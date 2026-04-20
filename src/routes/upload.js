import { get, run } from '../db.js';
import { saveImage } from '../storage.js';
import { authenticate } from '../middleware/auth.js';
import { settings } from '../config.js';

export default async function uploadRoutes(fastify, options) {
  fastify.post('/upload', { preHandler: authenticate }, async (req, reply) => {
    const userId = req.user?.id;
    const data = await req.file();

    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const projectRef = data.fields.project?.value;
    const project = get(
      'SELECT id FROM projects WHERE user_id = ? AND (id = ? OR slug = ?)',
      [userId, projectRef, projectRef]
    );

    if (!project) return reply.status(404).send({ error: 'Project not found' });

    try {
      // 1. Process Image
      const result = await saveImage(data.file, {
        convert: data.fields.convert?.value,
        quality: data.fields.quality?.value,
        width: data.fields.width?.value
      }, settings);

      // 2. DEBUG: LOG THE RESULT FROM STORAGE
      fastify.log.info({ storageResult: result }, '--- STORAGE ENGINE OUTPUT ---');

      // 3. Sync variable names (Ensure file_path is NOT NULL)
      const filePath = result.relPath || result.path;

      if (!filePath) {
        fastify.log.error(result, 'CRITICAL: Storage engine failed to return a file path');
        return reply.status(500).send({ error: 'Internal storage error' });
      }

      // 4. DATABASE INSERT
      run(`INSERT INTO images (id, user_id, project_id, file_path, filename, extension, size_bytes, width, height, blurhash) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          result.id,
          userId,
          project.id,
          filePath, // This is the fix for the NOT NULL constraint
          data.filename,
          result.ext,
          result.size,
          result.width,
          result.height,
          result.blurhash
        ]);

      return {
        success: true,
        id: result.id,
        url: `/i/${filePath.replace(/\\/g, '/')}`
      };

    } catch (err) {
      fastify.log.error(err, 'Upload System Error');
      return reply.status(500).send({ error: 'Database or Processing failure' });
    }
  });
}