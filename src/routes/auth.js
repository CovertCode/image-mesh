import crypto from 'node:crypto';
import { get, run, query } from '../db.js';
import { settings } from '../config.js';
import { hashApiKey, hashPassword, verifyPassword } from '../utils/crypto.js';

// 2. Stateless Session Tokens (HMAC)
const generateSessionToken = (userId) => {
    const hmac = crypto.createHmac('sha256', settings.security.admin_api_key);
    hmac.update(String(userId));
    return `${userId}.${hmac.digest('hex')}`;
};

const verifySessionToken = (token) => {
    if (!token) return null;
    const [userId, sig] = token.split('.');
    const hmac = crypto.createHmac('sha256', settings.security.admin_api_key);
    hmac.update(String(userId));
    if (sig !== hmac.digest('hex')) return null;
    return parseInt(userId, 10);
};

// 3. Session Middleware
const requireSession = async (req, reply) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    }
    const token = authHeader.split(' ')[1];
    const userId = verifySessionToken(token);
    if (!userId) return reply.status(401).send({ error: 'Invalid or expired session token' });
    req.sessionUserId = userId;
};

// --- Routes ---
export default async function authRoutes(fastify, options) {

    // 1. Register Account
    fastify.post('/register', async (req, reply) => {
        const { email, password } = req.body || {};
        if (!email || !password || password.length < 6) {
            return reply.status(400).send({ error: 'Valid email and password (min 6 chars) required' });
        }

        try {
            const hashed = hashPassword(password);
            run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email.toLowerCase(), hashed]);
            return { success: true, message: 'Account created. You can now log in.' };
        } catch (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return reply.status(409).send({ error: 'Email already exists' });
            }
            fastify.log.error('Registration error:', err);
            return reply.status(500).send({ error: 'Registration failed' });
        }
    });

    // 2. Login Account
    fastify.post('/login', async (req, reply) => {
        const { email, password } = req.body || {};
        if (!email || !password) return reply.status(400).send({ error: 'Email and password required' });

        try {
            const user = get('SELECT id, password_hash FROM users WHERE email = ?', [email.toLowerCase()]);
            if (!user || !verifyPassword(password, user.password_hash)) {
                return reply.status(401).send({ error: 'Invalid credentials' });
            }

            const token = generateSessionToken(user.id);
            return { success: true, token };
        } catch (err) {
            fastify.log.error('Login error:', err);
            return reply.status(500).send({ error: 'Login failed' });
        }
    });

    // POST /keys - Store as plaintext
    fastify.post('/keys', { preHandler: requireSession }, async (req, reply) => {
        const rawKey = crypto.randomBytes(24).toString('hex');
        run('INSERT INTO api_keys (user_id, key_hash, label) VALUES (?, ?, ?)',
            [req.sessionUserId, rawKey, req.body.label || 'New Key']);
        return { success: true, api_key: rawKey };
    });

    // GET /keys - Return raw keys for the dropdown
    fastify.get('/keys', { preHandler: requireSession }, async (req, reply) => {
        const keys = query('SELECT label, key_hash FROM api_keys WHERE user_id = ?', [req.sessionUserId]);
        return { success: true, keys }; // key_hash is now the raw string
    });

    // 5. Revoke (Delete) API Key by ID
    fastify.delete('/keys/:id', { preHandler: requireSession }, async (req, reply) => {
        try {
            const res = run('DELETE FROM api_keys WHERE id = ? AND user_id = ?', [req.params.id, req.sessionUserId]);

            if (res.changes === 0) {
                return reply.status(404).send({ error: 'Key not found' });
            }
            return { success: true, message: 'API key revoked' };
        } catch (err) {
            return reply.status(500).send({ error: 'Failed to revoke key' });
        }
    });
}