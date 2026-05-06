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

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Cannot find module '@privchat/cocos'` in Cocos Creator console | Run `npm install` at the demo project root; restart Cocos Creator |
| Bubbles render but text is invisible | `theme.colors.textPrimary` parsing failed — check the demo `theme` override if any |
| `chatRoot is not assigned` in console | Drag the `ChatRoot` node into the script's `chatRoot` field in inspector |
| Demo loads but nothing visible | Check `ChatRoot`'s `UITransform` width/height > 0 |
