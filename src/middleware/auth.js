import { get } from '../db.js';
import { settings } from '../config.js';
import { hashApiKey } from '../utils/crypto.js';

export const authenticate = async (req, reply) => {
  const key = req.headers['x-api-key'];
  if (!key) return reply.status(401).send({ error: 'Missing API Key' });

  if (key === settings.security.admin_api_key) {
    req.user = { user_id: 1, storage_limit_bytes: Infinity, isAdmin: true };
    return;
  }

  const hashedIncoming = hashApiKey(key); // This will now work!

  const authData = get(`
        SELECT k.user_id, u.storage_limit_bytes 
        FROM api_keys k 
        JOIN users u ON k.user_id = u.id 
        WHERE k.key_hash = ?`, [hashedIncoming]);

  if (!authData) return reply.status(403).send({ error: 'Invalid API Key' });
  req.user = authData;
};