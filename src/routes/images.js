import fsp from 'node:fs/promises';
import path from 'node:path';
import { get, query, run } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { settings } from '../config.js';

export default async function imageRoutes(fastify, options) {
  
  // 1. List All Images (with pagination and optional folder filter)
  fastify.get('/', { preHandler: authenticate }, async (req, reply) => {
    const { folder, limit = 50, offset = 0 } = req.query;
    
    // Validate pagination to prevent SQL injection or excessive loads
    const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);

    try {
      let sql = `
        SELECT i.id, i.filename, i.extension, i.size_bytes, i.width, i.height, i.blurhash, i.created_at, i.file_path, p.slug as project_slug
        FROM images i
        LEFT JOIN projects p ON i.project_id = p.id
        WHERE i.user_id = ?
      `;
      const params = [req.user.user_id];

      if (folder) {
        sql += ` AND p.slug = ?`;
        params.push(folder);
      }

      sql += ` ORDER BY i.created_at DESC LIMIT ? OFFSET ?`;
      params.push(safeLimit, safeOffset);

      const images = query(sql, params);
      
      // Map to add public URLs
      const mappedImages = images.map(img => ({
        ...img,
        url: `/i/${img.file_path.replace(/\\/g, '/')}`
      }));

      return { success: true, data: mappedImages, pagination: { limit: safeLimit, offset: safeOffset } };
    } catch (err) {
      fastify.log.error('Error fetching images:', err);
      return reply.status(500).send({ error: 'Failed to fetch images' });
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
    try {
      const image = get('SELECT id, file_path FROM images WHERE id = ? AND user_id = ?', [req.params.id, req.user.user_id]);
      if (!image) return reply.status(404).send({ error: 'Image not found' });

      const fullPath = path.join(settings.storage.base_path || './storage', image.file_path);

      // Attempt physical deletion
      try {
        await fsp.unlink(fullPath);
      } catch (fsError) {
        if (fsError.code === 'ENOENT') {
          fastify.log.warn(`File ${fullPath} already missing from disk. Proceeding with DB cleanup.`);
        } else {
          fastify.log.error(`Failed to delete physical file ${fullPath}:`, fsError);
          return reply.status(500).send({ error: 'Failed to delete file from storage' });
        }
      }

      // DB cleanup
      run('DELETE FROM images WHERE id = ?', [image.id]);

      return { success: true, message: `Image ${image.id} deleted successfully.` };
    } catch (err) {
      fastify.log.error('Error deleting image:', err);
      return reply.status(500).send({ error: 'Failed to delete image' });
    }
  });
}