import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/gps-api': {
        target: 'https://a1.gpsguard.eu',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/gps-api/, ''),
      },
    },
  },
})
