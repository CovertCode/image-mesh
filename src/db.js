import Database from 'better-sqlite3';

const db = new Database('./core.db');

// WAL mode for performance, Foreign Keys for data integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const initDb = () => {
    const schema = `
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        storage_limit_bytes INTEGER DEFAULT 104857600,
        password_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        slug TEXT NOT NULL,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
        UNIQUE(user_id, slug),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY, 
        user_id INTEGER NOT NULL,
        project_id INTEGER,
        file_path TEXT NOT NULL,
        filename TEXT,
        extension TEXT,
        size_bytes INTEGER,
        width INTEGER,
        height INTEGER,
        blurhash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        key_hash TEXT UNIQUE NOT NULL,
        label TEXT DEFAULT 'Default Key',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `;
    db.exec(schema);

    // Migration: Add created_at to projects safely
    const projectCols = db.pragma('table_info(projects)');
    if (!projectCols.some(col => col.name === 'created_at')) {
        // We add it without the dynamic DEFAULT to avoid the SQLite error
        db.exec('ALTER TABLE projects ADD COLUMN created_at DATETIME');
        // Optionally populate existing rows with the current time
        db.exec("UPDATE projects SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL");
        console.log('Migration: Added created_at column to projects.');
    }

    // Migration: Add password_hash to users safely
    const userCols = db.pragma('table_info(users)');
    if (!userCols.some(col => col.name === 'password_hash')) {
        db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
        console.log('Migration: Added password_hash to users table.');
    }

    const imageCols = db.pragma('table_info(images)');
    if (!imageCols.some(col => col.name === 'metadata')) {
        db.exec('ALTER TABLE images ADD COLUMN metadata TEXT DEFAULT "{}"');
    }

    // Migration: Add label to api_keys if missing
    const keyCols = db.pragma('table_info(api_keys)');
    if (!keyCols.some(col => col.name === 'label')) {
        db.exec("ALTER TABLE api_keys ADD COLUMN label TEXT DEFAULT 'Legacy Key'");
        db.exec("ALTER TABLE api_keys ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
        console.log('Migration: Added label and created_at to api_keys.');
    }
    console.log('Database initialized successfully.');
};

// Functional wrappers for clean code
export const query = (sql, params = []) => db.prepare(sql).all(params);
export const run = (sql, params = []) => db.prepare(sql).run(params);
export const get = (sql, params = []) => db.prepare(sql).get(params);

// Export raw db for transactions in the CLI
export default db;