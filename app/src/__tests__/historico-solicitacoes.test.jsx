import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider } from "../ui/Toast";
import { ConfirmProvider } from "../ui/Confirm";
import { filtrarHistorico, historicoDeSolicitacoes, paginar } from "../lib/confirmacoes";

/** Confirmações → Histórico (12/11/2026): todas, 15 por página (ou 30), filtros. */
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../api/db", () => ({ listar: vi.fn(async () => []), criar: vi.fn(), editar: vi.fn() }));
vi.mock("../api/supabase", () => ({ supabase: { rpc, storage: { from: () => ({ createSignedUrl: vi.fn() }) } } }));
import Confirmacao from "../pages/Confirmacao";

const dia = (n) => new Date(Date.UTC(2026, 10, 1 + n, 12)).toISOString();
const ABERTAS = Array.from({ length: 20 }, (_, k) => ({
  id: 100 + k, tipo: k % 2 ? "obra" : "reclamacao", status: k % 2 ? "em_analise" : "registrada",
  quem: k === 19 ? "Marina Moraes" : `Pessoa ${k}`, bloco: k < 10 ? 1 : 2, unidade: 100 + (k % 3), ultima_msg_em: dia(k), resumo: "",
}));
const FECHADAS = [
  { id: 50, tipo: "corretor", status: "aprovada", quem: "Carlos", bloco: 3, unidade: 303, fechada_em: dia(25), resumo: "" },
  { id: 51, tipo: "piscina", status: "concluida", quem: "Ana", bloco: 3, unidade: 304, fechada_em: dia(0), resumo: "" },
];
beforeEach(() => rpc.mockReset().mockImplementation(async (nome) => ({
  solicitacoes_para_responder: { data: ABERTAS, error: null },
  solicitacoes_finalizadas: { data: FECHADAS, error: null },
  detalhe_da_solicitacao: { data: { id: 50, tipo: "corretor", status: "aprovada", dados: {}, mensagens: [] }, error: null },
}[nome] ?? { data: [], error: null })));

const montar = () => render(
  <MemoryRouter initialEntries={["/confirmacao?fila=historico"]}>
    <ThemeProvider><ToastProvider><ConfirmProvider>
      <Confirmacao user={{ nome: "Síndico", cargo: "Sindico" }} />
    </ConfirmProvider></ToastProvider></ThemeProvider>
  </MemoryRouter>
);

describe("as regras do histórico", () => {
  it("junta abertas e fechadas, da mais recente para a mais antiga", () => {
    const h = historicoDeSolicitacoes(ABERTAS, FECHADAS);
    expect(h).toHaveLength(22);
    expect(h[0].id).toBe(50);
    expect(h[1].id).toBe(119);
    expect(h[0].situacao.texto).toBe("Aprovada");
  });

  it("filtra por situação, nome, bloco e unidade", () => {
    const h = historicoDeSolicitacoes(ABERTAS, FECHADAS);
    expect(filtrarHistorico(h, { situacao: "registrada" })).toHaveLength(10);
    expect(filtrarHistorico(h, { busca: "marina" }).map((s) => s.id)).toEqual([119]);
    expect(filtrarHistorico(h, { bloco: "3" })).toHaveLength(2);
    expect(filtrarHistorico(h, { bloco: "1", unidade: "100" }).every((s) => s.bloco === 1 && s.unidade === 100)).toBe(true);
  });

  it("pagina de 15 em 15 (ou 30)", () => {
    const lista = Array.from({ length: 40 }, (_, k) => k);
    expect(paginar(lista, 1, 15)).toMatchObject({ pagina: 1, paginas: 3, de: 1, ate: 15 });
    expect(paginar(lista, 3, 15)).toMatchObject({ itens: lista.slice(30), de: 31, ate: 40 });
    expect(paginar(lista, 9, 30)).toMatchObject({ pagina: 2, paginas: 2 });
    expect(paginar([], 1, 15)).toMatchObject({ de: 0, ate: 0, paginas: 1 });
  });
});

describe("a aba Histórico", () => {
  it("15 por página, ‹ 1 2 ›, e 30 por página mostra tudo", async () => {
    const user = userEvent.setup();
    montar();
    expect(await screen.findByText("1–15 de 22")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /: ver conversa$/ })).toHaveLength(15);
    await user.click(screen.getByRole("button", { name: "Página 2" }));
    expect(screen.getByText("16–22 de 22")).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Solicitações por página" }), "30");
    expect(screen.getByText("1–22 de 22")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Página 2" })).not.toBeInTheDocument();
  });

  it("busca por nome e filtra por situação", async () => {
    const user = userEvent.setup();
    montar();
    await user.type(await screen.findByRole("textbox", { name: "Buscar por nome, nº ou apartamento" }), "Marina");
    expect(screen.getByText("1–1 de 1")).toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "Buscar por nome, nº ou apartamento" }));
    await user.click(within(screen.getByRole("group", { name: "Filtrar" })).getByRole("button", { name: /Aprovadas/ }));
    expect(screen.getByText("1–1 de 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Visita de corretor Nº 50/ })).toBeInTheDocument();
  });

  it("a linha abre a conversa só para leitura", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: /Visita de corretor Nº 50/ }));
    const modal = await screen.findByRole("dialog", { name: /Visita de corretor · Nº 50/ });
    expect(modal).toBeInTheDocument();
    expect(within(modal).queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
  });
});
