import { getContext } from './test-context.js';

const run = async () => {
  const { apiKey, imageId, imageUrl } = getContext();
  const headers = { 'x-api-key': apiKey };

  console.log('--- Testing Images ---');

  // 1. List Images
  let res = await fetch('http://localhost:3000/v1/images?limit=5', { headers });
  console.log('\nList Images:', await res.json());

  // 2. Image Metadata
  res = await fetch(`http://localhost:3000/v1/images/${imageId}`, { headers });
  console.log('\nImage Metadata:', await res.json());

  // 3. Public Serve (No auth required)
  res = await fetch(`http://localhost:3000${imageUrl}`);
  console.log(`\nPublic Image Fetch Status: ${res.status} (Content-Type: ${res.headers.get('content-type')})`);
};
run();