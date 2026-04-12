This is the **Master Implementation Blueprint**. You can hand this entire document to a developer LLM (like Claude 3.5 Sonnet or GPT-4o) to generate the full codebase.

---

# 📄 Project Master Spec: "CoreReflect" Image API

## 1. System Overview
A lightweight, high-performance image hosting SaaS.
*   **Backend:** Node.js + Fastify
*   **Database:** `better-sqlite3` (Metadata store)
*   **Image Engine:** `sharp` (Processing & Transformation)
*   **Configuration:** All system-wide rules managed via `settings.json`.
*   **Architecture:** API-First, Headless (No frontend in V1).

---

## 2. Global Configuration (`settings.json`)
```json
{
  "app": {
    "port": 3000,
    "host": "0.0.0.0",
    "admin_secret_key": "super-admin-secret-change-me"
  },
  "database": {
    "path": "./data/core.db",
    "wal_mode": true
  },
  "storage": {
    "root": "./storage",
    "max_file_size_mb": 20,
    "allowed_types": ["image/jpeg", "image/png", "image/webp", "image/gif"]
  },
  "processing": {
    "default_format": "webp",
    "default_quality": 80,
    "generate_blurhash": true
  },
  "plans": {
    "free_storage_limit_mb": 100,
    "rate_limit_per_min": 60
  }
}
```

---

## 3. Detailed Phase Plan

### Phase 1: Foundation & Data Architecture
*   **Objective:** Setup the environment and the persistent data layer.
*   **Features:**
    *   **Config Loader:** Module to read and validate `settings.json`.
    *   **DB Engine:** Initialize `better-sqlite3` with WAL mode and Synchronous=Normal for speed.
    *   **Schema Creation:** Auto-run migration scripts for tables: `users`, `api_keys`, `projects` (folders), and `images`.
    *   **Admin CLI:** A simple script to create the first user and generate an API Key.

### Phase 2: The Upload & Transformation Engine
*   **Objective:** Handle binary data and image optimization.
*   **Features:**
    *   **Streamed Uploads:** Use `@fastify/multipart` to pipe files directly to Sharp to minimize RAM usage.
    *   **On-the-Fly Conversion:** Logic to detect `?convert=webp` or `?format=png` in upload params.
    *   **Smart Compression:** Automatic reduction of file size using `settings.json` quality defaults.
    *   **The "Date-Tree" Storage:** Save files physically at `/storage/YYYY/MM/DD/{nanoid}.ext` to prevent OS directory lag.
    *   **BlurHash Generation:** Generate a small placeholder string for every uploaded image.

### Phase 3: Logical Project Management (Folders)
*   **Objective:** Allow users to manage multiple websites/apps.
*   **Features:**
    *   **Auto-Project Creation:** If `folder=site-a` is passed during upload and doesn't exist, create it.
    *   **Project Scoping:** All API queries for images must be scoped to the `user_id` identified by the API key.
    *   **Folder Stats:** API endpoint to return total images and total disk space used by a specific folder.
    *   **Slugification:** Ensure folder names are automatically cleaned (e.g., "My Site" -> `my-site`).

### Phase 4: Delivery, Caching & SaaS Guardrails
*   **Objective:** Serve images fast and protect server resources.
*   **Features:**
    *   **High-Speed Serve Route:** `GET /i/:id` using `fastify-static`.
    *   **Immutable Caching:** Set `Cache-Control: public, max-age=31536000, immutable` for all image deliveries.
    *   **Quota Enforcement:** Check `total_storage_used` before allowing an upload. Reject if user is over their MB limit.
    *   **Rate Limiting:** Protect the `POST /upload` endpoint using a sliding window based on API Key.

### Phase 5: Production Hardening & Admin Tools
*   **Objective:** Maintenance and scalability.
*   **Features:**
    *   **Bulk Delete API:** Delete an entire folder and all its physical files in one transaction.
    *   **Orphan Cleanup Task:** A script that compares the Filesystem vs the Database and deletes any "ghost" files.
    *   **Graceful Shutdown:** Logic to ensure SQLite finishes writes before the Node process kills.
    *   **Logging:** Implement `pino` logger for request tracking and error monitoring.

---

## 4. Complete Feature List (V1)

### Developer Experience (DX)
*   **One-Key Auth:** Simple `X-API-Key` header authentication.
*   **Clean JSON Responses:** Every upload returns the `id`, `url`, `width`, `height`, `size`, and `blurhash`.
*   **Logical Folders:** Organise assets by website/project without physical path headaches.

### Image Optimization
*   **Auto-WebP:** Reduce image weight by up to 80% automatically.
*   **EXIF Strip:** Automatically remove sensitive metadata (GPS, etc.) from images.
*   **Resize on Upload:** Optional `width` and `height` params during upload to save storage.

### SaaS Management
*   **Storage Quotas:** Set max storage per user (e.g., 100MB for free, 10GB for pro).
*   **Super-Admin Key:** A master key defined in `settings.json` that can bypass quotas and manage all users.
*   **Health Check:** `/health` endpoint for monitoring.

---

## 5. Implementation Instructions for LLM
> "Please generate the full Node.js code for the project described above. 
> 1. Use **Fastify** as the framework. 
> 2. Use **better-sqlite3** for all database operations. 
> 3. Use **Sharp** for image processing. 
> 4. Ensure the database initialization happens in a separate module. 
> 5. Create a `StorageService` that handles the physical writing of files using streams. 
> 6. Create an `AuthMiddleware` to check API keys against the database. 
> 7. All routes should be versioned under `/v1/`.
> 8. Provide the `package.json` with all necessary dependencies."