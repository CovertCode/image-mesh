import { getContext } from './test-context.js';
import fs from 'node:fs';

const run = async () => {
  const { apiKey, token, imageId, projectSlug } = getContext();
  
  console.log('--- Testing Deletions & Cleanup ---');

  // 1. Delete Image
  console.log('\nDeleting Image...');
  let res = await fetch(`http://localhost:3000/v1/images/${imageId}`, {
    method: 'DELETE',
    headers: { 'x-api-key': apiKey }
  });
  console.log(await res.json());

  // 2. Delete Project
  console.log('\nDeleting Project...');
  res = await fetch(`http://localhost:3000/v1/projects/${projectSlug}`, {
    method: 'DELETE',
    headers: { 'x-api-key': apiKey }
  });
  console.log(await res.json());

  // 3. Revoke API Key
  console.log('\nRevoking API Key...');
  res = await fetch(`http://localhost:3000/v1/auth/keys/${apiKey}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(await res.json());

  // Delete local context file
  if (fs.existsSync('./tests/test-context.json')) {
    fs.unlinkSync('./tests/test-context.json');
    console.log('\n🧹 test-context.json removed.');
  }
};
run();