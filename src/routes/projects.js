import fsp from 'node:fs/promises';
import path from 'node:path';
import { get, run, query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { settings } from '../config.js';

// Helper to create URL-friendly names
const slugify = (text) => text.toString().toLowerCase()
  .replace(/\s+/g, '-')           // Replace spaces with -
  .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
  .replace(/\-\-+/g, '-')         // Replace multiple - with single -
  .replace(/^-+|-+$/g, '');       // Trim - from ends


export default async function projectRoutes(fastify, options) {

  /**
  * CREATE PROJECT
  * POST /v1/projects
  */
  fastify.post('/', { preHandler: authenticate }, async (req, reply) => {
    const { name } = req.body || {};

    // 1. Validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return reply.status(400).send({ error: 'A valid project name (min 2 characters) is required.' });
    }

    const cleanName = name.trim();
    const slug = slugify(cleanName);

    try {
      // 2. Check for duplicate slug for THIS user
      const existing = get('SELECT id FROM projects WHERE user_id = ? AND slug = ?', [req.user.user_id, slug]);

      if (existing) {
        return reply.status(409).send({
          error: 'A project with a similar name already exists.',
          slug: slug
        });
      }

      // 3. Insert into Database
      const result = run(
        'INSERT INTO projects (user_id, slug, name) VALUES (?, ?, ?)',
        [req.user.user_id, slug, cleanName]
      );

      // 4. Return success
      return reply.status(201).send({
        success: true,
        data: {
          id: result.lastInsertRowid,
          name: cleanName,
          slug: slug
        }
      });

    } catch (err) {
      fastify.log.error('Project Creation Error:', err);
      return reply.status(500).send({ error: 'Failed to create project.' });
    }
  });

  /**
  * LIST ALL PROJECTS
  * GET /v1/projects
  */
  fastify.get('/', { preHandler: authenticate }, async (req, reply) => {
    const projects = query(`
      SELECT p.id, p.slug, p.name, p.created_at,
             COUNT(i.id) as image_count,
             COALESCE(SUM(i.size_bytes), 0) as total_size_bytes
      FROM projects p
      LEFT JOIN images i ON p.id = i.project_id
      WHERE p.user_id = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `, [req.user.user_id]);

    return { success: true, data: projects };
  });

  /**
  * GET SINGLE PROJECT STATS
  * GET /v1/projects/:slug
  */
  fastify.get('/:slug', { preHandler: authenticate }, async (req, reply) => {
    const project = get(`
      SELECT p.*, COUNT(i.id) as image_count, COALESCE(SUM(i.size_bytes), 0) as total_size_bytes
      FROM projects p
      LEFT JOIN images i ON p.id = i.project_id
      WHERE p.user_id = ? AND p.slug = ?
      GROUP BY p.id
    `, [req.user.user_id, req.params.slug]);

    if (!project) return reply.status(404).send({ error: 'Project not found.' });
    return { success: true, data: project };
  });

  fastify.put('/:slug', { preHandler: authenticate }, async (req, reply) => {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string') return reply.status(400).send({ error: 'Valid project name is required' });

    try {
      const res = run('UPDATE projects SET name = ? WHERE user_id = ? AND slug = ?', [name.trim(), req.user.user_id, req.params.slug]);
      if (res.changes === 0) return reply.status(404).send({ error: 'Project not found' });
      return { success: true, message: 'Project updated' };
    } catch (err) {
      fastify.log.error('Error updating project:', err);
      return reply.status(500).send({ error: 'Failed to update project' });
    }
  });

  fastify.delete('/:slug', { preHandler: authenticate }, async (req, reply) => {
    try {
      const project = get('SELECT id FROM projects WHERE user_id = ? AND slug = ?', [req.user.user_id, req.params.slug]);
      if (!project) return reply.status(404).send({ error: 'Project not found' });

      const images = query('SELECT file_path FROM images WHERE project_id = ?', [project.id]);
      const basePath = settings.storage.base_path || './storage';

      // Batch deletion to prevent EMFILE (too many open files) crash
      const chunkSize = 50;
      for (let i = 0; i < images.length; i += chunkSize) {
        const chunk = images.slice(i, i + chunkSize);
        await Promise.all(chunk.map(img =>
          fsp.unlink(path.join(basePath, img.file_path)).catch(err => {
            fastify.log.warn(`Skip unlinking missing file ${img.file_path}: ${err.message}`);
          })
        ));
      }

      run('DELETE FROM images WHERE project_id = ?', [project.id]);
      run('DELETE FROM projects WHERE id = ?', [project.id]);

      return { success: true, message: `Project deleted with ${images.length} images.` };
    } catch (err) {
      fastify.log.error('Error deleting project:', err);
      return reply.status(500).send({ error: 'Failed to delete project' });
    }
  });
}