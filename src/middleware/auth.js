import { get } from '../db.js';
import { settings } from '../config.js';

export const authenticate = async (req, reply) => {
  const key = req.headers['x-api-key'];
  if (!key) return reply.status(401).send({ error: 'Missing API Key' });

  // Plaintext check for Admin or User keys
  if (key === settings.security.admin_api_key) {
    req.user = { id: 1, storage_limit_bytes: 1048576000, isAdmin: true };
    return;
  }

  // Direct lookup (No hashing)
  const authData = get(`
    SELECT k.user_id as id, u.storage_limit_bytes 
    FROM api_keys k 
    JOIN users u ON k.user_id = u.id 
    WHERE k.key_hash = ?`, [key]);

  if (!authData) return reply.status(403).send({ error: 'Invalid API Key' });
  req.user = authData;
};