import fs from 'node:fs';

const CONTEXT_FILE = './tests/test-context.json';

export const saveContext = (data) => {
  let current = {};
  if (fs.existsSync(CONTEXT_FILE)) {
    current = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
  }
  fs.writeFileSync(CONTEXT_FILE, JSON.stringify({ ...current, ...data }, null, 2));
};

export const getContext = () => {
  if (!fs.existsSync(CONTEXT_FILE)) return {};
  return JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
};