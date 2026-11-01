import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Manual from '../pages/Manual'

const abrir = (cargo, caminho = '/manual') =>
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/manual/*" element={<Manual user={{ nome: 'Ana', cargo }} />} />
      </Routes>
    </MemoryRouter>
  )

describe('Manual: página inicial', () => {
  it('o Porteiro vê a área Portaria com a página de Encomendas', () => {
    abrir('Porteiro')
    expect(screen.getByRole('heading', { name: 'Portaria' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Encomendas/ })).toHaveAttribute('href', '/manual/encomendas')
  })

  it('o Conselheiro não vê a página de Encomendas nem a área Portaria', () => {
    abrir('Conselheiro')
    expect(screen.queryByRole('heading', { name: 'Portaria' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Encomendas/ })).not.toBeInTheDocument()
  })
})

describe('Manual: página de uma tela', () => {
  it('a página de Encomendas mostra as tarefas de registrar, mandar o Aviso e a Retirada', () => {
    abrir('Porteiro', '/manual/encomendas')
    expect(screen.getByRole('heading', { level: 1, name: 'Encomendas' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Registrar uma Encomenda' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mandar o Aviso' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Registrar a Retirada' })).toBeInTheDocument()
  })

  it('o passo de abrir a Retirada mostra o print do diálogo aberto', () => {
    abrir('Porteiro', '/manual/encomendas')
    const print = screen.getByRole('img', { name: 'Abrir a Encomenda' })
    expect(print).toHaveAttribute('src', '/manual/encomendas/retirada.png')
  })

  it('o Conselheiro que abre o endereço de Encomendas volta para a página inicial', () => {
    abrir('Conselheiro', '/manual/encomendas')
    expect(screen.queryByRole('heading', { name: 'Registrar uma Encomenda' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Manual' })).toBeInTheDocument()
  })
})
