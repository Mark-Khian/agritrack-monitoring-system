import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const proxyTarget = env.VITE_API_PROXY_TARGET
    || (mode === 'phase4' ? 'http://127.0.0.1:5100' : 'http://127.0.0.1:5000')

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] })
    ],

    server: {
      port: mode === 'phase4' ? 5173 : undefined,
      strictPort: mode === 'phase4',
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})