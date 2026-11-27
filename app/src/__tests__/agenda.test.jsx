import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../ui/Toast";
import { ConfirmProvider } from "../ui/Confirm";

/**
 * Agenda do condomínio (0100): o SQL lido como texto, as regras do
 * formulário e a tela. A prova com o banco de verdade é o
 * scripts/verificar-agenda.mjs.
 */
const { chamadas, dados } = vi.hoisted(() => ({ chamadas: [], dados: { eventos: [], feriados: [] } }));
vi.mock("../api/supabase", () => {
  const tabela = (nome) => {
    const q = {
      select() { return q; }, lte() { return q; }, gte() { return q; }, or() { return q; }, order() { return q; }, eq() { return q; },
      insert(l) { chamadas.push([nome, "insert", l]); return q; },
      update(l) { chamadas.push([nome, "update", l]); return q; },
      single: async () => ({ data: { id: 77 }, error: null }),
      then(ok, falha) { return Promise.resolve({ data: nome === "feriados" ? dados.feriados : dados.eventos, error: null }).then(ok, falha); },
    };
    return q;
  };
  return { supabase: { from: tabela, rpc: async () => ({ data: [{ bloco: 1 }, { bloco: 5 }, { bloco: 8 }], error: null }) } };
});

import Calendario from "../pages/Calendario";
import { errosDoEvento, linhaDoEvento } from "../api/agenda";

const base = { tipo: "falta_agua", titulo: "Limpeza das caixas", texto: "", inicio: "2026-11-13", fim: "", diaInteiro: false, horaInicio: "08:00", horaFim: "14:00", local: "", todos: false, blocos: [5, 1], avisar: true };

describe("o formulário", () => {
  it("o que vai para o banco", () => {
    expect(linhaDoEvento(base)).toEqual({ tipo: "falta_agua", titulo: "Limpeza das caixas", texto: null, inicio: "2026-11-13", fim: null, hora_inicio: "08:00", hora_fim: "14:00", local: null, blocos: [1, 5], avisar: true });
    expect(linhaDoEvento({ ...base, diaInteiro: true, todos: true })).toMatchObject({ hora_inicio: null, hora_fim: null, blocos: null });
  });
  it("o que falta", () => {
    expect(errosDoEvento(base)).toEqual({});
    expect(errosDoEvento({ ...base, titulo: "x" }).titulo).toBeTruthy();
    expect(errosDoEvento({ ...base, horaInicio: "" }).horaInicio).toBeTruthy();
    expect(errosDoEvento({ ...base, horaFim: "07:00" }).horaFim).toBeTruthy();
    expect(errosDoEvento({ ...base, fim: "2026-11-01" }).fim).toBeTruthy();
    expect(errosDoEvento({ ...base, blocos: [] }).blocos).toBeTruthy();
  });
});

const montar = () => render(<ToastProvider><ConfirmProvider><Calendario /></ConfirmProvider></ToastProvider>);

describe("a tela", () => {
  beforeEach(() => { chamadas.length = 0; dados.eventos = []; dados.feriados = []; });

  it("Novo evento: tipo, dia, horário, blocos e avisar; salva no banco", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "Novo evento" }));
    const modal = await screen.findByRole("dialog", { name: "Novo evento" });
    await user.click(within(modal).getByRole("radio", { name: "Falta de luz" }));
    await user.type(within(modal).getByLabelText("Título"), "Troca do transformador");
    await user.type(within(modal).getByLabelText("Das"), "10:00");
    await user.click(within(modal).getByRole("radio", { name: "Blocos escolhidos" }));
    await user.click(await within(modal).findByRole("button", { name: "Bloco 5" }));
    await user.click(within(modal).getByRole("switch", { name: /Avisar os moradores/ }));
    await user.click(within(modal).getByRole("button", { name: "Salvar evento" }));
    await waitFor(() => expect(chamadas.find((c) => c[1] === "insert")).toBeTruthy());
    expect(chamadas.find((c) => c[1] === "insert")[2]).toMatchObject({ tipo: "falta_luz", titulo: "Troca do transformador", hora_inicio: "10:00", blocos: [5], avisar: true });
  });

  it("sem título não salva e diz o que falta", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "Novo evento" }));
    const modal = await screen.findByRole("dialog", { name: "Novo evento" });
    await user.click(within(modal).getByRole("button", { name: "Salvar evento" }));
    expect(await within(modal).findByText(/Escreva o título/)).toBeInTheDocument();
    expect(chamadas.find((c) => c[1] === "insert")).toBeFalsy();
  });

  it("o evento no mês abre para editar; cancelar pede confirmação e marca cancelado (não apaga)", async () => {
    const user = userEvent.setup();
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    dados.eventos = [{ id: 3, tipo: "assembleia", titulo: "Assembleia geral", texto: null, inicio: hoje, fim: null, hora_inicio: "19:00:00", hora_fim: null, local: null, blocos: null, avisar: true, cancelado_em: null }];
    montar();
    await user.click(await screen.findByRole("button", { name: /Assembleia geral/ }));
    const modal = await screen.findByRole("dialog", { name: "Editar evento" });
    expect(within(modal).getByLabelText("Título")).toHaveValue("Assembleia geral");
    await user.click(within(modal).getByRole("button", { name: "Cancelar evento" }));
    const conf = await screen.findByRole("dialog", { name: /Cancelar "Assembleia geral"\?/ });
    await user.click(within(conf).getByRole("button", { name: "Cancelar evento" }));
    await waitFor(() => expect(chamadas.find((c) => c[1] === "update" && c[2].cancelado_em)).toBeTruthy());
  });
});
