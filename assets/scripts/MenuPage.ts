// Menu page — Phase-G UI Kit primitives only:
//   - createListRow      for the 3 feature entry cards (label +
//                        subtitle + leading Avatar)
//   - createAvatar       for each entry's accent square (rounded)
//   - createButtonBase   for the 退出登录 (logout) action
//   - plain cc.Label     for the page title + greeting (these are
//                        decorative text, no kit primitive needed)
//
// All the hand-rolled `createRect / createButton / createListEntry`
// helpers from the v0.1.x version are gone — visual styling is now
// 100% driven by `theme.ui` (the UiTheme that ships inside the chat
// ThemeConfig).

import { Color, Graphics, Label, Node, UITransform } from 'cc';
import type { ThemeConfig } from '@privchat/cocos';
import {
  createAvatar,
  createButtonBase,
  createListRow,
  getUiTheme,
  type AvatarHandle,
  type ButtonBaseHandle,
  type ListRowHandle,
} from '@privchat/cocos';

export interface MenuPageOptions {
  root: Node;
  theme: ThemeConfig;
  username: string;
  onOpenFriends: () => void;
  onOpenRoom: () => void;
  onOpenFloating: () => void;
  onLogout: () => void;
}

export interface MenuPageHandle {
  dispose(): void;
}

interface RGBA { r: number; g: number; b: number; a: number; }

const ENTRY_W = 280;
const ENTRY_H = 64;
const ENTRY_GAP = 12;
const AVATAR_SIZE = 50;
const TITLE_FONT = 24;
const SUBTITLE_FONT = 13;

export function createMenuPage(opts: MenuPageOptions): MenuPageHandle {
  const {
    root,
    theme,
    username,
    onOpenFriends,
    onOpenRoom,
    onOpenFloating,
    onLogout,
  } = opts;
  const uiTheme = getUiTheme(theme);
  const ui = root.getComponent(UITransform) ?? root.addComponent(UITransform);
  const width = ui.width || 360;
  const height = ui.height || 640;

  const colorBg = parseHex(theme.colors.background);
  const colorText = parseHex(theme.colors.textPrimary);
  const colorSecondary = parseHex(theme.colors.textSecondary);

  const ownedNodes: Node[] = [];
  const ownedHandles: Array<{ dispose(): void }> = [];

  // ----- Page background -----
  const bg = createPlainRect('MenuBackground', width, height, colorBg);
  bg.setPosition(0, 0);
  root.addChild(bg);
  ownedNodes.push(bg);

  // ----- Title + greeting (plain decorative labels) -----
  const title = createPlainLabel('MenuTitle', {
    text: 'PrivChat Demo',
    fontSize: TITLE_FONT,
    color: colorText,
    width: width - 32,
    height: 32,
  });
  title.setPosition(0, height / 2 - 60);
  root.addChild(title);
  ownedNodes.push(title);

  const greeting = createPlainLabel('MenuGreeting', {
    text: username ? `已登录：${username}` : '已登录',
    fontSize: SUBTITLE_FONT,
    color: colorSecondary,
    width: width - 32,
    height: 20,
  });
  greeting.setPosition(0, height / 2 - 92);
  root.addChild(greeting);
  ownedNodes.push(greeting);

  // ----- 3 feature entries (kit ListRow + Avatar) -----
  // Stack top-down, centered horizontally. Each row's leading slot
  // is a rounded Avatar with the entry's mnemonic letter (友 / R /
  // 窗) — same `createAvatar` primitive the chat contact list uses.
  const entriesTopY = 80;
  const entries: Array<{
    label: string;
    subtitle: string;
    avatarName: string;
    onClick: () => void;
  }> = [
    { label: '好友列表 / 聊天',  subtitle: '加载好友资料 → 进入会话 → 收发消息',          avatarName: '友', onClick: onOpenFriends },
    { label: 'Room 订阅测试',    subtitle: '订阅一个 Room channelId → 验证服务端广播链路', avatarName: 'R',  onClick: onOpenRoom    },
    { label: '悬浮聊天测试',     subtitle: 'openChatWindow → 任意位置弹出独立聊天窗口',    avatarName: '窗', onClick: onOpenFloating },
  ];
  entries.forEach((entry, idx) => {
    const rowParent = makeRowSlot(root, 0, entriesTopY - idx * (ENTRY_H + ENTRY_GAP));
    ownedNodes.push(rowParent);

    const avatar: AvatarHandle = createAvatar({
      theme: uiTheme,
      name: entry.avatarName,
      shape: 'rounded',
      size: AVATAR_SIZE,
    });
    ownedHandles.push(avatar);

    const row: ListRowHandle = createListRow({
      parent: rowParent,
      theme: uiTheme,
      width: ENTRY_W,
      height: ENTRY_H,
      leading: avatar.node,
      label: entry.label,
      subtitle: entry.subtitle,
      onClick: entry.onClick,
    });
    ownedHandles.push(row);
  });

  // ----- Logout (ghost variant kit button) -----
  // Bottom-anchored, small width — text-only chrome. ButtonBase's
  // ghost variant is the kit's "no fill, primary text" treatment;
  // a hand-rolled red label would break the kit's token discipline.
  const logoutBtn: ButtonBaseHandle = createButtonBase({
    theme: uiTheme,
    label: '退出登录',
    variant: 'ghost',
    width: 160,
    height: 40,
    onClick: onLogout,
  });
  logoutBtn.node.setPosition(0, -height / 2 + 60);
  root.addChild(logoutBtn.node);
  ownedHandles.push(logoutBtn);

  return {
    dispose() {
      // Dispose kit handles first (clears their event listeners +
      // owned children), then drop plain nodes (bg / title /
      // greeting / row slot wrappers).
      for (const h of ownedHandles) h.dispose();
      for (const n of ownedNodes) {
        n.removeFromParent();
        n.destroy();
      }
    },
  };
}

// ----- internal helpers (cc primitives only) -----

/** Positioning wrapper for a kit row — its parent for the kit's
 *  `createListRow({ parent: ... })`. We position the wrapper at
 *  the grid coord; the kit's row centers inside this wrapper. */
function makeRowSlot(parent: Node, x: number, y: number): Node {
  const slot = new Node('MenuRowSlot');
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
}

function createPlainLabel(name: string, opts: PlainLabelOpts): Node {
  const node = new Node(name);
  const ui = node.addComponent(UITransform);
  ui.setContentSize(opts.width, opts.height);
  const label = node.addComponent(Label);
  label.string = opts.text;
  label.fontSize = opts.fontSize;
  label.color = new Color(opts.color.r, opts.color.g, opts.color.b, opts.color.a);
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.overflow = Label.Overflow.SHRINK;
  return node;
}
