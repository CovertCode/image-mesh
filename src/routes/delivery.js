import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { settings } from '../config.js';

const MIME_TYPES = { 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'gif': 'image/gif' };

export default async function deliveryRoutes(fastify, options) {
  const cacheDir = path.resolve(settings.storage.cache_path || './cache');
  const uploadsDir = path.resolve(settings.storage.base_path || './uploads');
  await fsp.mkdir(cacheDir, { recursive: true });

  // Handle GET and HEAD for scrapers
  fastify.route({
    method: ['GET', 'HEAD'],
    url: '/i/*',
    handler: async (req, reply) => {
      const rawPath = req.params['*'];
      const urlExt = path.extname(rawPath).slice(1).toLowerCase();
      const pathWithoutExt = rawPath.replace(path.extname(rawPath), '');

      const dirPath = path.join(uploadsDir, path.dirname(pathWithoutExt));
      const baseId = path.basename(pathWithoutExt);

      let actualFileName = null;
      try {
        const files = await fsp.readdir(dirPath);
        actualFileName = files.find(f => f.startsWith(baseId));
      } catch (e) { return reply.status(404).send({ error: 'Not found' }); }

      if (!actualFileName) return reply.status(404).send({ error: 'Image not found' });

      const sourcePath = path.join(dirPath, actualFileName);
      const diskExt = path.extname(actualFileName).slice(1).toLowerCase();
      const targetFormat = urlExt || diskExt;
      const contentType = MIME_TYPES[targetFormat] || `image/${targetFormat}`;

      // Helper for clean CDN headers
      const setCDNHeaders = (res) => {
        // Physically remove problematic headers from raw response
        res.raw.removeHeader('access-control-allow-credentials');
        res.raw.removeHeader('vary');

        res.header('Access-Control-Allow-Origin', '*');
        res.header('Cache-Control', 'public, max-age=31536000, immutable');
        res.header('X-Content-Type-Options', 'nosniff');
        res.header('Content-Type', contentType);
      };

      // 1. SERVE ORIGINAL
      if (urlExt === diskExt && !req.query.w && !req.query.h && !req.query.q) {
        setCDNHeaders(reply);
        // Note: use the absolute path for sendFile to be safe
        return reply.sendFile(path.basename(sourcePath), path.dirname(sourcePath));
      }

      // 2. TRANSFORM & CACHE
      const w = parseInt(req.query.w) || null;
      const h = parseInt(req.query.h) || null;
      const q = parseInt(req.query.q) || 80;
      const m = req.query.m || 'inside';

      const cacheKey = crypto.createHash('md5').update(`${baseId}_${w}_${h}_${q}_${targetFormat}_${m}`).digest('hex');
      const cachedPath = path.join(cacheDir, `${cacheKey}.${targetFormat}`);

      try {
        await fsp.access(cachedPath);
        setCDNHeaders(reply);
        reply.header('X-Cache', 'HIT');
        return reply.sendFile(path.basename(cachedPath), path.dirname(cachedPath));
      } catch {
        try {
          let transformer = sharp(sourcePath);
          if (w || h) transformer.resize(w, h, { fit: m, withoutEnlargement: true });
          const output = await transformer.toFormat(targetFormat === 'jpg' ? 'jpeg' : targetFormat, { quality: q }).toBuffer();

          await fsp.writeFile(cachedPath, output);
          setCDNHeaders(reply);
          reply.header('X-Cache', 'MISS');
          return reply.send(output);
        } catch (err) {
          return reply.status(500).send({ error: 'Processing error' });
        }
      }
    }
  });
}