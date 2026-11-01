import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '../theme/ThemeProvider'

// O App pergunta ao banco se a senha precisa ser trocada. Aqui não precisa.
// E o cliente do Supabase exige as chaves do .env.local; o Manual não usa banco.
vi.mock('../api/auth', () => ({ precisaTrocarSenha: () => Promise.resolve(false) }))
vi.mock('../api/supabase', () => ({ supabase: {} }))
// A Assembleia carrega o pdf.js no import, e ele não roda no jsdom.
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {} }))

const { default: App } = await import('../App')

describe('Rota Processos', () => {
  beforeEach(() => {
    sessionStorage.setItem('usuarioLogado', JSON.stringify({ nome: 'Ana', cargo: 'Porteiro' }))
    window.history.pushState({}, '', '/processos')
  })

  it('quem abre o endereço antigo de Processos cai na página de Encomendas do Manual', async () => {
    render(<ThemeProvider><App /></ThemeProvider>)
    expect(await screen.findByRole('heading', { name: 'Registrar uma Encomenda' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/manual/encomendas')
  })
})
