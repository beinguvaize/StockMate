import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // No `base` override here. Web build (vite build) must use the
  // default absolute "/" so deep SPA routes like
  // /tenant-slug/dashboard resolve /assets/* against the origin root.
  // Electron's build scripts pass `--base=./` on the CLI to switch to
  // relative paths for the file:// protocol.
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
