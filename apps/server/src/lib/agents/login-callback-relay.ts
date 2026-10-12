import { existsSync } from 'fs';
import * as net from 'net';
import * as os from 'os';

/** コンテナ内で動いているか（Docker が作るマーカーファイル） */
function isInContainer(): boolean {
  return existsSync('/.dockerenv');
}

/**
 * ブラウザでの OAuth の戻り先を、コンテナ内でループバックだけを待ち受けている CLI に中継する。
 * Codex の `codex login` は 127.0.0.1:<port> で戻りを待つが、コンテナの外（ホストのブラウザ）から
 * 公開ポート経由で届く通信はコンテナの外向けアドレス宛てになるため届かない。そこで外向けアドレスの
 * 同じポートで受け、127.0.0.1:<port> へ流す（ホスト側でそのポートを公開しておく必要がある）。
 * コンテナ外では何もしない。戻り値で中継を止める
 */
export function startLoginCallbackRelay(ports: number[], log: (msg: string) => void): () => void {
  if (!isInContainer()) return () => undefined;

  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((info): info is os.NetworkInterfaceInfo => Boolean(info && !info.internal))
    .map((info) => info.address);

  const servers = ports.flatMap((port) =>
    addresses.map((address) => {
      const server = net.createServer((client) => {
        const upstream = net.connect(port, '127.0.0.1');
        client.pipe(upstream).pipe(client);
        const close = () => {
          client.destroy();
          upstream.destroy();
        };
        client.on('error', close);
        upstream.on('error', close);
      });
      server.on('error', (err) =>
        log(`login callback relay on ${address}:${port}: ${err.message}`)
      );
      server.listen(port, address);
      return server;
    })
  );

  return () => {
    for (const server of servers) server.close();
  };
}
