import { Component, Node, _decorator } from 'cc';
import { PrivchatCocos, PrivchatDarkTheme, type ThemeConfig } from '@privchat/cocos';
import { PrivchatClient } from '@privchat/sdk';
import { DemoMockAdapter } from './DemoMockAdapter';

const { ccclass, property } = _decorator;

/**
 * Game-flavored theme for the demo. Spread `PrivchatDarkTheme` first to keep
 * radius / spacing / fontSize defaults, then override the colors that should
 * read as "this is a game", not "default chat library".
 *
 * To use a different look, define another constant like this and pass it
 * to `mountChatView({ theme })`. v0.1 does NOT support runtime theme
 * switching — to change theme, dispose the current ChatView and mount a
 * new one with the new theme.
 */
const GoldGameTheme: ThemeConfig = {
  ...PrivchatDarkTheme,
  colors: {
    ...PrivchatDarkTheme.colors,
    background:    '#1a1208',  // deep brown chat area
    surface:       '#2c1f0f',  // input bar surface
    primary:       '#e8b551',  // send button + accent (gold)
    bubbleMine:    '#c89a44',  // self-sent (warm gold)
    bubbleOther:   '#3d2e16',  // peer (dark earth)
    textPrimary:   '#f5e6c8',  // off-white parchment
    textSecondary: '#a08966',  // muted bronze
    danger:        '#d9534f',
  },
};

/**
 * Demo scene wiring for @privchat/cocos.
 *
 * Default: mock mode (no real PrivChat server needed) — visible UI immediately.
 *
 * Real-SDK mode: set `useMock = false` and fill in serverUrl / userId / token /
 * deviceId. The real PrivChat client construction is intentionally deferred to
 * runtime so the demo doesn't require a live server to load.
 */
@ccclass('DemoChatScene')
export class DemoChatScene extends Component {
  @property({ tooltip: 'When true, use the in-memory DemoMockAdapter (no server required).' })
  useMock = true;

  @property({ tooltip: 'Real PrivChat server URL (only used when useMock is false).' })
  serverUrl = 'tcp://127.0.0.1:9001';

  @property userId = '';
  @property token = '';
  @property({ tooltip: 'Leave empty to auto-generate a UUID at runtime. On real device, host should pass the platform-specific device id.' })
  deviceId = '';
  @property channelId = 'demo-channel';
  @property({ tooltip: '1 = direct, 2 = room' })
  channelType = 1;

  @property({ type: Node, tooltip: 'Container Node where the chat UI will be mounted.' })
  chatRoot: Node | null = null;

  private mounted: { dispose: () => void } | null = null;
  private mockAdapter: DemoMockAdapter | null = null;
  private client: PrivchatClient | null = null;

  onLoad(): void {
    console.log('[DemoChatScene] onLoad — Component instantiated. useMock=' + this.useMock);
  }

  async start(): Promise<void> {
    console.log('[DemoChatScene] start — chatRoot=' + (this.chatRoot ? this.chatRoot.name : 'null'));
    if (!this.chatRoot) {
      console.error('[DemoChatScene] chatRoot is not assigned in the inspector.');
      return;
    }
    if (!this.deviceId) {
      this.deviceId = generateDeviceId();
      console.log('[DemoChatScene] auto-generated deviceId=' + this.deviceId);
    }

    if (this.useMock) {
      this.mockAdapter = new DemoMockAdapter();
      this.mounted = PrivchatCocos.mountChatView(this.chatRoot, {
        adapter: this.mockAdapter,
        channelId: this.channelId,
        channelType: this.channelType,
        theme: GoldGameTheme,
        onError: (err) => console.warn('[DemoChatScene][mock] onError', err),
        onToast: (msg) => console.log('[DemoChatScene][mock] onToast', msg),
      });
      console.log('[DemoChatScene] mounted in MOCK mode.');
      return;
    }

    // Real SDK mode — only enabled when useMock is false.
    try {
      this.client = new PrivchatClient({ serverUrl: this.serverUrl } as never);
      await this.client.connect();
      await this.client.authenticate(this.userId, this.token, this.deviceId);

      this.mounted = PrivchatCocos.mountChatView(this.chatRoot, {
        client: this.client,
        channelId: this.channelId,
        channelType: this.channelType,
        theme: GoldGameTheme,
        onError: (err) => console.warn('[DemoChatScene][real] onError', err),
        onToast: (msg) => console.log('[DemoChatScene][real] onToast', msg),
      });
      console.log('[DemoChatScene] mounted in REAL SDK mode.');
    } catch (err) {
      console.error('[DemoChatScene] failed to mount in real-SDK mode:', err);
    }
  }

  onDestroy(): void {
    this.mounted?.dispose();
    this.mounted = null;
    this.mockAdapter = null;
    // Calling disconnect optionally; some PrivchatClient implementations may
    // not expose it on the type. Cast to any to defer type checking here.
    (this.client as unknown as { disconnect?: () => void } | null)?.disconnect?.();
    this.client = null;
  }
}

/**
 * Generate a stable-ish device id for demo use. Tries crypto.randomUUID()
 * first; falls back to RFC4122-flavored v4 random if unavailable.
 *
 * On real iOS/Android devices, the host integration should pass the
 * platform-specific device id (IDFV / Android ID / etc.) instead of
 * generating one here.
 */
function generateDeviceId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) {
    return 'demo-' + c.randomUUID();
  }
  // Fallback v4-ish UUID
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) uuid += '-';
    if (i === 12) uuid += '4';
    else if (i === 16) uuid += hex[8 + Math.floor(Math.random() * 4)];
    else uuid += hex[Math.floor(Math.random() * 16)];
  }
  return 'demo-' + uuid;
}
