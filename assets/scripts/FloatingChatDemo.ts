// v0.1.2 demo for `PrivchatCocos.openChatWindow`. Renders a small
// "fake game UI" page: 3 friend chips + 1 customer-service chip + a
// "modal toggle" switch. Tapping a friend opens a `'right'`-placed
// chat window; the support button opens a `'bottom-right'` window.
// Multiple windows can stack so the multi-instance contract is
// observable in the demo.
//
// Mock mode is intentionally NOT supported here — DemoMockAdapter
// has no real channel-list / observe-conversation wire, so opening a
// chat window would only render an empty timeline. The host scene
// (DemoChatScene) routes mock-mode taps to a console.warn. Real-SDK
// only.

import {
  Button,
  Color,
  Component,
  Graphics,
  Label,
  Node,
  UITransform,
  _decorator,
} from 'cc';
import {
  PrivchatClient,
  PrivchatCocos,
  type ChatWindowHandle,
  type ThemeConfig,
} from '@privchat/cocos';

const { ccclass } = _decorator;
void ccclass; // future: make it a Cocos Component if desired

export interface FloatingChatDemoOptions {
  root: Node;
  theme: ThemeConfig;
  client: PrivchatClient;
  /** Where windows mount. Typically the same Node as `root` (or a
   *  dedicated overlay layer). */
  windowParent: Node;
  onBack: () => void;
}

interface RGBA { r: number; g: number; b: number; a: number; }

interface FakeFriend {
  channelId: string;
  channelType: number;
  name: string;
  subtitle: string;
  initial: string;
}

const FAKE_FRIENDS: FakeFriend[] = [
  // The channelIds here are placeholders — for the demo to actually
  // render messages they must exist server-side. Manual E2E doc
  // explains how to seed.
  {
    channelId: '100001',
    channelType: 1,
    name: '艾莉丝',
    subtitle: '在线',
    initial: '艾',
  },
  {
    channelId: '100002',
    channelType: 1,
    name: 'Bob',
    subtitle: '通常几分钟内回复',
    initial: 'B',
  },
  {
    channelId: '100003',
    channelType: 1,
    name: 'Charlie',
    subtitle: '@charlie_dev',
    initial: 'C',
  },
];

const SUPPORT_CHANNEL: FakeFriend = {
  channelId: 'support_10001',
  channelType: 1,
  name: '在线客服',
  subtitle: '通常几分钟内回复',
  initial: '客',
};

export interface FloatingChatDemoHandle {
  dispose(): void;
}

export function createFloatingChatDemo(
  opts: FloatingChatDemoOptions,
): FloatingChatDemoHandle {
  const { root, theme, client, windowParent, onBack } = opts;
  const ui = root.getComponent(UITransform) ?? root.addComponent(UITransform);
  const width = ui.width || 360;
  const height = ui.height || 640;

  const colorBg = parseHex(theme.colors.background);
  const colorSurface = parseHex(theme.colors.surface);
  const colorPrimary = parseHex(theme.colors.primary);
  const colorText = parseHex(theme.colors.textPrimary);
  const colorSecondary = parseHex(theme.colors.textSecondary);

  // Track open windows so we can dispose them when the page tears down.
  // Multi-window: each entry tap creates an independent handle that
  // gets removed from this set on close.
  const openWindows = new Set<ChatWindowHandle>();
  let modalEnabled = false;

  const owned: Node[] = [];

  // Page background
  const bg = createRect('FloatingDemoBg', width, height, 0, colorBg);
  bg.setPosition(0, 0);
  root.addChild(bg);
  owned.push(bg);

  // Top NavBar with back button
  const navTitle = createLabel('FloatingNavTitle', {
    text: '悬浮聊天测试',
    fontSize: 17,
    color: colorText,
    width: width - 120,
    height: 48,
    align: 'center',
  });
  const navBg = createRect('FloatingNavBg', width, 48, 0, colorSurface);
  navBg.setPosition(0, height / 2 - 24);
  root.addChild(navBg);
  owned.push(navBg);
  navTitle.setPosition(0, height / 2 - 24);
  root.addChild(navTitle);
  owned.push(navTitle);

  const backBtn = createButton({
    name: 'FloatingBack',
    width: 60,
    height: 36,
    radius: 8,
    bgColor: { r: 0, g: 0, b: 0, a: 0 },
    textColor: colorPrimary,
    text: '< 返回',
    fontSize: 14,
  });
  backBtn.setPosition(-width / 2 + 38, height / 2 - 24);
  backBtn.on('click', onBack);
  root.addChild(backBtn);
  owned.push(backBtn);

  // Modal toggle row — lets the tester verify both modal and non-modal
  // window behavior without a code change.
  const toggleY = height / 2 - 80;
  const toggleLabel = createLabel('ModalToggleLabel', {
    text: '模态遮罩(modal)',
    fontSize: 14,
    color: colorText,
    width: 180,
    height: 28,
    align: 'left',
  });
  toggleLabel.setPosition(-width / 2 + 110, toggleY);
  root.addChild(toggleLabel);
  owned.push(toggleLabel);

  const toggleBtn = createButton({
    name: 'ModalToggleBtn',
    width: 80,
    height: 28,
    radius: 6,
    bgColor: lighten(colorSurface, 0.25),
    textColor: colorText,
    text: '关闭',
    fontSize: 13,
  });
  toggleBtn.setPosition(width / 2 - 60, toggleY);
  const toggleBtnLabel = toggleBtn.children[1]?.getComponent(Label) ?? null;
  toggleBtn.on('click', () => {
    modalEnabled = !modalEnabled;
    if (toggleBtnLabel) toggleBtnLabel.string = modalEnabled ? '开启' : '关闭';
  });
  root.addChild(toggleBtn);
  owned.push(toggleBtn);

  // Section header
  const friendsLabel = createLabel('FriendsHeader', {
    text: '点头像 → 弹出私聊窗口(右侧)',
    fontSize: 13,
    color: colorSecondary,
    width: width - 32,
    height: 20,
    align: 'left',
  });
  friendsLabel.setPosition(0, toggleY - 50);
  root.addChild(friendsLabel);
  owned.push(friendsLabel);

  // Friend chips — vertical stack on the page
  const chipStartY = toggleY - 90;
  for (let i = 0; i < FAKE_FRIENDS.length; i++) {
    const friend = FAKE_FRIENDS[i];
    if (friend === undefined) continue;
    const chip = createFriendChip(friend, colorSurface, colorText, colorSecondary, colorPrimary);
    chip.setPosition(0, chipStartY - i * 72);
    chip.on('click', () => {
      const win = PrivchatCocos.openChatWindow({
        parent: windowParent,
        client,
        channelId: friend.channelId,
        channelType: friend.channelType,
        title: friend.name,
        subtitle: friend.subtitle,
        theme,
        placement: 'right',
        modal: modalEnabled,
        closeOnBackdrop: false,
        onClose: () => openWindows.delete(win),
        onError: (e) => console.warn('[FloatingDemo][friend]', e),
      });
      openWindows.add(win);
    });
    root.addChild(chip);
    owned.push(chip);
  }

  // Support row at the bottom
  const supportLabel = createLabel('SupportHeader', {
    text: '点客服 → 弹出客服窗口(右下角)',
    fontSize: 13,
    color: colorSecondary,
    width: width - 32,
    height: 20,
    align: 'left',
  });
  supportLabel.setPosition(0, chipStartY - FAKE_FRIENDS.length * 72 - 24);
  root.addChild(supportLabel);
  owned.push(supportLabel);

  const supportChip = createFriendChip(
    SUPPORT_CHANNEL,
    colorSurface,
    colorText,
    colorSecondary,
    colorPrimary,
  );
  supportChip.setPosition(0, chipStartY - FAKE_FRIENDS.length * 72 - 60);
  supportChip.on('click', () => {
    const win = PrivchatCocos.openChatWindow({
      parent: windowParent,
      client,
      channelId: SUPPORT_CHANNEL.channelId,
      channelType: SUPPORT_CHANNEL.channelType,
      title: SUPPORT_CHANNEL.name,
      subtitle: SUPPORT_CHANNEL.subtitle,
      theme,
      placement: 'bottom-right',
      modal: modalEnabled,
      closeOnBackdrop: false,
      onClose: () => openWindows.delete(win),
      onError: (e) => console.warn('[FloatingDemo][support]', e),
    });
    openWindows.add(win);
  });
  root.addChild(supportChip);
  owned.push(supportChip);

  return {
    dispose() {
      // Hard-tear-down all open windows. Use dispose() (not close()) so
      // the per-window onClose doesn't fire and try to mutate
      // openWindows during iteration.
      for (const w of openWindows) w.dispose();
      openWindows.clear();
      backBtn.off('click', onBack);
      for (const n of owned) {
        n.removeFromParent();
        n.destroy();
      }
    },
  };
}

// ---------------- helpers ----------------

function createFriendChip(
  friend: FakeFriend,
  surface: RGBA,
  text: RGBA,
  secondary: RGBA,
  accent: RGBA,
): Node {
  const W = 280;
  const H = 60;
  const node = new Node(`Friend_${friend.channelId}`);
  const ui = node.addComponent(UITransform);
  ui.setContentSize(W, H);

  const bg = createRect(`${node.name}_bg`, W, H, 8, lighten(surface, 0.18));
  node.addChild(bg);

  // Square avatar
  const avatarSize = 44;
  const avatar = createRect(`${node.name}_avatar`, avatarSize, avatarSize, 8, accent);
  avatar.setPosition(-W / 2 + avatarSize / 2 + 8, 0);
  node.addChild(avatar);

  const initialLbl = createLabel(`${node.name}_initial`, {
    text: friend.initial,
    fontSize: 18,
    color: { r: 30, g: 18, b: 8, a: 255 },
    width: avatarSize,
    height: avatarSize,
    align: 'center',
  });
  avatar.addChild(initialLbl);

  // Name + subtitle stack
  const nameLbl = createLabel(`${node.name}_name`, {
    text: friend.name,
    fontSize: 15,
    color: text,
    width: W - avatarSize - 24,
    height: 20,
    align: 'left',
  });
  nameLbl.setPosition(avatarSize / 2 + 8, 8);
  node.addChild(nameLbl);

  const subLbl = createLabel(`${node.name}_sub`, {
    text: friend.subtitle,
    fontSize: 12,
    color: secondary,
    width: W - avatarSize - 24,
    height: 16,
    align: 'left',
  });
  subLbl.setPosition(avatarSize / 2 + 8, -10);
  node.addChild(subLbl);

  // Hit-target Button so 'click' fires
  const btn = node.addComponent(Button);
  btn.target = node;
  btn.transition = 0;
  return node;
}

function parseHex(input: string): RGBA {
  const hex = input.startsWith('#') ? input.slice(1) : input;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255,
  };
}

function lighten(c: RGBA, amount: number): RGBA {
  return {
    r: Math.min(255, Math.round(c.r + (255 - c.r) * amount)),
    g: Math.min(255, Math.round(c.g + (255 - c.g) * amount)),
    b: Math.min(255, Math.round(c.b + (255 - c.b) * amount)),
    a: c.a,
  };
}

function createRect(name: string, w: number, h: number, radius: number, color: RGBA): Node {
  const n = new Node(name);
  const ui = n.addComponent(UITransform);
  ui.setContentSize(w, h);
  const g = n.addComponent(Graphics);
  g.fillColor = new Color(color.r, color.g, color.b, color.a);
  const x0 = -w / 2;
  const y0 = -h / 2;
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  const gAny = g as unknown as {
    roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
    rect?: (x: number, y: number, w: number, h: number) => void;
  };
  if (r > 0 && typeof gAny.roundRect === 'function') gAny.roundRect(x0, y0, w, h, r);
  else if (typeof gAny.rect === 'function') gAny.rect(x0, y0, w, h);
  if (color.a > 0) g.fill();
  return n;
}

interface LabelOpts {
  text: string;
  fontSize: number;
  color: RGBA;
  width: number;
  height: number;
  align?: 'left' | 'center' | 'right';
  vAlign?: 'top' | 'center' | 'bottom';
}
function createLabel(name: string, opts: LabelOpts): Node {
  const n = new Node(name);
  const ui = n.addComponent(UITransform);
  ui.setContentSize(opts.width, opts.height);
  const l = n.addComponent(Label);
  l.string = opts.text;
  l.fontSize = opts.fontSize;
  l.color = new Color(opts.color.r, opts.color.g, opts.color.b, opts.color.a);
  l.horizontalAlign =
    opts.align === 'center'
      ? Label.HorizontalAlign.CENTER
      : opts.align === 'right'
      ? Label.HorizontalAlign.RIGHT
      : Label.HorizontalAlign.LEFT;
  l.verticalAlign =
    opts.vAlign === 'top'
      ? Label.VerticalAlign.TOP
      : opts.vAlign === 'bottom'
      ? Label.VerticalAlign.BOTTOM
      : Label.VerticalAlign.CENTER;
  l.overflow = Label.Overflow.SHRINK;
  return n;
}

interface ButtonOpts {
  name: string;
  width: number;
  height: number;
  radius: number;
  bgColor: RGBA;
  textColor: RGBA;
  text: string;
  fontSize: number;
}
function createButton(opts: ButtonOpts): Node {
  const n = new Node(opts.name);
  const ui = n.addComponent(UITransform);
  ui.setContentSize(opts.width, opts.height);
  if (opts.bgColor.a > 0) {
    const bg = createRect(`${opts.name}_bg`, opts.width, opts.height, opts.radius, opts.bgColor);
    n.addChild(bg);
  }
  const lbl = createLabel(`${opts.name}_label`, {
    text: opts.text,
    fontSize: opts.fontSize,
    color: opts.textColor,
    width: opts.width,
    height: opts.height,
    align: 'center',
  });
  n.addChild(lbl);
  const btn = n.addComponent(Button);
  btn.target = n;
  btn.transition = 0;
  return n;
}

// Used to satisfy TS "Component is unused" warning while we keep the
// file structurally a candidate for promotion to a Component later.
void Component;
