import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { settings } from '../config.js';

const MIME_TYPES = { 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'gif': 'image/gif' };

export default async function deliveryRoutes(fastify, options) {
  const cacheDir = path.resolve(settings.storage.cache_path || './cache');
  const uploadsDir = path.resolve(settings.storage.base_path || './uploads');

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

      // Helper to set "Absolute Static" headers
      const setPureHeaders = (res, stats) => {
        // Remove ALL noise from the raw Node.js response object
        res.raw.removeHeader('Vary');
        res.raw.removeHeader('X-Powered-By');
        res.raw.removeHeader('Access-Control-Allow-Credentials');
        res.raw.removeHeader('X-RateLimit-Limit');
        res.raw.removeHeader('X-RateLimit-Remaining');
        res.raw.removeHeader('X-RateLimit-Reset');

        res.header('Content-Type', contentType);
        res.header('Content-Length', stats.size);
        res.header('Last-Modified', stats.mtime.toUTCString());
        res.header('Cache-Control', 'public, max-age=31536000, immutable');
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Accept-Ranges', 'bytes');
        res.header('X-Content-Type-Options', 'nosniff');
        res.header('Connection', 'keep-alive');
      };

      // --- PATH 1: THE DIRECT ORIGINAL (Zero Processing) ---
      if (urlExt === diskExt && !req.query.w && !req.query.h && !req.query.q) {
        const stats = await fsp.stat(sourcePath);
        setPureHeaders(reply, stats);
        
        // We use readFile instead of createReadStream to avoid 'Transfer-Encoding: chunked'
        // for files under a reasonable size (like your 93KB image)
        const buffer = await fsp.readFile(sourcePath);
        return reply.send(buffer);
      }

      // --- PATH 2: TRANSFORMATIONS (Dynamic Resizing) ---
      const w = parseInt(req.query.w) || null;
      const h = parseInt(req.query.h) || null;
      const q = parseInt(req.query.q) || 80;
      const m = req.query.m || 'inside';

      const cacheKey = crypto.createHash('md5').update(`${baseId}_${w}_${h}_${q}_${targetFormat}_${m}`).digest('hex');
      const cachedPath = path.join(cacheDir, `${cacheKey}.${targetFormat}`);

      try {
        const stats = await fsp.stat(cachedPath);
        setPureHeaders(reply, stats);
        return reply.send(await fsp.readFile(cachedPath));
      } catch {
        try {
          const output = await sharp(sourcePath)
            .resize(w, h, { fit: m, withoutEnlargement: true })
            .toFormat(targetFormat === 'jpg' ? 'jpeg' : targetFormat, { quality: q })
            .toBuffer();
          
          await fsp.mkdir(cacheDir, { recursive: true });
          await fsp.writeFile(cachedPath, output);
          
          const stats = await fsp.stat(cachedPath);
          setPureHeaders(reply, stats);
          return reply.send(output);
        } catch (err) {
          return reply.status(500).send({ error: 'CDN Error' });
        }
      }
    }
  });
}