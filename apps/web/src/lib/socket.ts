import { io, type Socket } from 'socket.io-client';
import { getServerUrl } from '@/lib/api-url';

/**
 * 画面全体で共有する Socket.IO 接続。
 *
 * 以前は hook ごとに io() を呼んでいたが、同じ namespace への io() は毎回別の物理接続になる
 * （トップで 4 本、詳細で 4 本 + タブ数）。各接続は polling から始まるため、ページ遷移直後は
 * socket.io の XHR が API の fetch と同一オリジンの接続上限（HTTP/1.1 で 6 本）を奪い合い、
 * 初期表示を遅らせていた。購読系（task:* / status-changed / todos-updated / version:*）は
 * この 1 本に集約する。
 *
 * TerminalView の PTY 接続（mode='terminal'）はサーバーが socket 単位で所有者やサイズを
 * 管理するため対象外で、従来どおりタブごとに専用の socket を持つ。
 *
 * 接続はドキュメントの生存期間中ずっと保持し、ページ遷移では切断しない。
 */
let sharedSocket: Socket | null = null;

/** room ごとの購読者数。0 → 1 で join、1 → 0 で leave する */
const roomRefCounts = new Map<string, number>();

function joinRoom(socket: Socket, room: string): void {
  // PTY IO を接続しない購読専用モード。mode を省略するとサーバーで 'terminal' 扱いになる
  socket.emit('join', { room, mode: 'subscribe' });
}

export function getSharedSocket(): Socket {
  if (!sharedSocket) {
    // polling 併用: iOS(WebKit) は Basic 認証情報を WS に付与しないため（認証付き公開時の iOS 対策）
    const socket = io(getServerUrl(), { transports: ['polling', 'websocket'] });
    // 再接続時はサーバ側 socket が新規（room 未参加）になるため、購読中の room を張り直す。
    // これを怠るとスリープ復帰後にリアルタイム更新が静かに止まる。
    socket.on('connect', () => {
      for (const room of roomRefCounts.keys()) joinRoom(socket, room);
    });
    sharedSocket = socket;
  }
  return sharedSocket;
}

/**
 * room を購読する。複数の hook が同じ room を購読しても join は 1 回、
 * 全員が解除したときだけ leave する。戻り値を呼ぶと解除。
 */
export function subscribeRoom(room: string): () => void {
  const socket = getSharedSocket();
  const count = roomRefCounts.get(room) ?? 0;
  roomRefCounts.set(room, count + 1);
  // 未接続なら connect ハンドラが一括で join するので、ここでは接続中のみ送る
  if (count === 0 && socket.connected) joinRoom(socket, room);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = roomRefCounts.get(room) ?? 0;
    if (current <= 1) {
      roomRefCounts.delete(room);
      if (socket.connected) socket.emit('leave', { room });
    } else {
      roomRefCounts.set(room, current - 1);
    }
  };
}

/**
 * 購読したい room の集合と現在の購読を突き合わせ、差分だけ subscribe / unsubscribe する。
 * subscriptions は呼び出し側が hook のインスタンスごとに保持する。
 */
export function syncRoomSubscriptions(
  subscriptions: Map<string, () => void>,
  rooms: Iterable<string>
): void {
  const wanted = new Set(rooms);
  for (const room of wanted) {
    if (!subscriptions.has(room)) subscriptions.set(room, subscribeRoom(room));
  }
  for (const [room, unsubscribe] of subscriptions) {
    if (!wanted.has(room)) {
      unsubscribe();
      subscriptions.delete(room);
    }
  }
}

/** hook のアンマウント時に全ての購読を解除する */
export function clearRoomSubscriptions(subscriptions: Map<string, () => void>): void {
  for (const unsubscribe of subscriptions.values()) unsubscribe();
  subscriptions.clear();
}
