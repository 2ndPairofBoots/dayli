import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/dayli/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('react-dom') || id.includes('react/')) return 'react';
          if (id.includes('recharts')) return 'recharts';
        }
      }
    },
    chunkSizeWarningLimit: 600,
  }
})