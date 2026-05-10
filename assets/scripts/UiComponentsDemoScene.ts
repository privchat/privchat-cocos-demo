// UiComponentsDemoScene — manual-validation surface for the Phase A→D
// UI Kit primitives. The Phase D exit gate per plan §7 is "this
// scene renders, all interactions work, the Poker Feedback tab
// looks and feels like a poker UI fragment". Below that line the
// kit isn't shippable.
//
// Bind `uiRoot: Node` in the Cocos inspector to the empty container
// node where the demo should mount (mirrors DemoChatScene's
// `chatRoot` pattern). The scene is intentionally self-contained:
// no SDK / network / login dependencies. Switch tabs to exercise
// each component category.

import { Color, Component, Label, Layout, Node, UITransform, _decorator } from 'cc';
import {
  DefaultUiTheme,
  attachTweenAttention,
  createAnimatedNumber,
  createAvatar,
  createBadge,
  createBottomNav,
  createBottomSheet,
  createButtonBase,
  createCard,
  createCheckbox,
  createCountdownRing,
  createDialog,
  createDivider,
  createDropdown,
  createListRow,
  createLoadingSpinner,
  createProgressBar,
  createScrollView,
  createRadioGroup,
  createSectionHeader,
  createSlider,
  createSwitch,
  createTabs,
  showToast,
  type AttentionHandle,
  type AvatarStatus,
  type UiTheme,
  type UiComponentHandle,
} from '@privchat/cocos';

const { ccclass, property } = _decorator;

type TabKey = 'inputs' | 'navigation' | 'display' | 'overlay' | 'settings' | 'poker';

const TAB_BAR_HEIGHT = 44;
const TITLE_HEIGHT = 36;
const TITLE_FONT_BOOST = 4;
const SECTION_GAP = 16;

@ccclass('UiComponentsDemoScene')
export class UiComponentsDemoScene extends Component {
  @property({ type: Node, tooltip: 'Container Node where the demo UI will mount.' })
  uiRoot: Node | null = null;

  private theme: UiTheme = DefaultUiTheme;
  private bodyNode: Node | null = null;
  private bodyHandles: UiComponentHandle[] = [];
  private bodyOwnedNodes: Node[] = [];
  private currentTab: TabKey = 'inputs';

  start(): void {
    if (!this.uiRoot) {
      console.error('[UiComponentsDemoScene] uiRoot is not assigned.');
      return;
    }
    this.build();
  }

  protected override onDestroy(): void {
    this.disposeBody();
  }

  private build(): void {
    if (!this.uiRoot) return;
    const ui = this.uiRoot.getComponent(UITransform) ?? this.uiRoot.addComponent(UITransform);
    const MIN_DIM = 240;
    let canvasW = ui.width;
    let canvasH = ui.height;
    if (canvasW < MIN_DIM || canvasH < MIN_DIM) {
      console.warn(
        `[UiComponentsDemoScene] uiRoot UITransform is ${canvasW}×${canvasH} ` +
        `(too small). Falling back to 720×1280. To fix: bind uiRoot to your ` +
        `Canvas node, or set the bound Node's Content Size to your design ` +
        `resolution.`,
      );
      canvasW = 720;
      canvasH = 1280;
      ui.setContentSize(canvasW, canvasH);
    }
    const width = canvasW;
    const height = canvasH;
    const theme = this.theme;

    const title = makeLabel('UI Components Demo', {
      theme,
      width,
      fontSize: theme.fontSize.lg + TITLE_FONT_BOOST,
      align: 'center',
    });
    title.setPosition(0, height / 2 - TITLE_HEIGHT / 2 - 8);
    this.uiRoot.addChild(title);

    const tabsHandle = createTabs<TabKey>({
      theme,
      width,
      height: TAB_BAR_HEIGHT,
      tabs: [
        { key: 'inputs', label: 'Inputs' },
        { key: 'navigation', label: 'Navigation' },
        { key: 'display', label: 'Display' },
        { key: 'overlay', label: 'Overlay' },
        { key: 'settings', label: 'Settings' },
        { key: 'poker', label: 'Poker Feedback' },
      ],
      activeKey: this.currentTab,
      onChange: (key: TabKey) => {
        this.currentTab = key;
        this.renderTab(key);
      },
    });
    tabsHandle.node.setPosition(0, height / 2 - TITLE_HEIGHT - TAB_BAR_HEIGHT / 2 - 4);
    this.uiRoot.addChild(tabsHandle.node);
    this.bodyHandles.push(tabsHandle);

    const body = new Node('UiDemo_body');
    const bodyUi = body.addComponent(UITransform);
    const bodyHeight = height - TITLE_HEIGHT - TAB_BAR_HEIGHT - 12;
    bodyUi.setContentSize(width, bodyHeight);
    body.setPosition(0, -TITLE_HEIGHT / 2 - TAB_BAR_HEIGHT / 2 - 4);
    this.uiRoot.addChild(body);
    this.bodyNode = body;
    this.bodyOwnedNodes.push(body);

    this.renderTab(this.currentTab);
  }

  private renderTab(key: TabKey): void {
    if (!this.bodyNode) return;
    this.disposeTabContent();

    const ctx: TabContext = {
      theme: this.theme,
      parent: this.bodyNode,
      width: this.bodyNode.getComponent(UITransform)?.width ?? 360,
      height: this.bodyNode.getComponent(UITransform)?.height ?? 600,
      register: (h) => this.bodyHandles.push(h),
      registerNode: (n) => this.bodyOwnedNodes.push(n),
      uiRoot: this.uiRoot!,
    };

    switch (key) {
      case 'inputs': renderInputsTab(ctx); break;
      case 'navigation': renderNavigationTab(ctx); break;
      case 'display': renderDisplayTab(ctx); break;
      case 'overlay': renderOverlayTab(ctx); break;
      case 'settings': renderSettingsTab(ctx); break;
      case 'poker': renderPokerTab(ctx); break;
    }
  }

  /** Tear down current tab content but leave the title + tabs +
   *  body container alive (they belong to `build`, not the per-tab
   *  rebuild). */
  private disposeTabContent(): void {
    if (!this.bodyNode) return;
    // Children of bodyNode are tab-scoped. Disposable component
    // handles + raw nodes were tracked separately; filter to those
    // owned by the body subtree.
    for (const child of [...this.bodyNode.children]) {
      child.removeFromParent();
      child.destroy();
    }
    // Drop tracked handles whose nodes are no longer in the tree.
    // (Children are gone, so .node references dangle. Calling
    // dispose() on them would re-destroy already-destroyed nodes —
    // safe per UiComponentHandle contract, but skip the call.)
    this.bodyHandles = this.bodyHandles.filter((h) => h.node?.parent != null);
    this.bodyOwnedNodes = this.bodyOwnedNodes.filter((n) => n.parent != null);
  }

  private disposeBody(): void {
    for (const h of this.bodyHandles) {
      try { h.dispose(); } catch { /* ignore */ }
    }
    this.bodyHandles = [];
    for (const n of this.bodyOwnedNodes) {
      if (n.parent) n.removeFromParent();
      try { n.destroy(); } catch { /* ignore */ }
    }
    this.bodyOwnedNodes = [];
    this.bodyNode = null;
  }
}

// ---------------------------------------------------------------
// Per-tab content factories. Each takes a TabContext and registers
// any disposable handles / owned nodes back to the scene component.
// ---------------------------------------------------------------

interface TabContext {
  theme: UiTheme;
  /** The body container. New children mount here. */
  parent: Node;
  width: number;
  height: number;
  register(handle: UiComponentHandle): void;
  registerNode(n: Node): void;
  /** The scene-level uiRoot — Toast trigger uses this so toasts
   *  paint above tab body content. */
  uiRoot: Node;
}

// ---- Tab: Inputs ----

function renderInputsTab(ctx: TabContext): void {
  const { theme, parent, width } = ctx;
  // Per-row leading edge for left-aligned controls (checkboxes,
  // radio-group). Centered controls (slider, switch row) use 0.
  const leftEdge = -width / 2 + 24;
  let y = ctx.height / 2 - 28;

  const rowWidth = width - 48;

  const cb1 = createCheckbox({
    theme,
    label: 'Receive notifications',
    checked: true,
    width: rowWidth,
    onChange: (v) => console.log('[demo] checkbox-1', v),
  });
  cb1.node.setPosition(leftEdge + rowWidth / 2, y);
  parent.addChild(cb1.node);
  ctx.register(cb1);

  y -= 36;
  const cb2 = createCheckbox({
    theme,
    label: 'Auto-join voice',
    width: rowWidth,
    onChange: (v) => console.log('[demo] checkbox-2', v),
  });
  cb2.node.setPosition(leftEdge + rowWidth / 2, y);
  parent.addChild(cb2.node);
  ctx.register(cb2);

  y -= 36;
  const cb3 = createCheckbox({
    theme,
    label: 'Disabled checkbox',
    checked: true,
    disabled: true,
    width: rowWidth,
    onChange: () => { /* should never fire */ },
  });
  cb3.node.setPosition(leftEdge + rowWidth / 2, y);
  parent.addChild(cb3.node);
  ctx.register(cb3);

  y -= SECTION_GAP + 60;
  const radio = createRadioGroup<string>({
    theme,
    options: [
      { value: 'easy', label: '休闲场' },
      { value: 'normal', label: '普通场' },
      { value: 'hard', label: '高手场' },
    ],
    value: 'normal',
    width: rowWidth,
    onChange: (v) => console.log('[demo] radio', v),
  });
  radio.node.setPosition(leftEdge + rowWidth / 2, y - 10);
  parent.addChild(radio.node);
  ctx.register(radio);

  y -= SECTION_GAP + 100;
  const sw1 = createSwitch({
    theme,
    on: true,
    onChange: (v) => console.log('[demo] switch-1', v),
  });
  sw1.node.setPosition(-80, y);
  parent.addChild(sw1.node);
  ctx.register(sw1);

  const sw2 = createSwitch({
    theme,
    on: false,
    onChange: (v) => console.log('[demo] switch-2', v),
  });
  sw2.node.setPosition(0, y);
  parent.addChild(sw2.node);
  ctx.register(sw2);

  const sw3 = createSwitch({
    theme,
    on: true,
    disabled: true,
    onChange: () => { /* should never fire */ },
  });
  sw3.node.setPosition(80, y);
  parent.addChild(sw3.node);
  ctx.register(sw3);

  y -= SECTION_GAP + 30;
  const slider = createSlider({
    theme,
    min: 0,
    max: 100,
    step: 5,
    value: 30,
    width: Math.min(rowWidth, 320),
    onChange: (v) => console.log('[demo] slider drag', v),
    onCommit: (v) => console.log('[demo] slider commit', v),
  });
  slider.node.setPosition(0, y);
  parent.addChild(slider.node);
  ctx.register(slider);
}

// ---- Tab: Navigation ----

function renderNavigationTab(ctx: TabContext): void {
  const { theme, parent, width, height } = ctx;
  const innerWidth = width - 48;
  let y = height / 2 - 32;

  const innerTabs = createTabs<string>({
    theme,
    width: innerWidth,
    tabs: [
      { key: 'list', label: '列表' },
      { key: 'rooms', label: '房间' },
      { key: 'profile', label: '资料' },
    ],
    onChange: (k) => console.log('[demo] inner tabs', k),
  });
  innerTabs.node.setPosition(0, y);
  parent.addChild(innerTabs.node);
  ctx.register(innerTabs);

  y -= 60;
  const innerTabs2 = createTabs<string>({
    theme,
    width: innerWidth,
    tabs: [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
      { key: 'c', label: 'C' },
      { key: 'd', label: 'D' },
    ],
    activeKey: 'b',
    disabled: true,
    onChange: () => { /* should never fire */ },
  });
  innerTabs2.node.setPosition(0, y);
  parent.addChild(innerTabs2.node);
  ctx.register(innerTabs2);

  const bottomNav = createBottomNav<string>({
    theme,
    width,
    items: [
      { key: 'home', label: '首页', iconText: '🏠' },
      { key: 'rooms', label: '房间', iconText: '🎮', badge: 3 },
      { key: 'chat', label: '消息', iconText: '💬', badge: 142 },
      { key: 'me', label: '我的', iconText: '👤' },
    ],
    activeKey: 'home',
    onChange: (k) => console.log('[demo] bottom-nav', k),
  });
  bottomNav.node.setPosition(0, -height / 2 + 28);
  parent.addChild(bottomNav.node);
  ctx.register(bottomNav);
}

// ---- Tab: Display ----

function renderDisplayTab(ctx: TabContext): void {
  const { theme, parent, width, height, uiRoot } = ctx;
  const STATUSES: AvatarStatus[] = ['online', 'offline', 'unknown', 'busy', 'away'];
  const NAMES = ['Alice', 'Bob', 'Cara', 'Dan', 'Eve'];

  // Avatar grid: 2 rows × 5 columns. Top row circle, bottom rounded.
  let y = height / 2 - 50;
  const cellW = Math.floor(width / 5);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      const a = createAvatar({
        theme,
        name: NAMES[col],
        size: 44,
        shape: row === 0 ? 'circle' : 'rounded',
        status: STATUSES[col],
      });
      a.node.setPosition(-width / 2 + cellW * (col + 0.5), y - row * 56);
      parent.addChild(a.node);
      ctx.register(a);
    }
  }

  // Badge row: dot + 4 count variants.
  y -= 130;
  const badgeLabel = makeLabel('Badges:', { theme, width: 80, align: 'left' });
  badgeLabel.setPosition(-width / 2 + 50, y);
  parent.addChild(badgeLabel);
  ctx.registerNode(badgeLabel);

  const badges: Array<{ variant: 'dot' | 'count'; count: number | null; }> = [
    { variant: 'dot', count: 1 },
    { variant: 'count', count: 1 },
    { variant: 'count', count: 5 },
    { variant: 'count', count: 99 },
    { variant: 'count', count: 100 }, // renders "99+"
  ];
  badges.forEach((b, i) => {
    const handle = createBadge({ theme, variant: b.variant, count: b.count });
    handle.node.setPosition(-width / 2 + 110 + i * 36, y);
    parent.addChild(handle.node);
    ctx.register(handle);
  });

  // Toast triggers.
  y -= 40;
  const toastKinds: Array<{ kind: 'info' | 'success' | 'warning' | 'danger'; label: string; }> = [
    { kind: 'info', label: 'Info' },
    { kind: 'success', label: 'Success' },
    { kind: 'warning', label: 'Warning' },
    { kind: 'danger', label: 'Danger' },
  ];
  toastKinds.forEach((t, i) => {
    const btn = createButtonBase({
      theme,
      label: t.label,
      variant: i === 0 ? 'secondary' : i === 1 ? 'primary' : i === 2 ? 'secondary' : 'danger',
      width: 64,
      height: 32,
      onClick: () => {
        showToast({
          theme,
          parent: uiRoot,
          text: `${t.label} toast at ${formatTime()}`,
          kind: t.kind,
        });
      },
    });
    btn.node.setPosition(-width / 2 + 60 + i * 76, y);
    parent.addChild(btn.node);
    ctx.register(btn);
  });

  // LoadingSpinner + visibility toggle.
  y -= 50;
  const spinner = createLoadingSpinner({ theme, size: 32 });
  spinner.node.setPosition(-60, y);
  parent.addChild(spinner.node);
  ctx.register(spinner);

  const toggleBtn = createButtonBase({
    theme,
    label: 'Toggle Spinner',
    variant: 'secondary',
    width: 140,
    height: 32,
    onClick: () => spinner.setVisible(!spinner.isVisible()),
  });
  toggleBtn.node.setPosition(40, y);
  parent.addChild(toggleBtn.node);
  ctx.register(toggleBtn);
}

// ---- Tab: Overlay (Phase E) ----

function renderOverlayTab(ctx: TabContext): void {
  const { theme, parent, width, height, uiRoot } = ctx;
  const leftEdge = -width / 2 + 24;
  const rowWidth = width - 48;

  // Section: Dialog triggers — 3 buttons.
  let y = height / 2 - 40;

  const sectionTitle = makeLabel('Dialog', { theme, width: rowWidth, align: 'left' });
  sectionTitle.setPosition(leftEdge + rowWidth / 2, y);
  parent.addChild(sectionTitle);
  ctx.registerNode(sectionTitle);

  y -= 36;
  const defaultDialogBtn = createButtonBase({
    theme,
    label: '默认确认',
    variant: 'primary',
    width: 120,
    height: 36,
    onClick: () => {
      const d = createDialog({
        parent: uiRoot,
        theme,
        title: '退出当前牌局?',
        message: '退出后将无法回到本局，但桌位会保留 30 秒。',
        confirmText: '退出',
        onConfirm: () => console.log('[demo] dialog confirm'),
        onCancel: () => console.log('[demo] dialog cancel'),
        onClose: () => console.log('[demo] dialog close'),
      });
      void d;
    },
  });
  defaultDialogBtn.node.setPosition(leftEdge + 60, y);
  parent.addChild(defaultDialogBtn.node);
  ctx.register(defaultDialogBtn);

  const dangerDialogBtn = createButtonBase({
    theme,
    label: 'Danger 确认',
    variant: 'danger',
    width: 120,
    height: 36,
    onClick: () => {
      createDialog({
        parent: uiRoot,
        theme,
        title: '解散牌局?',
        message: '当前牌局未结束，解散将导致所有玩家退出，且无法撤销。',
        confirmText: '解散',
        cancelText: '继续',
        variant: 'danger',
        onConfirm: () => console.log('[demo] danger dialog confirm'),
      });
    },
  });
  dangerDialogBtn.node.setPosition(leftEdge + 196, y);
  parent.addChild(dangerDialogBtn.node);
  ctx.register(dangerDialogBtn);

  const alertDialogBtn = createButtonBase({
    theme,
    label: '单按钮',
    variant: 'secondary',
    width: 96,
    height: 36,
    onClick: () => {
      createDialog({
        parent: uiRoot,
        theme,
        title: '网络已断开',
        message: '请检查网络连接，稍后将自动重连。',
        confirmText: '我知道了',
        cancelText: null,
        onConfirm: () => console.log('[demo] alert dialog ack'),
      });
    },
  });
  alertDialogBtn.node.setPosition(leftEdge + 308, y);
  parent.addChild(alertDialogBtn.node);
  ctx.register(alertDialogBtn);

  // Section: BottomSheet trigger.
  y -= 56;
  const bsTitle = makeLabel('BottomSheet', { theme, width: rowWidth, align: 'left' });
  bsTitle.setPosition(leftEdge + rowWidth / 2, y);
  parent.addChild(bsTitle);
  ctx.registerNode(bsTitle);

  y -= 36;
  const bsBtn = createButtonBase({
    theme,
    label: '打开玩家资料',
    variant: 'primary',
    width: 160,
    height: 36,
    onClick: () => {
      const sheet = createBottomSheet({
        parent: uiRoot,
        theme,
        title: '玩家资料',
        height: 360,
        onClose: () => console.log('[demo] bottom-sheet close'),
      });
      // Host populates the body. Simplest demo: a centered placeholder
      // label + an inline close button (proves contentNode is host-
      // owned and dispose-clean).
      const placeholder = makeLabel('(host content here)', {
        theme,
        width: 320,
        align: 'center',
        fontSize: theme.fontSize.md,
      });
      placeholder.setPosition(0, 60);
      sheet.contentNode.addChild(placeholder);

      const innerBtn = createButtonBase({
        theme,
        label: '关闭',
        variant: 'secondary',
        width: 120,
        height: 36,
        onClick: () => sheet.close(),
      });
      innerBtn.node.setPosition(0, 0);
      sheet.contentNode.addChild(innerBtn.node);
    },
  });
  bsBtn.node.setPosition(leftEdge + 80, y);
  parent.addChild(bsBtn.node);
  ctx.register(bsBtn);

  // Section: ProgressBar samples.
  y -= 56;
  const pbTitle = makeLabel('ProgressBar', { theme, width: rowWidth, align: 'left' });
  pbTitle.setPosition(leftEdge + rowWidth / 2, y);
  parent.addChild(pbTitle);
  ctx.registerNode(pbTitle);

  y -= 28;
  const pb0 = createProgressBar({ theme, width: 280, value: 0 });
  pb0.node.setPosition(leftEdge + 140, y);
  parent.addChild(pb0.node);
  ctx.register(pb0);

  y -= 24;
  const pb50 = createProgressBar({
    theme,
    width: 280,
    value: 50,
    max: 100,
    showLabel: true,
  });
  pb50.node.setPosition(leftEdge + 140, y);
  parent.addChild(pb50.node);
  ctx.register(pb50);

  y -= 24;
  const pb100 = createProgressBar({
    theme,
    width: 280,
    value: 100,
    max: 100,
    showLabel: true,
  });
  pb100.node.setPosition(leftEdge + 140, y);
  parent.addChild(pb100.node);
  ctx.register(pb100);

  // Animate-to button — bumps the third bar from 100 → 25 → 100.
  y -= 36;
  let bumped = false;
  const animateBtn = createButtonBase({
    theme,
    label: '动画到 25%',
    variant: 'secondary',
    width: 140,
    height: 32,
    onClick: () => {
      // No tween in v1; setProgress is a snap. Demo just toggles
      // 100% ↔ 25% to prove setProgress paints. A tweened
      // ProgressBar is a deliberate omission — hosts wrap with
      // AnimatedNumber-style projection if they need it.
      pb100.setProgress(bumped ? 1 : 0.25);
      bumped = !bumped;
    },
  });
  animateBtn.node.setPosition(leftEdge + 70, y);
  parent.addChild(animateBtn.node);
  ctx.register(animateBtn);
}

// ---- Tab: Settings (Phase F) ----
//
// Realistic 3-Card settings screen, NOT a primitives catalog. The
// Phase F acceptance criterion is "this looks like a real game
// settings page", so the layout follows iOS/Material settings
// convention: SectionHeader → Card containing ListRows separated
// by Dividers, with Dropdowns embedded inline.

function renderSettingsTab(ctx: TabContext): void {
  const { theme, parent, width, height, uiRoot } = ctx;
  const COL_WIDTH = Math.min(width - 40, 480);
  const ROW_HEIGHT = 56;
  const SECTION_HEADER_GAP = 4;
  const CARD_GAP = 16;
  const TOP_INSET = 12;

  // Wrap the entire settings layout in a vertical ScrollView so a
  // long settings page (typical real game has 5+ sections) is
  // navigable. The scroll's `content` is a top-anchored Node we
  // manage manually — children use top-down y coords (y=0 at top
  // of content, y descends with negative values).
  const scrollViewport = makeVerticalScrollViewport(parent, ctx, width, height);
  const scrollContent = scrollViewport.content;
  // Content cursor: y=0 is the top edge of scroll content. We'll
  // grow the content height as we add sections; descending = more
  // negative y.
  let cursorY = -TOP_INSET;

  // ---- Section: 账户 ----
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, '账户');
  cursorY -= SECTION_HEADER_GAP;

  // Card body height: 3 ListRows + 1 Divider between row 2 and 3
  // (the Dropdown). Card adds its own padding (theme.spacing.md=12)
  // top + bottom inside contentNode, so the card needs to be tall
  // enough to fit content + 2*padding.
  const acctRows = 3;
  const acctDividers = 1;
  const acctCardHeight = ROW_HEIGHT * acctRows + 1 * acctDividers + theme.spacing.md * 2;
  const acctCard = createCard({
    parent: scrollContent,
    theme,
    width: COL_WIDTH,
    height: acctCardHeight,
  });
  acctCard.node.setPosition(0, cursorY - acctCardHeight / 2);
  ctx.register(acctCard);

  // Populate the Card's contentNode. Children's coords are local
  // to contentNode (origin = center of contentNode).
  const acctInner = acctCard.contentNode;
  const acctInnerW = COL_WIDTH - theme.spacing.md * 2;
  let innerY = (acctCardHeight - theme.spacing.md * 2) / 2 - ROW_HEIGHT / 2;

  const userRow = createListRow({
    parent: acctInner,
    theme,
    width: acctInnerW,
    label: '用户名',
    value: 'Brian',
    chevron: true,
    onClick: () => {
      // Real settings flow: open an "edit username" dialog with
      // text input. v0.2.0-alpha.0 doesn't ship a TextInput
      // primitive yet (deferred to a future phase), so the demo
      // shows a placeholder Dialog. Once TextInput lands, the
      // host swaps message → input field.
      createDialog({
        parent: uiRoot,
        theme,
        title: '修改用户名',
        message: 'TextInput 控件待 Phase G 后落地。当前以 Dialog 占位演示 click 流转：confirm 关闭、cancel 关闭，都通过 onClose 兜底。',
        confirmText: '保存',
        onConfirm: () => console.log('[demo] username save (no input wired)'),
        onCancel: () => console.log('[demo] username cancel'),
        onClose: () => console.log('[demo] username dialog close'),
      });
    },
  });
  userRow.node.setPosition(0, innerY);
  ctx.register(userRow);
  innerY -= ROW_HEIGHT;

  const idRow = createListRow({
    parent: acctInner,
    theme,
    width: acctInnerW,
    label: '用户 ID',
    value: '10000192',
  });
  idRow.node.setPosition(0, innerY);
  ctx.register(idRow);
  innerY -= ROW_HEIGHT / 2;

  const div1 = createDivider({
    parent: acctInner,
    theme,
    width: acctInnerW,
    insetLeft: 16,
  });
  div1.node.setPosition(0, innerY);
  ctx.register(div1);
  innerY -= ROW_HEIGHT / 2;

  const langDropdown = createDropdown<string>({
    parent: acctInner,
    theme,
    width: acctInnerW,
    label: '语言',
    value: 'zh-CN',
    options: [
      { value: 'zh-CN', label: '简体中文' },
      { value: 'en-US', label: 'English' },
      { value: 'ja-JP', label: '日本語', disabled: true },
    ],
    onChange: (v) => console.log('[demo] lang →', v),
  });
  langDropdown.node.setPosition(0, innerY);
  ctx.register(langDropdown);

  cursorY -= acctCardHeight + CARD_GAP;

  // ---- Section: 游戏设置 ----
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, '游戏设置');
  cursorY -= SECTION_HEADER_GAP;

  const gameRows = 3;
  const gameCardHeight = ROW_HEIGHT * gameRows + theme.spacing.md * 2;
  const gameCard = createCard({
    parent: scrollContent,
    theme,
    width: COL_WIDTH,
    height: gameCardHeight,
  });
  gameCard.node.setPosition(0, cursorY - gameCardHeight / 2);
  ctx.register(gameCard);

  const gameInner = gameCard.contentNode;
  const gameInnerW = COL_WIDTH - theme.spacing.md * 2;
  innerY = (gameCardHeight - theme.spacing.md * 2) / 2 - ROW_HEIGHT / 2;

  const audioSwitch = createSwitch({
    theme,
    on: true,
    onChange: (v) => console.log('[demo] audio', v),
  });
  const audioRow = createListRow({
    parent: gameInner,
    theme,
    width: gameInnerW,
    label: '音效',
    trailing: audioSwitch.node,
  });
  audioRow.node.setPosition(0, innerY);
  ctx.register(audioRow);
  ctx.register(audioSwitch);
  innerY -= ROW_HEIGHT;

  const vibrationSwitch = createSwitch({
    theme,
    on: false,
    onChange: (v) => console.log('[demo] vibration', v),
  });
  const vibrationRow = createListRow({
    parent: gameInner,
    theme,
    width: gameInnerW,
    label: '震动',
    trailing: vibrationSwitch.node,
  });
  vibrationRow.node.setPosition(0, innerY);
  ctx.register(vibrationRow);
  ctx.register(vibrationSwitch);
  innerY -= ROW_HEIGHT;

  const themeDropdown = createDropdown<string>({
    parent: gameInner,
    theme,
    width: gameInnerW,
    label: '桌面主题',
    value: 'gold',
    options: [
      { value: 'classic', label: '经典绿' },
      { value: 'gold', label: '金色经典' },
      { value: 'midnight', label: '午夜蓝' },
    ],
    onChange: (v) => console.log('[demo] theme →', v),
  });
  themeDropdown.node.setPosition(0, innerY);
  ctx.register(themeDropdown);

  cursorY -= gameCardHeight + CARD_GAP;

  // ---- Section: 德州设置 ----
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, '德州设置');
  cursorY -= SECTION_HEADER_GAP;

  const pokerRows = 2;
  const pokerCardHeight = ROW_HEIGHT * pokerRows + theme.spacing.md * 2;
  const pokerCard = createCard({
    parent: scrollContent,
    theme,
    width: COL_WIDTH,
    height: pokerCardHeight,
  });
  pokerCard.node.setPosition(0, cursorY - pokerCardHeight / 2);
  ctx.register(pokerCard);

  const pokerInner = pokerCard.contentNode;
  const pokerInnerW = COL_WIDTH - theme.spacing.md * 2;
  innerY = (pokerCardHeight - theme.spacing.md * 2) / 2 - ROW_HEIGHT / 2;

  const autoBuyinSwitch = createSwitch({
    theme,
    on: true,
    onChange: (v) => console.log('[demo] auto-buyin', v),
  });
  const autoBuyinRow = createListRow({
    parent: pokerInner,
    theme,
    width: pokerInnerW,
    label: '自动买入',
    subtitle: '坐下时自动按默认筹码补齐',
    trailing: autoBuyinSwitch.node,
  });
  autoBuyinRow.node.setPosition(0, innerY);
  ctx.register(autoBuyinRow);
  ctx.register(autoBuyinSwitch);
  innerY -= ROW_HEIGHT;

  const raiseDropdown = createDropdown<string>({
    parent: pokerInner,
    theme,
    width: pokerInnerW,
    label: '默认加注单位',
    value: '2bb',
    options: [
      { value: 'min', label: 'Min Raise' },
      { value: '2bb', label: '2 BB' },
      { value: '3bb', label: '3 BB' },
      { value: 'pot', label: 'Pot' },
    ],
    onChange: (v) => {
      console.log('[demo] raise unit →', v);
      showToast({ theme, parent: uiRoot, text: `加注单位已设为 ${v}`, kind: 'success' });
    },
  });
  raiseDropdown.node.setPosition(0, innerY);
  ctx.register(raiseDropdown);

  // Advance cursor past the last card so the total content height
  // includes its full extent. Earlier sections did this inline;
  // the last one needs an explicit step (no following section).
  cursorY -= pokerCardHeight;
  const totalContentHeight = -cursorY + 24; // 24px bottom inset
  scrollViewport.setContentHeight(totalContentHeight);
}

/** Place a SectionHeader at `y` and return the bottom edge so the
 *  caller can keep descending. */
function mountSectionHeader(
  parent: Node,
  ctx: TabContext,
  y: number,
  width: number,
  title: string,
): number {
  const header = createSectionHeader({
    parent,
    theme: ctx.theme,
    width,
    title,
  });
  // SectionHeader's UITransform is height=24 (single-line); position
  // at y - 12 so its top edge sits at y.
  const headerHeight = 24;
  header.node.setPosition(0, y - headerHeight / 2);
  ctx.register(header);
  return y - headerHeight;
}

// ---- Tab: Poker Feedback (the showcase) ----

function renderPokerTab(ctx: TabContext): void {
  const { theme, parent, height, uiRoot } = ctx;
  // ctx.width is unused — every section is x-centered (x=0).

  // Vertical rhythm. Top-down:
  //   [avatar+ring]
  //     ↓ 50px gap
  //   [底池 label]
  //     ↓ 24px gap
  //   [pot value]
  //     ↓ 50px gap
  //   [bet slider + 加注 readout]   single row
  //     ↓ 56px gap
  //   [countdown control row]        3 buttons
  //     ↓ 48px gap
  //   [attention trigger row]        3 buttons
  //     ↓ 48px gap
  //   [stop animations button]
  const avatarY = height / 2 - 70;
  const potLabelY = avatarY - 60;
  const potValueY = potLabelY - 24;
  const sliderRowY = potValueY - 50;
  const ctrlRowY = sliderRowY - 56;
  const attRowY = ctrlRowY - 48;
  const stopRowY = attRowY - 48;

  // ---- Avatar + CountdownRing ----
  const ring = createCountdownRing({
    theme,
    size: 78,
    thickness: 4,
    progress: 1,
  });
  ring.node.setPosition(0, avatarY);
  parent.addChild(ring.node);
  ctx.register(ring);

  const avatar = createAvatar({
    theme,
    name: 'Player',
    size: 64,
    shape: 'circle',
    status: 'online',
  });
  ring.node.addChild(avatar.node);
  ctx.register(avatar);

  // Attention attaches to the avatar (pulse / shake / glow targets
  // are the avatar node, which sits inside the ring).
  const attention = attachTweenAttention({ target: avatar.node, theme });
  ctx.register(attentionAsHandle(attention, avatar.node));

  // ---- Pot: stacked label + value (centered) ----
  // "底池" sits ABOVE the value as a small caption rather than a
  // horizontal sibling — earlier the side-by-side layout overlapped
  // (label width=80 at x=-50 + value width=140 at x=35 collided).
  const potLabel = makeLabel('底池', {
    theme,
    width: 200,
    align: 'center',
    fontSize: theme.fontSize.sm,
  });
  potLabel.setPosition(0, potLabelY);
  parent.addChild(potLabel);
  ctx.registerNode(potLabel);

  let currentPot = 1000;
  const pot = createAnimatedNumber({
    theme,
    value: currentPot,
    fontSize: theme.fontSize.xl,
    width: 240,
    align: 'center',
    format: (n) => `$${formatThousandsLocal(Math.floor(n))}`,
  });
  pot.node.setPosition(0, potValueY);
  parent.addChild(pot.node);
  ctx.register(pot);

  // ---- Slider + 加注 readout (single row) ----
  // Slider on the left, "加注 $XXX" on the right. Total width
  // ≈ 220 + 12 gap + 100 readout = 332; center the row at x=0.
  const sliderWidth = 220;
  const readoutWidth = 100;
  const sliderRowGap = 12;
  const sliderRowTotal = sliderWidth + sliderRowGap + readoutWidth;
  const sliderCenterX = -sliderRowTotal / 2 + sliderWidth / 2;
  const readoutCenterX = sliderRowTotal / 2 - readoutWidth / 2;

  const slider = createSlider({
    theme,
    min: 0,
    max: 1000,
    step: 50,
    value: 100,
    width: sliderWidth,
    onChange: (v) => bet.setValue(v),
    onCommit: (v) => console.log('[demo] bet committed', v),
  });
  slider.node.setPosition(sliderCenterX, sliderRowY);
  parent.addChild(slider.node);
  ctx.register(slider);

  const bet = createAnimatedNumber({
    theme,
    value: 100,
    fontSize: theme.fontSize.md,
    width: readoutWidth,
    align: 'center',
    format: (n) => `加注 $${formatThousandsLocal(Math.floor(n))}`,
  });
  bet.node.setPosition(readoutCenterX, sliderRowY);
  parent.addChild(bet.node);
  ctx.register(bet);

  // ---- Countdown control row (3 buttons, centered) ----
  layoutButtonRow(parent, ctx, ctrlRowY, [
    {
      label: '开始倒计时 30s',
      variant: 'primary',
      width: 140,
      onClick: () => {
        ring.start(30_000);
        showToast({ theme, parent: uiRoot, text: '本地倒计时 30s 已开始', kind: 'info' });
      },
    },
    {
      label: '服务端 progress=0.5',
      variant: 'secondary',
      width: 150,
      onClick: () => {
        ring.setProgress(0.5);
        showToast({ theme, parent: uiRoot, text: '权威模式：进度=0.5', kind: 'info' });
      },
    },
    {
      label: '重置',
      variant: 'ghost',
      width: 70,
      onClick: () => ring.reset(),
    },
  ], theme);

  // ---- Attention trigger row (3 buttons, centered) ----
  layoutButtonRow(parent, ctx, attRowY, [
    {
      label: '轮到你了',
      variant: 'primary',
      width: 100,
      onClick: () => {
        attention.trigger('pulse');
        showToast({ theme, parent: uiRoot, text: '轮到你了', kind: 'info' });
      },
    },
    {
      label: '超时',
      variant: 'danger',
      width: 80,
      onClick: () => {
        attention.trigger('shake');
        showToast({ theme, parent: uiRoot, text: '下注超时', kind: 'warning' });
      },
    },
    {
      label: '你赢了 $2,000',
      variant: 'primary',
      width: 140,
      onClick: () => {
        attention.trigger('glow');
        currentPot += 2000;
        pot.animateTo(currentPot);
        showToast({ theme, parent: uiRoot, text: '你赢了 $2,000', kind: 'success' });
      },
    },
  ], theme);

  // ---- Stop animations (single button, centered) ----
  const stopBtn = createButtonBase({
    theme,
    label: '停止动画',
    variant: 'ghost',
    width: 100,
    height: 32,
    onClick: () => attention.stop(),
  });
  stopBtn.node.setPosition(0, stopRowY);
  parent.addChild(stopBtn.node);
  ctx.register(stopBtn);
  ctx.register(stopBtn);
}

// ---------------------------------------------------------------
// Helpers (cc-coupled but tiny)
// ---------------------------------------------------------------

interface MakeLabelOpts {
  theme: UiTheme;
  width: number;
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
}

function makeLabel(text: string, opts: MakeLabelOpts): Node {
  // The UI Kit doesn't expose a static `createLabel` (each component
  // builds its own). For demo headings we use cc.Label directly —
  // this is demo glue, not Tier-A surface.
  //
  // overflow: NONE + explicit lineHeight is critical: the SHRINK
  // default would auto-scale the font down whenever container
  // height (fs + 4) is less than the default lineHeight (~fs * 1.5),
  // crushing demo captions ("底池", "Badges:", etc.) to ~10px and
  // making them unreadable. Same trap class as the kit's components.
  const node = new Node('UiDemo_label');
  const ui = node.addComponent(UITransform);
  const fs = opts.fontSize ?? opts.theme.fontSize.md;
  // Bump container height to match the natural lineHeight so cc's
  // vertical-center math has breathing room.
  ui.setContentSize(opts.width, Math.round(fs * 1.5));
  const lbl = node.addComponent(Label);
  lbl.string = text;
  lbl.fontSize = fs;
  (lbl as unknown as { lineHeight: number }).lineHeight = fs;
  const c = parseHexLocal(opts.theme.colors.textPrimary);
  lbl.color = new Color(c.r, c.g, c.b, c.a);
  lbl.horizontalAlign =
    opts.align === 'center' ? Label.HorizontalAlign.CENTER :
    opts.align === 'right' ? Label.HorizontalAlign.RIGHT :
    Label.HorizontalAlign.LEFT;
  lbl.verticalAlign = Label.VerticalAlign.CENTER;
  lbl.overflow = Label.Overflow.NONE;
  return node;
}

interface RGBALocal { r: number; g: number; b: number; a: number; }
function parseHexLocal(input: string): RGBALocal {
  const hex = input.startsWith('#') ? input.slice(1) : input;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) : 255,
  };
}

function formatThousandsLocal(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatTime(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

/** Adapt an AttentionHandle into the UiComponentHandle shape so
 *  the body-handles array can dispose it uniformly. The "node" is
 *  the avatar that the attention is attached to — destroying that
 *  is the avatar's own responsibility, so we mark this wrapper as
 *  dispose-only. */
function attentionAsHandle(att: AttentionHandle, surrogateNode: Node): UiComponentHandle {
  return {
    node: surrogateNode,
    dispose: () => att.dispose(),
  };
}

interface RowButtonSpec {
  label: string;
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  width: number;
  onClick: () => void;
}

/** Lay out N buttons centered as a row at given y. Buttons are
 *  spaced 12px apart; the row's total width is whatever the sum
 *  of widths + gaps comes to. Each button is a ButtonBase. */
function layoutButtonRow(
  parent: Node,
  ctx: TabContext,
  y: number,
  specs: ReadonlyArray<RowButtonSpec>,
  theme: UiTheme,
): void {
  const GAP = 12;
  const HEIGHT = 36;
  const total = specs.reduce((s, b, i) => s + b.width + (i > 0 ? GAP : 0), 0);
  let x = -total / 2;
  for (const spec of specs) {
    const btn = createButtonBase({
      theme,
      label: spec.label,
      variant: spec.variant,
      width: spec.width,
      height: HEIGHT,
      onClick: spec.onClick,
    });
    btn.node.setPosition(x + spec.width / 2, y);
    parent.addChild(btn.node);
    ctx.register(btn);
    x += spec.width + GAP;
  }
}

interface ScrollViewport {
  /** Top-anchored content node. Children added here use top-down
   *  y coords (y=0 at top of content, y descends). Set
   *  `setContentHeight()` after laying out so the ScrollView can
   *  compute its scroll range. */
  content: Node;
  setContentHeight(height: number): void;
}

/** Build a vertical ScrollView whose `content` is a Node with
 *  anchor (0.5, 1) — top-anchored — and NO cc.Layout component, so
 *  the host can manually position children. (`createScrollView`
 *  from @privchat/cocos attaches a vertical Layout that fights
 *  manual positioning; we bypass it here for the Settings tab.) */
function makeVerticalScrollViewport(
  parent: Node,
  ctx: TabContext,
  width: number,
  height: number,
): ScrollViewport {
  const sv = createScrollView('Settings_scroll', width, height);
  // createScrollView attaches a vertical Layout to `content` which
  // would override our manual positions. Disable it.
  const layout = sv.content.getComponent(Layout);
  if (layout) layout.enabled = false;
  parent.addChild(sv.root);
  ctx.registerNode(sv.root);

  return {
    content: sv.content,
    setContentHeight(h: number): void {
      const ui = sv.content.getComponent(UITransform);
      if (ui) ui.setContentSize(width, h);
    },
  };
}
