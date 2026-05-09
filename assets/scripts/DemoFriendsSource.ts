// Mock host friend system for the demo. In a real game this would be
// backed by your social/friends server — getList resolves from a cached
// snapshot, observe pushes when friends are added/removed/renamed,
// presence updates flow from a separate presence channel.

import type {
  FriendVM,
  FriendsSource,
  OnlineStatus,
  Unsubscribe,
} from '@privchat/cocos';

export interface DemoFriendSeed {
  friendId: string;
  name: string;
  channelId: string;
  channelType: number;
  initialPresence?: OnlineStatus;
}

export const DEFAULT_DEMO_FRIENDS: DemoFriendSeed[] = [
  {
    friendId: 'peer-alice',
    name: '艾莉丝',
    channelId: 'demo-channel-alice',
    channelType: 1,
    initialPresence: 'online',
  },
  {
    friendId: 'peer-bob',
    name: 'Bob',
    channelId: 'demo-channel-bob',
    channelType: 1,
    initialPresence: 'offline',
  },
  {
    friendId: 'peer-charlie',
    name: 'Charlie',
    channelId: 'demo-channel-charlie',
    channelType: 1,
    initialPresence: 'online',
  },
  {
    friendId: 'peer-david',
    name: 'David',
    channelId: 'demo-channel-david',
    channelType: 1,
    initialPresence: 'unknown',
  },
];

export class DemoFriendsSource implements FriendsSource {
  private friends: FriendVM[];
  private presence = new Map<string, OnlineStatus>();
  private listListeners = new Set<(friends: FriendVM[]) => void>();
  private presenceListeners = new Set<() => void>();
  private cycleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(seeds: DemoFriendSeed[] = DEFAULT_DEMO_FRIENDS) {
    this.friends = seeds.map((s) => ({
      friendId: s.friendId,
      name: s.name,
      online: s.initialPresence ?? 'unknown',
      channelId: s.channelId,
      channelType: s.channelType,
    }));
    for (const s of seeds) {
      this.presence.set(s.friendId, s.initialPresence ?? 'unknown');
    }
    // Flip a random friend's presence every 6s so the dot color visibly
    // changes during preview.
    this.cycleTimer = setInterval(() => this.cycle(), 6000);
  }

  getList(): FriendVM[] {
    return this.friends.slice();
  }

  observe(cb: (friends: FriendVM[]) => void): Unsubscribe {
    this.listListeners.add(cb);
    return () => {
      this.listListeners.delete(cb);
    };
  }

  getPresence(friendId: string): OnlineStatus {
    return this.presence.get(friendId) ?? 'unknown';
  }

  observePresence(cb: () => void): Unsubscribe {
    this.presenceListeners.add(cb);
    return () => {
      this.presenceListeners.delete(cb);
    };
  }

  /** Stop the auto-cycle timer. Owners must call this on teardown. */
  shutdown(): void {
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
  }

  private cycle(): void {
    if (this.friends.length === 0) return;
    const idx = Math.floor(Math.random() * this.friends.length);
    const f = this.friends[idx];
    if (!f) return;
    const order: OnlineStatus[] = ['online', 'offline', 'unknown'];
    const cur = this.presence.get(f.friendId) ?? 'unknown';
    const next = order[(order.indexOf(cur) + 1) % order.length] ?? 'unknown';
    this.presence.set(f.friendId, next);
    for (const cb of this.presenceListeners) cb();
  }
}
