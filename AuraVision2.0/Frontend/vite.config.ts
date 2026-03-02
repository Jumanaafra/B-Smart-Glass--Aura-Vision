// vite.config.ts

import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        // Forward all /api requests to the Express backend on port 5000.
        // This makes frontend (port 3000) and backend (port 5000) appear as the
        // SAME origin to the browser, so SameSite=Lax cookies are sent correctly.
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
        // Also proxy Socket.IO so it goes through the same origin
        '/socket.io': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          ws: true, // enable WebSocket proxying
        },
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});