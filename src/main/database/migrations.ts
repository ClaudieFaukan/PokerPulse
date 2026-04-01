import Database from 'better-sqlite3';

interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    description: 'Add effective_cost to tournaments for manual cost override (e.g. free tickets)',
    up: (db) => {
      const columns = db.pragma('table_info(tournaments)') as { name: string }[];
      if (!columns.some((c) => c.name === 'effective_cost')) {
        db.exec('ALTER TABLE tournaments ADD COLUMN effective_cost REAL DEFAULT NULL');
      }
    },
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[];
  const appliedVersions = new Set(applied.map((m) => m.version));

  const insert = db.prepare('INSERT INTO schema_migrations (version, description) VALUES (?, ?)');

  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      db.transaction(() => {
        migration.up(db);
        insert.run(migration.version, migration.description);
      })();
    }
  }
}
