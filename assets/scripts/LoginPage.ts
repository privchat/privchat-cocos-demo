// Programmatic login page for the demo. Renders a simple
// "username + password + login" form into a host Node and fires the
// onLogin callback when the user taps the login button.
//
// All UI is hand-built with cc primitives — no prefabs needed. The
// styling intentionally mirrors the GoldGameTheme so the transition
// from login → friends list feels visually continuous.

import {
  Button,
  Color,
  EditBox,
  Graphics,
  Label,
  Node,
  UITransform,
} from 'cc';
import type { ThemeConfig } from '@privchat/cocos';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginPageOptions {
  root: Node;
  theme: ThemeConfig;
  onLogin: (creds: LoginCredentials) => void;
}

export interface LoginPageHandle {
  dispose(): void;
}

interface RGBA { r: number; g: number; b: number; a: number; }

const FORM_WIDTH = 280;
const FIELD_HEIGHT = 44;
const FIELD_GAP = 16;
const TITLE_FONT = 28;
const FIELD_FONT = 16;

export function createLoginPage(opts: LoginPageOptions): LoginPageHandle {
  const { root, theme, onLogin } = opts;
  const ui = root.getComponent(UITransform) ?? root.addComponent(UITransform);
  const width = ui.width || 360;
  const height = ui.height || 640;

  const colorBg = parseHex(theme.colors.background);
  const colorSurface = parseHex(theme.colors.surface);
  const colorPrimary = parseHex(theme.colors.primary);
  const colorText = parseHex(theme.colors.textPrimary);
  const colorTextSecondary = parseHex(theme.colors.textSecondary);
  const colorInputBg = lighten(colorSurface, 0.2);
  const colorPlaceholder = mute(colorText);

  // Page background.
  const bg = createRectNode('LoginBackground', width, height, 0, colorBg);
  bg.setPosition(0, 0);
  root.addChild(bg);

  // Title label centered horizontally, top third vertically.
  const title = createLabelNode('LoginTitle', {
    text: 'PrivChat 登录',
    fontSize: TITLE_FONT,
    color: colorText,
    width: FORM_WIDTH,
    height: 40,
    align: 'center',
  });
  title.setPosition(0, height / 4);
  root.addChild(title);

  const subtitle = createLabelNode('LoginSubtitle', {
    text: 'Mock 模式 — 任意用户名密码即可登录',
    fontSize: 13,
    color: colorTextSecondary,
    width: FORM_WIDTH,
    height: 20,
    align: 'center',
  });
  subtitle.setPosition(0, height / 4 - 32);
  root.addChild(subtitle);

  // Form vertical stack: [user input] [password input] [login button].
  const formCenterY = -16;
  const userY = formCenterY + (FIELD_HEIGHT + FIELD_GAP);
  const passY = formCenterY;
  const loginY = formCenterY - (FIELD_HEIGHT + FIELD_GAP);

  const userField = createEditField('UserField', {
    width: FORM_WIDTH,
    height: FIELD_HEIGHT,
    radius: theme.radius.input,
    bgColor: colorInputBg,
    textColor: colorText,
    placeholderColor: colorPlaceholder,
    placeholder: '用户名',
    fontSize: FIELD_FONT,
  });
  userField.root.setPosition(0, userY);
  root.addChild(userField.root);

  const passField = createEditField('PassField', {
    width: FORM_WIDTH,
    height: FIELD_HEIGHT,
    radius: theme.radius.input,
    bgColor: colorInputBg,
    textColor: colorText,
    placeholderColor: colorPlaceholder,
    placeholder: '密码',
    fontSize: FIELD_FONT,
    password: true,
  });
  passField.root.setPosition(0, passY);
  root.addChild(passField.root);

  const loginBtn = createButtonNode({
    name: 'LoginButton',
    width: FORM_WIDTH,
    height: FIELD_HEIGHT,
    radius: theme.radius.input,
    bgColor: colorPrimary,
    textColor: { r: 30, g: 18, b: 8, a: 255 },
    text: '登录',
    fontSize: FIELD_FONT + 1,
  });
  loginBtn.setPosition(0, loginY);
  root.addChild(loginBtn);

  function fireLogin(): void {
    onLogin({
      username: userField.eb.string || 'demo-user',
      password: passField.eb.string,
    });
  }

  loginBtn.on('click', fireLogin);
  // Pressing Enter on the password field also submits.
  passField.root.on('editing-return', fireLogin);

  return {
    dispose() {
      loginBtn.off('click', fireLogin);
      passField.root.off('editing-return', fireLogin);
      bg.removeFromParent();
      bg.destroy();
      title.removeFromParent();
      title.destroy();
      subtitle.removeFromParent();
      subtitle.destroy();
      userField.root.removeFromParent();
      userField.root.destroy();
      passField.root.removeFromParent();
      passField.root.destroy();
      loginBtn.removeFromParent();
      loginBtn.destroy();
    },
  };
}

// ----- internals -----

function parseHex(input: string): RGBA {
  const hex = input.startsWith('#') ? input.slice(1) : input;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
  return { r, g, b, a };
}

function lighten(c: RGBA, amount: number): RGBA {
  return {
    r: Math.min(255, Math.round(c.r + (255 - c.r) * amount)),
    g: Math.min(255, Math.round(c.g + (255 - c.g) * amount)),
    b: Math.min(255, Math.round(c.b + (255 - c.b) * amount)),
    a: c.a,
  };
}

function mute(c: RGBA): RGBA {
  return { r: Math.round(c.r * 0.5), g: Math.round(c.g * 0.5), b: Math.round(c.b * 0.5), a: 255 };
}

function createRectNode(name: string, width: number, height: number, radius: number, color: RGBA): Node {
  const node = new Node(name);
  const ui = node.addComponent(UITransform);
  ui.setContentSize(width, height);
  const g = node.addComponent(Graphics);
  g.fillColor = new Color(color.r, color.g, color.b, color.a);
  const x0 = -width / 2;
  const y0 = -height / 2;
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  const gAny = g as unknown as {
    roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
    rect?: (x: number, y: number, w: number, h: number) => void;
  };
  if (r > 0 && typeof gAny.roundRect === 'function') {
    gAny.roundRect(x0, y0, width, height, r);
  } else if (typeof gAny.rect === 'function') {
    gAny.rect(x0, y0, width, height);
  } else {
    g.moveTo(x0, y0);
    g.lineTo(x0 + width, y0);
    g.lineTo(x0 + width, y0 + height);
    g.lineTo(x0, y0 + height);
    g.close();
  }
  g.fill();
  return node;
}

interface LabelOpts {
  text: string;
  fontSize: number;
  color: RGBA;
  width: number;
  height: number;
  align?: 'left' | 'center' | 'right';
}

function createLabelNode(name: string, opts: LabelOpts): Node {
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

interface EditFieldOpts {
  width: number;
  height: number;
  radius: number;
  bgColor: RGBA;
  textColor: RGBA;
  placeholderColor: RGBA;
  placeholder: string;
  fontSize: number;
  password?: boolean;
}

interface EditFieldHandle {
  root: Node;
  eb: EditBox;
}

function createEditField(name: string, opts: EditFieldOpts): EditFieldHandle {
  const root = new Node(name);
  const ui = root.addComponent(UITransform);
  ui.setContentSize(opts.width, opts.height);

  const bg = createRectNode(`${name}_bg`, opts.width, opts.height, opts.radius, opts.bgColor);
  bg.setPosition(0, 0);
  root.addChild(bg);

  const eb = root.addComponent(EditBox);
  eb.string = '';
  eb.placeholder = opts.placeholder;
  // fontSize / fontColor / placeholderFontSize live on EditBox at runtime in
  // 3.8.x but aren't in every TS shim version — cast to set them safely.
  const ebRuntime = eb as unknown as {
    fontSize?: number;
    fontColor?: Color;
    placeholderFontSize?: number;
  };
  ebRuntime.fontSize = opts.fontSize;
  ebRuntime.placeholderFontSize = opts.fontSize;
  ebRuntime.fontColor = new Color(
    opts.textColor.r,
    opts.textColor.g,
    opts.textColor.b,
    opts.textColor.a,
  );
  eb.maxLength = 64;
  // 1 = SINGLE_LINE so Enter fires editing-return.
  (eb as unknown as { inputMode: number }).inputMode = 1;
  // 5 = PASSWORD inputFlag. Cocos enum: PASSWORD = 5.
  if (opts.password) {
    (eb as unknown as { inputFlag: number }).inputFlag = 5;
  }

  // Configure auto-created labels in a deferred pass — Cocos creates them
  // during the EditBox's own onLoad which runs on next frame.
  setTimeout(() => {
    const ebAny = eb as unknown as { textLabel?: Label; placeholderLabel?: Label };
    if (ebAny.textLabel) {
      ebAny.textLabel.fontSize = opts.fontSize;
      ebAny.textLabel.lineHeight = opts.fontSize * 1.3;
      ebAny.textLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
      ebAny.textLabel.verticalAlign = Label.VerticalAlign.CENTER;
      ebAny.textLabel.color = new Color(
        opts.textColor.r,
        opts.textColor.g,
        opts.textColor.b,
        opts.textColor.a,
      );
      const tlNode = ebAny.textLabel.node;
      const tlUi = tlNode.getComponent(UITransform) ?? tlNode.addComponent(UITransform);
      tlUi.setAnchorPoint(0, 0.5);
      tlUi.setContentSize(opts.width - 24, opts.height);
      tlNode.setPosition(-opts.width / 2 + 12, 0);
    }
    if (ebAny.placeholderLabel) {
      ebAny.placeholderLabel.fontSize = opts.fontSize;
      ebAny.placeholderLabel.lineHeight = opts.fontSize * 1.3;
      ebAny.placeholderLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
      ebAny.placeholderLabel.verticalAlign = Label.VerticalAlign.CENTER;
      ebAny.placeholderLabel.color = new Color(
        opts.placeholderColor.r,
        opts.placeholderColor.g,
        opts.placeholderColor.b,
        opts.placeholderColor.a,
      );
      ebAny.placeholderLabel.string = opts.placeholder;
      const plNode = ebAny.placeholderLabel.node;
      const plUi = plNode.getComponent(UITransform) ?? plNode.addComponent(UITransform);
      plUi.setAnchorPoint(0, 0.5);
      plUi.setContentSize(opts.width - 24, opts.height);
      plNode.setPosition(-opts.width / 2 + 12, 0);
    }
  }, 0);

  return { root, eb };
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

function createButtonNode(opts: ButtonOpts): Node {
  const node = new Node(opts.name);
  const ui = node.addComponent(UITransform);
  ui.setContentSize(opts.width, opts.height);
  // Visible background — drawn at child since we want hit-area on root.
  const bg = createRectNode(`${opts.name}_bg`, opts.width, opts.height, opts.radius, opts.bgColor);
  node.addChild(bg);

  const labelNode = createLabelNode(`${opts.name}_label`, {
    text: opts.text,
    fontSize: opts.fontSize,
    color: opts.textColor,
    width: opts.width,
    height: opts.height,
    align: 'center',
  });
  node.addChild(labelNode);

  // cc.Node only emits 'click' when it has a Button component; the raw
  // touch system uses 'touch-end' / 'touch-start' instead. Attach Button
  // here so `node.on('click', ...)` fires on tap.
  const btn = node.addComponent(Button);
  btn.target = node;
  btn.transition = 0;
  return node;
}
