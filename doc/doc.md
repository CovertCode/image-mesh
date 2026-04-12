This is the **Complete Technical Specification Document**. You can provide this entire block to a developer-focused LLM (like Claude 3.5 Sonnet, GPT-4o, or GitHub Copilot) to generate the implementation code.

---

# Technical Specification: ImageHost API (v1)

## 1. Project Overview
A high-performance, developer-centric image hosting API built with Node.js and SQLite. The service allows users to manage images across multiple "projects" (logical folders), perform on-the-fly transformations (WebP conversion, resizing), and serve images with optimized caching.

## 2. Tech Stack
*   **Runtime:** Node.js (Latest LTS)
*   **Framework:** Fastify (Chosen for speed and schema validation)
*   **Database:** `better-sqlite3` (Must run in WAL mode)
*   **Image Processing:** `sharp`
*   **File Handling:** `@fastify/multipart` (Stream-based)
*   **Unique IDs:** `nanoid` (for image IDs and project slugs)

## 3. Global Configuration (`settings.json`)
The application must load this file on startup.
```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "storage": {
    "base_path": "./uploads",
    "max_file_size_mb": 10,
    "allowed_mimetypes": ["image/jpeg", "image/png", "image/webp"]
  },
  "image_defaults": {
    "default_format": "webp",
    "default_quality": 80
  },
  "security": {
    "admin_api_key": "generate-a-long-secure-key-here",
    "rate_limit_max": 100,
    "rate_limit_window": "1 minute"
  }
}
```

## 4. Database Schema (SQLite)
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    storage_limit_bytes INTEGER DEFAULT 104857600, -- 100MB
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE api_keys (
    key_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    slug TEXT NOT NULL,
    name TEXT,
    UNIQUE(user_id, slug),
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE images (
    id TEXT PRIMARY KEY, 
    user_id INTEGER NOT NULL,
    project_id INTEGER,
    file_path TEXT NOT NULL,
    filename TEXT,
    extension TEXT,
    size_bytes INTEGER,
    width INTEGER,
    height INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(project_id) REFERENCES projects(id)
);
CREATE INDEX idx_images_user ON images(user_id);
CREATE INDEX idx_images_project ON images(project_id);
```

## 5. Core Logic Requirements

### A. Upload Pipeline
1.  **Auth:** Validate `x-api-key` header.
2.  **Project Handling:** 
    *   If `folder` param is sent, find or create the project for that user.
3.  **Processing (Sharp):**
    *   If `convert=webp` param is present, transform image.
    *   Apply `quality` param if provided.
4.  **Storage:** 
    *   Store files in: `/{base_path}/{yyyy}/{mm}/{dd}/{nanoid}.{ext}`.
    *   This prevents single-directory file limits.
5.  **Atomic Ops:** Ensure DB record is created ONLY if file write to disk succeeds.

### B. Delivery Logic
*   Route: `GET /i/:id`
*   Stream the file directly from the filesystem.
*   **Headers:** Set `Cache-Control: public, max-age=31536000, immutable`.

## 6. API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **POST** | `/v1/upload` | Upload file. Params: `file`, `folder`, `convert`, `quality`. |
| **GET** | `/v1/images` | List all images. Filter by `?folder=slug`. |
| **GET** | `/v1/images/:id` | Get image metadata. |
| **DELETE** | `/v1/images/:id` | Delete file from disk and DB. |
| **GET** | `/v1/projects` | List all user projects/folders and stats. |
| **GET** | `/i/:id` | Public URL to serve the actual image. |

## 7. Developer Instructions (LLM Prompt)
> "Build a Fastify application based on the above specification. Use `better-sqlite3` for the database and ensure WAL mode is enabled. Use `sharp` for all image processing. The code should be modular, with separate files for database initialization, routes, and image processing services. Ensure all uploads are handled via streams to keep memory usage low. Provide a `setup.js` script to initialize the SQLite database based on the schema provided."

---

### Phase 1 Build Instructions for LLM:
1.  **Initialize Project:** Create `package.json` with dependencies (`fastify`, `better-sqlite3`, `sharp`, `nanoid`, `@fastify/multipart`, `@fastify/static`).
2.  **Config Loader:** Create logic to read `settings.json`.
3.  **Database Module:** Initialize `better-sqlite3` and create the schema.
4.  **Upload Route:** Implement the multipart upload logic with Sharp processing.
5.  **Static Serving:** Implement the `/i/:id` route for fast image delivery.