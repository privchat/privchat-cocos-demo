// Floating-chat demo page — Phase-G UI Kit primitives only:
//   - createNavBar         page header (title + < 返回)
//   - createSwitch         modal遮罩 toggle
//   - createListRow        friend / support entries (label +
//                          subtitle + leading Avatar, tap → open
//                          chat window / chat sheet)
//   - createAvatar         each entry's avatar (rounded, theme-tinted)
//   - plain cc.Label       section headers (decorative)
//
// Friend chips → `openChatWindow` (right-side floating window).
// Support chip → `openChatSheet`  (bottom-sheet — the standard
// 客服 / 私聊 弹层 pattern).

import {
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
  NAV_BAR_HEIGHT,
  createAvatar,
  createListRow,
  createNavBar,
  createSwitch,
  getUiTheme,
  type AvatarHandle,
  type ChatSheetHandle,
  type ChatWindowHandle,
  type ListRowHandle,
  type NavBarHandle,
  type SwitchHandle,
  type ThemeConfig,
} from '@privchat/cocos';

const { ccclass } = _decorator;
void ccclass;

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
}

const FAKE_FRIENDS: FakeFriend[] = [
  { channelId: '100001', channelType: 1, name: '艾莉丝',  subtitle: '在线' },
  { channelId: '100002', channelType: 1, name: 'Bob',     subtitle: '通常几分钟内回复' },
  { channelId: '100003', channelType: 1, name: 'Charlie', subtitle: '@charlie_dev' },
];

const SUPPORT_CHANNEL: FakeFriend = {
  channelId: 'support_10001',
  channelType: 1,
  name: '在线客服',
  subtitle: '通常几分钟内回复',
};

const ROW_W = 300;
const ROW_H = 64;
const ROW_GAP = 8;
const AVATAR_SIZE = 48;

export interface FloatingChatDemoHandle {
  dispose(): void;
}

export function createFloatingChatDemo(
  opts: FloatingChatDemoOptions,
): FloatingChatDemoHandle {
  const { root, theme, client, windowParent, onBack } = opts;
  const uiTheme = getUiTheme(theme);
  const ui = root.getComponent(UITransform) ?? root.addComponent(UITransform);
  const width = ui.width || 360;
  const height = ui.height || 640;

  const colorBg = parseHex(theme.colors.background);
  const colorText = parseHex(theme.colors.textPrimary);
  const colorSecondary = parseHex(theme.colors.textSecondary);

  const openWindows = new Set<ChatWindowHandle>();
  const openSheets = new Set<ChatSheetHandle>();
  let modalEnabled = false;

  const ownedNodes: Node[] = [];
  const ownedHandles: Array<{ dispose(): void }> = [];

  // ----- Page background -----
  const bg = createPlainRect('FloatingDemoBg', width, height, colorBg);
  bg.setPosition(0, 0);
  root.addChild(bg);
  ownedNodes.push(bg);

  // ----- NavBar (kit primitive) -----
  // Sits at the top of `root`; createNavBar internally positions
  // itself relative to root's UITransform.
  const navBar: NavBarHandle = createNavBar({
    parent: root,
    theme,
    width,
    title: '悬浮聊天测试',
    onBack,
  });
  ownedHandles.push(navBar);

  // ----- Modal toggle (kit Switch) -----
  const toggleY = height / 2 - NAV_BAR_HEIGHT - 32;
  const toggleLabel = createPlainLabel('ModalToggleLabel', {
    text: '模态遮罩 (modal)',
    fontSize: 14,
    color: colorText,
    width: 180,
    height: 28,
    align: 'left',
  });
  toggleLabel.setPosition(-width / 2 + 110, toggleY);
  root.addChild(toggleLabel);
  ownedNodes.push(toggleLabel);

  const modalSwitch: SwitchHandle = createSwitch({
    theme: uiTheme,
    on: modalEnabled,
    onChange: (on) => {
      modalEnabled = on;
    },
  });
  modalSwitch.node.setPosition(width / 2 - 50, toggleY);
  root.addChild(modalSwitch.node);
  ownedHandles.push(modalSwitch);

  // ----- Section header: friends -----
  const friendsLabel = createPlainLabel('FriendsHeader', {
    text: '点头像 → 弹出私聊窗口（右侧 FloatingWindow）',
    fontSize: 13,
    color: colorSecondary,
    width: width - 32,
    height: 20,
    align: 'left',
  });
  friendsLabel.setPosition(0, toggleY - 50);
  root.addChild(friendsLabel);
  ownedNodes.push(friendsLabel);

  // ----- Friend rows (kit ListRow + Avatar) → openChatWindow -----
  const friendsStartY = toggleY - 90;
  FAKE_FRIENDS.forEach((friend, idx) => {
    const rowSlot = makeRowSlot(root, 0, friendsStartY - idx * (ROW_H + ROW_GAP));
    ownedNodes.push(rowSlot);

    const avatar: AvatarHandle = createAvatar({
      theme: uiTheme,
      name: friend.name,
      shape: 'rounded',
      size: AVATAR_SIZE,
      status: 'online',
    });
    ownedHandles.push(avatar);

    const row: ListRowHandle = createListRow({
      parent: rowSlot,
      theme: uiTheme,
      width: ROW_W,
      height: ROW_H,
      leading: avatar.node,
      label: friend.name,
      subtitle: friend.subtitle,
      onClick: () => {
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
      },
    });
    ownedHandles.push(row);
  });

  // ----- Section header: support -----
  const supportLabelY = friendsStartY - FAKE_FRIENDS.length * (ROW_H + ROW_GAP) - 20;
  const supportLabel = createPlainLabel('SupportHeader', {
    text: '点客服 → 底部弹出 BottomSheet 聊天',
    fontSize: 13,
    color: colorSecondary,
    width: width - 32,
    height: 20,
    align: 'left',
  });
  supportLabel.setPosition(0, supportLabelY);
  root.addChild(supportLabel);
  ownedNodes.push(supportLabel);

  // ----- Support row → openChatSheet -----
  const supportRowSlot = makeRowSlot(root, 0, supportLabelY - 40);
  ownedNodes.push(supportRowSlot);

  const supportAvatar: AvatarHandle = createAvatar({
    theme: uiTheme,
    name: SUPPORT_CHANNEL.name,
    shape: 'rounded',
    size: AVATAR_SIZE,
    status: 'online',
  });
  ownedHandles.push(supportAvatar);

  const supportRow: ListRowHandle = createListRow({
    parent: supportRowSlot,
    theme: uiTheme,
    width: ROW_W,
    height: ROW_H,
    leading: supportAvatar.node,
    label: SUPPORT_CHANNEL.name,
    subtitle: SUPPORT_CHANNEL.subtitle,
    onClick: () => {
      const sheet = PrivchatCocos.openChatSheet({
        parent: windowParent,
        client,
        channelId: SUPPORT_CHANNEL.channelId,
        channelType: SUPPORT_CHANNEL.channelType,
        title: SUPPORT_CHANNEL.name,
        theme,
        closeOnBackdrop: false,
        onClose: () => openSheets.delete(sheet),
        onError: (e) => console.warn('[FloatingDemo][support-sheet]', e),
      });
      openSheets.add(sheet);
    },
  });
  ownedHandles.push(supportRow);

  return {
    dispose() {
      // Hard-tear-down open windows / sheets. dispose() (not close)
      // so per-handle onClose doesn't fire and mutate the sets
      // during iteration.
      for (const w of openWindows) w.dispose();
      openWindows.clear();
      for (const s of openSheets) s.dispose();
      openSheets.clear();
      for (const h of ownedHandles) h.dispose();
      for (const n of ownedNodes) {
        n.removeFromParent();
        n.destroy();
      }
    },
  };
}

// ----- internal helpers -----

function makeRowSlot(parent: Node, x: number, y: number): Node {
  const slot = new Node('FloatingRowSlot');
  slot.addComponent(UITransform);
  slot.setPosition(x, y);
  parent.addChild(slot);
  return slot;
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

function createPlainRect(name: string, width: number, height: number, color: RGBA): Node {
  const node = new Node(name);
  const ui = node.addComponent(UITransform);
  ui.setContentSize(width, height);
  const g = node.addComponent(Graphics);
  g.fillColor = new Color(color.r, color.g, color.b, color.a);
  const gAny = g as unknown as { rect?: (x: number, y: number, w: number, h: number) => void };
  if (typeof gAny.rect === 'function') {
    gAny.rect(-width / 2, -height / 2, width, height);
  } else {
    g.moveTo(-width / 2, -height / 2);
    g.lineTo(width / 2, -height / 2);
    g.lineTo(width / 2, height / 2);
    g.lineTo(-width / 2, height / 2);
    g.close();
  }
  g.fill();
  return node;
}

interface PlainLabelOpts {
  text: string;
  fontSize: number;
  color: RGBA;
  width: number;
  height: number;
  align?: 'left' | 'center' | 'right';
}

function createPlainLabel(name: string, opts: PlainLabelOpts): Node {
  const node = new Node(name);
  const ui = node.addComponent(UITransform);
  ui.setContentSize(opts.width, opts.height);
  const label = node.addComponent(Label);
  label.string = opts.text;
  label.fontSize = opts.fontSize;
  label.color = new Color(opts.color.r, opts.color.g, opts.color.b, opts.color.a);
  label.horizontalAlign =
    opts.align === 'center'
      ? Label.HorizontalAlign.CENTER
      : opts.align === 'right'
      ? Label.HorizontalAlign.RIGHT
      : Label.HorizontalAlign.LEFT;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.overflow = Label.Overflow.SHRINK;
  return node;
}

// Reserved for promotion to Cocos Component later.
void Component;
