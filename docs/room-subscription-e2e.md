# Room Subscription Demo — Manual E2E

Verifies that `@privchat/cocos` can subscribe to a Room channel served
by the privchat-server gateway and cleanly unsubscribe when leaving.

This demo deliberately covers a single boundary: **subscribe → server
ack → controller status === 'subscribed'** and the symmetric unsubscribe.
Live broadcast events are NOT rendered yet — the SDK
(`privchat-sdk-typescript` v0.1) only dispatches `topic === 'typing'`
publishes; ordinary Room broadcasts are dropped server-loop-side. Once
the SDK ships `room_publish_received` SequencedSdkEvent, the controller's
`events` array fills automatically and the placeholder line in the UI
becomes a live event log.

## Scope

- ✅ Subscribe to a Room `channelId` returned by the business server
- ✅ Unsubscribe explicitly
- ✅ Auto-unsubscribe on `dispose()` (e.g., scene teardown / scene swap)
- ❌ Receiving Room broadcasts (blocked on SDK Phase X — out of scope here)
- ❌ Creating / closing Rooms (always business-server side via privchat-server admin/service API)

## Pre-requisites

1. **privchat-server** running and reachable via WebSocket. Default port
   in `privchat-server/config.toml` is **9080** (the WS listener; 9001 is
   raw TCP). Adjust `serverUrl` in the inspector if yours differs.
2. **A real account** registered on the gateway. The login uses the same
   `account/auth/login` route privchat-web does — username + password.
3. **A Room channel that exists server-side**. Today, privchat-server
   has no public "create room" path the demo can call. Pre-create one
   manually:
   ```bash
   curl -X POST http://127.0.0.1:9090/api/admin/room \
     -H 'Content-Type: application/json' \
     -d '{"channel_id": 100}'
   ```
   `channel_id = 100` matches the demo's default. Use any number; just
   make sure it's OPEN.

## Setup the scene

The Room demo lives inside the same `DemoChatScene` as the chat / contact
flow, accessed via the menu page. There is no separate scene to create.

1. Open `privchat-cocos-demo` in Cocos Creator 3.8.x.
2. Open the existing demo Scene (the one with `DemoChatScene` already
   attached to a Canvas-sized Node).
3. In the `DemoChatScene` inspector:
   - **Use Mock** → uncheck (Room subscription requires real-SDK mode;
     mock mode silently no-ops the subscribe wire and the menu's Room
     entry is a no-op too).
   - **Server Url** → `ws://<host>:9080/`
   - **Default Room Channel Id** → `100` (or any other Room id you've
     pre-created server-side; see Pre-requisites above).
   - **Chat Root** → already bound from the chat-demo setup; leave alone.
4. Save the scene.

## Run preview

1. Click Cocos Creator's preview button (browser).
2. The login page appears. Type real credentials → tap **登录**.
3. The menu page appears. It shows two large entries plus a 退出登录
   button at the bottom.
4. Tap **Room 订阅测试**. The Room panel mounts: header with `< 返回`,
   channelId input prefilled with `100`, **Subscribe** / **Unsubscribe**
   buttons, status banner.
5. Tap **Subscribe**. Status flips: `SUBSCRIBING → SUBSCRIBED` (under
   100 ms on a healthy gateway).
6. Tap **Unsubscribe**. Status: `UNSUBSCRIBING → UNSUBSCRIBED`.
7. Tap **Subscribe** again — should return to `SUBSCRIBED` cleanly.
8. Tap **`< 返回`** in the header to return to the menu (auto-unsubscribes
   on dispose if you forgot to manually unsubscribe — see spec §11).
9. From the menu you can also exercise the friends/chat flow without
   re-logging-in; Room subscriptions are per-page so leaving the panel
   tears them down cleanly.

## Server-side verification

Even without SDK publish event support, you can confirm the subscription
landed by inspecting the gateway:

- **Prometheus metrics** (`channel_online_sessions{channel_id="100"}`)
  should bump from 0 → 1 after Subscribe and back to 0 after Unsubscribe.
- **Gateway logs** show `subscribe ok session=... channel=100 type=2`
  and the matching `unsubscribe`.

If the gateway prints `reason_code=3 CHANNEL_FULL` or `reason_code=8
TOO_MANY_SUBSCRIPTIONS`, the demo's status banner shows the wrapped
error — same code path tests cover.

## Failure cases worth probing

| Action | Expected | Reason |
| --- | --- | --- |
| Subscribe to a non-existent Room id | `FAILED` + error message | Server returns non-zero `reason_code`; SDK throws `SubscribeError`; controller wraps as `PrivchatCocosError` |
| Tap Subscribe twice in a row | Both calls succeed (idempotent at SDK layer) | `subscribe` is idempotent server-side per spec §6 |
| Tap Unsubscribe without subscribing first | Status flips to `UNSUBSCRIBED`, no wire call | Controller short-circuits non-subscribed states |
| Close the preview window with an active subscription | Server cleans up (session disconnect → routes purged per spec §11) | No client action required |

## What's NOT here (and why)

- **Create Room button** — production model is "business server creates
  Room, returns channelId to client". Surfacing creation in the client
  would imply admin trust the client doesn't have.
- **Multiple simultaneous Rooms** — the controller is per-Room. Use
  `PrivchatCocos.createRoomSubscriptionController(...)` once per Room
  the screen needs to follow. Per-session cap is 32 (spec §6).
- **Event log** — pending SDK `room_publish_received` event surface.
  When that lands the placeholder text auto-updates with no schema
  break (the `events: ReadonlyArray<RoomEventVM>` field is already in
  the v0.1.1 view-model).
