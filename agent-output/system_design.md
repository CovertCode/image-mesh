# System Design: PixelVault (image-mesh)

## Overview
PixelVault is a high-performance image management and delivery service built with Node.js. It provides a multi-tenant environment where users can organize images into projects, process them on-the-fly via a delivery API, and manage assets through a web-based dashboard.

## Technical Stack
- **Backend Framework:** [Fastify](https://www.fastify.io/) - Chosen for its low overhead and high performance.
- **Database:** [SQLite](https://www.sqlite.org/) via `better-sqlite3` - Provides a zero-configuration, serverless database with high-speed WAL mode.
- **Image Processing:** [Sharp](https://sharp.pixelplumbing.com/) - High-performance Node.js module for resizing and converting images.
- **Templating:** [Nunjucks](https://mozilla.github.io/nunjucks/) - Used for server-side rendering of management views.
- **Authentication:** Dual-mode (Stateless HMAC Session Tokens for the dashboard, API Keys for programmatic access).

## Architecture & Data Model
The system follows a hierarchical multi-tenant model:
1.  **Users:** The root entity, identified by email and protected by scrypt-hashed passwords.
2.  **Projects:** Logical containers for images. Each project belongs to a user and has a unique `slug`.
3.  **Images:** The core asset. Each image is linked to a user and a project. Files are stored on disk with metadata (dimensions, blurhash, size) in the database.
4.  **API Keys:** Linked to users, providing programmatic access to the `/v1` resource routes.

## Core Components
- **Delivery API (`/i/*`):** Handles on-the-fly resizing, format conversion (e.g., to WebP), and caching. It uses a MD5-based cache key system to store processed variants.
- **Storage Engine (`src/storage.js`):** Manages file writes, folder organization by project, and metadata extraction.
- **Security Middleware (`src/middleware/auth.js`):** Intercepts requests to validate API keys or administrative master keys.

## Data Flow
1.  **Ingestion:** User uploads an image -> `storage.js` processes it -> Metadata is stored in SQLite -> Result is returned with a delivery URL.
2.  **Delivery:** Request for `/i/project/image.jpg?w=300` -> `deliveryRoutes` checks cache -> If MISS, `sharp` resizes the original -> Result is cached and served.
3.  **Management:** Dashboard uses session tokens to manage API keys and projects.
