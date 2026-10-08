import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let pgModule = null;
try {
  pgModule = await import('pg');
} catch {
  // pg optional if running in pure sqlite mode
}

/**
 * Normalizes SQL queries and parameter ordering for SQLite
 */
function transformSqlAndParams(sql, params = []) {
  if (!sql.includes('$')) {
    return { sql, params };
  }
  const reordered = [];
  const transformedSql = sql.replace(/\$(\d+)/g, (_, numStr) => {
    const idx = parseInt(numStr, 10) - 1;
    reordered.push(params[idx]);
    return '?';
  });
  return { sql: transformedSql, params: reordered };
}

/**
 * Creates a database adapter supporting PostgreSQL (via DATABASE_URL)
 * and SQLite (via node:sqlite) with identical async API.
 */
export function createClassroomDb(options = {}) {
  const databaseUrl = options.DATABASE_URL || process.env.DATABASE_URL;
  const dbPath = options.DATABASE_PATH || process.env.DATABASE_PATH;

  if (databaseUrl && pgModule) {
    const { Pool } = pgModule.default || pgModule;
    const isSsl = databaseUrl.includes('sslmode=require') ||
      process.env.NODE_ENV === 'production' ||
      databaseUrl.includes('render.com') ||
      databaseUrl.includes('supabase.co');

    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: isSsl ? { rejectUnauthorized: false } : undefined
    });

    return {
      type: 'postgres',
      async query(sql, params = []) {
        const res = await pool.query(sql, params);
        return { rows: res.rows, rowCount: res.rowCount };
      },
      async get(sql, params = []) {
        const res = await pool.query(sql, params);
        return res.rows[0] || null;
      },
      async all(sql, params = []) {
        const res = await pool.query(sql, params);
        return res.rows;
      },
      async run(sql, params = []) {
        const res = await pool.query(sql, params);
        return { rowCount: res.rowCount };
      },
      async init() {
        const migrationPath = path.resolve(rootDir, 'drizzle/0001_classroom.sql');
        if (fs.existsSync(migrationPath)) {
          const sql = fs.readFileSync(migrationPath, 'utf8');
          await pool.query(sql);
        }
      },
      async close() {
        await pool.end();
      }
    };
  }

  // SQLite fallback for local development and tests
  const sqlite = options.sqliteInstance ||
    (dbPath ? new DatabaseSync(dbPath) : new DatabaseSync(':memory:'));

  const adapter = {
    type: 'sqlite',
    _sqlite: sqlite,
    async query(rawSql, rawParams = []) {
      const { sql, params } = transformSqlAndParams(rawSql, rawParams);
      const stmt = sqlite.prepare(sql);
      if (sql.trim().toUpperCase().startsWith('SELECT') || sql.includes('RETURNING')) {
        const rows = stmt.all(...params);
        return { rows, rowCount: rows.length };
      }
      const result = stmt.run(...params);
      return { rows: [], rowCount: result.changes };
    },
    async get(rawSql, rawParams = []) {
      const { sql, params } = transformSqlAndParams(rawSql, rawParams);
      const row = sqlite.prepare(sql).get(...params);
      return row || null;
    },
    async all(rawSql, rawParams = []) {
      const { sql, params } = transformSqlAndParams(rawSql, rawParams);
      return sqlite.prepare(sql).all(...params);
    },
    async run(rawSql, rawParams = []) {
      const { sql, params } = transformSqlAndParams(rawSql, rawParams);
      const result = sqlite.prepare(sql).run(...params);
      return { rowCount: result.changes };
    },
    async init() {
      const migrationPath = path.resolve(rootDir, 'drizzle/0001_classroom.sql');
      if (fs.existsSync(migrationPath)) {
        const sql = fs.readFileSync(migrationPath, 'utf8');
        sqlite.exec(sql);
      }
    },
    async close() {
      try {
        sqlite.close();
      } catch {
        // ignore
      }
    }
  };

  return adapter;
}
