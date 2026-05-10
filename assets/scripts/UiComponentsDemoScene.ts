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

import { Color, Component, Label, Node, UITransform, _decorator } from 'cc';
import {
  DefaultUiTheme,
  attachTweenAttention,
  createAnimatedNumber,
  createAvatar,
  createBadge,
  createBottomNav,
  createButtonBase,
  createCheckbox,
  createCountdownRing,
  createLoadingSpinner,
  createRadioGroup,
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

type TabKey = 'inputs' | 'navigation' | 'display' | 'poker';

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

// ---- Tab: Poker Feedback (the showcase) ----

function renderPokerTab(ctx: TabContext): void {
  const { theme, parent, width, height, uiRoot } = ctx;

  // Layout (top-down):
  //   [avatar+ring]
  //   [pot animated number]
  //   [bet slider + bet readout]
  //   [countdown control buttons row]
  //   [attention trigger buttons row]
  //   [stop animations button]

  const avatarTopY = height / 2 - 60;

  // Avatar wrapped in a CountdownRing. The ring is its own node,
  // slightly larger; we position the avatar inside it.
  const ring = createCountdownRing({
    theme,
    size: 78,
    thickness: 4,
    progress: 1,
  });
  ring.node.setPosition(0, avatarTopY);
  parent.addChild(ring.node);
  ctx.register(ring);

  const avatar = createAvatar({
    theme,
    name: 'Player',
    size: 64,
    shape: 'circle',
    status: 'online',
  });
  // Centered inside the ring.
  ring.node.addChild(avatar.node);
  ctx.register(avatar);

  // Attention attaches to the avatar — pulse / shake / glow target
  // the avatar node, which sits inside the ring.
  const attention = attachTweenAttention({ target: avatar.node, theme });
  // attention isn't a UiComponentHandle (no .node), but we still
  // need to dispose it on tab teardown — wrap as one.
  ctx.register(attentionAsHandle(attention, avatar.node));

  // Pot. Use a custom format with "$" prefix.
  const potLabel = makeLabel('底池', { theme, width: 80, align: 'right' });
  potLabel.setPosition(-50, avatarTopY - 70);
  parent.addChild(potLabel);
  ctx.registerNode(potLabel);

  let currentPot = 1000;
  const pot = createAnimatedNumber({
    theme,
    value: currentPot,
    fontSize: theme.fontSize.xl,
    width: 140,
    align: 'left',
    format: (n) => `$${formatThousandsLocal(Math.floor(n))}`,
  });
  pot.node.setPosition(35, avatarTopY - 70);
  parent.addChild(pot.node);
  ctx.register(pot);

  // Bet slider (range 0..1000, step 50). Drag updates the bet
  // readout via AnimatedNumber.setValue (jump-mode — drag is the
  // animation, no double-tween).
  const sliderTopY = avatarTopY - 130;
  const slider = createSlider({
    theme,
    min: 0,
    max: 1000,
    step: 50,
    value: 100,
    width: 220,
    onChange: (v) => bet.setValue(v),
    onCommit: (v) => console.log('[demo] bet committed', v),
  });
  slider.node.setPosition(-30, sliderTopY);
  parent.addChild(slider.node);
  ctx.register(slider);

  const betLabel = makeLabel('加注', { theme, width: 40, align: 'left' });
  betLabel.setPosition(110, sliderTopY);
  parent.addChild(betLabel);
  ctx.registerNode(betLabel);

  const bet = createAnimatedNumber({
    theme,
    value: 100,
    fontSize: theme.fontSize.md,
    width: 80,
    align: 'left',
    format: (n) => `$${formatThousandsLocal(Math.floor(n))}`,
  });
  bet.node.setPosition(155, sliderTopY);
  parent.addChild(bet.node);
  ctx.register(bet);

  // Countdown control row.
  const ctrlY = sliderTopY - 50;
  const startBtn = createButtonBase({
    theme,
    label: '开始倒计时 30s',
    variant: 'primary',
    width: 140,
    height: 32,
    onClick: () => {
      ring.start(30_000);
      showToast({ theme, parent: uiRoot, text: '本地倒计时 30s 已开始', kind: 'info' });
    },
  });
  startBtn.node.setPosition(-100, ctrlY);
  parent.addChild(startBtn.node);
  ctx.register(startBtn);

  const pushBtn = createButtonBase({
    theme,
    label: '服务端 progress=0.5',
    variant: 'secondary',
    width: 130,
    height: 32,
    onClick: () => {
      ring.setProgress(0.5);
      showToast({ theme, parent: uiRoot, text: '权威模式：进度=0.5', kind: 'info' });
    },
  });
  pushBtn.node.setPosition(40, ctrlY);
  parent.addChild(pushBtn.node);
  ctx.register(pushBtn);

  const resetBtn = createButtonBase({
    theme,
    label: '重置',
    variant: 'ghost',
    width: 60,
    height: 32,
    onClick: () => ring.reset(),
  });
  resetBtn.node.setPosition(140, ctrlY);
  parent.addChild(resetBtn.node);
  ctx.register(resetBtn);

  // Attention trigger row.
  const attY = ctrlY - 44;
  const turnBtn = createButtonBase({
    theme,
    label: '轮到你了',
    variant: 'primary',
    width: 90,
    height: 32,
    onClick: () => {
      attention.trigger('pulse');
      showToast({ theme, parent: uiRoot, text: '轮到你了', kind: 'info' });
    },
  });
  turnBtn.node.setPosition(-110, attY);
  parent.addChild(turnBtn.node);
  ctx.register(turnBtn);

  const timeoutBtn = createButtonBase({
    theme,
    label: '超时',
    variant: 'danger',
    width: 70,
    height: 32,
    onClick: () => {
      attention.trigger('shake');
      showToast({ theme, parent: uiRoot, text: '下注超时', kind: 'warning' });
    },
  });
  timeoutBtn.node.setPosition(-25, attY);
  parent.addChild(timeoutBtn.node);
  ctx.register(timeoutBtn);

  const winBtn = createButtonBase({
    theme,
    label: '你赢了 $2,000',
    variant: 'primary',
    width: 130,
    height: 32,
    onClick: () => {
      attention.trigger('glow');
      currentPot += 2000;
      pot.animateTo(currentPot);
      showToast({ theme, parent: uiRoot, text: '你赢了 $2,000', kind: 'success' });
    },
  });
  winBtn.node.setPosition(80, attY);
  parent.addChild(winBtn.node);
  ctx.register(winBtn);

  // Stop animations.
  const stopBtn = createButtonBase({
    theme,
    label: '停止动画',
    variant: 'ghost',
    width: 100,
    height: 28,
    onClick: () => attention.stop(),
  });
  stopBtn.node.setPosition(0, attY - 36);
  parent.addChild(stopBtn.node);
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
  const node = new Node('UiDemo_label');
  const ui = node.addComponent(UITransform);
  const fs = opts.fontSize ?? opts.theme.fontSize.md;
  ui.setContentSize(opts.width, fs + 4);
  const lbl = node.addComponent(Label);
  lbl.string = text;
  lbl.fontSize = fs;
  const c = parseHexLocal(opts.theme.colors.textPrimary);
  lbl.color = new Color(c.r, c.g, c.b, c.a);
  lbl.horizontalAlign =
    opts.align === 'center' ? Label.HorizontalAlign.CENTER :
    opts.align === 'right' ? Label.HorizontalAlign.RIGHT :
    Label.HorizontalAlign.LEFT;
  lbl.verticalAlign = Label.VerticalAlign.CENTER;
  lbl.overflow = Label.Overflow.SHRINK;
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
