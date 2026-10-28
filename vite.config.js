import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // In development, forward /api calls to the Node server (npm run api).
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
