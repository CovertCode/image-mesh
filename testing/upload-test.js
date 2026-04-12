import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CONFIGURATION
 * Change these values to match your environment
 */
const CONFIG = {
    API_URL: 'http://localhost:3000',
    API_KEY: '4409fc2ed4d02439abfd45fcb246eed23b18c97697d6c491f60267f193cd05f8',
    PROJECT_NAME: 'rogue', // Can be the Name, Slug, or ID
    IMAGE_FILENAME: 'uwp3874901.jpeg' // Must be in the same folder as this script
};

// Helper to convert "My Project" to "my-project"
const slugify = (text) => text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+|-+$/g, '');

const uploadFile = async () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const filePath = path.join(__dirname, CONFIG.IMAGE_FILENAME);

    try {
        // 1. Verify local file exists
        await fs.access(filePath);
        const fileBuffer = await fs.readFile(filePath);
        console.log(`[System] Found file: ${CONFIG.IMAGE_FILENAME} (${(fileBuffer.length / 1024).toFixed(2)} KB)`);

        // 2. Prepare Multipart Form Data
        const formData = new FormData();
        
        // IMPORTANT: Append the project reference FIRST
        const projectRef = slugify(CONFIG.PROJECT_NAME);
        formData.append('project', projectRef);
        
        // Append the file as a Blob
        const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
        formData.append('file', blob, CONFIG.IMAGE_FILENAME);

        // Optional: Add transformations
        // formData.append('convert', 'webp');
        // formData.append('width', '1000');

        console.log(`[API] Uploading to project: ${projectRef}...`);

        // 3. Execute Request
        const response = await fetch(`${CONFIG.API_URL}/v1/upload`, {
            method: 'POST',
            headers: {
                'x-api-key': CONFIG.API_KEY
                // Do NOT set Content-Type header; fetch handles boundaries automatically
            },
            body: formData
        });

        const result = await response.json();

        // 4. Handle Response
        if (response.ok && result.success) {
            const fullUrl = `${CONFIG.API_URL}${result.url}`;
            console.log('\n✅ Upload Successful!');
            console.log('--------------------------------------------');
            console.log(`Image ID:   ${result.id}`);
            console.log(`Public URL: ${fullUrl}`);
            console.log('--------------------------------------------');
            return fullUrl;
        } else {
            console.error('\n❌ Upload Failed');
            console.error('Server Error:', result.error || result);
        }

    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error(`\n❌ File not found: ${CONFIG.IMAGE_FILENAME}`);
            console.error(`Ensure the image is in: ${path.dirname(filePath)}`);
        } else {
            console.error('\n❌ Unexpected Error:', err.message);
        }
    }
};

uploadFile();