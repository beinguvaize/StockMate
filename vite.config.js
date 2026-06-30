import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Electron builds run under npm scripts prefixed "electron:" (electron:build,
// electron:preview, etc.) and always pass --base=./ for file:// compatibility.
// Service workers are invalid under file:// — disable the PWA plugin entirely
// for Electron so it doesn't inject a broken SW registration.
const isElectron = (process.env.npm_lifecycle_event || '').startsWith('electron');

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
    ...(!isElectron ? [VitePWA({
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Only cache Supabase REST API reads — never auth or realtime.
        // Auth token refresh must always hit the network; realtime is a
        // WebSocket and won't match this rule anyway.
        runtimeCaching: [{
          urlPattern: ({ url }) =>
            url.hostname.includes('supabase.co') && url.pathname.startsWith('/rest/'),
          handler: 'NetworkFirst',
          options: {
            cacheName: 'supabase-rest',
            networkTimeoutSeconds: 4,
            cacheableResponse: { statuses: [0, 200] },
          },
        }],
      },
      manifest: {
        name: 'StockMate — Smart Business Manager',
        short_name: 'StockMate',
        description: 'Billing, inventory, and accounts for growing businesses',
        theme_color: '#000000',
        background_color: '#f5f5f4',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/favicon-256.png', sizes: '256x256', type: 'image/png' },
          { src: '/favicon-256.png', sizes: '192x192', type: 'image/png' },
          { src: '/favicon-256.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    })] : []),
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
