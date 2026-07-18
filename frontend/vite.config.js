import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        watch: {
            usePolling: true,
            interval: 300,
        },
        host: '0.0.0.0',
        strictPort: true,
        port: 5173,
        proxy: {
            '/api/battle': {
                target: 'http://battle:8000',
                changeOrigin: true,
                ws: true,
                rewrite: path => path.replace(/^\/api\/battle/, ''),
            },
        },
    }
})
