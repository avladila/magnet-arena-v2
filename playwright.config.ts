import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4173' },
  projects: ['chromium', 'firefox', 'webkit'].map((name) => ({
    name,
    use: {
      browserName: name as 'chromium' | 'firefox' | 'webkit',
      ...(name === 'chromium' && process.env.PW_CHROMIUM_PATH
        ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
    },
  })),
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
