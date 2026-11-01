import { describe, it, expect } from 'vitest'
import { PAGINAS, paginasDoCargo } from '../manual/paginas.js'

const ids = (cargo) => paginasDoCargo(cargo).map((p) => p.id)

describe('Manual: páginas que cada Cargo vê', () => {
  it('o Porteiro vê a página de Encomendas', () => {
    expect(ids('Porteiro')).toContain('encomendas')
  })

  it('o Conselheiro não vê a página de Encomendas', () => {
    expect(ids('Conselheiro')).not.toContain('encomendas')
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
})
