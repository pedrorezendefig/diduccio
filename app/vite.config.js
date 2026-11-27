/// <reference types="vitest" />
import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Nos testes, o cliente do Supabase precisa de endereço e chave para ser
// importado (src/api/supabase.js lança sem eles). Sem `.env.local`, como no
// CI, entram valores de mentira; os testes que falam com o projeto de verdade
// (csp e seguranca) se pulam quando o endereço não é de um projeto real.
const TESTE_SEM_BANCO = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_teste',
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
  plugins: [react()],
  server: {
    // expõe o dev server na rede local (acesso pelo celular)
    host: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.js'],
    // Os arquivos .css são importados pelo main.jsx; em teste não interessam.
    css: false,
    env: {
      VITE_SUPABASE_URL: env.VITE_SUPABASE_URL || TESTE_SEM_BANCO.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY:
        env.VITE_SUPABASE_PUBLISHABLE_KEY || TESTE_SEM_BANCO.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  },
  }
})
