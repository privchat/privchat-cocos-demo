# Floating Chat (openChatWindow) — Manual E2E

Verifies `PrivchatCocos.openChatWindow(opts)` — the v0.1.2 high-level
API for popping an independent floating chat window from any game UI
surface (friend avatar, customer-service button, end-of-match flow).

This demo is **real-SDK only**. `DemoMockAdapter` has no real
openConversation / observeConversation wire that would emit messages,
so a mock-mode chat window would render an empty timeline. The menu
entry routes mock-mode taps to a console.warn instead.

## Scope

- ✅ Open a floating window from a tap; window appears at the
  configured `placement`
- ✅ Title + subtitle render in the window NavBar; close × is wired
- ✅ Multiple windows can be open simultaneously
- ✅ Chat inside the window behaves identically to `mountChatView`
  (input, scroll, send, history)
- ✅ `modal: true` adds a half-transparent backdrop; `closeOnBackdrop`
  default `false` means accidental backdrop taps don't dismiss
- ✅ Clicking close × disposes the window cleanly; reopening works
- ✅ Tearing down the demo page disposes all open windows

Out of scope (per spec — see
`privchat-cocos/docs/superpowers/specs/2026-05-09-cocos-openchatwindow-spec.md`):
- ❌ peerUserId → channelId resolution (business server's job)
- ❌ Avatar image rendering (M2 imageLoader)
- ❌ Drag / resize / minimize / WindowManager
- ❌ Channel switching inside an open window (close + reopen instead)

## Pre-requisites

1. **Real-SDK mode**:in DemoChatScene inspector uncheck `Use Mock`.
2. **Server-side channels exist** for the demo's seeded peer ids
   (`100001` / `100002` / `100003` / `support_10001`). The demo
   doesn't auto-create them — adapt to your server's channel-id
   scheme by editing `assets/scripts/FloatingChatDemo.ts`'s
   `FAKE_FRIENDS` array OR by pre-creating those channel ids on
   your gateway.

## Run preview

1. Click Cocos Creator's preview button.
2. Login with real credentials → menu page.
3. Tap **悬浮聊天测试** → mock business page renders inside `chatRoot`:
   - 3 friend chips at top
   - "悬浮聊天测试" header with `< 返回`
   - "模态遮罩(modal)" toggle (default 关闭)
   - "在线客服" chip at bottom
4. **Single window**:tap any friend chip → right-side window slides in
   (placement='right'). Header shows nickname + subtitle + ×.
5. **Send a message**:type in the window's input → Enter / send button.
   Bubble appears (same logic as `mountChatView`).
6. **Close**:tap × in the window's NavBar → window disappears, demo
   page intact.
7. **Multi-window**:tap two different friend chips in succession.
   Both windows should remain visible (latest on top stack-wise).
   Close the front one — the back one stays.
8. **Customer service window**:tap the bottom chip → window appears
   at the **bottom-right corner** (placement='bottom-right'),
   distinguishing it from friend windows visually.
9. **Modal toggle**:flip "模态遮罩(modal)" to "开启" → tap any chip →
   window now overlays a half-transparent backdrop covering the
   demo page. Tap the backdrop → **nothing happens**
   (`closeOnBackdrop` default `false`). Tap × → window closes.
10. **Page teardown**:tap `< 返回` in the demo page header → demo
    page disposes; any still-open windows are torn down by the
    `dispose()` path (no `onClose` fires from this teardown).

## Failure cases worth probing

| Action | Expected | Reason |
| --- | --- | --- |
| Open window for a non-existent channelId | ChatView shows error / empty state via its existing `onError` flow | Channel-not-found is the SDK's responsibility, openChatWindow doesn't probe |
| Tap × twice in quick succession | First tap closes, second is no-op | `close()` is idempotent |
| Re-open same channelId after close | Fresh window; previous state not retained | Each call returns an independent handle; controller is recreated |
| Modal=true + closeOnBackdrop=true (manually edit demo) | Tap on backdrop closes window | Verifies the opt-in path |
| Switch channels while window open | (not supported — should reach for ChatPanel design instead) | v0.1.2 doesn't expose in-window channel swap |

## Server-side verification (optional)

Each opened window triggers `openConversation(channelId, channelType)`
internally. Gateway logs should show one open per window mount, and
the corresponding `markRead` / cache reads as the user scrolls.

## What's NOT here (and why)

- **Drag windows around** — game studios have wildly different drag
  semantics (gesture-locked / joystick / pointer-only); library
  doesn't impose one. Use `handle.node.setPosition(x, y)` to move
  programmatically if needed.
- **Resize windows** — same. Use `handle.node.getComponent(UITransform)`
  to mutate, but layout won't auto-re-flow inside.
- **Custom NavBar content** — v0.1.2 only supports `title + subtitle`.
  Header actions / dropdowns are a v0.3 ChatPanel concern.
- **Avatar in NavBar** — input shape doesn't expose `avatarUrl` yet
  (M2 imageLoader will add it as an optional field).
