import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import pointOfView from '@fastify/view';
import nunjucks from 'nunjucks';
import path from 'node:path';
import fs from 'node:fs/promises';
import net from 'node:net';
import fastifyStatic from '@fastify/static';

import { initDb } from './db.js';
import { settings } from './config.js';

// Route imports
import uploadRoutes from './routes/upload.js';
import projectRoutes from './routes/projects.js';
import imageRoutes from './routes/images.js';
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
import deliveryRoutes from './routes/delivery.js';

const PORT_FILE = 'server_port.txt';
const fastify = Fastify({ logger: true, ignoreTrailingSlash: true });

/**
 * 1. CORE PLUGINS (Global)
 * These do not interfere with headers or security specs
 */
fastify.register(pointOfView, {
  engine: { nunjucks },
  root: path.resolve('views'),
  options: { noCache: true }
});

fastify.register(multipart, {
  limits: { fileSize: settings.storage.max_file_size_mb * 1024 * 1024 }
});

/**
 * 2. STANDALONE DELIVERY (The "Clean" Zone)
 * This is registered BEFORE the CORS/Rate-Limit scope.
 * Meta/Instagram scrapers hit this and see ZERO conflicting headers.
 */
fastify.register(deliveryRoutes);

/**
 * 3. MANAGEMENT & UI SCOPE (The "App" Zone)
 * Everything inside this block gets CORS and Rate-Limiting.
 */
fastify.register(async (app) => {
  // CORS with Credentials (Safe here because it's isolated from images)
  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
  });

  // Standard API Rate Limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.headers['x-api-key'] || req.ip
  });

  // API Routes
  app.register(healthRoutes);
  app.register(authRoutes, { prefix: '/v1/auth' });
  app.register(uploadRoutes, { prefix: '/v1' });
  app.register(projectRoutes, { prefix: '/v1/projects' });
  app.register(imageRoutes, { prefix: '/v1/images' });

  // Page Rendering Routes
  app.get('/', (req, reply) => reply.view('auth.njk', { title: 'Login | PixelVault', hideSidebar: true }));
  app.get('/dashboard', (req, reply) => reply.view('dashboard.njk', { title: 'Overview | PixelVault', activeTab: 'overview' }));
  app.get('/gallery', (req, reply) => reply.view('gallery.njk', { title: 'Gallery | PixelVault', activeTab: 'gallery' }));
  app.get('/settings', (req, reply) => reply.view('settings.njk', { title: 'Settings | PixelVault', activeTab: 'settings' }));
  app.get('/upload', (req, reply) => reply.view('upload.njk', { title: 'Upload Media | PixelVault', activeTab: 'upload' }));
  app.get('/projects', (req, reply) => reply.view('projects.njk', { title: 'Projects | PixelVault', activeTab: 'projects' }));
});

/**
 * 4. PORT MANAGEMENT UTILITIES
 */
const isPortAvailable = (port) => new Promise((resolve) => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.once('listening', () => server.close(() => resolve(true)));
  server.listen(port);
});

const resolvePort = async () => {
  try {
    const content = await fs.readFile(PORT_FILE, 'utf-8');
    const port = parseInt(content.trim(), 10);
    if (!isNaN(port) && port > 0 && port < 65536) return port;
  } catch (e) { /* ignore */ }

  let port = settings.server.port ?? 3000;
  while (!(await isPortAvailable(port))) port++;

  await fs.writeFile(PORT_FILE, String(port), 'utf-8');
  return port;
};

/**
 * 5. SERVER START
 */
const start = async () => {
  try {
    initDb();

    /**
    * 1. Register Static Plugin FIRST
    * This adds the 'sendFile' method to the 'reply' object.
    */
    await fastify.register(fastifyStatic, {
      root: path.resolve(settings.storage.base_path || './uploads'),
      serve: false, // We handle routing ourselves in deliveryRoutes
      wildcard: false
    });

    const port = await resolvePort();
    await fastify.listen({ port, host: settings.server.host });
    console.log(`🚀 PixelVault Online: http://${settings.server.host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();