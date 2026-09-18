// Room subscription test panel — Phase-G UI Kit primitives only:
//   - createNavBar       page header (title + < 返回)
//   - createTextInput    Room channelId input (gold focus border)
//   - createButtonBase   Subscribe (primary) + Unsubscribe (secondary)
//   - plain cc.Label     status banner + events feed (display-only,
//                        no kit primitive needed)
//
// Wires `PrivchatCocos.createRoomSubscriptionController` underneath
// for actual room subscribe / publish-receive testing.

import { Color, Graphics, Label, Node, UITransform } from 'cc';
import {
  ChannelType,
  PrivchatCocos,
  NAV_BAR_HEIGHT,
  createButtonBase,
  createNavBar,
  createTextInput,
  getUiTheme,
  type ButtonBaseHandle,
  type NavBarHandle,
  type PrivchatClient,
  type RoomSubscriptionController,
  type RoomSubscriptionState,
  type TextInputHandle,
  type ThemeConfig,
} from '@privchat/cocos';

// wire 编号来自 privchat-protocol ChannelType(1=Direct 2=Group 3=Room);2 是群聊,订阅会被当"非群成员"拒掉。
const ROOM_CHANNEL_TYPE = ChannelType.Room;

export interface RoomPanelOptions {
  root: Node;
  theme: ThemeConfig;
  client: PrivchatClient;
  defaultChannelId: string;
  ticket?: string;
  onBack: () => void;
}

export interface RoomPanelHandle {
  dispose(): void;
}

interface RGBA { r: number; g: number; b: number; a: number; }

export function createRoomPanel(opts: RoomPanelOptions): RoomPanelHandle {
  const { root, theme, client, defaultChannelId, ticket, onBack } = opts;
  const uiTheme = getUiTheme(theme);
  const ui = root.getComponent(UITransform) ?? root.addComponent(UITransform);
  const width = ui.width || 360;
  const height = ui.height || 640;

  const colorBg = parseHex(theme.colors.background);
  const colorText = parseHex(theme.colors.textPrimary);
  const colorSecondary = parseHex(theme.colors.textSecondary);
  const colorDanger = parseHex(theme.colors.danger);
  const colorSurface = parseHex(theme.colors.surface);

  const ownedNodes: Node[] = [];
  const ownedHandles: Array<{ dispose(): void }> = [];
  let controller: RoomSubscriptionController | null = null;
  let unsubscribeStateListener: (() => void) | null = null;

  // ----- Page bg -----
  const bg = createPlainRect('RoomPanelBg', width, height, colorBg);
  bg.setPosition(0, 0);
  root.addChild(bg);
  ownedNodes.push(bg);

  // ----- NavBar (kit) -----
  const navBar: NavBarHandle = createNavBar({
    parent: root,
    theme,
    width,
    title: 'Room 订阅测试',
    onBack,
  });
  ownedHandles.push(navBar);

  // ----- channelId input (kit TextInput) -----
  const inputW = width - 64;
  const inputY = height / 2 - NAV_BAR_HEIGHT - 50;
  const inputSlot = makeSlot(root, 0, inputY);
  ownedNodes.push(inputSlot);

  const channelInput: TextInputHandle = createTextInput({
    parent: inputSlot,
    theme: uiTheme,
    width: inputW,
    height: 40,
    value: defaultChannelId,
    placeholder: 'Room channelId (e.g. 100)',
    maxLength: 64,
  });
  ownedHandles.push(channelInput);

  // ----- Subscribe / Unsubscribe row (kit ButtonBase) -----
  const btnW = (inputW - 12) / 2;
  const btnY = inputY - 60;

  const onSubscribe = (): void => {
    const channelId = (channelInput.getValue() || '').trim() || defaultChannelId;
    if (controller) {
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

  const subBtn: ButtonBaseHandle = createButtonBase({
    theme: uiTheme,
    label: 'Subscribe',
    variant: 'primary',
    width: btnW,
    height: 40,
    onClick: onSubscribe,
  });
  subBtn.node.setPosition(-(btnW + 12) / 2, btnY);
  root.addChild(subBtn.node);
  ownedHandles.push(subBtn);

  const unsubBtn: ButtonBaseHandle = createButtonBase({
    theme: uiTheme,
    label: 'Unsubscribe',
    variant: 'secondary',
    width: btnW,
    height: 40,
    onClick: onUnsubscribe,
  });
  unsubBtn.node.setPosition((btnW + 12) / 2, btnY);
  root.addChild(unsubBtn.node);
  ownedHandles.push(unsubBtn);

  // ----- Status banner (plain Label) -----
  const statusY = btnY - 44;
  const statusLabel = createPlainLabel('RoomStatus', {
    text: 'idle — enter channelId then tap Subscribe',
    fontSize: 14,
    color: colorText,
    width: width - 32,
    height: 24,
    align: 'center',
  });
  statusLabel.setPosition(0, statusY);
  root.addChild(statusLabel);
  ownedNodes.push(statusLabel);
  const statusComp = statusLabel.getComponent(Label);

  // ----- Events panel (plain rect + labels) -----
  const eventsBgH = height / 2 - 100;
  const eventsBgY = -height / 4 - 30;
  const eventsBg = createPlainRect(
    'RoomEventsBg',
    width - 32,
    eventsBgH,
    lighten(colorSurface, 0.05),
    8,
  );
  eventsBg.setPosition(0, eventsBgY);
  root.addChild(eventsBg);
  ownedNodes.push(eventsBg);

  const eventsHeader = createPlainLabel('RoomEventsHeader', {
    text: 'Room Events',
    fontSize: 13,
    color: colorSecondary,
    width: width - 48,
    height: 20,
    align: 'left',
  });
  eventsHeader.setPosition(0, eventsBgY + eventsBgH / 2 - 14);
  root.addChild(eventsHeader);
  ownedNodes.push(eventsHeader);

  const eventsBody = createPlainLabel('RoomEventsBody', {
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
  ownedNodes.push(eventsBody);
  const eventsBodyComp = eventsBody.getComponent(Label);

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

  return {
    dispose() {
      unsubscribeStateListener?.();
      unsubscribeStateListener = null;
      controller?.dispose();
      controller = null;
      for (const h of ownedHandles) h.dispose();
      for (const n of ownedNodes) {
        n.removeFromParent();
        n.destroy();
      }
    },
  };
}

// ----- internal helpers -----

function makeSlot(parent: Node, x: number, y: number): Node {
  const slot = new Node('RoomPanelSlot');
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

function lighten(c: RGBA, amount: number): RGBA {
  return {
    r: Math.min(255, Math.round(c.r + (255 - c.r) * amount)),
    g: Math.min(255, Math.round(c.g + (255 - c.g) * amount)),
    b: Math.min(255, Math.round(c.b + (255 - c.b) * amount)),
    a: c.a,
  };
}

function createPlainRect(name: string, w: number, h: number, color: RGBA, radius = 0): Node {
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

interface PlainLabelOpts {
  text: string;
  fontSize: number;
  color: RGBA;
  width: number;
  height: number;
  align?: 'left' | 'center' | 'right';
  vAlign?: 'top' | 'center' | 'bottom';
}

function createPlainLabel(name: string, opts: PlainLabelOpts): Node {
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
