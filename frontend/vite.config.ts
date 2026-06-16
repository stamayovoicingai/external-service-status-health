import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // El frontend habla con el backend vía /api durante el desarrollo.
      '/api': 'http://localhost:4000',
    },
  },
});
