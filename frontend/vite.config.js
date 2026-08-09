import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

const usePolling = process.env.VITE_USE_POLLING === 'true'
// Local npm runs use the host battle service; Docker overrides this with the
// service DNS name below. Keeping the target configurable avoids proxying a
// Windows-hosted dev server to the unreachable Docker hostname `battle`.
const battleProxyTarget = process.env.VITE_BATTLE_PROXY_TARGET || 'http://localhost:8000'

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
        // Nginx proxies requests using the Docker service name. Keep the
        // allowlist explicit so the dev server accepts both browser and
        // internal proxy hosts without disabling Vite's host check.
        allowedHosts: ['localhost', 'frontend'],
        strictPort: true,
        port: 5173,
        proxy: {
            '/api/battle': {
                target: battleProxyTarget,
                changeOrigin: true,
                ws: true,
                rewrite: path => path.replace(/^\/api\/battle/, ''),
            },
        },
    }
})
