# Project Documentation: PixelVault

## Introduction
PixelVault is an internal image hosting and processing service. It allows teams to upload assets and retrieve them with dynamic transformations (resize, crop, format change) via a simple URL API.

## API Documentation

### Authentication
Most endpoints require an API Key passed in the `x-api-key` header.
- **Admin Key:** Provides full access to all resources.
- **User Key:** Provides access to the user's own projects and images.

### Image Delivery API
**Base URL:** `/i/`
**Endpoint:** `/i/{project_slug}/{filename}`

**Query Parameters:**
- `w`: Width in pixels.
- `h`: Height in pixels.
- `q`: Quality (1-100, default 80).
- `f`: Format (`webp`, `jpeg`, `png`, `avif`, default `webp`).
- `m`: Fit mode (`cover`, `contain`, `inside`).

**Example:**
`https://cdn.example.com/i/marketing/hero-banner.jpg?w=800&f=webp`

### Management API (v1)
- `POST /v1/auth/register`: Create a new account.
- `POST /v1/auth/login`: Get a session token.
- `GET /v1/projects`: List all projects for the authenticated user.
- `POST /v1/projects`: Create a new project.
- `POST /v1/upload`: Upload an image (requires `multipart/form-data`).
- `GET /v1/images`: List image gallery with pagination.
- `DELETE /v1/images/:id`: Delete an image and its physical file.

## Setup & Installation
1.  **Install Dependencies:** `npm install`
2.  **Configuration:** Edit `settings.json` to set your `admin_api_key` and storage paths.
3.  **Run Server:** `node src/app.js`
4.  **Access Dashboard:** Open `http://localhost:3000` in your browser.

## Project Structure
- `src/`: Backend logic.
- `views/`: HTML templates for the dashboard.
- `uploads/`: Default directory for original images.
- `cache/`: Directory for processed image variants.
- `tests/`: Comprehensive test suite for health, auth, and resources.
