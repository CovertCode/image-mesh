const run = async () => {
  console.log('--- Testing /health ---');
  try {
    const res = await fetch('http://localhost:3000/health');
    const data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(data);
  } catch (err) {
    console.error('Fetch failed. Is the server running?', err.message);
  }
};
run();