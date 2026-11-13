import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      rollupOptions: {
        output: {
          // Библиотеки — отдельными чанками: лучше кэшируются между релизами
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            query: ['@tanstack/react-query'],
          },
        },
      },
    },
    server: {
      // IPv4 явно: на Windows "localhost" иногда слушается только на ::1 (IPv6),
      // и браузер/VPN не может достучаться до dev-сервера
      host: '127.0.0.1',
      port: 5173,
      // Когда появится бэкенд: запросы на /api уйдут на VITE_PROXY_TARGET, без CORS.
      proxy: env.VITE_PROXY_TARGET
        ? { '/api': { target: env.VITE_PROXY_TARGET, changeOrigin: true } }
        : undefined,
    },
  };
});
