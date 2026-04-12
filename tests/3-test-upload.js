import { getContext, saveContext } from './test-context.js';

const dummyWebP = 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

const run = async () => {
  const { apiKey, projectSlug } = getContext();
  if (!projectSlug) return console.error('Missing Project Slug. Run 2.5-create-project.js first.');

  console.log('--- Testing Strict Project Upload ---');

  const formData = new FormData();
  const buffer = Buffer.from(dummyWebP, 'base64');
  const blob = new Blob([buffer], { type: 'image/webp' });
  
  formData.append('file', blob, 'test-pixel.webp');
  formData.append('project', projectSlug); // MANDATORY FIELD
  formData.append('convert', 'webp');

  const res = await fetch('http://localhost:3000/v1/upload', {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: formData
  });

  const data = await res.json();
  console.log('Upload Result:', data);

  if (data.success) {
    saveContext({ imageId: data.id, imageUrl: data.url });
  }
};
run();