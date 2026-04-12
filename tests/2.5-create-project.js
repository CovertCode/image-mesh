import { getContext, saveContext } from './test-context.js';

const run = async () => {
  const { apiKey } = getContext();
  if (!apiKey) return console.error('Run 2-test-auth.js first');

  console.log('--- Creating Project for Upload Test ---');

  const res = await fetch('http://localhost:3000/v1/projects', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'E2E Upload Destination' })
  });

  const result = await res.json();
  console.log(result);

  if (result.success) {
    saveContext({ projectSlug: result.data.slug });
  }
};
run();