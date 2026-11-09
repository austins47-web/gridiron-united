import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries change far less often than the app's own code, so
        // in their own chunks they stay cached on phones across deploys
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          data: ['@tanstack/react-query', '@supabase/supabase-js'],
        },
        // Ten-character hashes (Vite's default is eight) so every file got a
        // new name once: copies phones had cached before vercel.json gave
        // /assets a year-long cache kept being rechecked on every open
        entryFileNames: 'assets/[name]-[hash:10].js',
        chunkFileNames: 'assets/[name]-[hash:10].js',
        assetFileNames: 'assets/[name]-[hash:10][extname]',
      },
    },
  },
})
