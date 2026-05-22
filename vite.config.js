import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the same build works under the web origin
  // AND Electron's file:// protocol (otherwise /assets/* 404s against
  // the user's filesystem root and lazy-loaded route chunks never
  // resolve — surfaces as a blank "loading" screen on desktop).
  base: './',
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime — cached forever, rarely changes
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Supabase client
          'vendor-supabase': ['@supabase/supabase-js'],
          // Charts library (heavy — ~300 kB)
          'vendor-charts': ['recharts'],
          // Form validation
          'vendor-zod': ['zod'],
          // Icon set
          'vendor-icons': ['lucide-react'],
        },
      },
    },
    // Raise warning threshold — we know chunks exist, silence noise
    chunkSizeWarningLimit: 600,
  },
})
