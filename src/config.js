import fs from 'node:fs';

let settings;
try {
  settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
} catch (err) {
  console.error('Failed to load settings.json. Ensure the file exists.');
  process.exit(1);
}

export { settings };