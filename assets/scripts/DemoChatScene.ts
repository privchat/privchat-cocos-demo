import { Component, Node, _decorator } from 'cc';
import { PrivchatCocos, PrivchatDarkTheme } from '@privchat/cocos';
import { PrivchatClient } from '@privchat/sdk';
import { DemoMockAdapter } from './DemoMockAdapter';

const { ccclass, property } = _decorator;

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
  @property deviceId = 'cocos-demo';
  @property channelId = 'demo-channel';
  @property({ tooltip: '1 = direct, 2 = room' })
  channelType = 1;

  @property({ type: Node, tooltip: 'Container Node where the chat UI will be mounted.' })
  chatRoot: Node | null = null;

  private mounted: { dispose: () => void } | null = null;
  private mockAdapter: DemoMockAdapter | null = null;
  private client: PrivchatClient | null = null;

  async start(): Promise<void> {
    if (!this.chatRoot) {
      console.error('[DemoChatScene] chatRoot is not assigned in the inspector.');
      return;
    }

    if (this.useMock) {
      this.mockAdapter = new DemoMockAdapter();
      this.mounted = PrivchatCocos.mountChatView(this.chatRoot, {
        adapter: this.mockAdapter,
        channelId: this.channelId,
        channelType: this.channelType,
        theme: PrivchatDarkTheme,
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
        theme: PrivchatDarkTheme,
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
