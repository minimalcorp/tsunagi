import xtermHeadless from '@xterm/headless';
import xtermSerialize from '@xterm/addon-serialize';

const { Terminal } = xtermHeadless;
const { SerializeAddon } = xtermSerialize;

/** クライアントの xterm.js（既定 1000 行）と揃える */
const MIRROR_SCROLLBACK_LINES = 1000;

/** SerializeAddon が復元しないモードのうち、追跡するもの（マウスの座標形式・カーソル表示） */
const MOUSE_ENCODING_MODES = [1005, 1006, 1015];
const CURSOR_VISIBLE_MODE = 25;

/**
 * スナップショットの先頭に付ける、モードの初期化シーケンス。
 * SerializeAddon は有効なモードの有効化しか出力しないため、クライアントの xterm に前の接続の
 * モード（マウス追跡など）が残っていると消えない。先に既定値へ戻してから復元する
 * （無効化を先に並べる: xterm.js はマウス系のモードをどれか1つ無効化するとマウス追跡自体を止めるため）。
 */
const RESET_MODES =
  '\x1b[?1l\x1b[?66l\x1b[?2004l\x1b[4l\x1b[?6l\x1b[?45l\x1b[?1004l\x1b[?7h' +
  '\x1b[?9l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1015l' +
  '\x1b[?25h\x1b[0m\x1b[r';

export interface TerminalSnapshot {
  cols: number;
  rows: number;
  /** 空の xterm に書くと、スナップショット時点の画面・カーソル・モードを再現するシーケンス */
  data: string;
}

/**
 * PTY の出力をサーバー側の headless xterm に流し、端末の現在の状態を保持する。
 * 再接続時は生の出力ログではなく、この状態を直列化して送る。
 *
 * 生の出力を末尾だけ再生する方式では、差分で描く TUI（fullscreen の Claude 等）は
 * 最初の全体描画が上限で捨てられると、最近書き換えたセルしか復元できなかった。
 * 状態を持てば出力量に関係なく、画面・幅・alt screen・モードを正しく再現できる。
 *
 * 端末クエリ（DA / DSR 等）への応答（onData）は購読しない。クエリには接続中のクライアントの
 * xterm が応答するため、ここで応答すると PTY に二重に届く。
 */
export class TerminalMirror {
  private readonly term: InstanceType<typeof Terminal>;
  private readonly serializer = new SerializeAddon();
  private mouseEncoding: number | null = null;
  private cursorVisible = true;
  /** deleteSession 後も kill 済み PTY の残りの出力が届くことがあるため、破棄後は無視する */
  private disposed = false;

  constructor(cols: number, rows: number) {
    this.term = new Terminal({
      cols,
      rows,
      scrollback: MIRROR_SCROLLBACK_LINES,
      allowProposedApi: true,
    });
    // 型定義は @xterm/xterm の Terminal を要求するが、headless の Terminal で動作する（公式の用途）
    this.term.loadAddon(this.serializer as unknown as Parameters<typeof this.term.loadAddon>[0]);

    // マウスの座標形式とカーソル表示は IModes に無く SerializeAddon も出力しないため、
    // パーサのフックで追跡する（false を返して既定の処理も続けさせる）
    const trackPrivateMode = (enabled: boolean) => (params: (number | number[])[]) => {
      for (const param of params) {
        if (typeof param !== 'number') continue;
        if (MOUSE_ENCODING_MODES.includes(param)) {
          if (enabled) this.mouseEncoding = param;
          else if (this.mouseEncoding === param) this.mouseEncoding = null;
        } else if (param === CURSOR_VISIBLE_MODE) {
          this.cursorVisible = enabled;
        }
      }
      return false;
    };
    this.term.parser.registerCsiHandler({ prefix: '?', final: 'h' }, trackPrivateMode(true));
    this.term.parser.registerCsiHandler({ prefix: '?', final: 'l' }, trackPrivateMode(false));
    // RIS（ESC c）: 端末の全リセット
    this.term.parser.registerEscHandler({ final: 'c' }, () => {
      this.mouseEncoding = null;
      this.cursorVisible = true;
      return false;
    });
  }

  write(data: string): void {
    if (this.disposed) return;
    this.term.write(data);
  }

  /**
   * 書き込み待ちの出力をすべて処理した後に resize する。
   * term.write は非同期キューのため、即座に resize すると resize 前に出力された内容が新しい幅で解釈される
   */
  resize(cols: number, rows: number): void {
    if (this.disposed) return;
    this.term.write('', () => {
      if (!this.disposed) this.term.resize(cols, rows);
    });
  }

  /**
   * ここまでに write した出力をすべて反映した時点の状態を返す。
   * 呼び出し後に write した出力は含まない（呼び出し側はそれ以降の出力を別途クライアントへ送る）
   */
  snapshot(): Promise<TerminalSnapshot> {
    return new Promise((resolve) => {
      const empty = { cols: this.term.cols, rows: this.term.rows, data: '' };
      if (this.disposed) return resolve(empty);
      this.term.write('', () => {
        if (this.disposed) return resolve(empty);
        const encoding = this.mouseEncoding === null ? '' : `\x1b[?${this.mouseEncoding}h`;
        const cursor = this.cursorVisible ? '' : '\x1b[?25l';
        resolve({
          cols: this.term.cols,
          rows: this.term.rows,
          data: RESET_MODES + this.serializer.serialize() + encoding + cursor,
        });
      });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.term.dispose();
  }
}
