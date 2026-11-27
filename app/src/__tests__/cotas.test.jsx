import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../ui/Toast";
import { ConfirmProvider } from "../ui/Confirm";

/**
 * Cotas extras (0101): o SQL lido como texto, as regras do formulário e a
 * tela. A prova com o banco de verdade é o scripts/verificar-cotas.mjs.
 */
const { chamadas, dados } = vi.hoisted(() => ({ chamadas: [], dados: { cotas: [], assembleias: [] } }));
vi.mock("../api/supabase", () => {
  const tabela = (nome) => {
    const q = {
      select() { return q; }, order() { return q; }, eq() { return q; },
      insert(l) { chamadas.push([nome, "insert", l]); return q; },
      update(l) { chamadas.push([nome, "update", l]); return q; },
      single: async () => ({ data: { id: 77 }, error: null }),
      then(ok, falha) { return Promise.resolve({ data: nome === "assembleias" ? dados.assembleias : dados.cotas, error: null }).then(ok, falha); },
    };
    return q;
  };
  return { supabase: { from: tabela } };
});

import CotasExtras from "../pages/CotasExtras";
import { errosDaCota, lerValor, linhaDaCota, parcelasPorExtenso, situacaoDaCota, somarMeses } from "../api/cotas";

const base = { titulo: "Pintura da fachada", descricao: "", valor: "150,00", parcelas: "10", primeiroMes: "2026-09", assembleiaId: "a1" };

describe("o formulário", () => {
  it("o que vai para o banco", () => {
    expect(linhaDaCota(base)).toEqual({ titulo: "Pintura da fachada", descricao: null, valor_parcela: 150, parcelas: 10, primeiro_mes: "2026-09-01", assembleia_id: "a1" });
    expect(linhaDaCota({ ...base, assembleiaId: "" }).assembleia_id).toBeNull();
  });
  it("lê o valor do jeito brasileiro", () => {
    expect(lerValor("1.500,50")).toBe(1500.5);
    expect(lerValor("R$ 80")).toBe(80);
    expect(lerValor("1.500")).toBe(1500);
    expect(lerValor("")).toBeNaN();
  });
  it("o que falta", () => {
    expect(errosDaCota(base)).toEqual({});
    expect(errosDaCota({ ...base, titulo: "x" }).titulo).toBeTruthy();
    expect(errosDaCota({ ...base, valor: "0" }).valor).toBeTruthy();
    expect(errosDaCota({ ...base, parcelas: "121" }).parcelas).toBeTruthy();
    expect(errosDaCota({ ...base, parcelas: "2.5" }).parcelas).toBeTruthy();
    expect(errosDaCota({ ...base, primeiroMes: "" }).primeiroMes).toBeTruthy();
  });
  it("a parcela do mês e a situação", () => {
    const c = { primeiro_mes: "2026-09-01", parcelas: 10, encerrado_em: null };
    expect(somarMeses("2026-09", 9)).toBe("2027-06");
    expect(situacaoDaCota(c, "2026-11")).toMatchObject({ chave: "ativa", atual: 3 });
    expect(parcelasPorExtenso(c, "2026-11")).toBe("3 de 10 (set/26 a jun/27)");
    expect(parcelasPorExtenso(c, "2026-07")).toBe("10 (set/26 a jun/27)");
    expect(situacaoDaCota(c, "2027-07").chave).toBe("terminou");
    expect(situacaoDaCota({ ...c, encerrado_em: "2026-10-02" }, "2026-11").chave).toBe("encerrada");
  });
});

const montar = () => render(<ToastProvider><ConfirmProvider><CotasExtras /></ConfirmProvider></ToastProvider>);

describe("a tela", () => {
  beforeEach(() => {
    chamadas.length = 0;
    dados.cotas = [];
    dados.assembleias = [
      { id: "a1", titulo: "Assembleia Geral Extraordinária", data_assembleia: "2026-06-08" },
      { id: "a2", titulo: "Assembleia Geral Ordinária", data_assembleia: "2026-03-14",
        decisoes: JSON.stringify(["Aprovada a pintura da fachada em 10 parcelas", "Aprovada a troca do portão"]) },
    ];
  });

  it("Nova cota: valor, parcelas, mês e a assembleia escolhida da lista; mostra o total e publica", async () => {
    const user = userEvent.setup();
    montar();
    await user.click((await screen.findAllByRole("button", { name: "Nova cota" }))[0]);
    const modal = await screen.findByRole("dialog", { name: "Nova cota extra" });
    await user.type(within(modal).getByLabelText("Título"), "Pintura da fachada");
    await user.type(within(modal).getByLabelText(/Valor por parcela/), "150,00");
    await user.type(within(modal).getByLabelText("Parcelas"), "10");
    const mes = within(modal).getByLabelText("1ª parcela em");
    await user.clear(mes);
    await user.type(mes, "2026-09");
    expect(within(modal).getByText(/Total por apartamento/)).toHaveTextContent("R$ 1.500,00, de setembro de 2026 a junho de 2027");
    await user.click(within(modal).getByRole("button", { name: /Assembleia que aprovou/ }));
    const lista = within(modal).getByRole("listbox");
    expect(within(lista).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Sem assembleia ligada", "Assembleia Geral Extraordinária08/06/2026", "Assembleia Geral Ordinária14/03/2026",
    ]);
    await user.type(within(modal).getByLabelText("Buscar assembleia"), "x");
    expect(within(lista).queryByRole("option", { name: "Sem assembleia ligada" })).toBeNull();
    await user.clear(within(modal).getByLabelText("Buscar assembleia"));
    await user.type(within(modal).getByLabelText("Buscar assembleia"), "ordin");
    await user.click(within(modal).getByRole("option", { name: /Ordinária/ }));
    expect(within(modal).getByRole("button", { name: /Assembleia que aprovou/ })).toHaveTextContent("Assembleia Geral Ordinária, 14/03/2026");
    const ata = within(modal).getByRole("region", { name: /Decisões da ata/ });
    expect(within(ata).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Aprovada a pintura da fachada em 10 parcelas", "Aprovada a troca do portão",
    ]);
    await user.click(within(ata).getByRole("button", { name: "Fechar as decisões da ata" }));
    expect(within(modal).queryByRole("region", { name: /Decisões da ata/ })).toBeNull();
    await user.click(within(modal).getByRole("button", { name: "Publicar cota" }));
    await waitFor(() => expect(chamadas.find((c) => c[1] === "insert")).toBeTruthy());
    expect(chamadas.find((c) => c[1] === "insert")[2]).toEqual({ titulo: "Pintura da fachada", descricao: null, valor_parcela: 150, parcelas: 10, primeiro_mes: "2026-09-01", assembleia_id: "a2" });
  });

  it("sem valor não publica e diz o que falta", async () => {
    const user = userEvent.setup();
    montar();
    await user.click((await screen.findAllByRole("button", { name: "Nova cota" }))[0]);
    const modal = await screen.findByRole("dialog", { name: "Nova cota extra" });
    await user.type(within(modal).getByLabelText("Título"), "Portões");
    await user.click(within(modal).getByRole("button", { name: "Publicar cota" }));
    expect(await within(modal).findByText(/Informe o valor/)).toBeInTheDocument();
    expect(chamadas.find((c) => c[1] === "insert")).toBeFalsy();
  });

  it("a cota ativa abre para corrigir; encerrar pede confirmação e marca encerrada (não apaga)", async () => {
    const user = userEvent.setup();
    dados.cotas = [{ id: 3, titulo: "Reforma do playground", descricao: null, valor_parcela: 80, parcelas: 120, primeiro_mes: "2026-10-01", ultimo_mes: "2036-09-01", assembleia_id: "a1", encerrado_em: null }];
    montar();
    await user.click(await screen.findByRole("button", { name: "Reforma do playground" }));
    const modal = await screen.findByRole("dialog", { name: "Corrigir cota extra" });
    expect(within(modal).getByLabelText(/Valor por parcela/)).toHaveValue("80,00");
    expect(within(modal).getByText(/Corrigir não avisa/)).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Encerrar cota" }));
    const conf = await screen.findByRole("dialog", { name: /Encerrar "Reforma do playground"\?/ });
    await user.click(within(conf).getByRole("button", { name: "Encerrar cota" }));
    await waitFor(() => expect(chamadas.find((c) => c[1] === "update" && c[2].encerrado_em)).toBeTruthy());
  });

  it("a encerrada abre só para ver", async () => {
    const user = userEvent.setup();
    dados.cotas = [{ id: 4, titulo: "Piscina", descricao: null, valor_parcela: 120, parcelas: 5, primeiro_mes: "2026-03-01", ultimo_mes: "2026-07-01", assembleia_id: null, encerrado_em: "2026-05-02T10:00:00Z" }];
    montar();
    expect(await screen.findByText("Encerrada")).toBeInTheDocument();
    expect(screen.getByText("Sem ata")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Piscina" }));
    const modal = await screen.findByRole("dialog", { name: "Piscina" });
    expect(within(modal).getByText(/foi encerrada e não aparece no app/)).toBeInTheDocument();
    expect(within(modal).queryByRole("button", { name: "Encerrar cota" })).toBeNull();
  });
});
