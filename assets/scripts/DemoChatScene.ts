import { Component, Node, SpriteFrame, Texture2D, _decorator } from 'cc';
import {
  PrivchatClient,
  PrivchatCocos,
  PrivchatDarkTheme,
  SdkFriendsSource,
  createPlatformAuthClient,
  type FriendVM,
  type FriendsSource,
  type PlatformAuthClient,
  type ThemeConfig,
} from '@privchat/cocos';
import { DemoMockAdapter } from './DemoMockAdapter';
import { DemoFriendsSource } from './DemoFriendsSource';
import { createLoginPage, type LoginCredentials, type LoginPageHandle } from './LoginPage';
import { createMenuPage } from './MenuPage';
import { createRoomPanel } from './RoomPanel';
import { createFloatingChatDemo } from './FloatingChatDemo';

const { ccclass, property } = _decorator;

/**
 * Demo theme — uses `PrivchatDarkTheme` as-is. The dark theme is now
 * derived from the Phase-G UI Kit's BlackGold theme (see chat-theme.ts
 * `chatThemeFromUiTheme(createBlackGoldTheme(...))`), which gives the
 * chat surface the same dark / warm-charcoal palette as the rest of
 * the UI Kit demo. Previously a hand-rolled brown palette (#1a1208 /
 * #2c1f0f) lived here, but it made the chat read as a different app
 * from the UI Kit demo — removing it lets every screen share one
 * consistent BlackGold look.
 */
const GoldGameTheme: ThemeConfig = PrivchatDarkTheme;

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

  @property({
    tooltip:
      'privchat-application route-group base URL for PLATFORM auth. Example: http://127.0.0.1:8080/app',
  })
  applicationBaseUrl = 'http://127.0.0.1:8080/app';

  // chatRoot is the single Node bound in the scene editor — kept under this
  // property name for backward compat with existing scene bindings. It
  // hosts whichever page is currently active.
  @property({ type: Node, tooltip: 'Container Node where the demo UI will be mounted.' })
  chatRoot: Node | null = null;

  private currentPage: Page = 'login';
  private currentMount: { dispose: () => void } | null = null;
  // Hold the LoginPageHandle separately so afterLogin's catch can call
  // its setCodeError on validation failure (verify code expired / wrong
  // / network error) instead of tearing the whole login flow back to
  // step-1.
  private loginPage: LoginPageHandle | null = null;

  // Session-scoped — survives login → menu → ... navigation. Disposed
  // only on logout or component destroy.
  private mockAdapter: DemoMockAdapter | null = null;
  private friendsSource: FriendsSource | null = null;
  private mockFriendsSource: DemoFriendsSource | null = null;
  private client: PrivchatClient | null = null;
  private platformAuth: PlatformAuthClient | null = null;
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
      onSendSmsCode: (mobile) => {
        if (this.useMock) {
          console.log('[DemoChatScene] sendSmsCode mobile=' + mobile + ' (mock)');
          return Promise.resolve();
        }
        return this.ensurePlatformAuth().sendSmsCode(mobile);
      },
      onLogin: (creds) => {
        this.credentials = creds;
        console.log(
          '[DemoChatScene] login submitted mobile=' + creds.mobile + ' smsCode=' + creds.smsCode,
        );
        void this.afterLogin();
      },
    });
    this.loginPage = handle;
    this.currentMount = handle;
  }

  /** Lazy-init the PlatformAuthClient. Re-created on `applicationBaseUrl`
   *  change between sessions — we don't watch the property at runtime,
   *  the scene assumes baseUrl is stable for the session. */
  private ensurePlatformAuth(): PlatformAuthClient {
    if (!this.platformAuth) {
      this.platformAuth = createPlatformAuthClient({
        baseUrl: this.applicationBaseUrl,
      });
    }
    return this.platformAuth;
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
      this.sessionLabel = this.credentials?.mobile || 'mock-user';
      this.showMenu();
      return;
    }
    // Real-SDK mode — PLATFORM account-mode flow (per ACCOUNT_IDENTITY_
    // SPEC §3 + TOKEN_UNIFICATION_SPEC §1.2 §8):
    //   1. POST application /auth/sms-login → unified LoginResponse
    //   2. connect WebSocket to privchat-server
    //   3. sdk.authenticate(userId, accessToken, deviceId)
    //   4. wrap channel list as FriendsSource
    // accessToken is server-signed and works for HTTP + IM — same
    // unified token, no separate IM token.
    try {
      const mobile = this.credentials?.mobile ?? '';
      const smsCode = this.credentials?.smsCode ?? '';
      const auth = this.ensurePlatformAuth();
      const loginResp = await auth.loginWithSms({
        mobile,
        smsCode,
        device: {
          deviceId: this.deviceId,
          platform: 'web', // Cocos preview / web build; native builds detect via cc.sys.platform
          deviceName: 'cocos-creator',
          appVersion: '0.0.0',
        },
      });

      const url = normalizeWsUrl(this.serverUrl);
      this.client = new PrivchatClient({
        url,
        cache: { enabled: true, dbName: 'privchat-cocos-demo' },
      });
      await this.client.connect();
      await this.client.authenticate(
        String(loginResp.userId),
        loginResp.accessToken,
        loginResp.deviceId,
      );

      this.friendsSource = new SdkFriendsSource({
        client: this.client,
        channelTypes: [1], // peer channels only
      });
      this.sessionLabel = mobile;
      this.showMenu();
    } catch (err) {
      console.error('[DemoChatScene] PLATFORM real-mode login failed:', err);
      // 把后端的 application code → 中文友好提示，然后让 LoginPage 在
      // OTP 页面上原地显示错误，而不是把整个 session 推倒重来。常见的
      // 失败场景都不需要回手机号页 —— 用户保持在 OTP 页改验证码 / 用
      // 「重新发送」就能继续。如果是会话级故障（websocket 起不来等）
      // 才退到手机号页。
      const friendly = humanizeAuthError(err);
      if (friendly.recoverableOnCodeStep && this.loginPage) {
        this.loginPage.setCodeError(friendly.message);
        // 部分清理：只丢 client（authenticate 失败可能已 connect
        // 一半），不动 credentials / loginPage / friendsSource。
        if (this.client) {
          const c = this.client as unknown as { disconnect?: () => void; dispose?: () => void };
          try {
            if (c.dispose) c.dispose();
            else if (c.disconnect) c.disconnect();
          } catch { /* ignore */ }
          this.client = null;
        }
      } else {
        this.teardownSession();
        this.showLogin();
      }
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
        imageLoader: loadRemoteSpriteFrame,
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
        imageLoader: loadRemoteSpriteFrame,
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
    // loginPage 引用的就是 login 页面的 LoginPageHandle，离开 login
    // 后 handle 也已经 dispose；这里同步清掉避免 stale 引用。
    this.loginPage = null;
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

/** Convert a thrown error from the PLATFORM auth path into a friendly
 *  Chinese message + a flag telling the caller whether the user can
 *  retry on the OTP step (vs. needing to fully retry from step-1). */
function humanizeAuthError(err: unknown): {
  message: string;
  recoverableOnCodeStep: boolean;
} {
  const e = err as { applicationCode?: number; httpStatus?: number; message?: string };
  const code = e?.applicationCode;
  const msg = e?.message ?? '';
  // application 的 MemberAuthLogic 错误码（业务层校验，回 OTP 重试即可）
  if (code === 10100) {
    if (msg.includes('SMS code expired')) {
      return { message: '验证码已过期，请重新发送', recoverableOnCodeStep: true };
    }
    if (msg.includes('Invalid SMS code') || msg.includes('verify code')) {
      return { message: '验证码错误，请重新输入', recoverableOnCodeStep: true };
    }
    if (msg.includes('not sent')) {
      return { message: '验证码不存在，请先获取验证码', recoverableOnCodeStep: true };
    }
    // 其他 10100 业务校验 —— 让用户看到后端原文，至少能猜出问题
    return { message: msg || '请求参数有误', recoverableOnCodeStep: true };
  }
  if (code === 10200 || e?.httpStatus === 429) {
    return { message: '请求过于频繁，请稍后再试', recoverableOnCodeStep: true };
  }
  // 网络层（fetch 失败 / 超时）— OTP 页面可以原地重试
  if (err instanceof Error && /NetworkError|fetch|timeout|abort/i.test(err.message)) {
    return { message: '网络异常，请检查后端服务后重试', recoverableOnCodeStep: true };
  }
  // 其他未识别错误 —— 回到手机号页让用户重头来
  return {
    message: err instanceof Error ? err.message : String(err),
    recoverableOnCodeStep: false,
  };
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

/** Demo image loader — fetches a remote URL via `cc.assetManager.loadRemote`
 *  and converts the resulting Texture2D to a SpriteFrame. Used by the chat
 *  view for image-message thumbnails and the image viewer overlay.
 *  Real apps would route through their own CDN / cache layer; this
 *  helper is intentionally minimal for demo. */
function loadRemoteSpriteFrame(url: string): Promise<SpriteFrame | undefined> {
  return new Promise((resolve) => {
    try {
      const am = (globalThis as { cc?: { assetManager?: { loadRemote: Function } } }).cc?.assetManager;
      if (!am) {
        resolve(undefined);
        return;
      }
      // `cc.assetManager.loadRemote(url, options?, cb)` — pass an ext
      // hint via the options bag when the URL has no recognized
      // extension (e.g., picsum.photos query strings).
      const ext = inferImageExt(url);
      am.loadRemote(url, { ext }, (err: unknown, asset: Texture2D | unknown) => {
        if (err || !asset) {
          console.warn('[DemoChatScene] loadRemote failed', url, err);
          resolve(undefined);
          return;
        }
        try {
          const sf = new SpriteFrame();
          (sf as unknown as { texture: Texture2D }).texture = asset as Texture2D;
          resolve(sf);
        } catch (e) {
          console.warn('[DemoChatScene] SpriteFrame ctor failed', e);
          resolve(undefined);
        }
      });
    } catch (e) {
      console.warn('[DemoChatScene] loadRemoteSpriteFrame error', e);
      resolve(undefined);
    }
  });
}

function inferImageExt(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return '.jpg';
  if (lower.endsWith('.png')) return '.png';
  if (lower.endsWith('.webp')) return '.webp';
  if (lower.endsWith('.gif')) return '.gif';
  return '.png';
}

