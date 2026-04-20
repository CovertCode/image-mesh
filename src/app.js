import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import path from 'node:path';
import pointOfView from '@fastify/view';
import nunjucks from 'nunjucks';

import { initDb } from './db.js';
import { settings } from './config.js';

// Route imports
import uploadRoutes from './routes/upload.js';
import projectRoutes from './routes/projects.js';
import imageRoutes from './routes/images.js';
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
import deliveryRoutes from './routes/delivery.js';



const fastify = Fastify({
  logger: true,
  ignoreTrailingSlash: true
});

// 1. Setup Nunjucks
fastify.register(pointOfView, {
  engine: { nunjucks },
  root: path.resolve('views'),
  options: {
    noCache: true // Set to false in production
  }
});

// fastify.register(cors, { origin: '*' });
await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  credentials: true
});
// Core Plugins
fastify.register(multipart, { limits: { fileSize: settings.storage.max_file_size_mb * 1024 * 1024 } });
// fastify.register(fastifyStatic, {
//   root: path.resolve(settings.storage.base_path || './storage'),
//   prefix: '/i/',
//   immutable: true,
//   maxAge: '1y'
// });

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  // Custom key generator: Use API key if present, otherwise IP
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip
})

// API Routes
fastify.register(healthRoutes);
fastify.register(authRoutes, { prefix: '/v1/auth' });
fastify.register(uploadRoutes, { prefix: '/v1' });
fastify.register(projectRoutes, { prefix: '/v1/projects' });
fastify.register(imageRoutes, { prefix: '/v1/images' });
fastify.register(deliveryRoutes);

// Render Logic
fastify.get('/', async (req, reply) => {
  return reply.view('auth.njk', { title: 'Login | PixelVault' });
});

fastify.get('/dashboard', async (req, reply) => {
  return reply.view('dashboard.njk', { title: 'Overview | PixelVault' });
});

fastify.get('/gallery', async (req, reply) => {
  return reply.view('gallery.njk', { title: 'Gallery | PixelVault' });
});

fastify.get('/settings', async (req, reply) => {
  return reply.view('settings.njk', { title: 'Settings | PixelVault' });
});

fastify.get('/upload', async (req, reply) => {
  return reply.view('upload.njk', { title: 'Upload Media | PixelVault' });
});

fastify.get('/projects', async (req, reply) => {
    return reply.view('projects.njk', { title: 'Projects | PixelVault' });
});

const start = async () => {
  try {
    initDb();
    await fastify.listen({ port: settings.server.port, host: settings.server.host });
    console.log(`Server running at http://${settings.server.host}:${settings.server.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();