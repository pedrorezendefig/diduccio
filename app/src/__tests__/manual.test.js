import { describe, it, expect } from 'vitest'
import { paginasDoCargo } from '../manual/paginas.js'

const ids = (cargo) => paginasDoCargo(cargo).map((p) => p.id)

describe('Manual: páginas que cada Cargo vê', () => {
  it('o Porteiro vê a página de Encomendas', () => {
    expect(ids('Porteiro')).toContain('encomendas')
  })

  it('o Conselheiro não vê a página de Encomendas', () => {
    expect(ids('Conselheiro')).not.toContain('encomendas')
  })
})
