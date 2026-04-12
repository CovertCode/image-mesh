# 🖼️ ImageHost API Integration Guide

This guide explains how to programmatically upload images to the **CoreReflect** platform from any JavaScript environment (Node.js or Browser).

## 1. Authentication
All requests must include your unique API Key in the request headers. You can generate this key from your User Dashboard.

**Header:** `x-api-key: YOUR_API_KEY_HERE`

---

## 2. Upload Endpoint
*   **Method:** `POST`
*   **URL:** `https://your-api-domain.com/v1/upload`
*   **Content-Type:** `multipart/form-data`

### Request Parameters (Multipart Fields)
| Field | Requirement | Description |
| :--- | :--- | :--- |
| `file` | **Mandatory** | The binary image file. |
| `project` | **Mandatory** | The Project **Slug** or **ID** where the image will be stored. |
| `convert` | Optional | Target format: `webp`, `png`, `jpeg`. (Defaults to `webp`) |
| `width` | Optional | Resize image to specific width (maintains aspect ratio). |
| `quality` | Optional | Compression quality (1-100). Default is `80`. |

---

## 3. Sample Integration Script (JavaScript)

This script uses native `fetch`. It works in modern browsers and Node.js 18+.

```javascript
/**
 * Uploads an image to the CoreReflect API.
 * 
 * @param {File|Blob} file - The image file to upload
 * @param {string} project - The Project Slug or ID
 * @param {string} apiKey - Your API Key
 */
async function uploadToImageHost(file, project, apiKey) {
    const API_URL = 'https://your-api-domain.com/v1/upload';

    // 1. Prepare FormData
    const formData = new FormData();
    
    // IMPORTANT: Metadata (project) should be appended before the file 
    // for optimal stream processing on the server.
    formData.append('project', project);
    formData.append('file', file);
    
    // Optional Transformations
    formData.append('convert', 'webp');
    formData.append('width', '1200');
    formData.append('quality', '85');

    try {
        console.log('Starting upload...');
        
        // 2. Perform Fetch
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey
                // Note: Do NOT set 'Content-Type'. 
                // The browser/Node will automatically set it with the correct boundary.
            },
            body: formData
        });

        const data = await response.json();

        // 3. Handle Result
        if (response.ok) {
            console.log('Upload Successful!', data);
            return data; // Returns { id, url, blurhash, etc. }
        } else {
            console.error('Upload Failed:', data.error);
            throw new Error(data.error);
        }

    } catch (error) {
        console.error('Network Error:', error.message);
        throw error;
    }
}

// --- Usage Example (Browser) ---
/*
const fileInput = document.querySelector('#myFile');
fileInput.addEventListener('change', async () => {
    const result = await uploadToImageHost(
        fileInput.files[0], 
        'marketing-campaign-2024', 
        'your_api_key_here'
    );
    console.log('Public URL:', result.url);
});
*/
```

---

## 4. Understanding the Response
A successful upload returns a `200 OK` with a JSON body:

```json
{
  "success": true,
  "id": "abc123xyz456",
  "url": "/i/2024/05/12/abc123xyz456.webp",
  "project_id": 5,
  "blurhash": "L6PZfS_NcCIU00_N%MWB00~pM{Rj",
  "width": 1200,
  "height": 800,
  "size": 145600
}
```

### Key Values:
*   **`url`**: The path to the image. Prepend your domain (e.g., `https://api.com` + `url`) to use it in `<img>` tags.
*   **`blurhash`**: A very short string representing a blurred version of the image. Use this as a `placeholder` in your UI while the main image loads.

---