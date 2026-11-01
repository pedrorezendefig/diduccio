# ROTAS.md
<!-- gerado por /snapshot; não editar à mão -->

Rotas de página do React Router do Diduccio, lidas de `app/src/App.jsx`. Toda rota de página é GET;
a coluna Cargos vem dos guards de `App.jsx` (nomes em `src/auth/permissions.js`).

## Entrada (`app/src/App.jsx`)

| Método | Rota | O que faz | Auth | Cargos |
|--------|------|-----------|------|--------|
| GET | `/login` | Tela SelecaoUsuario (`src/pages/SelecaoUsuario.jsx`) | ❌ | sem login |
| GET | `*` | Redireciona para `/login` | ❌ | sem login |

## Painel (`app/src/App.jsx`)

| Método | Rota | O que faz | Auth | Cargos |
|--------|------|-----------|------|--------|
| GET | `/dashboard` | Tela Dashboard (`src/pages/Dashboard.jsx`) | ✅ | todos |
| GET | `/manual/*` | Tela Manual (`src/pages/Manual.jsx`) | ✅ | todos |
| GET | `/processos` | Redireciona para `/manual/encomendas` | ✅ | todos |
| GET | `/entregas` | Tela Entregas (`src/pages/Entregas.jsx`) | ✅ | Porteiro, Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/assembleia` | Tela Assembleia (`src/pages/Assembleia.jsx`) | ✅ | Sindico, Auxiliar Administrativo, Desenvolvedor, Conselheiro |
| GET | `/unidades` | Tela Unidades (`src/pages/Unidades.jsx`) | ✅ | Porteiro, Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/moradores` | Tela Moradores (`src/pages/Moradores.jsx`) | ✅ | Porteiro, Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/vagas` | Tela Vagas (`src/pages/Vagas.jsx`) | ✅ | Porteiro, Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/festas` | Tela Festas (`src/pages/Festas.jsx`) | ✅ | Porteiro, Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/churrasqueira` | Tela Churrasqueira (`src/pages/Churrasqueira.jsx`) | ✅ | Porteiro, Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/mudancas` | Tela Mudancas (`src/pages/Mudancas.jsx`) | ✅ | Porteiro, Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/calendario` | Tela Calendario (`src/pages/Calendario.jsx`) | ✅ | Porteiro, Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/aprovacao` | Tela Aprovacao (`src/pages/Aprovacao.jsx`) | ✅ | Porteiro, Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/piscina` | Tela Piscina (`src/pages/Piscina.jsx`) | ✅ | Porteiro, Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/comunicado` | Tela Comunicado (`src/pages/Comunicado.jsx`) | ✅ | Porteiro, Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/patrimonio` | Tela Patrimonio (`src/pages/Patrimonio.jsx`) | ✅ | Porteiro, Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/encomendas` | Tela Encomendas (`src/pages/Encomendas.jsx`) | ✅ | Porteiro, Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/agendamento` | Tela Agendamento (`src/pages/Agendamento.jsx`) | ✅ | Porteiro, Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/tarefas` | Tela Tarefas (`src/pages/Tarefas.jsx`) | ✅ | Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/confirmacao` | Tela Confirmacao (`src/pages/Confirmacao.jsx`) | ✅ | Sindico, Auxiliar Administrativo, Desenvolvedor |
| GET | `/usuarios` | Tela Usuarios (`src/pages/Usuarios.jsx`) | ✅ | Desenvolvedor |
| GET | `/vitrine` | Tela Vitrine (`src/pages/Vitrine.jsx`) | ✅ | Desenvolvedor |
| GET | `/` | Redireciona para `/dashboard` | ✅ | todos |
| GET | `*` | Redireciona para `/dashboard` | ✅ | todos |

---

**Totais:** 26 rotas em 2 grupos, 92% exigem login.
