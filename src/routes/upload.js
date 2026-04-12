import { get, run } from '../db.js';
import { saveImage } from '../storage.js';
import { authenticate } from '../middleware/auth.js';
import { settings } from '../config.js';

export default async function uploadRoutes(fastify, options) {
  fastify.post('/upload', { preHandler: authenticate }, async (req, reply) => {
    // 1. Quota Check
    const usage = get('SELECT COALESCE(SUM(size_bytes), 0) as total FROM images WHERE user_id = ?', [req.user.user_id]);
    if (usage.total >= req.user.storage_limit_bytes) {
      return reply.status(403).send({ error: 'Storage quota exceeded.' });
    }

    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    // 2. Mandatory Project Check
    const projectRef = data.fields.project?.value; // Expects ID or Slug
    if (!projectRef) {
      return reply.status(400).send({ error: 'The "project" field (ID or Slug) is mandatory.' });
    }

    // Find project belonging ONLY to this user
    const project = get(
      'SELECT id FROM projects WHERE user_id = ? AND (id = ? OR slug = ?)',
      [req.user.user_id, projectRef, projectRef]
    );

    if (!project) {
      return reply.status(404).send({ error: 'Project not found or access denied.' });
    }

    // 3. Extraction of other params
    const convertStr = data.fields.convert?.value || data.fields.format?.value;
    const qualityStr = data.fields.quality?.value;
    const widthStr = data.fields.width?.value;

    try {
      const result = await saveImage(data.file, {
        convert: convertStr,
        quality: qualityStr,
        width: widthStr
      }, settings);

      run(`INSERT INTO images (id, user_id, project_id, file_path, filename, extension, size_bytes, width, height, blurhash) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.id, req.user.user_id, project.id, result.path, data.filename, result.ext, result.size, result.width, result.height, result.blurhash]);

      return {
        success: true,
        id: result.id,
        url: `/i/${result.path.replace(/\\/g, '/')}`,
        project_id: project.id,
        blurhash: result.blurhash
      };
    } catch (err) {
      fastify.log.error('Upload failed:', err);
      return reply.status(500).send({ error: 'Image processing failed' });
    }
  });
}