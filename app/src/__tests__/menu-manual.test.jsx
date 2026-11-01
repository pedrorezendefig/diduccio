import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../theme/ThemeProvider'
import Sidebar from '../components/Sidebar'

const CARGOS = ['Porteiro', 'Sindico', 'Auxiliar Administrativo', 'Desenvolvedor', 'Conselheiro']

const menuDo = (cargo) =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar active="Dashboard" setActive={() => {}} user={{ nome: 'Ana', cargo }} onLogout={() => {}} />
      </MemoryRouter>
    </ThemeProvider>
  )

describe('Menu: item Manual', () => {
  it.each(CARGOS)('o %s vê o item Manual no menu', (cargo) => {
    menuDo(cargo)
    expect(screen.getByRole('button', { name: 'Manual' })).toBeInTheDocument()
  })

  it('o item Processos saiu do menu', () => {
    menuDo('Porteiro')
    expect(screen.queryByRole('button', { name: 'Processos' })).not.toBeInTheDocument()
  })
})
