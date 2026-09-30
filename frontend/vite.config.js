import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // En Docker, localhost apunta al contenedor del frontend, no a la API.
  // Fuera de Docker se conserva el destino local habitual.
  // `loadEnv` carga archivos .env; la variable de Docker está disponible en
  // process.env al iniciar Vite y debe tener prioridad para el proxy.
  const apiTarget = process.env.VITE_API_PROXY_TARGET
    || env.VITE_API_PROXY_TARGET
    || 'http://localhost:8000';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: ['frontend-production-3709.up.railway.app'],
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
