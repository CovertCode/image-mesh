import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { settings } from '../config.js';

const MIME_TYPES = { 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'gif': 'image/gif' };

export default async function deliveryRoutes(fastify, options) {
  const cacheDir = path.resolve(settings.storage.cache_path || './cache');
  const uploadsDir = path.resolve(settings.storage.base_path || './uploads');
  await fsp.mkdir(cacheDir, { recursive: true });

  // HELPER: Sets standard CDN headers for scrapers
  const setCDNHeaders = (res, stats, contentType) => {
    const oneYearInSeconds = 31536000;
    const expiryDate = new Date(Date.now() + (oneYearInSeconds * 1000)).toUTCString();

    // 1. Force remove headers from global plugins
    res.raw.removeHeader('vary');
    res.raw.removeHeader('access-control-allow-credentials');
    res.raw.removeHeader('x-ratelimit-limit');
    res.raw.removeHeader('x-ratelimit-remaining');
    res.raw.removeHeader('x-ratelimit-reset');

    // 2. Set Static Headers
    res.header('Content-Type', contentType);
    res.header('Content-Length', stats.size);
    res.header('Last-Modified', stats.mtime.toUTCString());
    res.header('Cache-Control', `public, max-age=${oneYearInSeconds}, immutable`);
    res.header('Expires', expiryDate);
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Accept-Ranges', 'bytes');
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Served-By', 'PixelVault-CDN');
  };

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

      // 1. SERVE ORIGINAL
      if (urlExt === diskExt && !req.query.w && !req.query.h && !req.query.q) {
        const stats = await fsp.stat(sourcePath);
        setCDNHeaders(reply, stats, contentType);
        return reply.send(fs.createReadStream(sourcePath));
      }

      // 2. TRANSFORM & CACHE
      const w = parseInt(req.query.w) || null;
      const h = parseInt(req.query.h) || null;
      const q = parseInt(req.query.q) || 80;
      const m = req.query.m || 'inside';

      const cacheKey = crypto.createHash('md5').update(`${baseId}_${w}_${h}_${q}_${targetFormat}_${m}`).digest('hex');
      const cachedPath = path.join(cacheDir, `${cacheKey}.${targetFormat}`);

      try {
        const stats = await fsp.stat(cachedPath);
        setCDNHeaders(reply, stats, contentType);
        reply.header('X-Cache', 'HIT');
        return reply.send(fs.createReadStream(cachedPath));
      } catch {
        try {
          let transformer = sharp(sourcePath);
          if (w || h) transformer.resize(w, h, { fit: m, withoutEnlargement: true });
          const output = await transformer.toFormat(targetFormat === 'jpg' ? 'jpeg' : targetFormat, { quality: q }).toBuffer();

          await fsp.writeFile(cachedPath, output);
          const stats = await fsp.stat(cachedPath);
          setCDNHeaders(reply, stats, contentType);
          reply.header('X-Cache', 'MISS');
          return reply.send(output);
        } catch (err) {
          return reply.status(500).send({ error: 'Process failed' });
        }
      }
    }
  });
}