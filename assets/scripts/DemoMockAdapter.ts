// Runtime mock adapter for the demo. Implements PrivchatClientAdapter so
// `mountChatView({ adapter })` shows visible content without a real server.
//
// NOT for production. The real adapter is `CocosDirectClientAdapter`.

import type {
  ConnectionState,
  ConversationPatch,
  ConversationSnapshot,
  MarkReadOptions,
  MessageRecord,
  OpenConversationOptions,
  ScrollHistoryOptions,
  SendTextInput,
  SendTextOperationResult,
  SequencedSdkEvent,
  SessionSnapshot,
} from '@privchat/sdk';
import type {
  PrivchatClientAdapter,
  Unsubscribe,
} from '@privchat/cocos';

const SELF_UID = 'demo-me';
const PEER_UID = 'demo-peer';

function rec(partial: Partial<MessageRecord>): MessageRecord {
  return {
    channel_id: 'demo-channel',
    channel_type: 1,
    from_uid: PEER_UID,
    message_type: 'text',
    content: '',
    payload: new Uint8Array(0),
    timestamp: Date.now(),
    status: 'received',
    server_message_id: 's-' + Math.random().toString(36).slice(2, 9),
    ...partial,
  } as MessageRecord;
}

export class DemoMockAdapter implements PrivchatClientAdapter {
  private listeners = new Map<
    string,
    Set<(snap: ConversationSnapshot, patch: ConversationPatch) => void>
  >();
  private messages: MessageRecord[] = [
    rec({ from_uid: PEER_UID, content: '欢迎来到 PrivChat Cocos demo!' }),
    rec({ from_uid: SELF_UID, content: '我已经接进来了。', status: 'sent' }),
    rec({ from_uid: PEER_UID, content: '试试发条消息吧 — 这是 mock 模式，不连服务器。' }),
    rec({ from_uid: SELF_UID, content: '收到，我先随便聊几句看看渲染。', status: 'sent' }),
    rec({ from_uid: PEER_UID, content: '这是第五条消息。' }),
    rec({ from_uid: SELF_UID, content: 'OK 继续测试一下滚动效果。', status: 'sent' }),
    rec({ from_uid: PEER_UID, content: 'Cocos preview 应该能用滚轮上下翻。' }),
    rec({ from_uid: SELF_UID, content: '我数一下条数：1 2 3 4 5 6 7 8。', status: 'sent' }),
    rec({ from_uid: PEER_UID, content: '中英文混排测试 mixed text 测试。' }),
    rec({ from_uid: SELF_UID, content: '气泡宽度应该刚好包住文字不缩字号。', status: 'sent' }),
    rec({ from_uid: PEER_UID, content: '最后一条 mock，下面试试发新消息。' }),
  ];
  private localSeq = 0;

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
    _channelId: string,
    _channelType: number,
    _opts?: OpenConversationOptions,
  ): Promise<MessageRecord[]> {
    return [...this.messages];
  }

  observeConversation(
    channelId: string,
    channelType: number,
    cb: (snap: ConversationSnapshot, patch: ConversationPatch) => void,
  ): Unsubscribe {
    const key = `${channelId}::${channelType}`;
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
    };
  }

  getCachedMessages(_channelId: string, _channelType: number): MessageRecord[] {
    return [...this.messages];
  }

  async scrollHistory(
    _channelId: string,
    _channelType: number,
    _opts?: ScrollHistoryOptions,
  ): Promise<MessageRecord[]> {
    return [];   // demo has no older history
  }

  async sendTextMessage(input: SendTextInput): Promise<SendTextOperationResult> {
    const local_message_id = 'l-' + (++this.localSeq);
    const sent: MessageRecord = rec({
      from_uid: SELF_UID,
      content: input.content,
      message_type: 'text',
      status: 'sent',
      local_message_id,
    });
    this.messages = [...this.messages, sent];
    this.emitSnapshot(input.channel_id, input.channel_type);
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

  /** Demo-only helper to simulate inbound messages. Hook to a button if you want. */
  pushFakeInbound(channelId: string, channelType: number, text: string): void {
    const r = rec({ from_uid: PEER_UID, content: text });
    this.messages = [...this.messages, r];
    this.emitSnapshot(channelId, channelType);
  }

  private emitSnapshot(channelId: string, channelType: number): void {
    const key = `${channelId}::${channelType}`;
    const set = this.listeners.get(key);
    if (!set) return;
    const snap: ConversationSnapshot = {
      messages: [...this.messages],
    } as unknown as ConversationSnapshot;
    const patch: ConversationPatch = {
      upserted: [...this.messages],
      removed: [],
    } as unknown as ConversationPatch;
    for (const cb of set) cb(snap, patch);
  }
}
