import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider, ConfirmProvider } from "../ui";

/**
 * A tela lê a lista de usuários via `listar` (Supabase) e escreve tudo — criar,
 * editar, resetar senha, excluir — via Edge Functions (`criar-usuario` e
 * `gerir-usuario`), chamadas por fetch direto autenticado pelo token de
 * `supabase.auth.getSession`. Nenhum dos dois toca rede de verdade aqui:
 * `listar` e `supabase` são substituídos por respostas fixas, e `confirm` (do
 * ConfirmProvider real) é resolvido clicando no botão do diálogo que ele
 * mesmo renderiza — não é mockado, porque o próprio ato de confirmar antes de
 * excluir é parte do que os testes verificam.
 */

const mockListar = vi.fn();
const mockUltimosAcessos = vi.fn();
vi.mock("../api/db", () => ({
  listar: (...a) => mockListar(...a),
  listarUltimosAcessos: (...a) => mockUltimosAcessos(...a),
}));

const mockGetSession = vi.fn();
vi.mock("../api/supabase", () => ({
  supabase: { auth: { getSession: (...a) => mockGetSession(...a) } },
}));

import Usuarios from "../pages/Usuarios";

const USUARIO_LOGADO = { id: "dev", nome: "Lucas", cargo: "Desenvolvedor", email: "lucas@vitta.test" };

const USUARIO_EXISTENTE = { id: 1, nome: "Usuário Existente", email: "existente@nr.com", cargo: "Porteiro" };

function montar(user = USUARIO_LOGADO) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Usuarios user={user} onLogout={() => {}} />
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Lista não-vazia por padrão: com zero usuários a tabela cai no EmptyState,
  // que tem seu PRÓPRIO botão "Novo usuário" — dois botões com o mesmo nome
  // acessível quebrariam getByRole nos testes que não são sobre a lista vazia.
  mockListar.mockResolvedValue([USUARIO_EXISTENTE]);
  mockUltimosAcessos.mockResolvedValue([]);
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "token-valido" } } });
});

async function abrirModalDeNovoUsuario(user) {
  montar();
  await screen.findByRole("heading", { name: "Usuários" });
  await user.click(screen.getByRole("button", { name: "Novo usuário" }));
}

async function abrirModalDeEdicao(user) {
  montar();
  await screen.findByRole("heading", { name: "Usuários" });
  await user.click(screen.getByRole("button", { name: `Editar ${USUARIO_EXISTENTE.nome}` }));
}

// O campo de senha fica dentro de um <span className="cad-senha"> (para
// caber o botão de mostrar/ocultar), e é nesse span — não vazio-labellable —
// que o Field pendura o `for` do rótulo. getByLabelText não acha o <input>
// por causa disso; um seletor direto contorna sem mexer no componente
// compartilhado só para o teste passar.
function campoSenha() {
  return document.querySelector('input[type="password"]');
}

describe("Último acesso", () => {
  it("mostra a data e hora de São Paulo, ligada pelo id do usuário", async () => {
    mockListar.mockResolvedValue([USUARIO_EXISTENTE, { id: 2, nome: "Outro", email: "o@nr.com", cargo: "Sindico" }]);
    mockUltimosAcessos.mockResolvedValue([{ id: 1, ultimo_acesso: "2026-11-03T14:05:00+00:00" }]);
    montar();
    expect(await screen.findByText("03/11/2026 11:05")).toBeTruthy();
    expect(screen.getByText("Nunca acessou")).toBeTruthy();
  });

  it("se só o último acesso falhar, a lista aparece mesmo assim", async () => {
    mockUltimosAcessos.mockRejectedValue(new Error("rede"));
    montar();
    expect(await screen.findByText(USUARIO_EXISTENTE.nome)).toBeTruthy();
    expect(await screen.findByText(/último acesso dos usuários/)).toBeTruthy();
  });
});

describe("Novo usuário: abrir o modal", () => {
  it('o botão "Novo usuário" abre o modal com os 5 cargos', async () => {
    const user = userEvent.setup();
    await abrirModalDeNovoUsuario(user);

    expect(screen.getByRole("dialog", { name: "Novo usuário" })).toBeInTheDocument();

    const select = screen.getByLabelText(/^Cargo/);
    const opcoes = [...select.querySelectorAll("option")].map((o) => o.value);
    expect(opcoes.sort()).toEqual(
      ["Auxiliar Administrativo", "Conselheiro", "Desenvolvedor", "Porteiro", "Sindico"].sort()
    );
  });
});

describe("Novo usuário: validação", () => {
  it("senha curta mostra erro e não chama a Edge Function", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn();
    await abrirModalDeNovoUsuario(user);

    await user.type(screen.getByLabelText(/^Nome/), "Ana Ribeiro");
    await user.type(screen.getByLabelText(/^Email/), "ana@nr.com");
    await user.type(campoSenha(), "Curta1");
    await user.click(screen.getByRole("button", { name: "Cadastrar" }));

    expect(await screen.findByText(/pelo menos 8 caracteres/)).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("senha longa SEM maiúscula também é recusada aqui", async () => {
    // O servidor exige maiúscula, minúscula e número. Validando só o tamanho, a
    // senha passava daqui e voltava recusada em inglês no meio do cadastro —
    // e a tradução dizia "faltam caracteres", que era falso.
    const user = userEvent.setup();
    globalThis.fetch = vi.fn();
    await abrirModalDeNovoUsuario(user);

    await user.type(screen.getByLabelText(/^Nome/), "Ana Ribeiro");
    await user.type(screen.getByLabelText(/^Email/), "ana@nr.com");
    await user.type(campoSenha(), "senhalongaminuscula1");
    await user.click(screen.getByRole("button", { name: "Cadastrar" }));

    const aviso = await screen.findByText(/maiúscula/i);
    expect(aviso).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("Novo usuário: cadastro com senha preenchida", () => {
  it("fecha o modal e recarrega a lista, sem exibir senha", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, id: "9", senhaProvisoria: undefined }),
      })
    );

    await abrirModalDeNovoUsuario(user);
    await user.type(screen.getByLabelText(/^Nome/), "Ana Ribeiro");
    await user.type(screen.getByLabelText(/^Email/), "ana@nr.com");
    await user.type(campoSenha(), "senhaSegura123");
    await user.click(screen.getByRole("button", { name: "Cadastrar" }));

    // Modal de cadastro some.
    expect(await screen.findByText("Ana Ribeiro cadastrado como Porteiro")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Novo usuário" })).not.toBeInTheDocument();
    // Nenhuma senha aparece na tela.
    expect(screen.queryByText("senhaSegura123")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Senha temporária gerada" })).not.toBeInTheDocument();

    // A lista recarrega.
    expect(mockListar).toHaveBeenCalledWith("usuarios");
    expect(mockListar).toHaveBeenCalledTimes(2); // montagem + recarga pós-cadastro

    const chamada = globalThis.fetch.mock.calls[0];
    expect(chamada[0]).toContain("/functions/v1/criar-usuario");
    expect(chamada[1].headers.Authorization).toBe("Bearer token-valido");
    const corpo = JSON.parse(chamada[1].body);
    expect(corpo).toEqual({
      nome: "Ana Ribeiro",
      email: "ana@nr.com",
      cpf: "",
      cargo: "Porteiro",
      senha: "senhaSegura123",
    });
  });
});

describe("Novo usuário: cadastro com senha vazia", () => {
  it("exibe a senha gerada pelo servidor com botão de copiar", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, id: "10", senhaProvisoria: "Xk7#mPq2" }),
      })
    );

    await abrirModalDeNovoUsuario(user);
    await user.type(screen.getByLabelText(/^Nome/), "Bruno Alves");
    await user.type(screen.getByLabelText(/^Email/), "bruno@nr.com");
    await user.click(screen.getByRole("button", { name: "Cadastrar" }));

    expect(await screen.findByText("Xk7#mPq2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copiar/ })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Senha temporária gerada" })).toBeInTheDocument();

    // O corpo enviado não tem a chave "senha": string vazia vira `undefined`
    // e some do JSON, sinal para o servidor gerar a senha.
    const corpo = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(corpo).not.toHaveProperty("senha");
  });
});

describe("Novo usuário: erro do servidor", () => {
  it("erro 403 mostra mensagem em português, não o código", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: "Forbidden" }),
      })
    );

    await abrirModalDeNovoUsuario(user);
    await user.type(screen.getByLabelText(/^Nome/), "Ana Ribeiro");
    await user.type(screen.getByLabelText(/^Email/), "ana@nr.com");
    await user.click(screen.getByRole("button", { name: "Cadastrar" }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Só síndico ou desenvolvedor podem cadastrar usuários.");
    expect(aviso).not.toHaveTextContent("403");
    // O modal continua aberto: não houve cadastro.
    expect(screen.getByRole("dialog", { name: "Novo usuário" })).toBeInTheDocument();
  });
});

describe("Editar usuário", () => {
  it('chama gerir-usuario com acao "editar" e recarrega a lista', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      })
    );

    await abrirModalDeEdicao(user);
    expect(screen.getByRole("dialog", { name: /Editar/ })).toBeInTheDocument();

    const campoNome = screen.getByLabelText(/^Nome/);
    await user.clear(campoNome);
    await user.type(campoNome, "Nome Corrigido");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Nome Corrigido atualizado")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /Editar/ })).not.toBeInTheDocument();

    // A lista recarrega depois da edição.
    expect(mockListar).toHaveBeenCalledTimes(2); // montagem + recarga pós-edição

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const chamada = globalThis.fetch.mock.calls[0];
    expect(chamada[0]).toContain("/functions/v1/gerir-usuario");
    expect(chamada[1].headers.Authorization).toBe("Bearer token-valido");
    const corpo = JSON.parse(chamada[1].body);
    expect(corpo).toEqual({
      acao: "editar",
      id: USUARIO_EXISTENTE.id,
      nome: "Nome Corrigido",
      cargo: USUARIO_EXISTENTE.cargo,
      email: USUARIO_EXISTENTE.email,
      cpf: "",
    });
  });

  it("preenchendo nova senha também chama resetar-senha, numa segunda requisição", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      })
    );

    await abrirModalDeEdicao(user);
    await user.type(campoSenha(), "novaSenhaSegura1");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText(/atualizado e senha alterada/)).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    const corpoEditar = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(corpoEditar.acao).toBe("editar");

    const corpoSenha = JSON.parse(globalThis.fetch.mock.calls[1][1].body);
    expect(corpoSenha).toEqual({
      acao: "resetar-senha",
      id: USUARIO_EXISTENTE.id,
      senha: "novaSenhaSegura1",
    });
  });
});

describe("Editar usuário: validação de senha", () => {
  it("nova senha curta mostra erro e não chama a Edge Function", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn();

    await abrirModalDeEdicao(user);
    await user.type(campoSenha(), "Curta1");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText(/pelo menos 8 caracteres/)).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("Editar usuário: erro do servidor", () => {
  it("erro 403 mostra mensagem em português, não o código", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: "Forbidden" }),
      })
    );

    await abrirModalDeEdicao(user);
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Só síndico ou desenvolvedor podem gerenciar usuários.");
    expect(aviso).not.toHaveTextContent("403");
    // O modal continua aberto: a edição não foi aplicada, e a lista não recarrega.
    expect(screen.getByRole("dialog", { name: /Editar/ })).toBeInTheDocument();
    expect(mockListar).toHaveBeenCalledTimes(1); // só a montagem
  });
});

describe("Gerar senha temporária avulsa", () => {
  it("pede confirmação, chama resetar-senha e exibe a senha gerada", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      })
    );

    montar();
    await screen.findByRole("heading", { name: "Usuários" });
    await user.click(
      screen.getByRole("button", { name: `Gerar senha temporária para ${USUARIO_EXISTENTE.nome}` })
    );

    // O ConfirmProvider real abre um diálogo; nada é chamado antes de confirmar.
    expect(await screen.findByText(/Gerar nova senha/)).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Gerar senha" }));

    expect(await screen.findByRole("dialog", { name: "Senha temporária gerada" })).toBeInTheDocument();

    const corpo = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(corpo.acao).toBe("resetar-senha");
    expect(corpo.id).toBe(USUARIO_EXISTENTE.id);
    expect(typeof corpo.senha).toBe("string");
    expect(corpo.senha.length).toBeGreaterThanOrEqual(8);
  });
});

describe("Excluir usuário", () => {
  it("pede confirmação antes de excluir", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn();

    montar();
    await screen.findByRole("heading", { name: "Usuários" });
    await user.click(screen.getByRole("button", { name: `Excluir ${USUARIO_EXISTENTE.nome}` }));

    expect(await screen.findByText(/Excluir o usuário/)).toBeInTheDocument();
    // Nada foi excluído ainda: sem confirmação, nenhuma chamada de rede.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("confirmando, chama gerir-usuario com acao excluir e recarrega a lista", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      })
    );

    montar();
    await screen.findByRole("heading", { name: "Usuários" });
    await user.click(screen.getByRole("button", { name: `Excluir ${USUARIO_EXISTENTE.nome}` }));
    await screen.findByText(/Excluir o usuário/);
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    expect(await screen.findByText(`${USUARIO_EXISTENTE.nome} foi removido`)).toBeInTheDocument();
    expect(mockListar).toHaveBeenCalledTimes(2); // montagem + recarga pós-exclusão

    const chamada = globalThis.fetch.mock.calls[0];
    expect(chamada[0]).toContain("/functions/v1/gerir-usuario");
    const corpo = JSON.parse(chamada[1].body);
    expect(corpo).toEqual({ acao: "excluir", id: USUARIO_EXISTENTE.id });
  });

  it("tentar excluir a si mesmo é bloqueado sem chamar a Edge Function", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn();

    // O usuário logado é o próprio USUARIO_EXISTENTE da lista.
    mockListar.mockResolvedValue([USUARIO_EXISTENTE]);
    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <ConfirmProvider>
              <Usuarios
                user={{ id: USUARIO_EXISTENTE.id, email: USUARIO_EXISTENTE.email, cargo: "Porteiro" }}
                onLogout={() => {}}
              />
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
    await screen.findByRole("heading", { name: "Usuários" });
    await user.click(screen.getByRole("button", { name: `Excluir ${USUARIO_EXISTENTE.nome}` }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Você não pode excluir a própria conta");
    // Nem chega a abrir o diálogo de confirmação, nem chama rede.
    expect(screen.queryByText(/Excluir o usuário/)).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
