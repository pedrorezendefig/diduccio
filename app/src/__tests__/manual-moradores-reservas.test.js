import { describe, it, expect } from 'vitest'
import { PAGINAS, paginasDoCargo } from '../manual/paginas.js'

// Issue #15: as páginas das áreas Moradores e Reservas do Manual.
const MORADORES = ['moradores', 'unidades', 'confirmacao']
const RESERVAS = ['festas', 'churrasqueira', 'piscina', 'mudancas', 'agendamento']
const DESTA_FATIA = [...MORADORES, ...RESERVAS]

const pagina = (id) => PAGINAS.find((p) => p.id === id)
const ids = (cargo) => paginasDoCargo(cargo).map((p) => p.id)

describe('Manual: páginas de Moradores e Reservas', () => {
  it('as páginas de Moradores ficam na área Moradores e as de Reservas na área Reservas', () => {
    expect(MORADORES.map((id) => pagina(id)?.area)).toEqual(['Moradores', 'Moradores', 'Moradores'])
    expect(RESERVAS.map((id) => pagina(id)?.area)).toEqual(['Reservas', 'Reservas', 'Reservas', 'Reservas', 'Reservas'])
  })

  it.each(DESTA_FATIA)('cada passo da página %s tem o seu print, sem repetir', (id) => {
    const passos = pagina(id).tarefas.flatMap((t) => t.passos)
    const semPrint = passos.filter((p) => !p.print?.arquivo).map((p) => p.titulo)
    expect(semPrint).toEqual([])
    const arquivos = passos.map((p) => p.print.arquivo)
    expect(new Set(arquivos).size).toBe(arquivos.length)
  })
})

describe('Manual: quem vê as páginas de Moradores e Reservas', () => {
  it('o Auxiliar Administrativo vê todas', () => {
    expect(ids('Auxiliar Administrativo')).toEqual(expect.arrayContaining(DESTA_FATIA))
  })

  it('o Porteiro não vê a página de Moradores', () => {
    expect(ids('Porteiro')).not.toContain('moradores')
  })
})

// Termos que o CONTEXT.md manda evitar nestas áreas. O rótulo de botão citado
// entre aspas (“Novo Agendamento”) é o texto da tela e fica de fora.
const EVITAR = [
  'condômino', 'residente', 'inquilino', 'apartamento', 'apto', 'imóvel',
  'agendamento', 'reunião', 'notificação', 'upload',
]

const prosa = (p) => [
  p.resumo,
  ...p.tarefas.flatMap((t) => [t.titulo, ...t.passos.flatMap((s) => [s.titulo, s.texto])]),
].map((s) => s.replace(/“[^”]*”/g, ''))

describe('Manual: Moradores e Reservas falam a língua do CONTEXT.md', () => {
  it.each(DESTA_FATIA)('a página %s não usa termo que o glossário manda evitar', (id) => {
    const achados = prosa(pagina(id)).flatMap((s) =>
      EVITAR.filter((termo) => new RegExp(`(^|[^\\p{L}])${termo}`, 'iu').test(s))
    )
    expect(achados).toEqual([])
  })
})
