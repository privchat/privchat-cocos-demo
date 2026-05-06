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
   - `useMock`: ✅ checked (default)
   - `chatRoot`: drag the `ChatRoot` node from Hierarchy
   - `channelId`: leave as `demo-channel`
   - `channelType`: leave as `1`
6. Save the scene (`Cmd-S`).

## Run (mock mode — no server needed)

1. Top toolbar → `Preview in Browser`.
2. The browser opens with a chat UI inside `ChatRoot`. You should see:
   - Three pre-canned messages (peer / self / peer).
   - A bottom input bar with placeholder.
   - The "发送" button on the right.

## v0.1 manual E2E checklist

- [ ] **A1** Three canned messages render on initial load (peer-mine-peer pattern).
- [ ] **A2** Typing in the input box updates the controller draft (no visible toast).
- [ ] **A3** Click `发送` (or press Enter) → a new bubble appears as "isMine"; input clears.
- [ ] **A4** No console errors during initial mount.
- [ ] **A5** Stop the preview / close the browser tab → no `[DemoChatScene]` errors in the console after exit. (If the editor stays open, watch logs as you switch scenes.)
- [ ] **A6** Switch the active scene to a non-demo scene → `onDestroy` runs → no `[DemoChatScene]` warnings.
- [ ] **A7** Reopen `Demo.scene` and re-preview → no leftover state from previous run.

## Real-SDK mode (optional)

To verify against a real PrivChat server:

1. Set `useMock` = ❌
2. Fill `serverUrl`, `userId`, `token`, `deviceId`, `channelId`, `channelType`
3. Save scene, preview again.
4. Bonus checklist:
   - [ ] **B1** Inbound message from another peer appears in real time.
   - [ ] **B2** History scroll-up triggers `loadMore` (only if the channel has older messages).
   - [ ] **B3** Network drop / reconnect doesn't crash the UI.

## Known v0.1 limitations (not bugs)

- Round-corner uses 9-slice with a runtime-generated SpriteFrame. On some
  GPUs the tinting may differ slightly from a hand-authored 9-slice — this
  is acceptable for v0.1.
- VirtualList is **fixed-height only**. Long messages may visually clip; v0.3
  introduces dynamic heights.
- Image / voice / system message types render as `[image]` / `[voice]` /
  `[system]` placeholders by design (see `MessageVM.fallbackText`).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Cannot find module '@privchat/cocos'` in Cocos Creator console | Run `npm install` at the demo project root; restart Cocos Creator |
| Bubbles render but text is invisible | `theme.colors.textPrimary` parsing failed — check the demo `theme` override if any |
| `chatRoot is not assigned` in console | Drag the `ChatRoot` node into the script's `chatRoot` field in inspector |
| Demo loads but nothing visible | Check `ChatRoot`'s `UITransform` width/height > 0 |
