import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

const usePolling = process.env.VITE_USE_POLLING === 'true'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        watch: {
            // Native filesystem events are much cheaper than polling. Polling
            // remains available for Docker Desktop setups where bind-mount
            // events are not forwarded reliably.
            usePolling,
            interval: usePolling ? 2000 : undefined,
            ignored: [
                '**/node_modules/**',
                '**/.git/**',
                '**/.playwright-cli/**',
                '**/dist/**',
                '**/public/assets/**',
                '**/assets-source/**',
                '**/output/**',
                '**/artifacts/**',
            ],
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
