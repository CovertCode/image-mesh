import { getContext } from './test-context.js';

const run = async () => {
  const { apiKey, projectSlug } = getContext();
  const headers = { 'x-api-key': apiKey, 'Content-Type': 'application/json' };

  console.log('--- Testing Projects ---');

  // 1. List Projects
  let res = await fetch('http://localhost:3000/v1/projects', { headers });
  console.log('\nAll Projects:', await res.json());

  // 2. Project Stats
  res = await fetch(`http://localhost:3000/v1/projects/${projectSlug}`, { headers });
  console.log('\nProject Stats:', await res.json());

  // 3. Rename Project
  res = await fetch(`http://localhost:3000/v1/projects/${projectSlug}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name: 'Renamed E2E Project' })
  });
  console.log('\nRename Project:', await res.json());
};
run();