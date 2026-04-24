import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { settings } from '../config.js';

export default async function deliveryRoutes(fastify, options) {
  const cacheDir = path.resolve(settings.storage.cache_path || './cache');
  await fsp.mkdir(cacheDir, { recursive: true });

  fastify.get('/i/*', async (req, reply) => {
    const rawPath = req.params['*'];
    const urlExt = path.extname(rawPath).slice(1).toLowerCase();
    const pathWithoutExt = rawPath.replace(path.extname(rawPath), '');

    const dirPath = path.join(path.resolve(settings.storage.base_path), path.dirname(pathWithoutExt));
    const baseId = path.basename(pathWithoutExt);

    // 1. Find the physical file
    let actualFileName = null;
    try {
      const files = await fsp.readdir(dirPath);
      actualFileName = files.find(f => f.startsWith(baseId));
    } catch (e) { return reply.status(404).send({ error: 'Not found' }); }

    if (!actualFileName) return reply.status(404).send({ error: 'File not found' });

    const sourcePath = path.join(dirPath, actualFileName);
    const diskExt = path.extname(actualFileName).slice(1).toLowerCase();

    // 2. Serve Direct if extensions match and no resizing
    if (urlExt === diskExt && !req.query.w && !req.query.h && !req.query.q) {
      const buf = await fsp.readFile(sourcePath);
      return reply.type(`image/${diskExt}`).send(buf);
    }

    // 3. Transformation & Cache Logic
    const w = parseInt(req.query.w) || null;
    const h = parseInt(req.query.h) || null;
    const q = parseInt(req.query.q) || 80;
    const m = req.query.m || 'inside';
    const targetFormat = urlExt || 'webp'; // Default to webp if no extension in URL

    const cacheKey = crypto.createHash('md5')
      .update(`${baseId}_${w}_${h}_${q}_${targetFormat}_${m}`)
      .digest('hex');
    const cachedPath = path.join(cacheDir, `${cacheKey}.${targetFormat}`);

    try {
      const cachedBuf = await fsp.readFile(cachedPath);
      reply.header('X-Cache', 'HIT');
      return reply.type(`image/${targetFormat}`).send(cachedBuf);
    } catch {
      // 4. Process and Cache
      try {
        let transformer = sharp(sourcePath);
        if (w || h) transformer.resize(w, h, { fit: m, withoutEnlargement: true });

        const output = await transformer.toFormat(targetFormat, { quality: q }).toBuffer();
        fsp.writeFile(cachedPath, output).catch(() => { });

        reply.header('X-Cache', 'MISS');
        return reply.type(`image/${targetFormat}`).send(output);
      } catch (err) {
        return reply.status(500).send({ error: 'Process failed' });
      }
    }
  });
}