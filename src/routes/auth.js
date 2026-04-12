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

    // 3. Generate New API Key
    fastify.post('/keys', { preHandler: requireSession }, async (req, reply) => {
        try {
            const rawKey = crypto.randomBytes(32).toString('hex');
            const hashedKey = hashApiKey(rawKey); // This will now work!

            run('INSERT INTO api_keys (key_hash, user_id) VALUES (?, ?)', [hashedKey, req.sessionUserId]);
            return { success: true, api_key: rawKey };
        } catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ error: 'Failed to generate key' });
        }
    });

    // 4. List User's API Keys
    fastify.get('/keys', { preHandler: requireSession }, async (req, reply) => {
        try {
            const keys = query('SELECT key_hash FROM api_keys WHERE user_id = ?', [req.sessionUserId]);
            // Mask the keys so we don't expose full keys in the list view
            const maskedKeys = keys.map(k => {
                const full = k.key_hash;
                return `${full.substring(0, 8)}...${full.substring(full.length - 4)}`;
            });
            return { success: true, keys: maskedKeys };
        } catch (err) {
            fastify.log.error('Key fetch error:', err);
            return reply.status(500).send({ error: 'Failed to fetch API keys' });
        }
    });

    // 5. Revoke (Delete) API Key
    fastify.delete('/keys/:key', { preHandler: requireSession }, async (req, reply) => {
        const { key } = req.params;

        if (!key) {
            return reply.status(400).send({ error: 'API key string is required' });
        }

        try {
            // Scoped to sessionUserId to ensure users can only delete their own keys
            const res = run('DELETE FROM api_keys WHERE key_hash = ? AND user_id = ?', [key, req.sessionUserId]);

            if (res.changes === 0) {
                return reply.status(404).send({ error: 'Key not found or you do not have permission to delete it' });
            }

            return { success: true, message: 'API key successfully revoked' };
        } catch (err) {
            fastify.log.error('Key revocation error:', err);
            return reply.status(500).send({ error: 'Failed to revoke API key' });
        }
    });
}