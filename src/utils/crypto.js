import crypto from 'node:crypto';

// Standardized SHA-256 for API Keys
export const hashApiKey = (key) => {
    return crypto.createHash('sha256').update(key).digest('hex');
};

// Password hashing logic (scrypt)
export const hashPassword = (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derivedKey}`;
};

export const verifyPassword = (password, hash) => {
    if (!hash) return false;
    const [salt, key] = hash.split(':');
    const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
    return key === derivedKey;
};