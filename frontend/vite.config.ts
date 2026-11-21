import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// /api goes to the Django API: the "api" container in docker compose (API_PROXY),
// and Cloud Run through the Firebase Hosting rewrite in the cloud (firebase.json).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': process.env.API_PROXY ?? 'http://localhost:8000' } },
});
