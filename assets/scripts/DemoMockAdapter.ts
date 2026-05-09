// Runtime mock adapter for the demo. Implements PrivchatClientAdapter so
// `mountChatView({ adapter })` shows visible content without a real server.
//
// IMPORTANT: This adapter is for IM messaging only (open/observe/send).
// It does NOT provide a friend list — that's the host game's job. See
// DemoFriendsSource.ts for the friend-system mock.

import type {
  BootstrapChannelsOptions,
  ChannelRecord,
  ConnectionState,
  ConversationPatch,
  ConversationSnapshot,
  FriendshipRecord,
  MarkReadOptions,
  MessageRecord,
  OpenConversationOptions,
  PrivchatClientAdapter,
  ScrollHistoryOptions,
  SendTextInput,
  SendTextOperationResult,
  SequencedSdkEvent,
  SessionSnapshot,
  Unsubscribe,
  UserRecord,
} from '@privchat/cocos';

const SELF_UID = 'demo-me';

interface SeedMessage {
  from: 'self' | 'peer';
  text: string;
  offsetMs?: number;
}

/** Per-channel seed configuration consumed at construction time. */
export interface DemoChannelSeed {
  channelId: string;
  channelType: number;
  peerUid: string;
  messages: SeedMessage[];
}

const NOW = Date.now();

function rec(seed: DemoChannelSeed, partial: Partial<MessageRecord>): MessageRecord {
  return {
    channel_id: seed.channelId,
    channel_type: seed.channelType,
    from_uid: seed.peerUid,
    message_type: 'text',
    content: '',
    payload: new Uint8Array(0),
    timestamp: Date.now(),
    status: 'received',
    server_message_id: 's-' + Math.random().toString(36).slice(2, 9),
    ...partial,
  } as MessageRecord;
}

function chanKey(channelId: string, channelType: number): string {
  return `${channelId}::${channelType}`;
}

/** The default seeded channels for the demo — paired 1:1 with friends in
 *  DemoFriendsSource. When you add a friend, add a matching seed here. */
export const DEFAULT_DEMO_SEEDS: DemoChannelSeed[] = [
  {
    channelId: 'demo-channel-alice',
    channelType: 1,
    peerUid: 'peer-alice',
    messages: [
      { from: 'peer', text: '欢迎来到 PrivChat Cocos demo!', offsetMs: -60_000 },
      { from: 'self', text: '我已经接进来了。', offsetMs: -50_000 },
      { from: 'peer', text: '试试发条消息吧 — 这是 mock 模式，不连服务器。', offsetMs: -2 * 60_000 },
    ],
  },
  {
    channelId: 'demo-channel-bob',
    channelType: 1,
    peerUid: 'peer-bob',
    messages: [
      { from: 'peer', text: 'Cocos preview 应该能用滚轮上下翻。', offsetMs: -30 * 60_000 },
      { from: 'self', text: '我数一下条数：1 2 3 4 5 6 7 8。', offsetMs: -29 * 60_000 },
    ],
  },
  {
    channelId: 'demo-channel-charlie',
    channelType: 1,
    peerUid: 'peer-charlie',
    messages: [
      { from: 'peer', text: '中英文混排测试 mixed text 测试。', offsetMs: -60 * 60_000 },
      { from: 'self', text: '气泡宽度应该刚好包住文字不缩字号。', offsetMs: -59 * 60_000 },
    ],
  },
  {
    channelId: 'demo-channel-david',
    channelType: 1,
    peerUid: 'peer-david',
    messages: [
      { from: 'peer', text: '这是昨天发的一条消息。', offsetMs: -28 * 60 * 60_000 },
    ],
  },
];

export class DemoMockAdapter implements PrivchatClientAdapter {
  private convListeners = new Map<
    string,
    Set<(snap: ConversationSnapshot, patch: ConversationPatch) => void>
  >();
  private messagesByChannel = new Map<string, MessageRecord[]>();
  private seeds = new Map<string, DemoChannelSeed>();
  private localSeq = 0;

  constructor(seeds: DemoChannelSeed[] = DEFAULT_DEMO_SEEDS) {
    for (const seed of seeds) {
      const k = chanKey(seed.channelId, seed.channelType);
      this.seeds.set(k, seed);
      const list: MessageRecord[] = seed.messages.map((s) =>
        rec(seed, {
          from_uid: s.from === 'self' ? SELF_UID : seed.peerUid,
          content: s.text,
          status: s.from === 'self' ? 'sent' : 'received',
          timestamp: NOW + (s.offsetMs ?? 0),
        }),
      );
      this.messagesByChannel.set(k, list);
    }
  }

  connectionState(): ConnectionState {
    return 'connected';
  }

  sessionSnapshot(): SessionSnapshot {
    return {
      user_id: SELF_UID,
      device_id: 'demo-device',
      connection_state: 'connected',
      has_access_token: true,
      last_event_sequence_id: 0,
    };
  }

  observeEvents(_cb: (env: SequencedSdkEvent) => void): Unsubscribe {
    return () => {};
  }

  async openConversation(
    channelId: string,
    channelType: number,
    _opts?: OpenConversationOptions,
  ): Promise<MessageRecord[]> {
    return [...(this.messagesByChannel.get(chanKey(channelId, channelType)) ?? [])];
  }

  observeConversation(
    channelId: string,
    channelType: number,
    cb: (snap: ConversationSnapshot, patch: ConversationPatch) => void,
  ): Unsubscribe {
    const k = chanKey(channelId, channelType);
    let set = this.convListeners.get(k);
    if (!set) {
      set = new Set();
      this.convListeners.set(k, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
    };
  }

  getCachedMessages(channelId: string, channelType: number): MessageRecord[] {
    return [...(this.messagesByChannel.get(chanKey(channelId, channelType)) ?? [])];
  }

  async scrollHistory(
    _channelId: string,
    _channelType: number,
    _opts?: ScrollHistoryOptions,
  ): Promise<MessageRecord[]> {
    return [];
  }

  async sendTextMessage(input: SendTextInput): Promise<SendTextOperationResult> {
    const local_message_id = 'l-' + (++this.localSeq);
    const k = chanKey(input.channel_id, input.channel_type);
    const seed = this.seeds.get(k);
    if (!seed) {
      throw new Error(`DemoMockAdapter: unknown channel ${k}`);
    }
    const sent: MessageRecord = rec(seed, {
      from_uid: SELF_UID,
      content: input.content,
      message_type: 'text',
      status: 'sent',
      local_message_id,
      timestamp: Date.now(),
    });
    const cur = this.messagesByChannel.get(k) ?? [];
    this.messagesByChannel.set(k, [...cur, sent]);
    this.emitConversationSnapshot(input.channel_id, input.channel_type);
    return {
      status: 'sent',
      local_message_id,
      response: {} as never,
    };
  }

  async markRead(
    _channelId: string,
    _channelType: number,
    _readPts: string,
    _opts?: MarkReadOptions,
  ): Promise<unknown> {
    return undefined;
  }

  // Channel-list methods exist on the adapter interface for the
  // optional SdkFriendsSource bridge. In mock mode the demo uses
  // DemoFriendsSource for the contact list, so these stay no-ops.
  async bootstrapChannels(_opts?: BootstrapChannelsOptions): Promise<ChannelRecord[]> {
    return [];
  }

  cachedChannels(): ChannelRecord[] {
    return [];
  }

  observeChannelList(_cb: (channels: ChannelRecord[]) => void): Unsubscribe {
    return () => {};
  }

  // User/friendship caches and subscribe APIs are unused in mock mode —
  // contact list comes from DemoFriendsSource, and Room subscription is
  // exercised in the separate DemoRoomSubscriptionScene with the real SDK.
  cachedUser(_user_id: string): UserRecord | undefined {
    return undefined;
  }

  observeUserList(_cb: (users: UserRecord[]) => void): Unsubscribe {
    return () => {};
  }

  cachedFriendship(_user_id: string): FriendshipRecord | undefined {
    return undefined;
  }

  observeFriendshipList(_cb: (rows: FriendshipRecord[]) => void): Unsubscribe {
    return () => {};
  }

  async subscribeChannel(_channelId: string, _channelType: number, _ticket?: string): Promise<void> {
    // noop
  }

  async unsubscribeChannel(_channelId: string, _channelType: number): Promise<void> {
    // noop
  }

  async fetchUserDetail(
    _targetUserId: string,
    _source: 'conversation' | 'friend' | 'group' | 'search' | 'card_share' | 'friend_pending',
    _sourceId: string,
  ): Promise<undefined> {
    return undefined;
  }

  /** Demo helper: simulate an inbound message from the peer. */
  pushFakeInbound(channelId: string, channelType: number, text: string): void {
    const k = chanKey(channelId, channelType);
    const seed = this.seeds.get(k);
    if (!seed) return;
    const r = rec(seed, { from_uid: seed.peerUid, content: text, timestamp: Date.now() });
    const cur = this.messagesByChannel.get(k) ?? [];
    this.messagesByChannel.set(k, [...cur, r]);
    this.emitConversationSnapshot(channelId, channelType);
  }

  private emitConversationSnapshot(channelId: string, channelType: number): void {
    const k = chanKey(channelId, channelType);
    const set = this.convListeners.get(k);
    if (!set) return;
    const messages = this.messagesByChannel.get(k) ?? [];
    const snap: ConversationSnapshot = {
      messages: [...messages],
    } as unknown as ConversationSnapshot;
    const patch: ConversationPatch = {
      upserted: [...messages],
      removed: [],
    } as unknown as ConversationPatch;
    for (const cb of set) cb(snap, patch);
  }
}
