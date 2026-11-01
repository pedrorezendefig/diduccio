import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PAGINAS, paginasDoCargo } from '../manual/paginas.js'
import { planoDosPrints, PASTA_DOS_PRINTS } from '../manual/prints.js'

const ids = (cargo) => paginasDoCargo(cargo).map((p) => p.id)

describe('Manual: páginas que cada Cargo vê', () => {
  it('o Porteiro vê a página de Encomendas', () => {
    expect(ids('Porteiro')).toContain('encomendas')
  })

  it('o Conselheiro não vê a página de Encomendas', () => {
    expect(ids('Conselheiro')).not.toContain('encomendas')
  })
})

describe('Manual: páginas da Administração', () => {
  it('o Conselheiro vê as páginas da Assembleia e do painel', () => {
    expect(ids('Conselheiro')).toEqual(expect.arrayContaining(['assembleia', 'painel']))
  })

  it('o Síndico não vê a página de Usuários', () => {
    expect(ids('Sindico')).not.toContain('usuarios')
  })

  it('o Desenvolvedor vê a página de Usuários', () => {
    expect(ids('Desenvolvedor')).toContain('usuarios')
  })

  const ADMINISTRACAO = ['painel', 'comunicado', 'tarefas', 'assembleia', 'usuarios']

  it.each(ADMINISTRACAO)('a página %s está na área Administração e tem um print em cada passo', (id) => {
    const pagina = PAGINAS.find((p) => p.id === id)
    expect(pagina?.area).toBe('Administração')
    const passosSemPrint = pagina.tarefas.flatMap((t) => t.passos).filter((p) => !p.print?.arquivo)
    expect(passosSemPrint.map((p) => p.titulo)).toEqual([])
  })
})

const PAGINAS_DA_PORTARIA = ['retirada', 'entradas-e-saidas', 'vagas', 'tag']

describe('Manual: páginas da Portaria', () => {
  it('o Porteiro vê as páginas de Retirada, Entradas e Saídas, Vagas e TAG', () => {
    expect(ids('Porteiro')).toEqual(expect.arrayContaining(PAGINAS_DA_PORTARIA))
  })

  it('o Conselheiro não vê nenhuma das páginas da Portaria', () => {
    expect(ids('Conselheiro').filter((id) => PAGINAS_DA_PORTARIA.includes(id))).toEqual([])
  })

  const pagina = (id) => PAGINAS.find((p) => p.id === id)
  const passos = (id) => pagina(id).tarefas.flatMap((t) => t.passos.map((passo) => [`${id}: ${passo.titulo}`, passo]))

  it.each(PAGINAS_DA_PORTARIA.flatMap(passos))('o passo %s tem print', (_nome, passo) => {
    expect(passo.print?.arquivo).toMatch(/\.png$/)
  })

  it('a Retirada explica a inteira, a parcial e a feita por outra pessoa', () => {
    expect(pagina('retirada').tarefas.map((t) => t.titulo)).toEqual([
      'Retirada inteira',
      'Retirada parcial',
      'Retirada por outra pessoa',
    ])
  })

  it('Entradas e Saídas cita os cinco tipos de Pessoa de fora e a Passagem', () => {
    const texto = textos(pagina('entradas-e-saidas')).join(' ')
    for (const termo of ['Pessoa de fora', 'Passagem', 'Entregador', 'Motorista', 'Visitante', 'Temporada', 'Serviço']) {
      expect(texto).toContain(termo)
    }
  })

  it('a TAG percorre Solicitada, Disponível e Aplicada', () => {
    expect(pagina('tag').tarefas.map((t) => t.titulo)).toEqual([
      'Pedir a TAG (Solicitada)',
      'Esperar a liberação (Disponível)',
      'Colar e marcar (Aplicada)',
    ])
  })
})

// Todo texto de uma página, inclusive os aninhados nas tarefas e nos passos.
const textos = (valor) => {
  if (typeof valor === 'string') return [valor]
  if (Array.isArray(valor)) return valor.flatMap(textos)
  if (valor && typeof valor === 'object') return Object.values(valor).flatMap(textos)
  return []
}

describe('Manual: consistência do conteúdo', () => {
  it('existe ao menos uma página', () => {
    expect(PAGINAS.length).toBeGreaterThan(0)
  })

  it.each(PAGINAS.map((p) => [p.id, p]))('a página %s tem título, área e ao menos uma tarefa com passos', (_id, p) => {
    expect(p.titulo?.trim()).toBeTruthy()
    expect(p.area?.trim()).toBeTruthy()
    expect(p.tarefas?.length).toBeGreaterThan(0)
    for (const t of p.tarefas) {
      expect(t.titulo?.trim()).toBeTruthy()
      expect(t.passos?.length).toBeGreaterThan(0)
    }
  })

  it('nenhum texto do Manual tem travessão nem meia-risca', () => {
    const comTraco = textos(PAGINAS).filter((s) => /[–—]/.test(s))
    expect(comTraco).toEqual([])
  })

  // Os PNGs saem do `npm run manual:prints`, que não roda no CI: quem cita um
  // print novo no conteúdo precisa rodar o script e commitar o arquivo.
  it.each(planoDosPrints().map((p) => [p.arquivo]))('o print %s citado no conteúdo existe em public/', (arquivo) => {
    const caminho = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', PASTA_DOS_PRINTS, arquivo)
    expect(existsSync(caminho)).toBe(true)
  })
})
