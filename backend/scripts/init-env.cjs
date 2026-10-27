const { randomBytes } = require('node:crypto');
const { copyFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const backendDirectory = resolve(__dirname, '..');
const envPath = resolve(backendDirectory, '.env');
const examplePath = resolve(backendDirectory, '.env.example');

if (existsSync(envPath)) {
  process.exit(0);
}

copyFileSync(examplePath, envPath);
const env = readFileSync(envPath, 'utf8')
  .replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET="${randomBytes(32).toString('hex')}"`)
  .replace(/^JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET="${randomBytes(32).toString('hex')}"`);
writeFileSync(envPath, env, 'utf8');
console.log('backend/.env yaratildi: JWT secretlar xavfsiz tasodifiy qiymatlar bilan sozlandi.');
