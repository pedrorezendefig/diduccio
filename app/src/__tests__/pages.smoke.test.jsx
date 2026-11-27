import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";

import Dashboard from "../pages/Dashboard";
import Unidades from "../pages/Unidades";
import Moradores from "../pages/Moradores";
import Vagas from "../pages/Vagas";
import Festas from "../pages/Festas";
import Churrasqueira from "../pages/Churrasqueira";
import Mudancas from "../pages/Mudancas";
import Calendario from "../pages/Calendario";
import Aprovacao from "../pages/Aprovacao";
import Piscina from "../pages/Piscina";
import Comunicado from "../pages/Comunicado";
import Patrimonio from "../pages/Patrimonio";
import Encomendas from "../pages/Encomendas";
import Entregas from "../pages/Entregas";
import Confirmacao from "../pages/Confirmacao";
import AppDoMorador from "../pages/AppDoMorador";
import Assembleia from "../pages/Assembleia";
import Tarefas from "../pages/Tarefas";
import Agendamento from "../pages/Agendamento";
import Usuarios from "../pages/Usuarios";
import SelecaoUsuario from "../pages/SelecaoUsuario";
import Vitrine from "../pages/Vitrine";
import Sidebar from "../components/Sidebar";
import { ToastProvider } from "../ui/Toast";
import { ConfirmProvider } from "../ui/Confirm";

// SelecaoUsuario chama `entrar` de ../api/auth, que por sua vez importa o
// cliente Supabase — e este lança se as variáveis de ambiente não estiverem
// configuradas (não estão em teste). O smoke test só monta a tela, não faz
// login, então um mock vazio basta.
vi.mock("../api/auth", () => ({ entrar: vi.fn(), sair: vi.fn() }));

// Usuarios lê a lista via `listar` (Supabase). O smoke test só confere que a
// tela monta sem lançar — nenhum teste aqui precisa de dado real.
vi.mock("../api/db", () => ({
  listar: vi.fn(async () => []),
  listarResponsaveis: vi.fn(async () => []),
  lerNotas: vi.fn(async () => ""),
  salvarNotas: vi.fn(async () => ({ success: true })),
}));

const USUARIO = {
  id: "dev",
  nome: "Lucas Sampaio",
  cargo: "Desenvolvedor",
  email: "lucas@vitta.test",
};

// [nome, Componente, props]
const PAGINAS = [
  ["Dashboard", Dashboard, { user: USUARIO }],
  ["Unidades", Unidades, { user: USUARIO }],
  ["Moradores", Moradores, { user: USUARIO }],
  ["Vagas", Vagas, { user: USUARIO }],
  ["Festas", Festas, { user: USUARIO }],
  ["Churrasqueira", Churrasqueira, { user: USUARIO }],
  ["Mudancas", Mudancas, { user: USUARIO }],
  ["Calendario", Calendario, { user: USUARIO }],
  ["Aprovacao", Aprovacao, { user: USUARIO }],
  ["Piscina", Piscina, { user: USUARIO }],
  ["Comunicado", Comunicado, { user: USUARIO }],
  ["Patrimonio", Patrimonio, { user: USUARIO }],
  ["Encomendas", Encomendas, { user: USUARIO }],
  ["Entregas", Entregas, { user: USUARIO }],
  ["Confirmacao", Confirmacao, { user: USUARIO }],
  ["AppDoMorador", AppDoMorador, {}],
  ["Assembleia", Assembleia, { user: USUARIO }],
  ["Tarefas", Tarefas, { user: USUARIO }],
  ["Agendamento", Agendamento, { user: USUARIO }],
  ["Usuarios", Usuarios, { user: USUARIO, onLogout: () => {} }],
  ["SelecaoUsuario", SelecaoUsuario, { onSelectUser: () => {} }],
  ["Vitrine", Vitrine, {}],
  // A Sidebar não é página, mas a Task 2 altera o import dela e nada mais a cobre.
  ["Sidebar", Sidebar, {
    active: "Dashboard",
    setActive: () => {},
    user: USUARIO,
    onLogout: () => {},
  }],
];

function Envolver({ children }) {
  // Mesma pilha de providers do main.jsx: a Vitrine usa useToast e useConfirm.
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter>{children}</MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  // O backend é Google Apps Script e não é determinístico. Nenhum teste toca a rede.
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => [],
    text: async () => "[]",
  }));
  sessionStorage.setItem("usuarioLogado", JSON.stringify(USUARIO));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

describe("todas as páginas montam sem lançar", () => {
  it.each(PAGINAS)("%s monta", (_nome, Componente, props) => {
    expect(() =>
      render(
        <Envolver>
          <Componente {...props} />
        </Envolver>
      )
    ).not.toThrow();
  });
});
