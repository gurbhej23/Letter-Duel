import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import net from 'node:net';

function checkPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(250);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Listen on all network interfaces
    port: 5173,
    allowedHosts: true, // Allow ngrok and external tunnel host headers
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        router: async () => {
          if (process.env.BACKEND_PORT) {
            return `http://127.0.0.1:${process.env.BACKEND_PORT}`;
          }
          const p8000 = await checkPortOpen(8000);
          return p8000 ? 'http://127.0.0.1:8000' : 'http://127.0.0.1:8001';
        },
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        router: async () => {
          if (process.env.BACKEND_PORT) {
            return `ws://127.0.0.1:${process.env.BACKEND_PORT}`;
          }
          const p8000 = await checkPortOpen(8000);
          return p8000 ? 'ws://127.0.0.1:8000' : 'ws://127.0.0.1:8001';
        },
      },
    },
  },
});
