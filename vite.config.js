import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base path for GitHub Pages (atrifan.github.io)
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Generate source maps for debugging
    sourcemap: false,
  },
  // Ensure proper handling of SPA routing
  preview: {
    port: 4173,
  },
  server: {
    port: 5173,
  }
})

