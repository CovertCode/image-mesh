import fsp from 'node:fs/promises';
import fs from 'node:fs'; // Use standard fs for createReadStream
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { settings } from '../config.js';

// Standard MIME mapping
const MIME_TYPES = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp',
  'gif': 'image/gif',
  'avif': 'image/avif'
};

export default async function deliveryRoutes(fastify, options) {
  const cacheDir = path.resolve(settings.storage.cache_path || './cache');
  await fsp.mkdir(cacheDir, { recursive: true });

  fastify.get('/i/*', async (req, reply) => {
    const rawPath = req.params['*'];
    const urlExt = path.extname(rawPath).slice(1).toLowerCase();
    const pathWithoutExt = rawPath.replace(path.extname(rawPath), '');

    const dirPath = path.join(path.resolve(settings.storage.base_path), path.dirname(pathWithoutExt));
    const baseId = path.basename(pathWithoutExt);

    let actualFileName = null;
    try {
      const files = await fsp.readdir(dirPath);
      actualFileName = files.find(f => f.startsWith(baseId));
    } catch (e) { return reply.status(404).send({ error: 'Not found' }); }

    if (!actualFileName) return reply.status(404).send({ error: 'Image not found' });

    const sourcePath = path.join(dirPath, actualFileName);
    const diskExt = path.extname(actualFileName).slice(1).toLowerCase();

    // 1. DETERMINE TARGET MIME TYPE
    const targetFormat = urlExt || diskExt;
    const contentType = MIME_TYPES[targetFormat] || `image/${targetFormat}`;

    // 2. SERVE ORIGINAL (Standard Stream)
    // If format matches and no resizing, use a stream for better Meta compatibility
    if (urlExt === diskExt && !req.query.w && !req.query.h && !req.query.q) {
      const stats = await fsp.stat(sourcePath);

      return reply
        .type(contentType)
        .header('Content-Length', stats.size)
        .header('Accept-Ranges', 'bytes') // Meta loves this
        .send(fs.createReadStream(sourcePath));
    }

    // 3. TRANSFORMATION LOGIC (Cached)
    const w = parseInt(req.query.w) || null;
    const h = parseInt(req.query.h) || null;
    const q = parseInt(req.query.q) || 80;
    const m = req.query.m || 'inside';

    const cacheKey = crypto.createHash('md5')
      .update(`${baseId}_${w}_${h}_${q}_${targetFormat}_${m}`)
      .digest('hex');
    const cachedPath = path.join(cacheDir, `${cacheKey}.${targetFormat}`);

    try {
      const cachedStats = await fsp.stat(cachedPath);
      reply.header('X-Cache', 'HIT');
      reply.header('Accept-Ranges', 'bytes');
      return reply.type(contentType).send(fs.createReadStream(cachedPath));
    } catch {
      // 4. PROCESS VIA SHARP
      try {
        let transformer = sharp(sourcePath);
        if (w || h) transformer.resize(w, h, { fit: m, 维护Enlargement: false });

        const output = await transformer.toFormat(targetFormat === 'jpg' ? 'jpeg' : targetFormat, { quality: q }).toBuffer();

        // Write to cache
        await fsp.writeFile(cachedPath, output);

        reply.header('X-Cache', 'MISS');
        return reply.type(contentType).send(output);
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Process failed' });
      }
    }
  });
}