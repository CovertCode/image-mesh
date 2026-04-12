import pkg from 'enquirer';
const { Form, Select, Input, Confirm, NumberPrompt } = pkg;
import pc from 'picocolors';
import crypto from 'node:crypto';
import db, { get, run, query } from '../src/db.js';

const API_URL = 'http://localhost:3000/v1';

// --- Cryptography Utils (Sync with Backend) ---
const hashPassword = (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derivedKey}`;
};

const hashKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

const getUserIdFromToken = (token) => parseInt(token.split('.')[0]);
const formatBytes = (bytes) => (bytes / (1024 * 1024)).toFixed(2) + ' MB';

// --- State ---
let session = { token: null, email: null, userId: null };

async function mainMenu() {
    console.clear();
    console.log(pc.cyan(pc.bold('=== CoreReflect Management CLI ===\n')));
    
    const prompt = new Select({
        name: 'action',
        message: 'Main Menu',
        choices: [
            { name: 'admin_users', message: '👥 Manage All Users (Global Admin)' },
            { name: 'user_flow', message: '🔑 User Dashboard (Login Mode)' },
            { name: 'exit', message: '❌ Exit' }
        ]
    });

    try {
        const choice = await prompt.run();
        if (choice === 'admin_users') await adminUserMenu();
        if (choice === 'user_flow') await userFlowMenu();
        if (choice === 'exit') process.exit(0);
        mainMenu();
    } catch (e) { process.exit(0); }
}

// --- ADMIN MENU (Direct DB Access) ---
async function adminUserMenu() {
    console.clear();
    console.log(pc.red(pc.bold('--- Admin: Global User Management ---')));
    
    const users = query('SELECT id, email, storage_limit_bytes FROM users');
    const choices = users.map(u => ({ 
        name: String(u.id), 
        message: `${u.email} [Limit: ${formatBytes(u.storage_limit_bytes)}]` 
    }));
    
    choices.push({ name: 'create', message: pc.green('+ Create New User Account') });
    choices.push({ name: 'back', message: '← Back to Main Menu' });

    const choice = await new Select({ name: 'u', message: 'Select a user:', choices }).run();

    if (choice === 'back') return;
    if (choice === 'create') {
        const form = new Form({
            name: 'u', message: 'Account Details:',
            choices: [{ name: 'email', message: 'Email' }, { name: 'password', message: 'Password' }]
        });
        const res = await form.run();
        try {
            run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [res.email, hashPassword(res.password)]);
            console.log(pc.green('✔ Account created.'));
        } catch (e) { console.log(pc.red('Error: ' + e.message)); }
    } else {
        await manageSingleUserAdmin(choice);
    }
    await adminUserMenu();
}

async function manageSingleUserAdmin(userId) {
    const user = get('SELECT * FROM users WHERE id = ?', [userId]);
    const action = await new Select({
        name: 'a', message: `Managing ${user.email}`,
        choices: ['Change Storage Limit', 'Delete User', 'Back']
    }).run();

    if (action === 'Change Storage Limit') {
        const val = await new Input({ message: 'Enter limit in MB (e.g. 500):' }).run();
        const bytes = parseInt(val) * 1024 * 1024;
        run('UPDATE users SET storage_limit_bytes = ? WHERE id = ?', [bytes, userId]);
        console.log(pc.green('✔ Limit updated.'));
    }
    if (action === 'Delete User') {
        const confirm = await new Confirm({ message: `Permanently delete ${user.email} and all data?` }).run();
        if (confirm) run('DELETE FROM users WHERE id = ?', [userId]);
    }
}

// --- USER DASHBOARD (API + DB Access) ---
async function userFlowMenu() {
    if (!session.token) {
        const choice = await new Select({ name: 'c', message: 'Client Access', choices: ['Login', 'Back'] }).run();
        if (choice === 'Back') return;

        const form = new Form({
            name: 'login', message: 'Login:',
            choices: [{ name: 'email', message: 'Email' }, { name: 'password', message: 'Password' }]
        });
        const creds = await form.run();
        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(creds)
            });
            const data = await res.json();
            if (data.token) {
                session = { token: data.token, email: creds.email, userId: getUserIdFromToken(data.token) };
            } else {
                console.log(pc.red('Login Failed: ' + data.error));
                await new Input({ message: 'Press Enter...' }).run();
                return;
            }
        } catch (e) { console.log(pc.red('API Offline. Start the server first.')); await new Input({ message: 'Enter...' }).run(); return; }
    }

    console.clear();
    console.log(pc.magenta(pc.bold(`--- User Dashboard: ${session.email} ---`)));
    const action = await new Select({
        name: 'a', message: 'Select Action',
        choices: [
            { name: 'stats', message: '📊 View My Storage Stats' },
            { name: 'projects', message: '📁 Manage My Projects' },
            { name: 'keys', message: '🔑 Manage API Keys' },
            { name: 'logout', message: 'Logout' },
            { name: 'back', message: 'Back' }
        ]
    }).run();

    if (action === 'logout') { session = { token: null }; return; }
    if (action === 'back') return;
    if (action === 'stats') await viewUserStats();
    if (action === 'projects') await manageProjects();
    if (action === 'keys') await manageUserKeys();

    await userFlowMenu();
}

async function viewUserStats() {
    const user = get('SELECT storage_limit_bytes FROM users WHERE id = ?', [session.userId]);
    const usage = get('SELECT COUNT(id) as count, SUM(size_bytes) as size FROM images WHERE user_id = ?', [session.userId]);
    const projectCount = get('SELECT COUNT(id) as count FROM projects WHERE user_id = ?', [session.userId]);

    console.log(pc.yellow('\n--- Account Statistics ---'));
    console.log(`Projects: ${pc.cyan(projectCount.count)}`);
    console.log(`Total Images: ${pc.cyan(usage.count)}`);
    console.log(`Used Space: ${pc.cyan(formatBytes(usage.size || 0))}`);
    console.log(`Total Limit: ${pc.cyan(formatBytes(user.storage_limit_bytes))}`);
    
    const usageSize = usage.size || 0;
    const percent = Math.min(((usageSize / user.storage_limit_bytes) * 100), 100).toFixed(1);
    const bar = pc.green('|'.repeat(percent / 5)) + pc.dim('.'.repeat(20 - (percent / 5)));
    console.log(`Quota Usage: [${bar}] ${percent}%`);
    
    await new Input({ message: '\nPress Enter to return...' }).run();
}

async function manageProjects() {
    const projects = query(`
        SELECT p.*, COUNT(i.id) as img_count, SUM(i.size_bytes) as total_size 
        FROM projects p LEFT JOIN images i ON p.id = i.project_id 
        WHERE p.user_id = ? GROUP BY p.id`, [session.userId]);

    const choices = projects.map(p => ({ 
        name: p.slug, 
        message: `${pc.bold(p.name)} (${p.img_count} imgs, ${formatBytes(p.total_size || 0)})` 
    }));
    choices.push({ name: 'create', message: pc.green('+ Create New Project') });
    choices.push({ name: 'back', message: '← Back' });

    const slug = await new Select({ name: 'p', message: 'My Projects', choices }).run();
    if (slug === 'back') return;
    
    if (slug === 'create') {
        const name = await new Input({ message: 'Project Name:' }).run();
        const newSlug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
        try {
            run('INSERT INTO projects (user_id, slug, name) VALUES (?, ?, ?)', [session.userId, newSlug, name]);
        } catch (e) { console.log(pc.red('Error: Already exists.')); }
    } else {
        const p = projects.find(x => x.slug === slug);
        const action = await new Select({
            name: 'a', message: `Manage ${p.name}`,
            choices: ['Rename', 'Delete', 'Back']
        }).run();

        if (action === 'Rename') {
            const newName = await new Input({ message: 'New Name:' }).run();
            run('UPDATE projects SET name = ? WHERE id = ?', [newName, p.id]);
        }
        if (action === 'Delete') {
            const confirm = await new Confirm({ message: `Delete project and images?` }).run();
            if (confirm) run('DELETE FROM projects WHERE id = ?', [p.id]);
        }
    }
    await manageProjects();
}

async function manageUserKeys() {
    const keys = query('SELECT key_hash FROM api_keys WHERE user_id = ?', [session.userId]);
    const choices = keys.map(k => ({ 
        name: k.key_hash, 
        message: `Hashed Key: ${k.key_hash.substring(0, 12)}...` 
    }));
    choices.push({ name: 'generate', message: pc.green('+ Generate New API Key (API Request)') });
    choices.push({ name: 'back', message: '← Back' });

    const selection = await new Select({ name: 'k', message: 'API Key Management', choices }).run();
    if (selection === 'back') return;
    
    if (selection === 'generate') {
        try {
            const res = await fetch(`${API_URL}/auth/keys`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${session.token}` }
            });
            const data = await res.json();
            console.log(pc.yellow(`\n🚀 YOUR NEW RAW API KEY: ${pc.bold(pc.white(data.api_key))}`));
            console.log(pc.dim('Copy this now. It is never shown again and stored as a hash in the DB.\n'));
            await new Input({ message: 'Press Enter once saved...' }).run();
        } catch (e) { console.log(pc.red('API Request Failed.')); }
    } else {
        const confirm = await new Confirm({ message: 'Revoke this API Key?' }).run();
        if (confirm) run('DELETE FROM api_keys WHERE key_hash = ?', [selection]);
    }
    await manageUserKeys();
}

mainMenu().catch(() => process.exit(0));