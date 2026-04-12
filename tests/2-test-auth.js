import { saveContext } from './test-context.js';

const BASE_URL = 'http://localhost:3000/v1/auth';
const testEmail = `testuser+${Date.now()}@example.com`; // Unique email every run
const testPassword = 'securepassword123';

const run = async () => {
  console.log('--- Testing Auth Routes ---');

  // 1. Register
  console.log(`\nRegistering ${testEmail}...`);
  let res = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword })
  });
  console.log('Register:', await res.json());

  // 2. Login
  console.log('\nLogging in...');
  res = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword })
  });
  const loginData = await res.json();
  console.log('Login:', loginData);

  const sessionToken = loginData.token;

  // 3. Generate API Key
  console.log('\nGenerating API Key...');
  res = await fetch(`${BASE_URL}/keys`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${sessionToken}` }
  });
  const keyData = await res.json();
  console.log('Generate Key:', keyData);

  // Save context for next scripts
  saveContext({ token: sessionToken, apiKey: keyData.api_key });
};
run();