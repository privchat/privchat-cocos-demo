import { Component, Node, _decorator } from 'cc';
import {
  PrivchatClient,
  PrivchatCocos,
  PrivchatDarkTheme,
  SdkFriendsSource,
  type FriendVM,
  type FriendsSource,
  type ThemeConfig,
} from '@privchat/cocos';
import { DemoMockAdapter } from './DemoMockAdapter';
import { DemoFriendsSource } from './DemoFriendsSource';
import { createLoginPage, type LoginCredentials } from './LoginPage';
import { createMenuPage } from './MenuPage';
import { createRoomPanel } from './RoomPanel';
import { createFloatingChatDemo } from './FloatingChatDemo';

const { ccclass, property } = _decorator;

/**
 * Game-flavored theme for the demo. Spread `PrivchatDarkTheme` first to keep
 * radius / spacing / fontSize defaults, then override the colors that should
 * read as "this is a game", not "default chat library".
 */
const GoldGameTheme: ThemeConfig = {
  ...PrivchatDarkTheme,
  colors: {
    ...PrivchatDarkTheme.colors,
    background: '#1a1208',
    surface: '#2c1f0f',
    primary: '#e8b551',
    bubbleMine: '#c89a44',
    bubbleOther: '#3d2e16',
    textPrimary: '#f5e6c8',
    textSecondary: '#a08966',
    danger: '#d9534f',
  },
};

type Page = 'login' | 'menu' | 'friends' | 'chat' | 'room' | 'floating';

/**
 * Demo scene wiring for @privchat/cocos.
 *
 * State machine:
 *
 *     login ──auth ok──▶ menu ─┬─▶ friends ──pick──▶ chat ──back──▶ friends
 *                              │                                      │
 *                              │                                  back│
 *                              │                                      ▼
 *                              ◀──────────────────────── back ─────menu
 *                              │
 *                              ├─▶ room (subscription test) ──back──▶ menu
 *                              │
 *                              └─▶ logout ──▶ login
 *
 * Lifecycle ownership (the part you can't see in the diagram):
 *   - PrivchatClient is created once after login succeeds and survives
 *     all menu / friends / chat / room transitions. Logout disposes it
 *     so the next login starts a fresh session (new device id is also
 *     re-rolled implicitly via the inspector default + UUID guard).
 *   - FriendsSource (real or DemoFriendsSource) is created lazily and
 *     reused across friends-page entries so presence flips and lazy-
 *     fetch resolutions persist.
 *   - DemoMockAdapter (mock mode only) is created once for the same
 *     reason — sent messages stay visible across page transitions.
 */
@ccclass('DemoChatScene')
export class DemoChatScene extends Component {
  @property({ tooltip: 'When true, use the in-memory DemoMockAdapter (no server required).' })
  useMock = true;

  @property({ tooltip: 'Real PrivChat server URL (WebSocket; only used when useMock is false). Examples: ws://127.0.0.1:9080/, wss://im.example.com/ws' })
  serverUrl = 'ws://127.0.0.1:9080/';

  @property({ tooltip: 'Leave empty to auto-generate a UUID at runtime. On real device, host should pass the platform-specific device id.' })
  deviceId = '';

  @property({ tooltip: 'Default Room channelId prefilled in the Room subscription test page.' })
  defaultRoomChannelId = '100';

  // chatRoot is the single Node bound in the scene editor — kept under this
  // property name for backward compat with existing scene bindings. It
  // hosts whichever page is currently active.
  @property({ type: Node, tooltip: 'Container Node where the demo UI will be mounted.' })
  chatRoot: Node | null = null;

  private currentPage: Page = 'login';
  private currentMount: { dispose: () => void } | null = null;

  // Session-scoped — survives login → menu → ... navigation. Disposed
  // only on logout or component destroy.
  private mockAdapter: DemoMockAdapter | null = null;
  private friendsSource: FriendsSource | null = null;
  private mockFriendsSource: DemoFriendsSource | null = null;
  private client: PrivchatClient | null = null;
  private credentials: LoginCredentials | null = null;
  /** Display name surfaced on the menu greeting. Username for real-SDK,
   *  the placeholder string for mock. */
  private sessionLabel = '';

  onLoad(): void {
    console.log('[DemoChatScene] onLoad — useMock=' + this.useMock);
  }

  start(): void {
    if (!this.chatRoot) {
      console.error('[DemoChatScene] chatRoot is not assigned in the inspector.');
      return;
    }
    if (!isValidUuidV4(this.deviceId)) {
      const old = this.deviceId;
      this.deviceId = generateDeviceId();
      console.log(
        `[DemoChatScene] regenerated deviceId — was "${old || '(empty)'}", now "${this.deviceId}"`,
      );
    }
    this.showLogin();
  }

  onDestroy(): void {
    this.disposeCurrent();
    this.teardownSession();
  }

  // ----- pages -----

  private showLogin(): void {
    if (!this.chatRoot) return;
    this.disposeCurrent();
    this.currentPage = 'login';
    const handle = createLoginPage({
      root: this.chatRoot,
      theme: GoldGameTheme,
      onLogin: (creds) => {
        this.credentials = creds;
        console.log('[DemoChatScene] login submitted username=' + creds.username);
        void this.afterLogin();
      },
    });
    this.currentMount = handle;
  }

  private async afterLogin(): Promise<void> {
    if (this.useMock) {
      // Reuse the same mock adapter + friendsSource across the session
      // so messages and presence flips persist across page transitions.
      if (!this.mockAdapter) this.mockAdapter = new DemoMockAdapter();
      if (!this.mockFriendsSource) {
        this.mockFriendsSource = new DemoFriendsSource();
        this.friendsSource = this.mockFriendsSource;
      }
      this.sessionLabel = this.credentials?.username || 'mock-user';
      this.showMenu();
      return;
    }
    // Real-SDK mode — flow mirrors privchat-web's login-page.tsx:
    //   1. connect WebSocket
    //   2. rpc(account/auth/login) with username+password → user_id+token
    //   3. authenticate(user_id, token, device_id) for the L1 session
    //   4. wrap channel list as FriendsSource for the contact list view
    try {
      const url = normalizeWsUrl(this.serverUrl);
      // cache must be enabled — bootstrapChannels / openConversation /
      // observeConversation throw CacheDisabledError without it.
      this.client = new PrivchatClient({
        url,
        cache: { enabled: true, dbName: 'privchat-cocos-demo' },
      });
      await this.client.connect();
      const username = this.credentials?.username ?? '';
      const password = this.credentials?.password ?? '';
      const resp = await this.client.rpcCallTyped<LoginRequest, LoginResponse>(
        'account/auth/login',
        {
          username,
          password,
          device_id: this.deviceId,
          device_info: {
            device_id: this.deviceId,
            // Server enum: unknown | ios | android | web | macos | windows | linux | iot.
            // Cocos preview runs in browser → 'web'. Native builds should
            // detect via cc.sys.platform and pick ios/android.
            device_type: 'web',
            app_id: 'privchat-cocos-demo',
            device_name: 'cocos-creator',
            app_version: '0.0.0',
          },
        },
      );
      await this.client.authenticate(
        String(resp.user_id),
        resp.token,
        resp.device_id,
      );
      this.friendsSource = new SdkFriendsSource({
        client: this.client,
        channelTypes: [1], // peer channels only
      });
      this.sessionLabel = username;
      this.showMenu();
    } catch (err) {
      console.error('[DemoChatScene] real-SDK login failed:', err);
      // Fail clean: drop any half-built client so the next login attempt
      // starts fresh, then return to login screen.
      this.teardownSession();
      this.showLogin();
    }
  }

  private showMenu(): void {
    if (!this.chatRoot) return;
    this.disposeCurrent();
    this.currentPage = 'menu';
    this.currentMount = createMenuPage({
      root: this.chatRoot,
      theme: GoldGameTheme,
      username: this.sessionLabel,
      onOpenFriends: () => this.showFriends(),
      onOpenRoom: () => this.showRoom(),
      onOpenFloating: () => this.showFloating(),
      onLogout: () => this.logout(),
    });
  }

  private showFloating(): void {
    if (!this.chatRoot) return;
    if (this.useMock || !this.client) {
      // openChatWindow demo needs a real client — DemoMockAdapter has
      // no openConversation/observe wire that actually emits messages,
      // so mock-mode windows would render empty timelines. Surface
      // the limitation instead of silently doing the wrong thing.
      console.warn(
        '[DemoChatScene] 悬浮聊天测试 requires real-SDK mode (uncheck `useMock`).',
      );
      return;
    }
    this.disposeCurrent();
    this.currentPage = 'floating';
    this.currentMount = createFloatingChatDemo({
      root: this.chatRoot,
      theme: GoldGameTheme,
      client: this.client,
      // Windows mount on the same chatRoot as the demo page itself —
      // they paint above sibling-index-wise so the menu/page UI behind
      // is visible (or covered, when modal=true).
      windowParent: this.chatRoot,
      onBack: () => this.showMenu(),
    });
  }

  private showFriends(): void {
    if (!this.chatRoot || !this.friendsSource) {
      console.error('[DemoChatScene] showFriends: friendsSource missing — go through login first.');
      this.showLogin();
      return;
    }
    this.disposeCurrent();
    this.currentPage = 'friends';

    // Same NavBar primitive as the chat view's header (`< 返回` left,
    // title centered) — keeps friends/chat/room visually consistent.
    this.currentMount = PrivchatCocos.mountContactList(this.chatRoot, {
      friendsSource: this.friendsSource,
      theme: GoldGameTheme,
      onSelect: (friend) => this.showChat(friend),
      header: {
        title: '好友列表',
        onBack: () => this.showMenu(),
      },
      onError: (err) => console.warn('[DemoChatScene][friends] onError', err),
    });
  }

  private showChat(friend: FriendVM): void {
    if (!this.chatRoot) return;
    this.disposeCurrent();
    this.currentPage = 'chat';

    const header = {
      title: friend.name || friend.friendId,
      onBack: () => this.showFriends(),
    };

    if (this.useMock && this.mockAdapter) {
      this.currentMount = PrivchatCocos.mountChatView(this.chatRoot, {
        adapter: this.mockAdapter,
        channelId: friend.channelId,
        channelType: friend.channelType,
        theme: GoldGameTheme,
        header,
        onError: (err) => console.warn('[DemoChatScene][chat] onError', err),
        onToast: (msg) => console.log('[DemoChatScene][chat] onToast', msg),
      });
    } else if (this.client) {
      this.currentMount = PrivchatCocos.mountChatView(this.chatRoot, {
        client: this.client,
        channelId: friend.channelId,
        channelType: friend.channelType,
        theme: GoldGameTheme,
        header,
        onError: (err) => console.warn('[DemoChatScene][chat] onError', err),
        onToast: (msg) => console.log('[DemoChatScene][chat] onToast', msg),
      });
    } else {
      console.error('[DemoChatScene] showChat: no adapter/client available');
      return;
    }
  }

  private showRoom(): void {
    if (!this.chatRoot) return;
    if (this.useMock || !this.client) {
      // Room subscription is real-SDK only — DemoMockAdapter has no real
      // subscribe wire. Surface the limitation instead of silently doing
      // nothing.
      console.warn(
        '[DemoChatScene] Room subscription requires real-SDK mode (uncheck `useMock` in the inspector).',
      );
      // Stay on the menu; the user can re-tap once they switch modes.
      return;
    }
    this.disposeCurrent();
    this.currentPage = 'room';
    this.currentMount = createRoomPanel({
      root: this.chatRoot,
      theme: GoldGameTheme,
      client: this.client,
      defaultChannelId: this.defaultRoomChannelId,
      onBack: () => this.showMenu(),
    });
  }

  private logout(): void {
    this.teardownSession();
    this.credentials = null;
    this.sessionLabel = '';
    this.showLogin();
  }

  private disposeCurrent(): void {
    this.currentMount?.dispose();
    this.currentMount = null;
  }

  /** Drop everything tied to a single login session. Called from logout
   *  and onDestroy. Idempotent. */
  private teardownSession(): void {
    this.mockFriendsSource?.shutdown();
    this.mockFriendsSource = null;
    this.mockAdapter = null;
    this.friendsSource = null;
    const c = this.client as unknown as { disconnect?: () => void; dispose?: () => void } | null;
    // Prefer dispose() if exposed (closes IDB handle); otherwise disconnect.
    if (c?.dispose) {
      try { void c.dispose(); } catch (e) { console.warn('[DemoChatScene] client.dispose threw', e); }
    } else if (c?.disconnect) {
      try { c.disconnect(); } catch (e) { console.warn('[DemoChatScene] client.disconnect threw', e); }
    }
    this.client = null;
  }
}

// ----- helpers -----

interface LoginRequest {
  username: string;
  password: string;
  device_id: string;
  device_info: {
    device_id: string;
    device_type: string;
    app_id: string;
    device_name: string;
    app_version: string;
  };
}

interface LoginResponse {
  user_id: number | string;
  token: string;
  device_id: string;
}

function normalizeWsUrl(input: string): string {
  if (/^wss?:\/\//i.test(input)) return input;
  if (/^tcp:\/\//i.test(input)) {
    const fixed = input.replace(/^tcp:\/\//i, 'ws://');
    console.warn(`[DemoChatScene] auto-converting "${input}" → "${fixed}" (WebSocket required)`);
    return fixed;
  }
  if (!/^[a-z]+:\/\//i.test(input)) {
    const fixed = `ws://${input}`;
    console.warn(`[DemoChatScene] auto-prefixing "${input}" → "${fixed}"`);
    return fixed;
  }
  return input;
}

function isValidUuidV4(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s);
}

function generateDeviceId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) uuid += '-';
    if (i === 12) uuid += '4';
    else if (i === 16) uuid += hex[8 + Math.floor(Math.random() * 4)];
    else uuid += hex[Math.floor(Math.random() * 16)];
  }
  return uuid;
}

