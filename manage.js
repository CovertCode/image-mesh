import db, { initDb, get, run } from './src/db.js';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';

const ADMIN_LOG_FILE = './admin-account.json';

// Ensure DB is ready
initDb();

const generateKey = () => randomBytes(32).toString('hex');

const updateJsonLog = async (email, key, action = 'create') => {
  let accounts = [];
  try {
    const data = await fs.readFile(ADMIN_LOG_FILE, 'utf8');
    accounts = JSON.parse(data);
  } catch (err) { accounts = []; }

  if (action === 'create' || action === 'reset') {
    accounts = accounts.filter(a => a.email !== email);
    accounts.push({ email, key, updated_at: new Date().toISOString() });
  } else if (action === 'delete') {
    accounts = accounts.filter(a => a.email !== email);
  }

  await fs.writeFile(ADMIN_LOG_FILE, JSON.stringify(accounts, null, 2));
};

const createAdmin = async (email) => {
  const key = generateKey();
  const tx = db.transaction(() => {
    const userRes = db.prepare('INSERT INTO users (email) VALUES (?)').run(email);
    db.prepare('INSERT INTO api_keys (key_hash, user_id) VALUES (?, ?)').run(key, userRes.lastInsertRowid);
  });

  try {
    tx();
    await updateJsonLog(email, key, 'create');
    console.log(`✅ Admin created: ${email}\n🔑 Key: ${key}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
};

const deleteAdmin = async (email) => {
  try {
    const res = run('DELETE FROM users WHERE email = ?', [email]);
    if (res.changes > 0) {
      await updateJsonLog(email, null, 'delete');
      console.log(`🗑️ Admin ${email} deleted.`);
    } else {
      console.log('⚠️ Admin not found.');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
};

const resetKey = async (email) => {
  const user = get('SELECT id FROM users WHERE email = ?', [email]);
  if (!user) return console.log('⚠️ Admin not found.');

  const newKey = generateKey();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(user.id);
    db.prepare('INSERT INTO api_keys (key_hash, user_id) VALUES (?, ?)').run(newKey, user.id);
  });

  try {
    tx();
    await updateJsonLog(email, newKey, 'reset');
    console.log(`🔄 Key reset for ${email}\n🔑 New Key: ${newKey}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
};

const [,, command, email] = process.argv;
if (!command || !email) {
  console.log('Usage: node manage.js <create|delete|reset> <email>');
  process.exit(0);
}

const actions = { create: createAdmin, delete: deleteAdmin, reset: resetKey };
if (actions[command]) {
  actions[command](email);
} else {
  console.log('Invalid command');
}