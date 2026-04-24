import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { settings } from '../config.js';

const MIME_TYPES = { 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'gif': 'image/gif' };

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
    const targetFormat = urlExt || diskExt;
    const contentType = MIME_TYPES[targetFormat] || `image/${targetFormat}`;

    // HELPER: Strip ALL dynamic headers and set CDN standards
    const finalizeCDNHeaders = (res, stats) => {
        // 1. Remove conflicting/dynamic headers from global plugins
        res.raw.removeHeader('vary');
        res.raw.removeHeader('access-control-allow-credentials');
        res.raw.removeHeader('x-ratelimit-limit');
        res.raw.removeHeader('x-ratelimit-remaining');
        res.raw.removeHeader('x-ratelimit-reset');

        // 2. Set Clean, Static Headers
        res.header('Content-Type', contentType);
        res.header('Content-Length', stats.size);
        res.header('Last-Modified', stats.mtime.toUTCString());
        res.header('Cache-Control', 'public, max-age=31536000, immutable');
        res.header('ETag', crypto.createHash('md5').update(`${stats.size}-${stats.mtime.getTime()}`).digest('hex'));
        res.header('Accept-Ranges', 'bytes');
        res.header('Access-Control-Allow-Origin', '*'); // Wildcard ONLY (no credentials)
        res.header('X-Content-Type-Options', 'nosniff');
        res.header('X-Served-By', 'PixelVault-CDN');
    };

    // 1. SERVE ORIGINAL
    if (urlExt === diskExt && !req.query.w && !req.query.h && !req.query.q) {
        const stats = await fsp.stat(sourcePath);
        finalizeCDNHeaders(reply, stats);
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
      finalizeCDNHeaders(reply, stats);
      reply.header('X-Cache', 'HIT');
      return reply.send(fs.createReadStream(cachedPath));
    } catch {
      try {
        let transformer = sharp(sourcePath);
        if (w || h) transformer.resize(w, h, { fit: m, withoutEnlargement: true });
        const output = await transformer.toFormat(targetFormat === 'jpg' ? 'jpeg' : targetFormat, { quality: q }).toBuffer();
        
        await fsp.writeFile(cachedPath, output);
        const stats = await fsp.stat(cachedPath);
        finalizeCDNHeaders(reply, stats);
        reply.header('X-Cache', 'MISS');
        return reply.send(output);
      } catch (err) {
        return reply.status(500).send({ error: 'Process failed' });
      }
    }
  });
}