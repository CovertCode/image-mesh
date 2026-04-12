import fs from 'node:fs/promises';
import path from 'node:path';
import { get } from '../db.js';
import { settings } from '../config.js';

export default async function healthRoutes(fastify, options) {
    fastify.get('/health', async (req, reply) => {
        const healthStatus = {
            status: 'ok',
            uptime_seconds: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
            services: {
                database: 'down',
                storage: 'down'
            }
        };

        let isHealthy = true;

        // 1. Check SQLite Database
        try {
            const dbCheck = get('SELECT 1 AS ok');
            if (dbCheck && dbCheck.ok === 1) {
                healthStatus.services.database = 'up';
            } else {
                isHealthy = false;
            }
        } catch (err) {
            isHealthy = false;
            fastify.log.error('Healthcheck DB Error:', err);
        }

        // 2. Check Storage Directory Access
        try {
            const basePath = path.resolve(settings.storage.base_path || './storage');
            // Ensure the directory exists and the Node process has read/write permissions
            await fs.access(basePath, fs.constants.R_OK | fs.constants.W_OK);
            healthStatus.services.storage = 'up';
        } catch (err) {
            isHealthy = false;
            fastify.log.error('Healthcheck Storage Error:', err);
        }

        // Return 503 if any critical service is down
        if (!isHealthy) {
            healthStatus.status = 'error';
            return reply.status(503).send(healthStatus);
        }

        // Return 200 OK
        return reply.send(healthStatus);
    });
}