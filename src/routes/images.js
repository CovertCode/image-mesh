import fsp from 'node:fs/promises';
import path from 'node:path';
import { get, query, run } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { settings } from '../config.js';

export default async function imageRoutes(fastify, options) {

  // 1. List All Images (with pagination and optional folder filter)
  fastify.get('/', { preHandler: authenticate }, async (req, reply) => {
    const { folder, limit = 100, offset = 0 } = req.query;
    const userId = req.user.id;

    // Default SQL query
    let sql = `
        SELECT i.*, p.slug as project_slug
        FROM images i
        LEFT JOIN projects p ON i.project_id = p.id
        WHERE i.user_id = ?
    `;
    const params = [userId];

    // If folder (slug) is provided, add it to the filter
    if (folder && folder !== 'all' && folder !== '') {
      sql += ` AND p.slug = ?`;
      params.push(folder);
    }

    // Add ordering and pagination
    sql += ` ORDER BY i.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    try {
      const images = query(sql, params);

      // Log for debugging (Remove in production)
      fastify.log.info({ folder, count: images.length }, 'Gallery Fetch completed');

      return { success: true, data: images };
    } catch (err) {
      fastify.log.error(err, 'Failed to query images');
      return reply.status(500).send({ error: 'Database query failed' });
    }
  });

  // 2. Get Single Image Metadata
  fastify.get('/:id', { preHandler: authenticate }, async (req, reply) => {
    try {
      const image = get(`
        SELECT i.*, p.slug as project_slug
        FROM images i
        LEFT JOIN projects p ON i.project_id = p.id
        WHERE i.id = ? AND i.user_id = ?
      `, [req.params.id, req.user.user_id]);

      if (!image) return reply.status(404).send({ error: 'Image not found' });

      image.url = `/i/${image.file_path.replace(/\\/g, '/')}`;
      return { success: true, data: image };
    } catch (err) {
      fastify.log.error('Error fetching image:', err);
      return reply.status(500).send({ error: 'Failed to fetch image metadata' });
    }
  });

  // 3. Delete Image (Disk + DB)
  fastify.delete('/:id', { preHandler: authenticate }, async (req, reply) => {
    // FIX: Use req.user.id instead of user_id
    const userId = req.user.id;
    const imageId = req.params.id;

    try {
      // 1. Find the image and ensure it belongs to this user
      const image = get('SELECT id, file_path FROM images WHERE id = ? AND user_id = ?', [imageId, userId]);

      if (!image) {
        fastify.log.warn({ imageId, userId }, 'Delete failed: Image not found or access denied');
        return reply.status(404).send({ error: 'Image not found' });
      }

      // 2. Physical File Deletion
      const fullPath = path.join(path.resolve(settings.storage.base_path || './uploads'), image.file_path);

      try {
        await fsp.unlink(fullPath);
        fastify.log.info({ fullPath }, 'Physical file deleted');
      } catch (fsError) {
        // If file is already gone from disk, we still want to clean the DB
        if (fsError.code === 'ENOENT') {
          fastify.log.warn({ fullPath }, 'File already missing from disk, cleaning DB record anyway');
        } else {
          fastify.log.error(fsError, 'Failed to delete physical file');
          return reply.status(500).send({ error: 'Disk cleanup failed' });
        }
      }

      // 3. Database Deletion
      run('DELETE FROM images WHERE id = ?', [image.id]);
      fastify.log.info({ imageId }, 'Database record deleted');

      return { success: true, message: 'Image deleted successfully' };

    } catch (err) {
      fastify.log.error(err, 'Critical error during image deletion');
      return reply.status(500).send({ error: 'Delete operation failed' });
    }
  });
}