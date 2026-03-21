import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  webServer: [
    {
      command: 'powershell -NoProfile -Command "cd src/frontend; $env:VITE_API_BASE_URL=\'http://localhost:8000/api/v1\'; $env:VITE_API_URL=\'http://localhost:8000/api/v1\'; npm run dev"',
      port: 5173,
      reuseExistingServer: true,
    },
    {
      command: 'powershell -NoProfile -Command "& \'C:/Users/vivek/anaconda3/shell/condabin/conda-hook.ps1\'; conda activate intellog-ai; uvicorn src.backend.app.main:app --port 8000"',
      port: 8000,
      reuseExistingServer: true,
    },
  ],
});
