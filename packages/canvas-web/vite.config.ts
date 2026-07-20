import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 开发时把 WS 和资产代理转发到 bridge-server
      '/ws': { target: 'ws://127.0.0.1:4399', ws: true },
      '/assets': { target: 'http://127.0.0.1:4399', changeOrigin: true },
      '/api': { target: 'http://127.0.0.1:4399', changeOrigin: true },
    },
  },
});
