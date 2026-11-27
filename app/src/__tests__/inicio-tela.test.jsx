import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider } from "../ui/Toast";
import { ConfirmProvider } from "../ui/Confirm";

/**
 * Início (para todos os cargos, com o botão grande do cargo) e Modo foco (os
 * pedidos do app um por vez, com as mesmas funções de Confirmações).
 */
const { rpc, assinar, navegar } = vi.hoisted(() => ({ rpc: vi.fn(), assinar: vi.fn(), navegar: vi.fn() }));
vi.mock("react-router-dom", async (orig) => ({ ...(await orig()), useNavigate: () => navegar }));
vi.mock("../api/db", () => ({
  listar: vi.fn(async (t) => (t === "UNIDADES" ? [{ id: 1504, bloco: 15, unidade: "04" }] : [])),
  listarChegadas: vi.fn(async ({ abertas } = {}) => (abertas ? [{ id: 1, nome: "Carlos Entregador", tipo: "entregador", horario_entrada: new Date().toISOString() }] : [])),
}));
vi.mock("../api/edge", () => ({ chamarEdgeFunction: vi.fn(async () => ({ ok: true, corpo: { dados: [] } })) }));
vi.mock("../api/supabase", () => ({
  supabase: { rpc, storage: { from: () => ({ createSignedUrl: assinar, upload: vi.fn() }) } },
}));

import Inicio from "../pages/Inicio";
import ModoFoco from "../pages/ModoFoco";

const HORA = 3_600_000;
const RESERVA = { id: 77, data_reserva: "2026-11-22", faltam: 19, espacos: "Salão de festas", valor: 100, morador: "Ricardo Alves Pontes", bloco: 15, unidade: "04", pedido_em: new Date(Date.now() - 60 * HORA).toISOString() };
const CADASTRO = { id: 5, nome: "Fernanda Lima Soares", vinculo: "Locatário", tipo: "Titular", bloco: 4, unidade: "305", pedido_em: new Date(Date.now() - 20 * HORA).toISOString() };

const respostas = {
  cadastros_para_aprovar: () => ({ data: [CADASTRO], error: null }),
  reservas_para_aprovar: () => ({ data: [RESERVA], error: null }),
  pedidos_veiculo_para_aprovar: () => ({ data: [], error: null }),
  solicitacoes_para_responder: () => ({ data: [], error: null }),
  moradores_no_app: () => ({ data: [], error: null }),
  detalhe_da_reserva: () => ({ data: { telefone: "21991025566", email: "r@x.com", comprovante: "reservas-morador/77/pix.jpg", livres: "Churrasqueira A", ocupados: "" }, error: null }),
  detalhe_do_cadastro: () => ({ data: { cpf: "***.1**", email: "f@x.com", email_confirmado_em: "2026-11-02", no_app: [], no_condominio: [] }, error: null }),
  aprovar_reserva: () => ({ data: null, error: null }),
};

const montar = (ui) => render(
  <MemoryRouter><ThemeProvider><ToastProvider><ConfirmProvider>{ui}</ConfirmProvider></ToastProvider></ThemeProvider></MemoryRouter>,
);

beforeEach(() => {
  navegar.mockReset();
  rpc.mockReset().mockImplementation(async (nome) => respostas[nome]?.() ?? { data: null, error: null });
  assinar.mockReset().mockResolvedValue({ data: { signedUrl: "https://assinada/pix.jpg" }, error: null });
});

describe("Início", () => {
  it("a administração vê o Modo foco com os pedidos do app esperando, e o botão leva até ele", async () => {
    montar(<Inicio user={{ nome: "Nayra Brito", cargo: "Auxiliar Administrativo" }} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Nayra\./);
    const botao = await screen.findByRole("button", { name: /Modo foco: 2 pedidos do app esperando/ });
    expect(botao).toHaveAccessibleName(/1 fora do prazo/);
    await userEvent.click(botao);
    expect(navegar).toHaveBeenCalledWith("/modo-foco");
    expect(screen.queryByLabelText("by VITTA")).not.toBeInTheDocument(); // o Diduccio não assina
  });

  it("clicar num dia de Próximos dias troca o cartão da esquerda para aquele dia", async () => {
    montar(<Inicio user={{ nome: "Nayra Brito", cargo: "Sindico" }} />);
    expect(await screen.findByRole("heading", { level: 2, name: "Hoje" })).toBeInTheDocument();
    const amanha = await screen.findByRole("button", { name: /^Amanhã:/ });
    await userEvent.click(amanha);
    expect(amanha).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { level: 2, name: "Amanhã" })).toBeInTheDocument();
    expect(screen.getByText(/Nada marcado para este dia/)).toBeInTheDocument();
  });

  it("a portaria vê Entradas e saídas no lugar do Modo foco, e não chama as filas da administração", async () => {
    montar(<Inicio user={{ nome: "Carlos", cargo: "Porteiro" }} />);
    // O botão grande é o primeiro; o cartão "Dentro do condomínio" tem um atalho com o mesmo nome.
    const [botao] = await screen.findAllByRole("button", { name: "Entradas e saídas" });
    expect(botao).toHaveClass("ini-botao");
    await waitFor(() => expect(screen.getByText("Carlos Entregador")).toBeInTheDocument());
    await userEvent.click(botao);
    expect(navegar).toHaveBeenCalledWith("/entregas");
    expect(rpc).not.toHaveBeenCalledWith("cadastros_para_aprovar");
    expect(screen.queryByText("Modo foco")).not.toBeInTheDocument();
  });

  it("o conselho vê a Assembleia", async () => {
    montar(<Inicio user={{ nome: "Marcelo", cargo: "Conselheiro" }} />);
    expect(await screen.findByRole("button", { name: "Assembleia" })).toHaveClass("ini-botao");
  });
});

describe("Modo foco", () => {
  it("começa pelo pedido mais antigo e aprova pela mesma função de Confirmações", async () => {
    montar(<ModoFoco />);
    // A reserva espera há 60 h, o cadastro há 20 h: a reserva vem primeiro.
    expect(await screen.findByRole("heading", { level: 2, name: /Salão de festas/ })).toBeInTheDocument();
    expect(screen.getByText("fora do prazo", { selector: ".foco-prazo" })).toBeInTheDocument();
    const aprovar = await screen.findByRole("button", { name: "Aprovar" });
    await waitFor(() => expect(aprovar).toBeEnabled());
    await userEvent.click(aprovar);
    expect(rpc).toHaveBeenCalledWith("aprovar_reserva", { p_id: 77 });
    // Sai a reserva, entra o cadastro.
    expect(await screen.findByRole("heading", { level: 2, name: /Fernanda Lima Soares/ }, { timeout: 2000 })).toBeInTheDocument();
  });

  it("pular manda o pedido para o fim da fila, e dá para desfazer", async () => {
    montar(<ModoFoco />);
    await screen.findByRole("heading", { level: 2, name: /Salão de festas/ });
    await userEvent.click(screen.getByRole("button", { name: "Pular" }));
    expect(await screen.findByRole("heading", { level: 2, name: /Fernanda Lima Soares/ }, { timeout: 2000 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Desfazer/ }));
    expect(await screen.findByRole("heading", { level: 2, name: /Salão de festas/ })).toBeInTheDocument();
  });
});
