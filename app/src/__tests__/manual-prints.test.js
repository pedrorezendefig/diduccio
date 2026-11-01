import { describe, it, expect } from 'vitest'
import { planoDosPrints, exigeModoDemo } from '../manual/prints.js'

describe('Manual: plano dos prints do modo demo', () => {
  it('a página de Encomendas é fotografada com o login da portaria, com a Retirada aberta antes do print', () => {
    const plano = planoDosPrints()
    const retirada = plano.find((p) => p.arquivo === 'encomendas/retirada.png')

    expect(retirada).toEqual({
      arquivo: 'encomendas/retirada.png',
      rota: '/encomendas',
      email: 'portaria@exemplo.com.br',
      senha: 'demo',
      acoes: [{ clicar: 'Ver detalhes' }, { clicar: 'Confirmar Entrega' }],
    })
  })

  it('cada tarefa da página de Encomendas tem ao menos um print', () => {
    const arquivos = planoDosPrints().map((p) => p.arquivo)
    expect(arquivos).toEqual(
      expect.arrayContaining([
        'encomendas/novo-recebimento.png',
        'encomendas/detalhes.png',
        'encomendas/retirada.png',
      ])
    )
  })
})

describe('Manual: login de cada print', () => {
  it('o painel é fotografado com o login do Síndico, que o passo pede, e não com o da portaria', () => {
    const inicio = planoDosPrints().find((p) => p.arquivo === 'painel/inicio.png')
    expect(inicio.email).toBe('sindico@exemplo.com.br')
  })

  it('o painel do Conselheiro é fotografado com o login do Conselheiro', () => {
    const conselheiro = planoDosPrints().find((p) => p.arquivo === 'painel/conselheiro.png')
    expect(conselheiro.email).toBe('conselho@exemplo.com.br')
  })

  it('recusa um print pedido por um Cargo que não vê a tela', () => {
    const pagina = {
      tela: 'Usuarios',
      rota: '/usuarios',
      tarefas: [{ passos: [{ print: { arquivo: 'x.png', cargo: 'Sindico' } }] }],
    }
    expect(() => planoDosPrints([pagina])).toThrow(/Sindico/)
  })
})

describe('Manual: o script de prints só roda no modo demo', () => {
  it('recusa quando o modo demo não está ligado', () => {
    expect(() => exigeModoDemo({ VITE_DEMO: 'false' })).toThrow(/modo demo/)
    expect(() => exigeModoDemo({})).toThrow(/modo demo/)
  })

  it('segue quando o modo demo está ligado', () => {
    expect(() => exigeModoDemo({ VITE_DEMO: 'true' })).not.toThrow()
  })
})
