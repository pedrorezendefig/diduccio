import { describe, it, expect } from 'vitest'
import { planoDosPrints } from '../manual/prints.js'

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
