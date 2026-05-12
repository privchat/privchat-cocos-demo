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

import { Color, Component, Graphics, Label, Layout, Mask, Node, ScrollView, UITransform, _decorator, screen, view } from 'cc';
import {
  DefaultUiTheme,
  attachTweenAttention,
  createAnimatedNumber,
  createAvatar,
  createBadge,
  createBanner,
  createBottomNav,
  createBottomSheet,
  createSidebar,
  createButtonBase,
  createCard,
  createCarousel,
  createCheckbox,
  createCoachMark,
  createCountdownRing,
  createDanmakuLayer,
  createDialog,
  createDivider,
  createDropdown,
  createEmptyState,
  createListRow,
  createLoadingSpinner,
  createMarquee,
  createNumberInput,
  createProgressBar,
  createRetryView,
  createRichTextView,
  createScrollView,
  createSkeleton,
  createStepper,
  createTextInput,
  createTooltip,
  createRadioGroup,
  createSectionHeader,
  createSlider,
  createSwitch,
  createTabs,
  createTag,
  createProfileCard,
  createStatGrid,
  createDataTable,
  showActionSheet,
  showFloatingText,
  showToast,
  type AttentionHandle,
  type AvatarStatus,
  type DataColumn,
  type SidebarItem,
  type StatEntry,
  type UiTheme,
  type UiComponentHandle,
} from '@privchat/cocos';

const { ccclass, property } = _decorator;

type TabKey =
  | 'inputs'
  | 'button'
  | 'navigation'
  | 'display'
  | 'overlay'
  | 'settings'
  | 'forms'
  | 'liveops'
  | 'guide'
  | 'poker';

/** Single source of truth for the "app navigation" domain — the
 *  state rendered as Sidebar in landscape and BottomNav in portrait.
 *  Independent from `TabKey` (the demo top tabs). */
type AppNavKey = 'home' | 'rooms' | 'chat' | 'me';

const TAB_BAR_HEIGHT = 44;
const TITLE_HEIGHT = 36;
const TITLE_FONT_BOOST = 4;
const SECTION_GAP = 16;
const BOTTOM_NAV_HEIGHT = 56; // matches BottomNav's DEFAULT_HEIGHT
const SIDEBAR_WIDTH = 80; // matches Sidebar's DEFAULT_WIDTH
// Fixed content height for the body's vertical scroll area. Sized to
// fit the tallest tab content (Settings / Forms) at the 720×1280
// portrait baseline. When the viewport is taller than this (portrait
// devices with tall screens) the ScrollView simply doesn't scroll;
// when shorter (landscape preview ~405h) it scrolls to reveal the
// bottom of the tab. Tab renderers DON'T need to know about this —
// they keep computing y as `ctx.height / 2 - offset`, just relative
// to a 1100-tall content node instead of the live viewport.
const BODY_CONTENT_HEIGHT = 1100;

@ccclass('UiComponentsDemoScene')
export class UiComponentsDemoScene extends Component {
  @property({ type: Node, tooltip: 'Container Node where the demo UI will mount.' })
  uiRoot: Node | null = null;

  private theme: UiTheme = DefaultUiTheme;
  /** The fixed-size viewport (has Mask + ScrollView). Children are
   *  cleared on tab switch / orientation rebuild via disposeBody(). */
  private bodyNode: Node | null = null;
  /** The scrollable content node inside bodyNode. Tab renderers
   *  mount their children here, so when content exceeds the
   *  viewport (e.g. landscape ~405h), they scroll into view. */
  private bodyContentNode: Node | null = null;
  /** ScrollView component on bodyNode; held so renderTab can
   *  reset scroll-to-top on tab switch. */
  private bodyScroll: ScrollView | null = null;
  private bodyHandles: UiComponentHandle[] = [];
  private bodyOwnedNodes: Node[] = [];
  private currentTab: TabKey = 'inputs';
  /** App-nav state — rendered as Sidebar (landscape) or BottomNav
   *  (portrait). Single source of truth across orientation rebuilds
   *  so rotating preserves the selected item. Independent from
   *  `currentTab`. */
  private appNavKey: AppNavKey = 'home';

  start(): void {
    if (!this.uiRoot) {
      console.error('[UiComponentsDemoScene] uiRoot is not assigned.');
      return;
    }
    this.build();
    // React to Cocos preview's Rotate button + actual device rotation
    // by disposing the current body and rebuilding against the new
    // viewport dimensions. Without this, controls stay positioned by
    // the initial-orientation height (e.g. 1280) and overflow when
    // landscape squashes the viewport to ~405px.
    screen.on('window-resize', this.handleResize, this);
    screen.on('orientation-change', this.handleResize, this);
  }

  protected override onDestroy(): void {
    screen.off('window-resize', this.handleResize, this);
    screen.off('orientation-change', this.handleResize, this);
    this.disposeBody();
  }

  private handleResize = (..._args: unknown[]): void => {
    if (!this.uiRoot) return;
    // Preserve currentTab across rebuild so the user lands on the
    // same tab they were viewing.
    this.disposeBody();
    this.build();
  };

  private build(): void {
    if (!this.uiRoot) return;
    const ui = this.uiRoot.getComponent(UITransform) ?? this.uiRoot.addComponent(UITransform);

    // Layout must use the ACTUAL visible viewport, not Canvas
    // UITransform — under Show All policy with a 1280×720 design,
    // a portrait device reports canvas=1280×720 + applies a global
    // ~0.5625× scale to letterbox, which makes every control look
    // shrunken (BottomNav icons, top tabs, labels). Reading
    // cc.view.getVisibleSize() instead gives us orientation-aware
    // dimensions in design space, so layout fills the screen and
    // the engine no longer needs to downscale. See plan §6.11
    // (fixed-dp scale rule).
    const visible = view.getVisibleSize();
    let canvasW = Math.round(visible.width);
    let canvasH = Math.round(visible.height);
    const MIN_DIM = 240;
    if (canvasW < MIN_DIM || canvasH < MIN_DIM) {
      // Editor preview before view is initialized — fall back to
      // UITransform, then to a portrait default.
      canvasW = ui.width >= MIN_DIM ? ui.width : 720;
      canvasH = ui.height >= MIN_DIM ? ui.height : 1280;
    }
    ui.setContentSize(canvasW, canvasH);

    // Diagnostic: confirm uiRoot.scale === (1,1,1) and surface what
    // the viewport actually reports. If rootScale != 1, something
    // upstream (Widget / parent transform / project scale) is
    // shrinking the UI — the kit's fixed-dp tokens assume scale=1.
    const rootScale = this.uiRoot.scale;
    console.log('[UiComponentsDemoScene] viewport=' +
      `${canvasW}×${canvasH} ` +
      `visible=${Math.round(visible.width)}×${Math.round(visible.height)} ` +
      `canvasUI=${ui.width}×${ui.height} ` +
      `rootScale=(${rootScale.x},${rootScale.y},${rootScale.z})`);

    const width = canvasW;
    const height = canvasH;
    const theme = this.theme;

    // Full-screen background — NOT pure black. A warm-charcoal
    // panel that the page chrome (title / tabs / body) sits on,
    // so cards have something to contrast against. Without this
    // every component reads as "floating on void".
    const bgNode = new Node('UiDemo_root_bg');
    const bgUi = bgNode.addComponent(UITransform);
    bgUi.setContentSize(canvasW, canvasH);
    const bgG = bgNode.addComponent(Graphics);
    const bgHex = theme.colors.background ?? '#0B0D10';
    const bgRgb = hexToColor(bgHex);
    bgG.fillColor = new Color(bgRgb.r, bgRgb.g, bgRgb.b, 255);
    bgG.rect(-canvasW / 2, -canvasH / 2, canvasW, canvasH);
    bgG.fill();
    this.uiRoot.addChild(bgNode);
    this.bodyOwnedNodes.push(bgNode);

    // Orientation-aware layout: landscape shows Sidebar at the left
    // edge (80px wide); portrait shows BottomNav at the bottom.
    // The body area (title + tabs + scrollable body) lives in the
    // remaining space to the RIGHT of the sidebar (landscape) or
    // FULL width (portrait).
    const isLandscape = width > height;
    const bodyAreaWidth = isLandscape ? width - SIDEBAR_WIDTH : width;
    const bodyAreaCenterX = isLandscape ? SIDEBAR_WIDTH / 2 : 0;

    const title = makeLabel('UI Components Demo', {
      theme,
      width: bodyAreaWidth,
      fontSize: theme.fontSize.lg + TITLE_FONT_BOOST,
      align: 'center',
    });
    title.setPosition(bodyAreaCenterX, height / 2 - TITLE_HEIGHT / 2 - 8);
    this.uiRoot.addChild(title);
    // Track so disposeBody() can clean it up on orientation rebuild;
    // otherwise a second title appears after Rotate.
    this.bodyOwnedNodes.push(title);

    const tabsHandle = createTabs<TabKey>({
      theme,
      width: bodyAreaWidth,
      height: TAB_BAR_HEIGHT,
      // Top-level Tabs use capsule-only — the design ref has NO
      // underline below the strip; the active tab's gold-edged
      // capsule + outer glow already carries the selection signal.
      variant: 'capsule',
      tabs: [
        { key: 'inputs',     label: 'Inputs',     iconText: '✎' },
        { key: 'button',     label: 'Button',     iconText: '◉' },
        { key: 'navigation', label: 'Navigation', iconText: '☰' },
        { key: 'display',    label: 'Display',    iconText: '▣' },
        { key: 'overlay',    label: 'Overlay',    iconText: '◐' },
        { key: 'settings',   label: 'Settings',   iconText: '⚙' },
        { key: 'forms',      label: 'Forms',      iconText: '✓' },
        { key: 'liveops',    label: 'Live Ops',   iconText: '◆' },
        { key: 'guide',      label: 'Guide',      iconText: '?' },
        { key: 'poker',      label: 'Poker',      iconText: '♠' },
      ],
      activeKey: this.currentTab,
      // scrollable: true honors the kit's fixed-dp scale rule
      // (plan §6.11). 9 tabs at natural width overflow a portrait
      // canvas — instead of compressing each tab to ≈80px (which
      // shrinks "Forms & States" labels), the strip becomes a
      // horizontal scroller; each tab keeps its landscape-size
      // font / height / padding.
      scrollable: true,
      onChange: (key: TabKey) => {
        this.currentTab = key;
        this.renderTab(key);
      },
    });
    const tabsCenterY = height / 2 - TITLE_HEIGHT - TAB_BAR_HEIGHT / 2 - 4;
    // Top nav-bar background — surface panel matching BottomNav's
    // depth so the two bars read as the same chrome. Painted BEFORE
    // tabsHandle so it lives z-below the Tabs node and its mask.
    const TOP_BAR_PANEL_H = TAB_BAR_HEIGHT + 12; // Tabs node UITransform = height + DIVIDER_GUTTER
    const topBarBg = new Node('TopBar_bg');
    const tbUi = topBarBg.addComponent(UITransform);
    tbUi.setContentSize(bodyAreaWidth, TOP_BAR_PANEL_H);
    const tbG = topBarBg.addComponent(Graphics);
    tbG.fillColor = hexToColor(theme.colors.surface ?? theme.colors.background);
    tbG.rect(-bodyAreaWidth / 2, -TOP_BAR_PANEL_H / 2, bodyAreaWidth, TOP_BAR_PANEL_H);
    tbG.fill();
    topBarBg.setPosition(bodyAreaCenterX, tabsCenterY);
    this.uiRoot.addChild(topBarBg);
    this.bodyOwnedNodes.push(topBarBg);

    tabsHandle.node.setPosition(bodyAreaCenterX, tabsCenterY);
    this.uiRoot.addChild(tabsHandle.node);
    this.bodyHandles.push(tabsHandle);

    // Decorative theme toggle (sun glyph) at top-right of body area.
    // Clicking is a no-op — runtime theme switching is out-of-scope.
    const themeToggleBtn = createButtonBase({
      theme,
      label: '☀',
      variant: 'ghost',
      width: 32,
      height: 32,
      onClick: () => console.log('[demo] theme toggle (decorative, no-op)'),
    });
    themeToggleBtn.node.setPosition(
      bodyAreaCenterX + bodyAreaWidth / 2 - 22,
      height / 2 - TITLE_HEIGHT - TAB_BAR_HEIGHT / 2 - 4,
    );
    this.uiRoot.addChild(themeToggleBtn.node);
    this.bodyHandles.push(themeToggleBtn);

    // Body: a fixed-size viewport (Mask + vertical ScrollView)
    // holding a taller scrollable content node. Title / top Tabs
    // stay above the body; portrait BottomNav stays BELOW the body;
    // landscape Sidebar stays to its LEFT. Body claims whatever's
    // left over.
    const body = new Node('UiDemo_body');
    const bodyUi = body.addComponent(UITransform);
    const bodyHeight = isLandscape
      ? height - TITLE_HEIGHT - TAB_BAR_HEIGHT - 12
      : height - TITLE_HEIGHT - TAB_BAR_HEIGHT - BOTTOM_NAV_HEIGHT - 12;
    bodyUi.setContentSize(bodyAreaWidth, bodyHeight);
    // Vertical center: in portrait we give up height for both the
    // top-fixed stack (title + tabs) and the bottom-fixed BottomNav.
    // In landscape only the top stack exists; BottomNav slot is 0.
    const bodyCenterY = isLandscape
      ? -(TITLE_HEIGHT + TAB_BAR_HEIGHT) / 2 - 4
      : -(TITLE_HEIGHT + TAB_BAR_HEIGHT - BOTTOM_NAV_HEIGHT) / 2 - 4;
    body.setPosition(bodyAreaCenterX, bodyCenterY);

    // Outer body panel — surface1 fill + goldDim border (same hue
    // as the Tabs hairline divider). Rendered BEFORE the body node
    // so it sits z-below the Mask + ScrollView. Slightly larger
    // than body so the gold edge shows around the viewport.
    const PANEL_INSET = 2;
    const panelW = bodyAreaWidth + PANEL_INSET * 2;
    const panelH = bodyHeight + PANEL_INSET * 2;
    const bodyPanelBg = new Node('UiDemo_body_panel_bg');
    const bpUi = bodyPanelBg.addComponent(UITransform);
    bpUi.setContentSize(panelW, panelH);
    const bpG = bodyPanelBg.addComponent(Graphics);
    bpG.fillColor = hexToColor(theme.colors.surface1 ?? theme.colors.surface);
    const bpAny = bpG as unknown as {
      roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
    };
    if (typeof bpAny.roundRect === 'function') {
      bpAny.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 12);
    }
    bpG.fill();
    bpG.strokeColor = hexToColor(theme.colors.goldDim ?? theme.colors.border);
    bpG.lineWidth = 1;
    if (typeof bpAny.roundRect === 'function') {
      bpAny.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 12);
    }
    bpG.stroke();
    bodyPanelBg.setPosition(bodyAreaCenterX, bodyCenterY);
    this.uiRoot.addChild(bodyPanelBg);
    this.bodyOwnedNodes.push(bodyPanelBg);
    const bodyMask = body.addComponent(Mask);
    bodyMask.type = Mask.Type.GRAPHICS_RECT;
    const bodyScroll = body.addComponent(ScrollView);
    bodyScroll.vertical = true;
    bodyScroll.horizontal = false;
    bodyScroll.inertia = true;
    bodyScroll.brake = 0.7;
    bodyScroll.elastic = true;
    bodyScroll.bounceDuration = 0.2;
    this.uiRoot.addChild(body);
    this.bodyNode = body;
    this.bodyScroll = bodyScroll;
    this.bodyOwnedNodes.push(body);

    // bodyContent: anchor (0.5, 0.5) keeps tab renderer's existing
    // `y = ctx.height/2 - offset` math working unchanged. Initial
    // position aligns content's top with viewport's top.
    const bodyContent = new Node('UiDemo_body_content');
    const bodyContentUi = bodyContent.addComponent(UITransform);
    bodyContentUi.setContentSize(bodyAreaWidth, BODY_CONTENT_HEIGHT);
    bodyContentUi.setAnchorPoint(0.5, 0.5);
    bodyContent.setPosition(0, bodyHeight / 2 - BODY_CONTENT_HEIGHT / 2, 0);
    body.addChild(bodyContent);
    bodyScroll.content = bodyContent;
    this.bodyContentNode = bodyContent;

    // Scene-level App nav: orientation-aware presentation.
    // Landscape → Sidebar (left edge), Portrait → BottomNav (bottom).
    // Both share `this.appNavKey` so rotating preserves selection.
    this.renderAppNav(isLandscape, canvasW, canvasH);

    this.renderTab(this.currentTab);
  }

  /** Render the App nav presentation that fits the current
   *  orientation. Both presentations share `this.appNavKey` as the
   *  single source of truth — clicking either updates it; the next
   *  orientation rebuild picks up the same value. */
  private renderAppNav(isLandscape: boolean, canvasW: number, canvasH: number): void {
    if (!this.uiRoot) return;
    const items: ReadonlyArray<SidebarItem<AppNavKey>> = [
      // Monochrome glyphs (NOT emoji) — design ref uses outlined
      // icons; emoji renders inconsistently across platforms and
      // clashes with the BlackGold language. Final-quality apps
      // wire SpriteFrame icons here; v1 demo uses unicode shapes.
      { key: 'home',  label: '首页', iconText: '⌂' },
      { key: 'rooms', label: '房间', iconText: '◈', badge: 3 },
      { key: 'chat',  label: '消息', iconText: '✉', badge: 142 },
      { key: 'me',    label: '我的', iconText: '◉' },
    ];
    if (isLandscape) {
      const sidebar = createSidebar<AppNavKey>({
        theme: this.theme,
        width: SIDEBAR_WIDTH,
        height: canvasH,
        logoText: 'U',
        items,
        activeKey: this.appNavKey,
        profile: { name: 'Brian', userId: '10000192', avatarText: 'B' },
        onChange: (k) => { this.appNavKey = k; },
      });
      // Anchor sidebar's center at canvas-left + SIDEBAR_WIDTH/2.
      sidebar.node.setPosition(-canvasW / 2 + SIDEBAR_WIDTH / 2, 0);
      this.uiRoot.addChild(sidebar.node);
      this.bodyHandles.push(sidebar);
    } else {
      const bottomNav = createBottomNav<AppNavKey>({
        theme: this.theme,
        width: canvasW,
        items,
        activeKey: this.appNavKey,
        onChange: (k) => { this.appNavKey = k; },
      });
      bottomNav.node.setPosition(0, -canvasH / 2 + BOTTOM_NAV_HEIGHT / 2);
      this.uiRoot.addChild(bottomNav.node);
      this.bodyHandles.push(bottomNav);
    }
  }

  private renderTab(key: TabKey): void {
    if (!this.bodyNode || !this.bodyContentNode) return;
    this.disposeTabContent();

    // Tab content mounts to bodyContentNode (the scrollable inner
    // node), NOT bodyNode (the fixed viewport). ctx.height is the
    // content's fixed designed height, NOT the viewport height —
    // so y math stays consistent across orientations / devices.
    const ctx: TabContext = {
      theme: this.theme,
      parent: this.bodyContentNode,
      width: this.bodyContentNode.getComponent(UITransform)?.width ?? 360,
      height: this.bodyContentNode.getComponent(UITransform)?.height ?? BODY_CONTENT_HEIGHT,
      register: (h) => this.bodyHandles.push(h),
      registerNode: (n) => this.bodyOwnedNodes.push(n),
      uiRoot: this.uiRoot!,
    };

    switch (key) {
      case 'inputs': renderInputsTab(ctx); break;
      case 'button': renderButtonTab(ctx); break;
      case 'navigation': renderNavigationTab(ctx); break;
      case 'display': renderDisplayTab(ctx); break;
      case 'overlay': renderOverlayTab(ctx); break;
      case 'settings': renderSettingsTab(ctx); break;
      case 'forms': renderFormsAndStatesTab(ctx); break;
      case 'liveops': renderLiveOpsTab(ctx); break;
      case 'guide': renderGuideTab(ctx); break;
      case 'poker': renderPokerTab(ctx); break;
    }

    // After populating the tab, reset the scroll to the top so the
    // user sees the start of the new tab rather than wherever the
    // previous tab left the scroll position.
    if (this.bodyScroll) this.bodyScroll.scrollToTop(0);
  }

  /** Tear down current tab content but leave the title + tabs +
   *  body container alive (they belong to `build`, not the per-tab
   *  rebuild). */
  private disposeTabContent(): void {
    if (!this.bodyNode || !this.bodyContentNode) return;
    // Dispose component handles FIRST so any setInterval / setTimeout
    // / cc.tween they own gets cleared. The earlier "just remove
    // children + destroy" path left Skeleton / Marquee / Carousel
    // autoplay tickers running on the destroyed nodes — those then
    // crashed on the next tick when applyRoundedBackground tried to
    // read a null UITransform. Always dispose() first; only THEN
    // tear down the node tree (most handles already destroy their
    // own node in dispose, so the children loop is a defensive
    // cleanup for anything not handled).
    //
    // Filter to handles whose node is currently inside our body
    // subtree (page-scoped Toast / Dialog handles attached to
    // uiRoot directly remain alive across tab switches; we leave
    // them to the host's own onDestroy).
    const subtreeHandles = this.bodyHandles.filter((h) =>
      isDescendantOf(h.node, this.bodyNode!),
    );
    for (const h of subtreeHandles) {
      try { h.dispose(); } catch { /* ignore */ }
    }
    // Drop subtree handles from the tracked list (they're disposed).
    this.bodyHandles = this.bodyHandles.filter((h) => !subtreeHandles.includes(h));

    // Defensive cleanup: remove anything left INSIDE bodyContentNode
    // (un-handle-tracked raw nodes or orphan descendants from a
    // partial dispose). Critically iterate bodyContentNode.children,
    // not bodyNode.children — bodyContentNode IS a child of bodyNode
    // and must survive across tab switches.
    for (const child of [...this.bodyContentNode.children]) {
      child.removeFromParent();
      child.destroy();
    }
    // Same for owned-node tracking.
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
    // bodyContentNode is bodyNode's child — bodyNode.destroy() above
    // tears it down too. Drop the refs so build() recreates them.
    this.bodyNode = null;
    this.bodyContentNode = null;
    this.bodyScroll = null;
  }
}

/** Walk up `n`'s parent chain and return true if `ancestor` is on
 *  the path. Used to decide if a tracked handle belongs to the
 *  current tab's body subtree. */
function isDescendantOf(n: Node | null | undefined, ancestor: Node): boolean {
  let cur: Node | null = n ?? null;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parent;
  }
  return false;
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
  const leftEdge = -width / 2 + 24;
  const rowWidth = width - 48;
  let y = ctx.height / 2 - 28;

  // Section: 基础选项
  y = mountSectionHeader(parent, ctx, y, rowWidth, '基础选项');
  y -= 16;

  const cb1 = createCheckbox({
    theme, label: 'Receive notifications', checked: true, width: rowWidth,
    onChange: (v) => console.log('[demo] checkbox-1', v),
  });
  cb1.node.setPosition(leftEdge + rowWidth / 2, y);
  parent.addChild(cb1.node);
  ctx.register(cb1);
  y -= 36;

  const cb2 = createCheckbox({
    theme, label: 'Auto-join voice', width: rowWidth,
    onChange: (v) => console.log('[demo] checkbox-2', v),
  });
  cb2.node.setPosition(leftEdge + rowWidth / 2, y);
  parent.addChild(cb2.node);
  ctx.register(cb2);
  y -= 36;

  const cb3 = createCheckbox({
    theme, label: 'Disabled checkbox', checked: true, disabled: true, width: rowWidth,
    onChange: () => { /* should never fire */ },
  });
  cb3.node.setPosition(leftEdge + rowWidth / 2, y);
  parent.addChild(cb3.node);
  ctx.register(cb3);

  // Section: 场景选择
  y -= 28;
  y = mountSectionHeader(parent, ctx, y, rowWidth, '场景选择');
  y -= 16;

  const radio = createRadioGroup<string>({
    theme,
    options: [
      { value: 'easy',   label: '休闲场' },
      { value: 'normal', label: '普通场' },
      { value: 'hard',   label: '高手场' },
    ],
    value: 'normal',
    width: rowWidth,
    onChange: (v) => console.log('[demo] radio', v),
  });
  radio.node.setPosition(leftEdge + rowWidth / 2, y - 60);
  parent.addChild(radio.node);
  ctx.register(radio);

  // 3-Switch row.
  y -= 160;
  const sw1 = createSwitch({ theme, on: true,  onChange: (v) => console.log('[demo] switch-1', v) });
  sw1.node.setPosition(-80, y);
  parent.addChild(sw1.node);
  ctx.register(sw1);

  const sw2 = createSwitch({ theme, on: false, onChange: (v) => console.log('[demo] switch-2', v) });
  sw2.node.setPosition(0, y);
  parent.addChild(sw2.node);
  ctx.register(sw2);

  const sw3 = createSwitch({ theme, on: true, disabled: true, onChange: () => {} });
  sw3.node.setPosition(80, y);
  parent.addChild(sw3.node);
  ctx.register(sw3);

  // Slider.
  y -= 50;
  const slider = createSlider({
    theme, min: 0, max: 100, step: 5, value: 30,
    width: Math.min(rowWidth, 320),
    onChange: (v) => console.log('[demo] slider drag', v),
    onCommit: (v) => console.log('[demo] slider commit', v),
  });
  slider.node.setPosition(0, y);
  parent.addChild(slider.node);
  ctx.register(slider);
}

// ---- Tab: Button ----
//
// Dedicated showcase for the Button primitive — the 4 variants
// (primary / secondary / ghost / danger) crossed with normal +
// disabled state, plus 3 height presets (28 / 36 / 44) to surface
// the kit's recommended sizes. Click-counter row at the bottom
// verifies onClick fires + disabled blocks clicks.

function renderButtonTab(ctx: TabContext): void {
  const { theme, parent, width, height } = ctx;
  const leftEdge = -width / 2 + 24;
  const rowWidth = width - 48;
  let y = height / 2 - 28;

  type V = 'primary' | 'secondary' | 'ghost' | 'danger';
  const variants: Array<{ v: V; label: string }> = [
    { v: 'primary',   label: 'Primary' },
    { v: 'secondary', label: 'Secondary' },
    { v: 'ghost',     label: 'Ghost' },
    { v: 'danger',    label: 'Danger' },
  ];

  const btnStep = (rowWidth - 8) / 4;
  const btnW = btnStep - 12;

  // Variants 变体
  y = mountSectionHeader(parent, ctx, y, rowWidth, 'Variants 变体');
  y -= 32;
  variants.forEach(({ v, label }, i) => {
    const btn = createButtonBase({
      theme, label, variant: v, width: btnW, height: 40,
      onClick: () => console.log('[demo] button', v),
    });
    btn.node.setPosition(leftEdge + btnStep * (i + 0.5), y);
    parent.addChild(btn.node);
    ctx.register(btn);
  });

  // Disabled 禁用状态
  y -= 48;
  y = mountSectionHeader(parent, ctx, y, rowWidth, 'Disabled 禁用状态');
  y -= 32;
  variants.forEach(({ v, label }, i) => {
    const btn = createButtonBase({
      theme, label, variant: v, width: btnW, height: 40, disabled: true,
      onClick: () => {},
    });
    btn.node.setPosition(leftEdge + btnStep * (i + 0.5), y);
    parent.addChild(btn.node);
    ctx.register(btn);
  });

  // Sizes 尺寸
  y -= 48;
  y = mountSectionHeader(parent, ctx, y, rowWidth, 'Sizes 尺寸');
  y -= 36;
  const sizes = [
    { h: 32, label: 'Small'  },
    { h: 40, label: 'Medium' },
    { h: 48, label: 'Large'  },
  ];
  const sizeStep = (rowWidth - 8) / 3;
  sizes.forEach(({ h, label }, i) => {
    const btn = createButtonBase({
      theme, label, variant: 'primary',
      width: sizeStep - 16, height: h,
      onClick: () => console.log('[demo] size', label),
    });
    btn.node.setPosition(leftEdge + sizeStep * (i + 0.5), y);
    parent.addChild(btn.node);
    ctx.register(btn);
  });

  // Click counter + Toggle Disable row.
  y -= 64;
  let clickCount = 0;
  const counterLabel = makeLabel('Clicks: 0', { theme, width: 120, align: 'left' });
  counterLabel.setPosition(leftEdge + 60, y);
  parent.addChild(counterLabel);
  ctx.registerNode(counterLabel);

  const clickBtn = createButtonBase({
    theme, label: 'Click me', variant: 'primary', width: 120, height: 36,
    onClick: () => {
      clickCount += 1;
      const lc = counterLabel.getComponent(Label);
      if (lc) lc.string = `Clicks: ${clickCount}`;
    },
  });
  clickBtn.node.setPosition(leftEdge + 220, y);
  parent.addChild(clickBtn.node);
  ctx.register(clickBtn);

  let demoDisabled = false;
  const toggleDisableBtn = createButtonBase({
    theme, label: 'Toggle Disable', variant: 'secondary', width: 140, height: 36,
    onClick: () => {
      demoDisabled = !demoDisabled;
      clickBtn.setDisabled(demoDisabled);
    },
  });
  toggleDisableBtn.node.setPosition(leftEdge + 360, y);
  parent.addChild(toggleDisableBtn.node);
  ctx.register(toggleDisableBtn);
}

// ---- Tab: Navigation ----

function renderNavigationTab(ctx: TabContext): void {
  const { theme, parent, width, height } = ctx;
  const innerWidth = width - 48;
  let y = height / 2 - 24;

  // Sub-tabs: 对决 / 房间 / 资料
  const innerTabs = createTabs<string>({
    theme,
    width: innerWidth,
    height: 44,
    variant: 'capsule',
    tabs: [
      { key: 'duel', label: '对决' },
      { key: 'rooms', label: '房间' },
      { key: 'profile', label: '资料' },
    ],
    activeKey: 'duel',
    onChange: (k) => console.log('[demo] sub-tab', k),
  });
  innerTabs.node.setPosition(0, y - 22);
  parent.addChild(innerTabs.node);
  ctx.register(innerTabs);
  y -= 64;

  // Sort selector A/B/C/D — a segmented-control look: 4 evenly-
  // spaced tab boxes inside a single rounded surface container.
  // The container provides the "outer frame" of the segmented
  // control; the inner Tabs(variant='capsule') paints the
  // gold-edged active capsule on the selected letter.
  const SORT_BOX_H = 48;
  const sortBox = new Node('sortBox');
  const sortBoxUi = sortBox.addComponent(UITransform);
  sortBoxUi.setContentSize(innerWidth, SORT_BOX_H);
  sortBox.setPosition(0, y - SORT_BOX_H / 2);
  const sortBoxG = sortBox.addComponent(Graphics);
  // hexToColor is a module-level helper (defined near makeLabel).
  const surface1Hex = theme.colors.surface1 ?? theme.colors.surface;
  const goldDimHex = theme.colors.goldDim ?? theme.colors.border;
  const sortBoxAny = sortBoxG as unknown as {
    roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
  };
  // Fill: surface1 rounded rect.
  sortBoxG.fillColor = hexToColor(surface1Hex);
  if (typeof sortBoxAny.roundRect === 'function') {
    sortBoxAny.roundRect(-innerWidth / 2, -SORT_BOX_H / 2, innerWidth, SORT_BOX_H, 8);
  }
  sortBoxG.fill();
  // Outer goldDim border.
  sortBoxG.strokeColor = hexToColor(goldDimHex);
  sortBoxG.lineWidth = 1;
  if (typeof sortBoxAny.roundRect === 'function') {
    sortBoxAny.roundRect(-innerWidth / 2, -SORT_BOX_H / 2, innerWidth, SORT_BOX_H, 8);
  }
  sortBoxG.stroke();
  parent.addChild(sortBox);
  ctx.registerNode(sortBox);

  const sortTabs = createTabs<string>({
    theme,
    width: innerWidth - 8,
    height: SORT_BOX_H - 8,
    variant: 'capsule',
    tabs: [
      { key: 'A', label: 'A' },
      { key: 'B', label: 'B' },
      { key: 'C', label: 'C' },
      { key: 'D', label: 'D' },
    ],
    activeKey: 'B',
    onChange: (k) => console.log('[demo] sort tab', k),
  });
  sortTabs.node.setPosition(0, y - SORT_BOX_H / 2);
  parent.addChild(sortTabs.node);
  ctx.register(sortTabs);
  y -= SORT_BOX_H + 16;

  // DataTable: room list.
  interface RoomRow {
    name: string;
    type: string;
    players: string;
    status: string;
  }
  const cols: ReadonlyArray<DataColumn<RoomRow>> = [
    { key: 'name',    header: '房间名称', width: 'auto', align: 'left' },
    { key: 'type',    header: '类型',     width: 100,    align: 'left' },
    { key: 'players', header: '玩家',     width: 80,     align: 'center' },
    { key: 'status',  header: '状态',     width: 110,    align: 'left' },
  ];
  const rows: ReadonlyArray<RoomRow> = [
    { name: '巅峰对决',   type: '高手场', players: '8/10', status: '● 进行中' },
    { name: '极速竞技',   type: '普通场', players: '5/10', status: '● 等待中' },
    { name: '休闲娱乐',   type: '休闲场', players: '2/8',  status: '● 等待中' },
    { name: '新手训练',   type: '休闲场', players: '1/6',  status: '● 等待中' },
  ];
  const table = createDataTable<RoomRow>({
    theme, width: innerWidth, columns: cols, rows,
    onRowClick: (row) => console.log('[demo] row', row.name),
  });
  const tableH = 40 + 44 * rows.length;
  table.node.setPosition(0, y - tableH / 2);
  parent.addChild(table.node);
  ctx.register(table);
  y -= tableH + 16;

  // "加载更多 ⌄" — secondary chip (dark fill + gold border), not
  // bare ghost text. Matches the design panel's button-shaped
  // pagination affordance.
  const moreBtn = createButtonBase({
    theme, label: '加载更多 ⌄', variant: 'secondary', width: 160, height: 38,
    onClick: () => console.log('[demo] load more'),
  });
  moreBtn.node.setPosition(0, y);
  parent.addChild(moreBtn.node);
  ctx.register(moreBtn);
}

// ---- Tab: Display ----

function renderDisplayTab(ctx: TabContext): void {
  const { theme, parent, width } = ctx;
  const visible = view.getVisibleSize();
  // Two-column layout if the viewport is wider than tall (landscape).
  const isWide = visible.width > visible.height;

  const SIDE_PADDING = 24;
  const SECTION_GAP = 18;
  const ROW_GAP = 18;
  const innerW = width - SIDE_PADDING * 2;

  let y = ctx.height / 2 - SIDE_PADDING;

  // ----- Section header helper (inside a Card) -----
  const mountHeaderInCard = (
    cardContent: Node,
    title: string,
    cardWidth: number,
    headerY: number,
  ): void => {
    const h = createSectionHeader({
      parent: cardContent,
      theme, width: cardWidth - 12, title,
    });
    h.node.setPosition(0, headerY);
    ctx.register(h);
  };

  // ----- 1. ProfileCard (always full-width — it carries its own card chrome) -----
  const PROFILE_H = 120;
  const profile = createProfileCard({
    theme, width: innerW,
    name: 'Brian', vipLevel: 'VIP', userId: '10000192', online: true,
  });
  profile.node.setPosition(0, y - PROFILE_H / 2);
  parent.addChild(profile.node);
  ctx.register(profile);
  y -= PROFILE_H + SECTION_GAP;

  // ----- 2. Progress + Tag row -----
  const PB_TAG_CARD_H = 110;
  const progressBarW = (cw: number): number => cw - 40;

  const renderProgressIntoCard = (cardWidth: number, cardCenterX: number, topY: number): void => {
    const card = createCard({
      parent, theme, width: cardWidth, height: PB_TAG_CARD_H,
    });
    card.node.setPosition(cardCenterX, topY - PB_TAG_CARD_H / 2);
    ctx.register(card);
    mountHeaderInCard(card.contentNode, '进度条', cardWidth, PB_TAG_CARD_H / 2 - 24);
    const pb = createProgressBar({
      theme, width: progressBarW(cardWidth), value: 75, max: 100, showLabel: true,
    });
    pb.node.setPosition(0, -10);
    card.contentNode.addChild(pb.node);
    ctx.register(pb);
  };

  const renderTagIntoCard = (cardWidth: number, cardCenterX: number, topY: number): void => {
    const card = createCard({
      parent, theme, width: cardWidth, height: PB_TAG_CARD_H,
    });
    card.node.setPosition(cardCenterX, topY - PB_TAG_CARD_H / 2);
    ctx.register(card);
    mountHeaderInCard(card.contentNode, '标签 Tag', cardWidth, PB_TAG_CARD_H / 2 - 24);

    const tagDefs: Array<{ label: string; color: 'gold' | 'blue' | 'purple' }> = [
      { label: '团人赛',   color: 'gold' },
      { label: '排位赛',   color: 'blue' },
      { label: '限时活动', color: 'purple' },
    ];
    let tagX = -(cardWidth / 2) + 18;
    tagDefs.forEach((t) => {
      const tag = createTag({ theme, label: t.label, color: t.color });
      const tagUi = tag.node.getComponent(UITransform);
      const tagW = tagUi?.width ?? 60;
      tag.node.setPosition(tagX + tagW / 2, -10);
      card.contentNode.addChild(tag.node);
      ctx.register(tag);
      tagX += tagW + 10;
    });
  };

  if (isWide) {
    const halfW = (innerW - ROW_GAP) / 2;
    renderProgressIntoCard(halfW, -innerW / 2 + halfW / 2, y);
    renderTagIntoCard(halfW, innerW / 2 - halfW / 2, y);
    y -= PB_TAG_CARD_H + SECTION_GAP;
  } else {
    renderProgressIntoCard(innerW, 0, y);
    y -= PB_TAG_CARD_H + ROW_GAP;
    renderTagIntoCard(innerW, 0, y);
    y -= PB_TAG_CARD_H + SECTION_GAP;
  }

  // ----- 3. Badge + Achievements row -----
  const BADGE_CARD_H = 150;
  const STAT_CARD_H = 150;

  const renderBadgeIntoCard = (cardWidth: number, cardCenterX: number, topY: number): void => {
    const card = createCard({
      parent, theme, width: cardWidth, height: BADGE_CARD_H,
    });
    card.node.setPosition(cardCenterX, topY - BADGE_CARD_H / 2);
    ctx.register(card);
    mountHeaderInCard(card.contentNode, '徽章 Badge', cardWidth, BADGE_CARD_H / 2 - 24);

    // Three solid-color glyph badges (no emoji). Each badge is a
    // rounded square with subtle border + center glyph.
    const badgeDefs: Array<{ glyph: string; colorHex: string }> = [
      { glyph: '♛', colorHex: theme.colors.gold ?? '#D6B56D' },           // crown — gold
      { glyph: '◇', colorHex: '#7CA7D9' },                                // shield — blue
      { glyph: '◆', colorHex: '#B45CFF' },                                // diamond — purple
    ];
    const BADGE_SIZE = 56;
    const BADGE_GAP = 12;
    const badgeRowW = badgeDefs.length * BADGE_SIZE + (badgeDefs.length - 1) * BADGE_GAP;
    let bx = -badgeRowW / 2 + BADGE_SIZE / 2;
    badgeDefs.forEach((b) => {
      const badge = renderSoloBadge(card.contentNode, b.glyph, b.colorHex, BADGE_SIZE);
      badge.setPosition(bx, -10);
      ctx.registerNode(badge);
      bx += BADGE_SIZE + BADGE_GAP;
    });
  };

  const renderStatIntoCard = (cardWidth: number, cardCenterX: number, topY: number): void => {
    const card = createCard({
      parent, theme, width: cardWidth, height: STAT_CARD_H,
    });
    card.node.setPosition(cardCenterX, topY - STAT_CARD_H / 2);
    ctx.register(card);
    mountHeaderInCard(card.contentNode, '成就 Achievements', cardWidth, STAT_CARD_H / 2 - 24);

    const stats: ReadonlyArray<StatEntry> = [
      { value: '128',  label: '胜场' },
      { value: '63%',  label: '胜率' },
      { value: '4.6',  label: 'K/D' },
      { value: '256',  label: 'MVP' },
    ];
    const grid = createStatGrid({
      theme, width: cardWidth - 24, stats, columns: 4, cellHeight: 72,
    });
    grid.node.setPosition(0, -10);
    card.contentNode.addChild(grid.node);
    ctx.register(grid);
  };

  if (isWide) {
    const badgeW = (innerW - ROW_GAP) * 0.38;
    const statW = (innerW - ROW_GAP) * 0.62;
    renderBadgeIntoCard(badgeW, -innerW / 2 + badgeW / 2, y);
    renderStatIntoCard(statW, innerW / 2 - statW / 2, y);
    y -= Math.max(BADGE_CARD_H, STAT_CARD_H) + SECTION_GAP;
  } else {
    renderBadgeIntoCard(innerW, 0, y);
    y -= BADGE_CARD_H + ROW_GAP;
    renderStatIntoCard(innerW, 0, y);
    y -= STAT_CARD_H + SECTION_GAP;
  }
}

/** Render a solo (no-count, no-host-Badge-component) badge container
 *  with surface2 fill + colored border + center glyph. Returns the
 *  badge Node mounted in `parent`. */
function renderSoloBadge(
  parent: Node,
  glyph: string,
  borderHex: string,
  size: number,
): Node {
  const node = new Node('SoloBadge');
  const nodeUi = node.addComponent(UITransform);
  nodeUi.setContentSize(size, size);
  const g = node.addComponent(Graphics);
  // Dark inner fill.
  g.fillColor = new Color(0x1B, 0x1B, 0x19, 255);
  const gAny = g as unknown as {
    roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
  };
  if (typeof gAny.roundRect === 'function') {
    gAny.roundRect(-size / 2, -size / 2, size, size, 12);
  }
  g.fill();
  // Colored border.
  g.strokeColor = hexToColor(borderHex);
  g.lineWidth = 2;
  if (typeof gAny.roundRect === 'function') {
    gAny.roundRect(-size / 2, -size / 2, size, size, 12);
  }
  g.stroke();
  parent.addChild(node);

  // Center glyph.
  const glyphNode = new Node('SoloBadge_glyph');
  glyphNode.addComponent(UITransform).setContentSize(size, size);
  const labelComp = glyphNode.addComponent(Label);
  labelComp.string = glyph;
  labelComp.fontSize = Math.round(size * 0.55);
  labelComp.lineHeight = Math.round(size * 0.55);
  labelComp.color = hexToColor(borderHex);
  labelComp.horizontalAlign = Label.HorizontalAlign.CENTER;
  labelComp.verticalAlign = Label.VerticalAlign.CENTER;
  node.addChild(glyphNode);
  return node;
}

// ---- Tab: Overlay (Phase E) ----

function renderOverlayTab(ctx: TabContext): void {
  const { theme, parent, width, height, uiRoot } = ctx;
  const leftEdge = -width / 2 + 24;
  const rowWidth = width - 48;

  // Section: Dialog triggers — 3 buttons.
  let y = height / 2 - 40;

  y = mountSectionHeader(parent, ctx, y, rowWidth, '对话框 Dialog');

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
  y = mountSectionHeader(parent, ctx, y, rowWidth, '底部面板 BottomSheet');

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
  y = mountSectionHeader(parent, ctx, y, rowWidth, '进度条 ProgressBar');

  // Per-row gap is sized so two ProgressBar containers (height + label
  // area when showLabel=true) don't visually crowd each other. Bar
  // itself is 8px; with the new above-the-bar label the container is
  // ~25px, so 40px gap leaves a clean 15px breathing room between rows.
  const BAR_GAP = 40;

  y -= 32;
  const pb0 = createProgressBar({ theme, width: 280, value: 0 });
  pb0.node.setPosition(leftEdge + 140, y);
  parent.addChild(pb0.node);
  ctx.register(pb0);

  y -= BAR_GAP;
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

  y -= BAR_GAP;
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
  y -= 40;
  let bumped = false;
  const animateBtn = createButtonBase({
    theme,
    label: '动画到 25%',
    variant: 'secondary',
    width: 140,
    height: 36,
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

  let usernameValue = 'Brian';
  const userRow = createListRow({
    parent: acctInner,
    theme,
    width: acctInnerW,
    label: '用户名',
    value: usernameValue,
    chevron: true,
    onClick: () => {
      // Phase G2: real edit flow via BottomSheet + TextInput.
      // BottomSheet's contentNode is the natural slot for form
      // content (Dialog's `message` is text-only). The sheet's
      // backdrop dismiss + close button + slide animation reuse
      // the existing primitive.
      const sheet = createBottomSheet({
        parent: uiRoot,
        theme,
        title: '修改用户名',
        height: 220,
        onClose: () => console.log('[demo] username sheet close'),
      });
      const sheetW = sheet.contentNode.getComponent(UITransform)?.width ?? 360;
      const inputWidth = Math.min(sheetW - 48, 360);

      const input = createTextInput({
        parent: sheet.contentNode,
        theme,
        width: inputWidth,
        value: usernameValue,
        placeholder: '输入新的用户名',
        maxLength: 24,
      });
      input.node.setPosition(0, 30);

      // Save / Cancel pinned at the bottom of the sheet body.
      const saveBtn = createButtonBase({
        theme,
        label: '保存',
        variant: 'primary',
        width: 120,
        height: 36,
        onClick: () => {
          const next = input.getValue().trim();
          if (next.length > 0 && next !== usernameValue) {
            usernameValue = next;
            userRow.setValue(usernameValue);
            console.log('[demo] username save', usernameValue);
          }
          input.dispose();
          saveBtn.dispose();
          cancelBtn.dispose();
          sheet.close();
        },
      });
      saveBtn.node.setPosition(70, -40);
      sheet.contentNode.addChild(saveBtn.node);

      const cancelBtn = createButtonBase({
        theme,
        label: '取消',
        variant: 'ghost',
        width: 120,
        height: 36,
        onClick: () => {
          input.dispose();
          saveBtn.dispose();
          cancelBtn.dispose();
          sheet.close();
        },
      });
      cancelBtn.node.setPosition(-70, -40);
      sheet.contentNode.addChild(cancelBtn.node);
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
    // Long option list to demonstrate the picker's vertical scroll.
    // 12+ entries forces the BottomSheet's clamped visible region
    // to overflow → ScrollView in Dropdown kicks in. 日本語 is
    // intentionally disabled to demo the option.disabled rejection
    // path (tap doesn't switch + label dims to textDisabled).
    options: [
      { value: 'zh-CN', label: '简体中文' },
      { value: 'zh-TW', label: '繁體中文' },
      { value: 'en-US', label: 'English' },
      { value: 'ja-JP', label: '日本語', disabled: true },
      { value: 'ko-KR', label: '한국어' },
      { value: 'es-ES', label: 'Español' },
      { value: 'fr-FR', label: 'Français' },
      { value: 'de-DE', label: 'Deutsch' },
      { value: 'pt-BR', label: 'Português (BR)' },
      { value: 'ru-RU', label: 'Русский' },
      { value: 'ar-SA', label: 'العربية' },
      { value: 'th-TH', label: 'ไทย' },
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
    // Same many-options story as the language picker — keeps the
    // demo's two Dropdowns visually consistent (both engage the
    // inner ScrollView). With only 3 options the sheet would fit
    // everything without scrolling, which reads as inconsistent
    // behavior next to the long language picker.
    options: [
      { value: 'classic', label: '经典绿' },
      { value: 'gold', label: '金色经典' },
      { value: 'midnight', label: '午夜蓝' },
      { value: 'forest', label: '森林深绿' },
      { value: 'ocean', label: '海洋蓝' },
      { value: 'sunset', label: '日落橙' },
      { value: 'royal', label: '皇家紫' },
      { value: 'cherry', label: '樱花粉' },
      { value: 'ice', label: '冰川蓝' },
      { value: 'phoenix', label: '凤凰红', disabled: true },
    ],
    onChange: (v) => console.log('[demo] theme →', v),
  });
  themeDropdown.node.setPosition(0, innerY);
  ctx.register(themeDropdown);

  cursorY -= gameCardHeight + CARD_GAP;

  // ---- Section: 德州设置 ----
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, '系统设置');
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

// ---- Tab: Forms & States (Phase G2) ----

function renderFormsAndStatesTab(ctx: TabContext): void {
  const { theme, parent, width, height } = ctx;
  const COL_WIDTH = Math.min(width - 40, 480);
  const SECTION_GAP_LOCAL = 28;

  const sv = makeVerticalScrollViewport(parent, ctx, width, height);
  const scrollContent = sv.content;
  let cursorY = -16;

  // ---- Section 1: TextInput / NumberInput / Stepper ----
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, '表单输入');
  cursorY -= 8;

  // TextInput sample
  cursorY -= 16;
  const nicknameInput = createTextInput({
    parent: scrollContent,
    theme,
    width: COL_WIDTH,
    placeholder: '输入昵称',
    value: '',
    maxLength: 16,
    onChange: (v) => console.log('[demo] nickname', v),
  });
  nicknameInput.node.setPosition(0, cursorY - 20);
  ctx.register(nicknameInput);
  cursorY -= 56;

  // NumberInput sample (wallet flavor)
  cursorY -= 12;
  const amountInput = createNumberInput({
    parent: scrollContent,
    theme,
    width: COL_WIDTH,
    placeholder: '充值金额',
    value: 1000,
    min: 0,
    max: 1000000,
    decimals: 2,
    thousands: true,
    onChange: (v) => console.log('[demo] amount', v),
    onCommit: (v) => console.log('[demo] amount commit', v),
  });
  amountInput.node.setPosition(0, cursorY - 20);
  ctx.register(amountInput);
  cursorY -= 56;

  // Stepper sample (room player count)
  cursorY -= 12;
  const seatsStepper = createStepper({
    parent: scrollContent,
    theme,
    width: 180,
    value: 6,
    min: 2,
    max: 9,
    step: 1,
    onChange: (v) => console.log('[demo] seats', v),
  });
  seatsStepper.node.setPosition(0, cursorY - 20);
  ctx.register(seatsStepper);
  cursorY -= 56;

  // ---- Section 2: Skeleton ----
  cursorY -= SECTION_GAP_LOCAL;
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, 'Skeleton 加载占位');
  cursorY -= 8;

  for (let i = 0; i < 3; i++) {
    cursorY -= 12;
    const skel = createSkeleton({
      parent: scrollContent,
      theme,
      width: COL_WIDTH,
      height: 56,
      radius: theme.radius.md,
    });
    skel.node.setPosition(0, cursorY - 28);
    ctx.register(skel);
    cursorY -= 56;
  }

  // ---- Section 3: EmptyState ----
  cursorY -= SECTION_GAP_LOCAL;
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, 'EmptyState 空状态');
  cursorY -= 8;

  const emptyHeight = 220;
  cursorY -= 12;
  const empty = createEmptyState({
    parent: scrollContent,
    theme,
    width: COL_WIDTH,
    iconText: '👥',
    title: '暂无好友',
    subtitle: '去添加一个好友开始第一局',
    action: {
      label: '去添加',
      variant: 'primary',
      onClick: () => console.log('[demo] empty state action'),
    },
  });
  empty.node.setPosition(0, cursorY - emptyHeight / 2);
  ctx.register(empty);
  cursorY -= emptyHeight;

  // ---- Section 4: RetryView ----
  cursorY -= SECTION_GAP_LOCAL;
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, 'RetryView 加载失败');
  cursorY -= 8;

  cursorY -= 12;
  const retry = createRetryView({
    parent: scrollContent,
    theme,
    width: COL_WIDTH,
    onRetry: () => console.log('[demo] retry triggered'),
  });
  retry.node.setPosition(0, cursorY - emptyHeight / 2);
  ctx.register(retry);
  cursorY -= emptyHeight;

  sv.setContentHeight(-cursorY + 32);
}

// ---- Tab: Live Ops (Phase G3) ----

function renderLiveOpsTab(ctx: TabContext): void {
  const { theme, parent, width, height } = ctx;
  const COL_WIDTH = Math.min(width - 40, 480);
  const SECTION_GAP = 20;

  const sv = makeVerticalScrollViewport(parent, ctx, width, height);
  const scrollContent = sv.content;
  let cursorY = -16;

  // Banner: 4 kinds stacked.
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, '系统横幅 (Banner)');
  cursorY -= 8;
  const bannerKinds: Array<{ kind: 'info' | 'success' | 'warning' | 'danger'; title: string; subtitle?: string }> = [
    { kind: 'info', title: '系统消息', subtitle: '今日凌晨 3:00 进行版本维护' },
    { kind: 'success', title: '签到成功', subtitle: '获得 500 金币奖励' },
    { kind: 'warning', title: '余额不足', subtitle: '请充值后继续游戏' },
    { kind: 'danger', title: '网络已断开', subtitle: '正在尝试重连…' },
  ];
  const bannerHeight = 64;
  for (const b of bannerKinds) {
    cursorY -= 12;
    const banner = createBanner({
      parent: scrollContent,
      theme,
      width: COL_WIDTH,
      kind: b.kind,
      title: b.title,
      subtitle: b.subtitle,
      onDismiss: () => console.log('[demo] banner dismissed', b.kind),
    });
    banner.node.setPosition(0, cursorY - bannerHeight / 2);
    ctx.register(banner);
    cursorY -= bannerHeight;
  }

  // Marquee: scrolling broadcast.
  cursorY -= SECTION_GAP;
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, '跑马灯 (Marquee)');
  cursorY -= 8;
  cursorY -= 12;
  const marquee = createMarquee({
    parent: scrollContent,
    theme,
    width: COL_WIDTH,
    height: 32,
    text: '🎉 恭喜玩家 Brian 在德州扑克中赢得 $100,000 筹码！  ·  系统将于今晚 03:00 维护，请提前下线  ·  新春活动开启，登录送 1000 金币',
    speed: 80,
    background: theme.colors.surfaceElevated,
  });
  marquee.node.setPosition(0, cursorY - 16);
  ctx.register(marquee);
  cursorY -= 32;

  // FloatingText trigger.
  cursorY -= SECTION_GAP;
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, '飘字 (FloatingText)');
  cursorY -= 8;
  cursorY -= 12;
  const floatBtn = createButtonBase({
    theme,
    label: '你赢了 +1000',
    variant: 'primary',
    width: 180,
    height: 40,
    onClick: () => {
      // Spawn the floater above the button.
      showFloatingText({
        parent: scrollContent,
        theme,
        text: '+1000',
        x: 0,
        y: cursorY + 60,
        color: theme.colors.success,
        fontSize: 32,
      });
    },
  });
  floatBtn.node.setPosition(0, cursorY - 20);
  scrollContent.addChild(floatBtn.node);
  ctx.register(floatBtn);
  cursorY -= 40;

  // Danmaku (Phase G5)
  cursorY -= SECTION_GAP;
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, '弹幕 (Danmaku)');
  cursorY -= 8;
  cursorY -= 12;
  const danmakuH = 160;
  const danmaku = createDanmakuLayer({
    parent: scrollContent,
    theme,
    width: COL_WIDTH,
    height: danmakuH,
    lanes: 4,
    speed: 120,
  });
  danmaku.node.setPosition(0, cursorY - danmakuH / 2);
  ctx.register(danmaku);
  cursorY -= danmakuH;

  // Trigger button: pushes a random message into the danmaku layer.
  // Each tap fires N pushes back-to-back so lanes / queue fill up
  // realistically — single-push doesn't demo the scheduling.
  const danmakuSamples = [
    { text: '🎉 GG！绝杀！', color: theme.colors.success },
    { text: '让我看看', color: theme.colors.textPrimary },
    { text: '666666', color: theme.colors.warning },
    { text: '这把要 all in 了', color: theme.colors.danger },
    { text: '主播秀！', color: theme.colors.primary },
    { text: '稳啊', color: theme.colors.textPrimary },
    { text: '太刺激了', color: theme.colors.warning },
    { text: '🐲🐲🐲', color: theme.colors.success },
  ];
  cursorY -= 12;
  const danmakuBtn = createButtonBase({
    theme,
    label: '发送 5 条随机弹幕',
    variant: 'primary',
    width: 200,
    height: 40,
    onClick: () => {
      for (let k = 0; k < 5; k++) {
        const sample = danmakuSamples[Math.floor(Math.random() * danmakuSamples.length)];
        if (sample) danmaku.push(sample);
      }
    },
  });
  danmakuBtn.node.setPosition(0, cursorY - 20);
  scrollContent.addChild(danmakuBtn.node);
  ctx.register(danmakuBtn);
  cursorY -= 40;

  // Carousel: 4 placeholder activity slides. Each slide is a Node
  // containing a Banner — dogfoods the kit's own primitive and
  // gives us themed tint + title for free, without exposing
  // createBackground / applyRoundedBackground from the library
  // surface just for this demo.
  cursorY -= SECTION_GAP;
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, '轮播 (Carousel)');
  cursorY -= 8;
  cursorY -= 12;
  const carouselH = 160;
  const slideTitles = ['新春活动', '比赛入口', 'VIP 礼包', '邀请好友赢筹码'];
  const slideKinds: Array<'info' | 'success' | 'warning' | 'danger'> = ['info', 'success', 'warning', 'danger'];
  const slides: Node[] = [];
  for (let k = 0; k < 4; k++) {
    const slide = new Node(`Slide_${k}`);
    const su = slide.addComponent(UITransform);
    su.setContentSize(COL_WIDTH, carouselH);
    const banner = createBanner({
      parent: slide,
      theme,
      width: COL_WIDTH,
      kind: slideKinds[k] ?? 'info',
      title: slideTitles[k] ?? `活动 ${k + 1}`,
      subtitle: `点击查看详情 #${k + 1}`,
      dismissible: false,
    });
    banner.node.setPosition(0, 0);
    ctx.register(banner);
    slides.push(slide);
  }
  const carousel = createCarousel({
    parent: scrollContent,
    theme,
    width: COL_WIDTH,
    height: carouselH,
    items: slides,
    autoplay: true,
    intervalMs: 4000,
    onChange: (i) => console.log('[demo] carousel index', i),
  });
  carousel.node.setPosition(0, cursorY - carouselH / 2);
  ctx.register(carousel);
  cursorY -= carouselH;

  // RichTextView.
  cursorY -= SECTION_GAP;
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, '富文本 (RichTextView)');
  cursorY -= 8;
  const richH = 80;
  cursorY -= 12;
  const rich = createRichTextView({
    parent: scrollContent,
    theme,
    width: COL_WIDTH,
    text: '<color=#e8eaed>德州扑克规则：</color><color=#52c41a>大盲</color>必须下注，<color=#faad14>小盲</color>下注一半，<b>底池</b>累加，最大牌型 = <color=#ff4d4f>皇家同花顺</color>。',
  });
  rich.node.setPosition(0, cursorY - richH / 2);
  ctx.register(rich);
  cursorY -= richH;

  sv.setContentHeight(-cursorY + 32);
}

// ---- Tab: Guide (Phase G4) ----

function renderGuideTab(ctx: TabContext): void {
  const { theme, parent, width, height, uiRoot } = ctx;
  const COL_WIDTH = Math.min(width - 40, 480);

  const sv = makeVerticalScrollViewport(parent, ctx, width, height);
  const scrollContent = sv.content;
  let cursorY = -16;

  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, 'ActionSheet');
  cursorY -= 8;
  cursorY -= 12;
  const actionBtn = createButtonBase({
    theme,
    label: '打开玩家操作',
    variant: 'primary',
    width: 180,
    height: 40,
    onClick: () => {
      showActionSheet({
        parent: uiRoot,
        theme,
        title: '玩家操作',
        actions: [
          { label: '查看资料', onClick: () => console.log('[demo] action 查看资料') },
          { label: '私聊', onClick: () => console.log('[demo] action 私聊') },
          { label: '拉黑', variant: 'danger', onClick: () => console.log('[demo] action 拉黑') },
        ],
      });
    },
  });
  actionBtn.node.setPosition(0, cursorY - 20);
  scrollContent.addChild(actionBtn.node);
  ctx.register(actionBtn);
  cursorY -= 40;

  // Tooltip
  cursorY -= 24;
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, 'Tooltip');
  cursorY -= 8;
  cursorY -= 12;
  let activeTooltip: { dispose(): void } | null = null;
  const tooltipBtn = createButtonBase({
    theme,
    label: '点击显示 Tooltip',
    variant: 'secondary',
    width: 200,
    height: 40,
    onClick: () => {
      if (activeTooltip) {
        activeTooltip.dispose();
        activeTooltip = null;
        return;
      }
      activeTooltip = createTooltip({
        parent: scrollContent,
        theme,
        target: tooltipBtn.node,
        text: '这是一个 tooltip 解释',
        placement: 'top',
        durationMs: 4000,
      });
    },
  });
  tooltipBtn.node.setPosition(0, cursorY - 20);
  scrollContent.addChild(tooltipBtn.node);
  ctx.register(tooltipBtn);
  cursorY -= 40;

  // CoachMark (3 steps walking through 3 buttons in this tab).
  cursorY -= 24;
  cursorY = mountSectionHeader(scrollContent, ctx, cursorY, COL_WIDTH, 'CoachMark 新手引导');
  cursorY -= 8;
  cursorY -= 12;
  // Three target buttons stacked, then a "start coach" button below.
  const targets: Node[] = [];
  for (let k = 0; k < 3; k++) {
    const btn = createButtonBase({
      theme,
      label: `步骤 ${k + 1} 目标`,
      variant: k === 0 ? 'primary' : k === 1 ? 'secondary' : 'ghost',
      width: 180,
      height: 40,
      onClick: () => console.log('[demo] target', k),
    });
    btn.node.setPosition(0, cursorY - 20);
    scrollContent.addChild(btn.node);
    ctx.register(btn);
    targets.push(btn.node);
    cursorY -= 48;
  }

  cursorY -= 12;
  const coachBtn = createButtonBase({
    theme,
    label: '启动新手引导',
    variant: 'primary',
    width: 180,
    height: 40,
    onClick: () => {
      const target0 = targets[0];
      const target1 = targets[1];
      const target2 = targets[2];
      if (!target0 || !target1 || !target2) return;
      createCoachMark({
        parent: uiRoot,
        theme,
        steps: [
          { target: target0, text: '这是第一步——核心操作按钮', placement: 'right' },
          { target: target1, text: '这里是次要操作，可选', placement: 'right' },
          { target: target2, text: '最后这里是辅助选项', placement: 'right' },
        ],
        onFinish: () => console.log('[demo] coach finish'),
        onSkip: () => console.log('[demo] coach skip'),
      });
    },
  });
  coachBtn.node.setPosition(0, cursorY - 20);
  scrollContent.addChild(coachBtn.node);
  ctx.register(coachBtn);
  cursorY -= 40;

  sv.setContentHeight(-cursorY + 32);
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

/** Parse a hex color string (#RRGGBB or #RRGGBBAA) to a cc.Color.
 *  Demo-internal helper because the library's parseHexColor is not
 *  re-exported. */
function hexToColor(hex: string): Color {
  const h = hex.replace('#', '');
  return new Color(
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
    h.length === 8 ? parseInt(h.substring(6, 8), 16) : 255,
  );
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
