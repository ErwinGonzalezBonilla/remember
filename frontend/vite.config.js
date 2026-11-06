import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Identificador de esta versión: el commit en Vercel, o la hora de compilación en local.
const VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 12) || String(Date.now())

// Publica /version.json con ese identificador: la app lo consulta para saber si hay una versión nueva.
const versionFile = () => ({
  name: 'rehomi-version',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION }) })
  },
})

// En desarrollo, /api y /uploads se redirigen al backend FastAPI (puerto 8000)
export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
    },
  },
})
