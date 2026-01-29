import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const DB_PATH = path.join(os.homedir(), '.tsunagi', 'state', 'events.db');
const MAX_EVENTS = 3000;

export interface StoredEvent {
  sequence: number;
  type: string;
  data: unknown;
  timestamp: number;
}

class EventStore {
  private db: DatabaseSync | null = null;
  private initialized: boolean = false;

  init(): void {
    if (this.initialized) return;

    // ディレクトリ作成
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // SQLite接続
    this.db = new DatabaseSync(DB_PATH);

    // WALモード（書き込み性能向上）
    this.db.exec('PRAGMA journal_mode = WAL;');

    // テーブル + インデックス + TRIGGER作成
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_sequence ON events(sequence);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

      CREATE TRIGGER IF NOT EXISTS enforce_max_events
      AFTER INSERT ON events
      WHEN (SELECT COUNT(*) FROM events) > ${MAX_EVENTS}
      BEGIN
        DELETE FROM events
        WHERE sequence = (SELECT MIN(sequence) FROM events);
      END;
    `);

    const countResult = this.db.prepare('SELECT COUNT(*) as count FROM events').get() as {
      count: number;
    };
    const maxSeqResult = this.db.prepare('SELECT MAX(sequence) as max FROM events').get() as {
      max: number | null;
    };

    console.log(
      `[EventStore] Initialized with ${countResult.count} events, max sequence: ${maxSeqResult.max || 0}`
    );
    this.initialized = true;
  }

  record(type: string, data: unknown): number {
    if (!this.db || !this.initialized) {
      throw new Error('[EventStore] Not initialized. Call init() first.');
    }

    const stmt = this.db.prepare(`
      INSERT INTO events (type, data, timestamp)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(type, JSON.stringify(data), Date.now());
    return Number(result.lastInsertRowid);
  }

  getEventsSince(sequence: number): StoredEvent[] {
    if (!this.db || !this.initialized) {
      throw new Error('[EventStore] Not initialized.');
    }

    const stmt = this.db.prepare(`
      SELECT sequence, type, data, timestamp
      FROM events
      WHERE sequence > ?
      ORDER BY sequence ASC
    `);

    const rows = stmt.all(sequence) as Array<{
      sequence: number;
      type: string;
      data: string;
      timestamp: number;
    }>;

    return rows.map((row) => ({
      sequence: row.sequence,
      type: row.type,
      data: JSON.parse(row.data),
      timestamp: row.timestamp,
    }));
  }

  getCurrentSequence(): number {
    if (!this.db || !this.initialized) {
      return 0;
    }

    const result = this.db.prepare('SELECT MAX(sequence) as max FROM events').get() as {
      max: number | null;
    };
    return result.max || 0;
  }

  getEventCount(): number {
    if (!this.db || !this.initialized) {
      return 0;
    }

    const result = this.db.prepare('SELECT COUNT(*) as count FROM events').get() as {
      count: number;
    };
    return result.count;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      console.log('[EventStore] Database closed');
    }
  }
}

export const eventStore = new EventStore();
