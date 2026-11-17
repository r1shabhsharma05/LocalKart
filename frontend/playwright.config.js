import { defineConfig } from '@playwright/test';

// This VM reaches the internet through an egress proxy (HTTPS_PROXY env).
// Chromium does not pick it up on its own, so pass it explicitly when set.
// GitHub Actions runners have no proxy env, so this is a no-op in CI.
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
let proxy;
try {
  const parsed = new URL(proxyUrl);
  if (parsed.hostname) {
    proxy = {
      server: `${parsed.protocol}//${parsed.hostname}:${parsed.port || 3128}`,
      username: decodeURIComponent(parsed.username || ''),
      password: decodeURIComponent(parsed.password || ''),
      bypass: 'localhost,127.0.0.1',
    };
  }
} catch {
  proxy = undefined;
}

export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://localkart-jet.vercel.app',
    ...(proxy ? { proxy } : {}),
  },
});
