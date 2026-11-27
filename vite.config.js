import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

// Electron builds run under npm scripts prefixed "electron:" (electron:build,
// electron:preview, etc.) and always pass --base=./ for file:// compatibility.
// Service workers are invalid under file:// — disable the PWA plugin entirely
// for Electron so it doesn't inject a broken SW registration.
const isElectron = (process.env.npm_lifecycle_event || '').startsWith('electron');

// The public invoice page (/i/) is opened by a shop's clients. It must not
// register the app's service worker or offer to install the app on their
// phone, so the PWA plugin's tags are taken back out of that one page.
const keepInvoiceViewerBare = () => ({
  name: 'keep-invoice-viewer-bare',
  enforce: 'post',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      if (!/(^|\/)i\/index\.html$/.test(ctx.path || ctx.filename || '')) return html;
      return html
        .replace(/<link rel="manifest"[^>]*>/g, '')
        .replace(/<script id="vite-plugin-pwa:register-sw"[^>]*><\/script>/g, '');
    },
  },
});

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
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // /i/ is the public invoice page a client opens from a shared link.
        // It is its own small page; the app shell must never stand in for it.
        navigateFallbackDenylist: [/^\/i\//],
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
    keepInvoiceViewerBare(),
  ],
  build: {
    rollupOptions: {
      // Two pages: the app, and the stand-alone public invoice viewer (/i/),
      // which carries none of the app's code.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        invoiceViewer: fileURLToPath(new URL('./i/index.html', import.meta.url)),
      },
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
