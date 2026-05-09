// Hub page for the demo. After login, the user lands here and picks a
// feature to test (friends/chat, Room subscription, logout). The host
// (DemoChatScene) drives navigation; this file only renders + wires
// button callbacks.

import {
  Button,
  Color,
  Graphics,
  Label,
  Node,
  UITransform,
} from 'cc';
import type { ThemeConfig } from '@privchat/cocos';

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
const TITLE_FONT = 24;
const SUBTITLE_FONT = 13;
const ENTRY_FONT = 17;

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
  const ui = root.getComponent(UITransform) ?? root.addComponent(UITransform);
  const width = ui.width || 360;
  const height = ui.height || 640;

  const colorBg = parseHex(theme.colors.background);
  const colorSurface = parseHex(theme.colors.surface);
  const colorPrimary = parseHex(theme.colors.primary);
  const colorText = parseHex(theme.colors.textPrimary);
  const colorSecondary = parseHex(theme.colors.textSecondary);
  const colorDanger = parseHex(theme.colors.danger);

  const owned: Node[] = [];

  // Page background — separate from chatRoot so dispose can drop just
  // this page's nodes without touching ancestor styling.
  const bg = createRect('MenuBackground', width, height, 0, colorBg);
  bg.setPosition(0, 0);
  root.addChild(bg);
  owned.push(bg);

  const title = createLabel('MenuTitle', {
    text: 'PrivChat Demo',
    fontSize: TITLE_FONT,
    color: colorText,
    width: width - 32,
    height: 32,
    align: 'center',
  });
  title.setPosition(0, height / 2 - 60);
  root.addChild(title);
  owned.push(title);

  const greeting = createLabel('MenuGreeting', {
    text: username ? `已登录：${username}` : '已登录',
    fontSize: SUBTITLE_FONT,
    color: colorSecondary,
    width: width - 32,
    height: 20,
    align: 'center',
  });
  greeting.setPosition(0, height / 2 - 92);
  root.addChild(greeting);
  owned.push(greeting);

  // Two primary entries, stacked vertically. Vertically centered minus
  // the bottom logout button so the whole stack reads as a single block.
  const entriesTopY = 80;

  const entryFriends = createListEntry({
    name: 'EntryFriends',
    title: '好友列表 / 聊天',
    subtitle: '加载好友资料 → 进入会话 → 收发消息',
    width: ENTRY_W,
    height: ENTRY_H,
    bgColor: lighten(colorSurface, 0.2),
    titleColor: colorText,
    subtitleColor: colorSecondary,
    accent: colorPrimary,
    accentLetter: '友',
  });
  entryFriends.setPosition(0, entriesTopY);
  entryFriends.on('click', onOpenFriends);
  root.addChild(entryFriends);
  owned.push(entryFriends);

  const entryRoom = createListEntry({
    name: 'EntryRoom',
    title: 'Room 订阅测试',
    subtitle: '订阅一个 Room channelId → 验证服务端广播链路',
    width: ENTRY_W,
    height: ENTRY_H,
    bgColor: lighten(colorSurface, 0.2),
    titleColor: colorText,
    subtitleColor: colorSecondary,
    accent: colorPrimary,
    accentLetter: 'R',
  });
  entryRoom.setPosition(0, entriesTopY - (ENTRY_H + ENTRY_GAP));
  entryRoom.on('click', onOpenRoom);
  root.addChild(entryRoom);
  owned.push(entryRoom);

  // v0.1.2: openChatWindow demo. Same shape as the other two entries
  // so the menu reads as a uniform list.
  const entryFloating = createListEntry({
    name: 'EntryFloating',
    title: '悬浮聊天测试',
    subtitle: 'openChatWindow → 任意位置弹出独立聊天窗口',
    width: ENTRY_W,
    height: ENTRY_H,
    bgColor: lighten(colorSurface, 0.2),
    titleColor: colorText,
    subtitleColor: colorSecondary,
    accent: colorPrimary,
    accentLetter: '窗',
  });
  entryFloating.setPosition(0, entriesTopY - 2 * (ENTRY_H + ENTRY_GAP));
  entryFloating.on('click', onOpenFloating);
  root.addChild(entryFloating);
  owned.push(entryFloating);

  // Logout — secondary, near the bottom edge.
  const logoutBtn = createButton({
    name: 'LogoutBtn',
    width: 160,
    height: 40,
    radius: 8,
    bgColor: { r: 0, g: 0, b: 0, a: 0 }, // transparent — text-only chrome
    textColor: colorDanger,
    text: '退出登录',
    fontSize: 14,
  });
  logoutBtn.setPosition(0, -height / 2 + 60);
  logoutBtn.on('click', onLogout);
  root.addChild(logoutBtn);
  owned.push(logoutBtn);

  return {
    dispose() {
      // Remove all click bindings before destroying — Cocos doesn't
      // automatically clean Button event listeners on node destroy in
      // every minor version of 3.8.x.
      entryFriends.off('click', onOpenFriends);
      entryRoom.off('click', onOpenRoom);
      entryFloating.off('click', onOpenFloating);
      logoutBtn.off('click', onLogout);
      for (const n of owned) {
        n.removeFromParent();
        n.destroy();
      }
    },
  };
}

// ---------------- helpers ----------------

interface ListEntryOpts {
  name: string;
  title: string;
  subtitle: string;
  width: number;
  height: number;
  bgColor: RGBA;
  titleColor: RGBA;
  subtitleColor: RGBA;
  accent: RGBA;
  accentLetter: string;
}

function createListEntry(opts: ListEntryOpts): Node {
  const node = new Node(opts.name);
  const ui = node.addComponent(UITransform);
  ui.setContentSize(opts.width, opts.height);

  const bg = createRect(`${opts.name}_bg`, opts.width, opts.height, 12, opts.bgColor);
  node.addChild(bg);

  // Square accent on the left — same shape as contact-list-view's avatar.
  const accentSize = opts.height - 14;
  const accent = createRect(`${opts.name}_accent`, accentSize, accentSize, 8, opts.accent);
  accent.setPosition(-opts.width / 2 + accentSize / 2 + 8, 0);
  node.addChild(accent);

  const accentLabel = createLabel(`${opts.name}_accentLabel`, {
    text: opts.accentLetter,
    fontSize: ENTRY_FONT + 4,
    color: { r: 30, g: 18, b: 8, a: 255 },
    width: accentSize,
    height: accentSize,
    align: 'center',
  });
  accent.addChild(accentLabel);

  const textLeft = -opts.width / 2 + accentSize + 20;
  const textWidth = opts.width / 2 - accentSize - 28 + opts.width / 2;

  const titleLabel = createLabel(`${opts.name}_title`, {
    text: opts.title,
    fontSize: ENTRY_FONT,
    color: opts.titleColor,
    width: textWidth,
    height: 22,
    align: 'left',
  });
  titleLabel.setPosition(textLeft + textWidth / 2, 10);
  node.addChild(titleLabel);

  const subtitleLabel = createLabel(`${opts.name}_subtitle`, {
    text: opts.subtitle,
    fontSize: SUBTITLE_FONT,
    color: opts.subtitleColor,
    width: textWidth,
    height: 18,
    align: 'left',
  });
  subtitleLabel.setPosition(textLeft + textWidth / 2, -10);
  node.addChild(subtitleLabel);

  // Hit-target requires a Button to fan out 'click' events.
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
