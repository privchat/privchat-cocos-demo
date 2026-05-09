// Room subscription test panel. Renders subscribe/unsubscribe controls
// + status banner + events placeholder into a host Node, drives the
// PrivchatCocos.RoomSubscriptionController under the hood.
//
// Why a function helper instead of a Cocos Component: the host scene
// (DemoChatScene) wants this as one of several pages it can swap into
// the same root node. Same pattern as LoginPage.ts / MenuPage.ts.

import {
  Button,
  Color,
  EditBox,
  Graphics,
  Label,
  Node,
  UITransform,
} from 'cc';
import {
  PrivchatCocos,
  type PrivchatClient,
  type RoomSubscriptionController,
  type RoomSubscriptionState,
  type ThemeConfig,
} from '@privchat/cocos';

const ROOM_CHANNEL_TYPE = 2;

export interface RoomPanelOptions {
  root: Node;
  theme: ThemeConfig;
  client: PrivchatClient;
  /** Default channelId to prefill the input. */
  defaultChannelId: string;
  /** Optional ticket (JWT) for Room subscriptions. Leave empty for now. */
  ticket?: string;
  /** "返回" button → host navigates back to menu. */
  onBack: () => void;
}

export interface RoomPanelHandle {
  dispose(): void;
}

interface RGBA { r: number; g: number; b: number; a: number; }

export function createRoomPanel(opts: RoomPanelOptions): RoomPanelHandle {
  const { root, theme, client, defaultChannelId, ticket, onBack } = opts;
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
  let controller: RoomSubscriptionController | null = null;
  let unsubscribeStateListener: (() => void) | null = null;

  // Page background
  const bg = createRect('RoomPanelBg', width, height, 0, colorBg);
  bg.setPosition(0, 0);
  root.addChild(bg);
  owned.push(bg);

  // Header bar with title + back button (mirrors mountChatView header look)
  const HEADER_H = 48;
  const header = createRect('RoomHeader', width, HEADER_H, 0, colorSurface);
  header.setPosition(0, height / 2 - HEADER_H / 2);
  root.addChild(header);
  owned.push(header);

  const headerTitle = createLabel('RoomHeaderTitle', {
    text: 'Room 订阅测试',
    fontSize: theme.fontSize.message + 1,
    color: colorText,
    width: width - 140,
    height: HEADER_H,
    align: 'center',
  });
  headerTitle.setPosition(0, height / 2 - HEADER_H / 2);
  root.addChild(headerTitle);
  owned.push(headerTitle);

  const backBtn = createButton({
    name: 'RoomBack',
    width: 56,
    height: HEADER_H - 12,
    radius: 8,
    bgColor: { r: 0, g: 0, b: 0, a: 0 },
    textColor: colorPrimary,
    text: '< 返回',
    fontSize: theme.fontSize.input - 1,
  });
  backBtn.setPosition(-width / 2 + 36, height / 2 - HEADER_H / 2);
  backBtn.on('click', onBack);
  root.addChild(backBtn);
  owned.push(backBtn);

  // Body — channelId input
  const inputBg = createRect('RoomInputBg', width - 64, 40, 8, lighten(colorSurface, 0.2));
  const inputY = height / 2 - HEADER_H - 50;
  inputBg.setPosition(0, inputY);
  root.addChild(inputBg);
  owned.push(inputBg);

  const inputNode = new Node('RoomChannelInput');
  const inputUi = inputNode.addComponent(UITransform);
  inputUi.setContentSize(width - 80, 40);
  const eb = inputNode.addComponent(EditBox);
  eb.string = defaultChannelId;
  eb.placeholder = 'Room channelId (e.g. 100)';
  const ebRuntime = eb as unknown as {
    fontSize?: number;
    fontColor?: Color;
    placeholderFontSize?: number;
    inputMode?: number;
  };
  ebRuntime.fontSize = 16;
  ebRuntime.placeholderFontSize = 16;
  ebRuntime.fontColor = new Color(colorText.r, colorText.g, colorText.b, colorText.a);
  ebRuntime.inputMode = 1; // SINGLE_LINE
  eb.maxLength = 64;
  inputNode.setPosition(0, inputY);
  root.addChild(inputNode);
  owned.push(inputNode);

  // Subscribe / Unsubscribe row
  const btnW = (width - 64 - 12) / 2;
  const btnY = inputY - 60;

  const subBtn = createButton({
    name: 'RoomSubscribe',
    width: btnW,
    height: 40,
    radius: 8,
    bgColor: colorPrimary,
    textColor: { r: 30, g: 18, b: 8, a: 255 },
    text: 'Subscribe',
    fontSize: 15,
  });
  subBtn.setPosition(-(btnW + 12) / 2, btnY);
  root.addChild(subBtn);
  owned.push(subBtn);

  const unsubBtn = createButton({
    name: 'RoomUnsubscribe',
    width: btnW,
    height: 40,
    radius: 8,
    bgColor: lighten(colorSurface, 0.25),
    textColor: colorText,
    text: 'Unsubscribe',
    fontSize: 15,
  });
  unsubBtn.setPosition((btnW + 12) / 2, btnY);
  root.addChild(unsubBtn);
  owned.push(unsubBtn);

  // Status banner
  const statusY = btnY - 44;
  const statusLabel = createLabel('RoomStatus', {
    text: 'idle — enter channelId then tap Subscribe',
    fontSize: 14,
    color: colorText,
    width: width - 32,
    height: 24,
    align: 'center',
  });
  statusLabel.setPosition(0, statusY);
  root.addChild(statusLabel);
  owned.push(statusLabel);
  const statusComp = statusLabel.getComponent(Label);

  // Events panel (placeholder until SDK exposes room_publish_received)
  const eventsBgH = height / 2 - 100;
  const eventsBgY = -height / 4 - 30;
  const eventsBg = createRect('RoomEventsBg', width - 32, eventsBgH, 8, lighten(colorSurface, 0.05));
  eventsBg.setPosition(0, eventsBgY);
  root.addChild(eventsBg);
  owned.push(eventsBg);

  const eventsHeader = createLabel('RoomEventsHeader', {
    text: 'Room Events',
    fontSize: 13,
    color: colorSecondary,
    width: width - 48,
    height: 20,
    align: 'left',
  });
  eventsHeader.setPosition(0, eventsBgY + eventsBgH / 2 - 14);
  root.addChild(eventsHeader);
  owned.push(eventsHeader);

  const eventsBody = createLabel('RoomEventsBody', {
    text: '(events feed will appear here once SDK exposes room_publish_received)',
    fontSize: 12,
    color: colorSecondary,
    width: width - 48,
    height: eventsBgH - 32,
    align: 'left',
    vAlign: 'top',
  });
  eventsBody.setPosition(0, eventsBgY - 8);
  root.addChild(eventsBody);
  owned.push(eventsBody);
  const eventsBodyComp = eventsBody.getComponent(Label);

  // ---------------- handlers ----------------

  const onSubscribe = (): void => {
    const channelId = eb.string.trim() || defaultChannelId;
    if (controller) {
      // Tear down a previous run before starting a new one — same uid
      // can't be subscribed twice from one session anyway.
      unsubscribeStateListener?.();
      unsubscribeStateListener = null;
      controller.dispose();
      controller = null;
    }
    controller = PrivchatCocos.createRoomSubscriptionController({
      client,
      channelId,
      channelType: ROOM_CHANNEL_TYPE,
      ticket: ticket || undefined,
      onError: (e) => console.warn('[RoomPanel] onError', e),
    });
    unsubscribeStateListener = controller.subscribe(applyState);
    applyState(controller.state);
    void controller.start();
  };

  const onUnsubscribe = (): void => {
    if (!controller) return;
    void controller.unsubscribeRoom();
  };

  function applyState(vm: RoomSubscriptionState): void {
    if (statusComp) {
      const banner = vm.lastError
        ? `${vm.status.toUpperCase()} — ${vm.lastError.message}`
        : vm.status.toUpperCase();
      statusComp.string = banner;
      statusComp.color = vm.lastError
        ? new Color(colorDanger.r, colorDanger.g, colorDanger.b, colorDanger.a)
        : new Color(colorText.r, colorText.g, colorText.b, colorText.a);
    }
    if (eventsBodyComp) {
      eventsBodyComp.string =
        vm.events.length === 0
          ? '(events feed will appear here once SDK exposes room_publish_received)'
          : vm.events
              .map(
                (e) =>
                  `${new Date(e.timestamp).toLocaleTimeString()}  topic=${e.topic ?? '(default)'}  ${e.payloadText}`,
              )
              .join('\n');
    }
  }

  subBtn.on('click', onSubscribe);
  unsubBtn.on('click', onUnsubscribe);

  return {
    dispose() {
      subBtn.off('click', onSubscribe);
      unsubBtn.off('click', onUnsubscribe);
      backBtn.off('click', onBack);
      unsubscribeStateListener?.();
      unsubscribeStateListener = null;
      controller?.dispose();
      controller = null;
      for (const n of owned) {
        n.removeFromParent();
        n.destroy();
      }
    },
  };
}

// ---------------- shared primitives ----------------

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
  l.enableWrapText = true;
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
