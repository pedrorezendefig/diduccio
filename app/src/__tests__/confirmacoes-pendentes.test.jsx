import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider } from "../ui/Toast";
import { ConfirmProvider } from "../ui/Confirm";
import { prontosParaRetirar, prontoHa } from "../lib/confirmacoes";

/**
 * Confirmações → Pendentes (pronto, esperando o morador buscar) e Concluídas
 * (pedido do usuário, 12/11/2026).
 */
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../api/db", () => ({ listar: vi.fn(async () => []), criar: vi.fn(), editar: vi.fn() }));
vi.mock("../api/supabase", () => ({ supabase: { rpc, storage: { from: () => ({ createSignedUrl: vi.fn() }) } } }));
import Confirmacao from "../pages/Confirmacao";

const HORA = 3_600_000;
const TAGS = [
  { id: 5, placa: "TST1C23", modelo: "Gol", cor: "Preto", tag: "portaria", desde: new Date(Date.now() - 50 * HORA).toISOString(), bloco: 1, unidade: 101 },
  { id: 6, placa: "ABC1D23", modelo: "Uno", cor: "Branco", tag: "pedida", desde: new Date().toISOString(), bloco: 2, unidade: 202 },
];
const SOLICITACOES = [
  { id: 19, tipo: "piscina", status: "pronta", quem: "Ana Lima", bloco: 3, unidade: 303, resumo: "Marina Moraes", ultima_msg_em: new Date(Date.now() - 3 * HORA).toISOString(), nao_lida: false },
  { id: 20, tipo: "obra", status: "aberta", quem: "João", bloco: 4, unidade: 404, resumo: "", ultima_msg_em: new Date().toISOString(), nao_lida: true },
];
const respostas = {
  tags_a_entregar: () => ({ data: TAGS, error: null }),
  solicitacoes_para_responder: () => ({ data: SOLICITACOES, error: null }),
  solicitacoes_finalizadas: () => ({ data: [{ id: 7, tipo: "piscina", status: "concluida", quem: "Paula", bloco: 5, unidade: 505, fechada_em: new Date().toISOString(), resumo: "Paula" }], error: null }),
};
beforeEach(() => rpc.mockReset().mockImplementation(async (nome) => respostas[nome]?.() ?? { data: null, error: null }));

const montar = (rota) => render(
  <MemoryRouter initialEntries={[rota]}>
    <ThemeProvider><ToastProvider><ConfirmProvider>
      <Confirmacao user={{ nome: "Síndico", cargo: "Sindico" }} />
    </ConfirmProvider></ToastProvider></ThemeProvider>
  </MemoryRouter>
);

describe("a regra dos pendentes", () => {
  it("só a TAG na portaria e a solicitação pronta, do mais antigo para o mais novo", () => {
    const itens = prontosParaRetirar({ tags: TAGS, solicitacoes: SOLICITACOES });
    expect(itens.map((i) => i.chave)).toEqual(["tag-5", "sol-19"]);
    expect(itens[0]).toMatchObject({ titulo: "TAG do carro", detalhe: "TST1C23 · Gol, Preto", acao: "Colada" });
    expect(itens[1]).toMatchObject({ titulo: "Cartão da piscina Nº 19", quem: "Ana Lima", acao: "Concluir" });
    expect(prontosParaRetirar()).toEqual([]);
  });

  it("o texto da espera", () => {
    const agora = Date.parse("2026-11-12T12:00:00Z");
    expect(prontoHa("2026-11-12T11:30:00Z", agora)).toBe("pronto agora");
    expect(prontoHa("2026-11-12T07:00:00Z", agora)).toBe("pronto há 5 h");
    expect(prontoHa("2026-11-09T12:00:00Z", agora)).toBe("pronto há 3 dias");
    expect(prontoHa(null, agora)).toBe("pronto");
  });
});

describe("as abas novas", () => {
  it("Pendentes conta e lista; não entra no 'esperando a administração'", async () => {
    montar("/confirmacao?fila=pendentes");
    expect(await screen.findByRole("tab", { name: /Pendentes/ })).toHaveTextContent("2");
    expect(screen.getByText("TAG do carro")).toBeInTheDocument();
    expect(screen.getByText("Cartão da piscina Nº 19")).toBeInTheDocument();
    expect(screen.getByText("pronto há 2 dias")).toBeInTheDocument();
    // Só a obra aberta espera a administração; os prontos esperam o morador.
    expect(screen.getByText(/1 pedido esperando a administração/)).toBeInTheDocument();
  });

  it("Colada marca a TAG; Concluir conclui a solicitação (com confirmação)", async () => {
    const user = userEvent.setup();
    montar("/confirmacao?fila=pendentes");
    await screen.findByText("TAG do carro");
    const [colada] = screen.getAllByRole("button", { name: "Colada" });
    await user.click(colada);
    const pergunta = await screen.findByRole("dialog");
    expect(pergunta).toHaveTextContent("A TAG foi colada?");
    await user.click(within(pergunta).getByRole("button", { name: "Sim, foi colada" }));
    expect(rpc).toHaveBeenCalledWith("marcar_tag", { p_veiculo_id: 5, p_situacao: "colada" });

    await user.click(screen.getByRole("button", { name: "Concluir" }));
    const final = await screen.findByRole("dialog");
    expect(final).toHaveTextContent("Tem certeza que quer finalizar o chamado?");
    expect(final).toHaveTextContent("Cartão da piscina Nº 19 · Bl 3 · 303, Ana Lima");
    await user.click(within(final).getByRole("button", { name: "Sim, finalizar" }));
    expect(rpc).toHaveBeenCalledWith("mudar_situacao_da_solicitacao", { p_id: 19, p_status: "concluida", p_motivo: null });
  });

  it("vazio: explica o que aparece ali", async () => {
    respostas.tags_a_entregar = () => ({ data: [], error: null });
    respostas.solicitacoes_para_responder = () => ({ data: [], error: null });
    montar("/confirmacao?fila=pendentes");
    expect(await screen.findByText("Nada esperando o morador buscar")).toBeInTheDocument();
    respostas.tags_a_entregar = () => ({ data: TAGS, error: null });
    respostas.solicitacoes_para_responder = () => ({ data: SOLICITACOES, error: null });
  });

  it("Concluídas mostra as solicitações que fecharam", async () => {
    montar("/confirmacao?fila=concluidas");
    expect(await screen.findByRole("tab", { name: /Concluídas/ })).toHaveAttribute("aria-selected", "true");
    expect((await screen.findAllByText("Paula")).length).toBeGreaterThan(0);
    expect(rpc).toHaveBeenCalledWith("solicitacoes_finalizadas");
  });
});

describe("os botões de cada tipo e a pergunta antes de encerrar (0110)", () => {
  it("Obra: sem Pronto nem Concluir; Aprovar pergunta, porque encerra", async () => {
    const user = userEvent.setup();
    respostas.detalhe_da_solicitacao = () => ({ data: { id: 20, tipo: "obra", status: "aberta", dados: {}, mensagens: [] }, error: null });
    montar("/confirmacao?fila=solicitacoes");
    await user.click(await screen.findByRole("button", { name: /Obra ou reforma Nº 20/ }));
    expect(await screen.findByRole("button", { name: "Aprovar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar pronto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Concluir" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recusar" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aprovar" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Voltar" }));
    expect(rpc).not.toHaveBeenCalledWith("mudar_situacao_da_solicitacao", expect.anything());
    await user.click(screen.getByRole("button", { name: "Aprovar" }));
    const d = await screen.findByRole("dialog");
    expect(d).toHaveTextContent("Aprovar e encerrar o chamado?");
    await user.click(within(d).getByRole("button", { name: "Sim, aprovar" }));
    expect(rpc).toHaveBeenCalledWith("mudar_situacao_da_solicitacao", { p_id: 20, p_status: "aprovada", p_motivo: null });
  });

  it("Cartão da piscina: continua com Pronto e Concluir, e Concluir pergunta", async () => {
    const user = userEvent.setup();
    respostas.detalhe_da_solicitacao = () => ({ data: { id: 19, tipo: "piscina", status: "pronta", dados: {}, mensagens: [] }, error: null });
    montar("/confirmacao?fila=solicitacoes");
    await user.click(await screen.findByRole("button", { name: /Cartão da piscina Nº 19/ }));
    await user.click(await screen.findByRole("button", { name: "Concluir" }));
    const d = await screen.findByRole("dialog");
    expect(d).toHaveTextContent("Tem certeza que quer finalizar o chamado?");
    await user.click(within(d).getByRole("button", { name: "Sim, finalizar" }));
    expect(rpc).toHaveBeenCalledWith("mudar_situacao_da_solicitacao", { p_id: 19, p_status: "concluida", p_motivo: null });
  });
});

describe("Reclamações e sugestões (0110)", () => {
  const RECL = { id: 31, tipo: "reclamacao", status: "registrada", quem: "Ana", bloco: 1, unidade: 101, resumo: "Barulho", ultima_msg_em: new Date().toISOString(), nao_lida: false, tarefa_id: null };
  it("ficam na aba deles, fora de Solicitações; Encerrar e Mandar para Tarefas, sem Aprovar nem Recusar", async () => {
    const user = userEvent.setup();
    respostas.solicitacoes_para_responder = () => ({ data: [...SOLICITACOES, RECL], error: null });
    respostas.detalhe_da_solicitacao = () => ({ data: { id: 31, tipo: "reclamacao", status: "registrada", dados: { assunto: "Barulho" }, mensagens: [] }, error: null });
    respostas.mandar_para_tarefas = () => ({ data: 900, error: null });
    montar("/confirmacao?fila=reclamacoes");
    expect(await screen.findByRole("tab", { name: /Reclamações e sugestões/ })).toHaveTextContent("1");
    await user.click(await screen.findByRole("button", { name: /Reclamação Nº 31/ }));
    expect(await screen.findByRole("button", { name: "Encerrar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recusar" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Mandar para Tarefas/ }));
    expect(rpc).toHaveBeenCalledWith("mandar_para_tarefas", { p_id: 31 });
    respostas.solicitacoes_para_responder = () => ({ data: SOLICITACOES, error: null });
  });

  it("a aba Solicitações não mostra a reclamação", async () => {
    respostas.solicitacoes_para_responder = () => ({ data: [...SOLICITACOES, RECL], error: null });
    montar("/confirmacao?fila=solicitacoes");
    await screen.findByRole("button", { name: /Obra ou reforma Nº 20/ });
    expect(screen.queryByRole("button", { name: /Reclamação Nº 31/ })).not.toBeInTheDocument();
    respostas.solicitacoes_para_responder = () => ({ data: SOLICITACOES, error: null });
  });

  it("já mandada: mostra Nas Tarefas no lugar do botão", async () => {
    const user = userEvent.setup();
    respostas.solicitacoes_para_responder = () => ({ data: [{ ...RECL, tarefa_id: 900 }], error: null });
    respostas.detalhe_da_solicitacao = () => ({ data: { id: 31, tipo: "reclamacao", status: "registrada", dados: {}, mensagens: [] }, error: null });
    montar("/confirmacao?fila=reclamacoes");
    await user.click(await screen.findByRole("button", { name: /Reclamação Nº 31/ }));
    expect(await screen.findByText("Nas Tarefas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mandar para Tarefas/ })).not.toBeInTheDocument();
    respostas.solicitacoes_para_responder = () => ({ data: SOLICITACOES, error: null });
  });
});

describe("modo foco: Falta concluir", () => {
  it("o cartão lê as TAGs e mostra os prontos com o atalho para os pendentes", () => {
    const foco = readFileSync("src/pages/ModoFoco.jsx", "utf8");
    expect(foco).toContain('seguro(supabase.rpc("tags_a_entregar"))');
    expect(foco).toContain("pendentes: prontosParaRetirar({ tags: lista(tags), solicitacoes: lista(s) })");
    expect(foco).toContain("<h2>Falta concluir</h2>");
    expect(foco).toContain('navigate("/confirmacao?fila=pendentes")');
  });
});
