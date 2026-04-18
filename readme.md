# 🖼️ Imagemesh: High-Performance Image Hosting API

Imagemesh is a lightweight, developer-centric image hosting SaaS built with **Node.js**, **Fastify**, and **SQLite**. It offers on-the-fly image optimization, dynamic resizing, and a secure project-based organizational structure.

## 🚀 Features

- **⚡ High Performance:** Powered by Fastify and `better-sqlite3` (WAL mode) for sub-millisecond database operations.
- **🖼️ On-the-Fly Optimization:** Automatic conversion to WebP/PNG/JPEG and dynamic resizing via URL parameters.
- **💾 Smart Caching:** Transformed images are stored in a local `./cache` to minimize CPU load.
- **🔐 Secure Auth:** User registration, login (scrypt), and SHA-256 hashed API Key management.
- **📁 Logical Projects:** Organize images by "Projects" (Folders) with per-project statistics.
- **✨ UI Placeholders:** Automatic **BlurHash** generation for beautiful loading states.
- **🛠️ Interactive CLI:** A powerful terminal-based dashboard to manage users, keys, and projects.
- **🌐 Global CORS:** Ready to be used as a backend for any web or mobile application.

## 🛠️ Tech Stack

- **Runtime:** Node.js (ES6 Modules)
- **Framework:** Fastify
- **Image Engine:** Sharp
- **Database:** SQLite (`better-sqlite3`)
- **CLI UI:** Enquirer & Picocolors

---

## 📦 Installation

### 1. Clone & Install
```bash
git clone https://github.com/yourusername/core-reflect.git
cd core-reflect
npm install
```

### 2. Setup Configuration
Copy the example settings:
```bash
cp settings.example.json settings.json
```
Edit `settings.json` to set your `admin_api_key` and storage paths.

### 3. Start the Server
```bash
node src/app.js
```
The server will automatically initialize the SQLite database and create necessary folders.

---

## 🎮 Management CLI

Imagemesh comes with an interactive CLI to manage your entire instance without touching the database manually.

```bash
node cli.js
```
- **Admin Mode:** Create/Delete users, change storage limits.
- **User Mode:** Log in, generate API keys, and view account stats.

---

## 🖼️ Image Delivery & Dynamic Resizing

Request images using the following URL structure:
`GET /i/{year}/{month}/{day}/{image_id}.{ext}`

### Dynamic Parameters:
Append query strings to transform images on the fly:
- `w`: Width (e.g., `?w=500`)
- `h`: Height (e.g., `?h=300`)
- `q`: Quality 1-100 (e.g., `?q=75`)
- `f`: Format `webp`, `png`, `jpeg` (e.g., `?f=png`)
- `m`: Fit Mode `cover`, `inside`, `contain` (e.g., `?m=cover`)

**Example:**
`https://api.yoursite.com/i/2024/05/10/abc123xyz.webp?w=200&h=200&m=cover`

---

## 🔗 API Integration

### Uploading an Image (Fetch API)

```javascript
const formData = new FormData();
formData.append('project', 'my-web-app'); // Slug or ID
formData.append('file', fileInput.files[0]);

const res = await fetch('https://api.yoursite.com/v1/upload', {
  method: 'POST',
  headers: { 'x-api-key': 'YOUR_API_KEY' },
  body: formData
});

const data = await res.json();
console.log('Public URL:', data.url);
```

---

## 🛡️ Security Note

- **API Keys:** Store API keys in the database as SHA-256 hashes.
- **Frontend Usage:** Never expose your API Key in client-side code. Use a backend proxy or server-to-server calls for uploads.
- **Admin Access:** The `admin_api_key` in `settings.json` provides "God Mode" access; keep it safe.

---

## 📄 License

MIT © [Prashant Verma]

---