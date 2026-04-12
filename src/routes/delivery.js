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

    // 1. Extract and Normalize Parameters
    const w = req.query.w ? parseInt(req.query.w) : null;
    const h = req.query.h ? parseInt(req.query.h) : null;
    const q = req.query.q ? parseInt(req.query.q) : 80;
    const f = req.query.f || 'webp';
    const m = req.query.m || 'inside'; // Mode: cover, contain, inside

    const sourcePath = path.join(path.resolve(settings.storage.base_path), rawPath);

    // Security: Path Traversal Check
    if (!sourcePath.startsWith(path.resolve(settings.storage.base_path))) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    // Check if source exists
    try {
      await fsp.access(sourcePath);
    } catch {
      return reply.status(404).send({ error: 'Source image not found' });
    }

    // 2. Generate UNIQUE Cache Key
    // We include every parameter in the string to ensure the MD5 is unique
    const cacheParams = `path:${rawPath}|w:${w}|h:${h}|q:${q}|f:${f}|m:${m}`;
    const cacheKey = crypto.createHash('md5').update(cacheParams).digest('hex');
    const cachedFilePath = path.join(cacheDir, `${cacheKey}.${f}`);

    // DEBUG LOG: Check your terminal to see if these change!
    fastify.log.info(`Delivery Request: ${m} | Key: ${cacheKey}`);

    // 3. Try serving from Cache
    try {
      const cachedBuffer = await fsp.readFile(cachedFilePath);
      reply.header('X-Cache', 'HIT');
      reply.header('Vary', 'Query-String');
      return reply.type(`image/${f}`).send(cachedBuffer);
    } catch (err) {
      // Not in cache, proceed to Sharp
      reply.header('X-Cache', 'MISS');
    }

    // 4. Image Processing
    try {
      let transformer = sharp(sourcePath);

      if (w || h) {
        transformer = transformer.resize(w, h, {
          fit: m,
          withoutEnlargement: true,
          background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background for 'contain'
        });
      }

      const outputBuffer = await transformer
        .toFormat(f, { quality: q })
        .toBuffer();

      // Save to cache (Async)
      fsp.writeFile(cachedFilePath, outputBuffer).catch(e => console.error('Cache Write Error:', e));

      reply.header('Vary', 'Query-String');
      return reply.type(`image/${f}`).send(outputBuffer);

    } catch (err) {
      fastify.log.error('Sharp Error:', err);
      return reply.status(500).send({ error: 'Processing failed' });
    }
  });
}