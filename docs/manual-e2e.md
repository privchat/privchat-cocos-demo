# privchat-cocos-demo — Manual E2E Checklist

Cocos Creator 3.8.x LTS+. The demo verifies the cc-side renderer of
`@privchat/cocos` v0.1, which has no automated tests by design (per spec
§12 D6).

## Prerequisites

```bash
cd ../privchat-sdk-typescript && npm install && npm run build
cd ../privchat-cocos && npm install && npm run build
cd ../privchat-cocos-demo && npm install
```

Then open `/Users/zoujiaqing/projects/privchat/privchat-cocos-demo/` in
Cocos Creator 3.8.8.

## Setup the demo scene (one-time)

1. **Asset panel** → right-click `assets/` → `New Folder` → name it `scenes`.
2. Right-click `scenes/` → `New Scene` → name it `Demo`.
3. Open `Demo.scene`. In the **Hierarchy** panel:
   - Confirm the default `Canvas` exists.
   - Right-click `Canvas` → `Create` → `Empty Node` → name it `ChatRoot`.
   - Click `ChatRoot`, in the **Properties** panel set its `UITransform` size
     (e.g. `360 × 640` for a phone-portrait sample area).
4. Click `Canvas` (or any node you want the script lifecycle on). In Properties:
   - `Add Component` → `Custom Script` → `DemoChatScene`.
5. In the `DemoChatScene` component fields:
   - `useMock`: ✅ checked (default — uses `DemoMockAdapter` + `DemoFriendsSource`, no server)
   - `serverUrl`: `ws://127.0.0.1:9080/` (only used when `useMock` is unchecked)
   - `deviceId`: leave empty — the script regenerates a UUID v4 if invalid
   - `defaultRoomChannelId`: `100` (prefilled in the Room subscription panel)
   - `chatRoot`: drag the `ChatRoot` node from Hierarchy
6. Save the scene (`Cmd-S`).

## Run (mock mode — no server needed)

1. Top toolbar → `Preview in Browser`.
2. **Login page** mounts inside `ChatRoot`. Type any username/password
   (the mock accepts everything) → tap **登录**.
3. **Menu page** appears with three controls: 「好友列表 / 聊天」,
   「Room 订阅测试」, 「退出登录」.
4. Tap 「好友列表 / 聊天」 → contact list with 4 friends (艾莉丝, Bob,
   Charlie, David) + 「系统通知」-style entries if any. Status dots
   cycle every 6 s (online / offline / unknown).
5. Pick a friend → chat view with three pre-canned messages.
6. Tap 「< 返回」 in the chat header → back to friend list.
7. Tap 「< 菜单」 (top-left floating pill) → back to menu.
8. Tap 「Room 订阅测试」 → see the warning *"Room subscription requires
   real-SDK mode"* in console (mock mode has no real subscribe wire).

## v0.1.1 manual E2E checklist (mock mode)

- [ ] **A1** Login page renders; tapping 登录 advances to menu page.
- [ ] **A2** Menu shows greeting with submitted username + two large
      entries + bottom 退出登录 button.
- [ ] **A3** 好友列表 entry: 4 friends visible, names resolve correctly
      (艾莉丝, Bob, Charlie, David). Status dots animate.
- [ ] **A4** Pick a friend → chat view with seeded messages. 发送 a
      message → bubble appears as `isMine`, input clears.
- [ ] **A5** Chat header `< 返回` → back to friend list with new message
      reflected in… (mock doesn't surface preview, but sort still
      reflects last activity).
- [ ] **A6** Friends-page `< 菜单` floating pill → back to menu.
- [ ] **A7** Menu → 退出登录 → returns to login page; new login round-
      trips correctly (mockAdapter / mockFriendsSource state is reset).
- [ ] **A8** No `[DemoChatScene]` errors in console at any transition.
- [ ] **A9** Stop preview → onDestroy runs cleanly, no warnings.

## Real-SDK mode (required for Room subscription)

1. In the inspector, uncheck `useMock`.
2. Set `serverUrl` to your gateway's WebSocket URL.
3. Pre-create a Room channel server-side (see
   [`room-subscription-e2e.md`](./room-subscription-e2e.md) for the
   `curl POST /api/admin/room` command).
4. Preview, log in with **real** credentials.
5. From the menu:
   - 「好友列表 / 聊天」 — see your real channel list. Names lazy-fetch
     via `account/user/detail` so first paint is "loading…" until names
     arrive (default `awaitProfilesOnGetList: true`).
   - 「Room 订阅测试」 — see [`room-subscription-e2e.md`](./room-subscription-e2e.md)
     for the full Room flow (subscribe / unsubscribe / status banner).
6. Bonus checklist (chat):
   - [ ] **B1** Inbound message from another peer appears in real time.
   - [ ] **B2** History scroll-up triggers `loadMore` (only if the
         channel has older messages).
   - [ ] **B3** Network drop / reconnect doesn't crash the UI.

## Customizing the theme (colors, radius, font sizes)

`@privchat/cocos` doesn't hard-code colors — pass a `ThemeConfig` object
to `mountChatView` and the renderer styles itself accordingly. **The main
path is: pass `theme` at mount time.**

### Example 1: completely custom theme

```ts
import { PrivchatCocos, type ThemeConfig } from '@privchat/cocos';

const MyTheme: ThemeConfig = {
  colors: {
    background:    '#0d1117',
    surface:       '#161b22',
    primary:       '#58a6ff',
    textPrimary:   '#e6edf3',
    textSecondary: '#8b949e',
    bubbleMine:    '#1f6feb',
    bubbleOther:   '#21262d',
    danger:        '#f85149',
  },
  radius: { bubble: 16, input: 12 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
  fontSize: { message: 15, time: 11, input: 15 },
};

PrivchatCocos.mountChatView(this.chatRoot, {
  client,
  channelId: '10001',
  channelType: 1,
  theme: MyTheme,
});
```

### Example 2: spread the default and override a few colors

```ts
import { PrivchatCocos, PrivchatDarkTheme } from '@privchat/cocos';

PrivchatCocos.mountChatView(this.chatRoot, {
  client,
  channelId: '10001',
  channelType: 1,
  theme: {
    ...PrivchatDarkTheme,
    colors: {
      ...PrivchatDarkTheme.colors,
      bubbleMine: '#7e22ce',
      primary:    '#a855f7',
    },
  },
});
```

### What the demo uses

`DemoChatScene.ts` defines a `GoldGameTheme` constant and passes it.
This shows that the demo isn't running on the default dark gray look —
swap that constant for any palette you like.

### What v0.1 does NOT support

- **Runtime theme switching.** Pass `theme` once at `mountChatView`. To
  change theme, dispose the current ChatView and mount a new one.
- **Partial / deep-merge theme.** `theme` is a complete `ThemeConfig`.
  Use the spread pattern shown in Example 2 if you only want to tweak a
  few values.
- **Per-component overrides.** No CSS-like cascade. The whole ChatView
  uses the single passed theme.

### A few palette starting points

```ts
// iMessage blue
{ bubbleMine: '#007AFF', bubbleOther: '#3A3A3C', primary: '#007AFF', textPrimary: '#FFFFFF', ... }

// WeChat-ish green
{ background: '#000', bubbleMine: '#95EC69', bubbleOther: '#222', primary: '#07C160', textPrimary: '#FFFFFF', ... }

// Discord-ish purple
{ background: '#36393F', surface: '#2F3136', bubbleMine: '#5865F2', bubbleOther: '#40444B', primary: '#5865F2', ... }

// Gold (game): see DemoChatScene.ts
```

## Advanced: PrivchatRoot for context-based theme/client lookup

For projects that mount multiple ChatViews and want them to share the same
client and theme, you can attach a `PrivchatRoot` Component to a parent
node and call `init(client, theme)` on it once. ChatViews mounted further
down the node tree can omit the `client` (and `theme`) options and the
library will walk up to find the `PrivchatRoot`. This is **advanced
usage**; the main path remains `mountChatView({ client, theme })`.

## Known v0.1 limitations (not bugs)

- Round-corner uses `cc.Graphics.roundRect` (Cocos 3.7+); falls back to
  square corners on older Cocos versions.
- Long messages wrap up to **4 lines**; beyond that, text is visually
  clipped at the bubble edge. v0.3 lifts this cap.
- Image / voice / system message types render as `[image]` / `[voice]` /
  `[system]` placeholders by design (see `MessageVM.fallbackText`).
- No runtime theme switching — change theme by disposing and re-mounting.
- The outer ~8px ring of the input field isn't a click target (Cocos
  HTML overlay only covers the inner content area). Click the middle of
  the input to focus.
- **Conversation switch reloads the chat view.** The demo intentionally
  remounts ChatView on each navigation to keep lifecycle simple — the
  push-pop friends ↔ chat flow reclaims the same root node, so even an
  in-place controller swap couldn't avoid view destruction. **This is
  not the recommended pattern for production**: ship UIs that keep a
  chat surface mounted (split-screen, sidebar, ChatPanel) should hold
  the `controller` returned by `mountChatView` and call
  `controller.setChannel(channelId, channelType)` to swap conversations
  without UI rebuild. Data layer is already cache-first (IndexedDB
  window emits before the server's `message/history/get` round-trip
  resolves), so the visible "reload" is purely a view-recreation
  artifact, not a network re-fetch of message bodies.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Cannot find module '@privchat/cocos'` in Cocos Creator console | Run `npm install` at the demo project root; restart Cocos Creator |
| Bubbles render but text is invisible | `theme.colors.textPrimary` parsing failed — check the demo `theme` override if any |
| `chatRoot is not assigned` in console | Drag the `ChatRoot` node into the script's `chatRoot` field in inspector |
| Demo loads but nothing visible | Check `ChatRoot`'s `UITransform` width/height > 0 |
