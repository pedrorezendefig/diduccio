import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, ConfirmProvider } from "../ui";
import {
  acharPorCpf, acharPorPlaca, esperadasHoje, paraGravar, problemasDaTemporada, situacaoNaTela, soPlaca,
} from "../lib/temporada";
import { hojeEmBrasilia } from "../lib/portaria";

/**
 * Temporada na portaria (0091): a administração libera o hóspede antes, a
 * portaria confere pela placa. Regra, janela, aviso na chegada e o banco.
 */

const HOJE = "2026-11-05";

describe("as regras", () => {
  it("a situação na tela sai do gravado e de hoje", () => {
    expect(situacaoNaTela({ situacao: "agendada", entrada: HOJE, saida: "2026-11-10" }, HOJE)).toBe("chega_hoje");
    expect(situacaoNaTela({ situacao: "agendada", entrada: "2026-11-03", saida: "2026-11-10" }, HOJE)).toBe("liberada");
    expect(situacaoNaTela({ situacao: "agendada", entrada: "2026-11-12", saida: "2026-11-15" }, HOJE)).toBe("proxima");
    expect(situacaoNaTela({ situacao: "hospedado", entrada: "2026-11-01", saida: HOJE }, HOJE)).toBe("sai_hoje");
    expect(situacaoNaTela({ situacao: "hospedado", entrada: "2026-11-01", saida: "2026-11-04" }, HOJE)).toBe("encerrada");
    expect(situacaoNaTela({ situacao: "cancelada", entrada: HOJE, saida: HOJE }, HOJE)).toBe("cancelada");
  });

  it("a placa casa sem traço e só nas liberações de hoje", () => {
    const lista = [
      { id: 1, situacao: "agendada", entrada: HOJE, saida: "2026-11-10", veiculos: [{ placa: "ABC1D23" }] },
      { id: 2, situacao: "agendada", entrada: "2026-11-20", saida: "2026-11-22", veiculos: [{ placa: "XYZ9K88" }] },
      { id: 3, situacao: "cancelada", entrada: HOJE, saida: HOJE, veiculos: [{ placa: "QQQ1A11" }] },
    ];
    expect(soPlaca("abc-1d23")).toBe("ABC1D23");
    expect(acharPorPlaca(lista, "abc-1d23", HOJE).map((x) => x.temporada.id)).toEqual([1]);
    expect(acharPorPlaca(lista, "XYZ9K88", HOJE)).toEqual([]); // ainda não começou
    expect(acharPorPlaca(lista, "QQQ1A11", HOJE)).toEqual([]); // cancelada
    expect(esperadasHoje(lista, HOJE).map((t) => t.id)).toEqual([1]);
  });

  it("o CPF acha a liberação de hoje, só com 11 dígitos", () => {
    const lista = [{ id: 7, situacao: "agendada", entrada: HOJE, saida: HOJE, cpf: "12345678909", veiculos: [] }];
    expect(acharPorCpf(lista, "123.456.789-09", HOJE).map((x) => x.temporada.id)).toEqual([7]);
    expect(acharPorCpf(lista, "1234567", HOJE)).toEqual([]);
    expect(problemasDaTemporada({ id_unidade: 1, entrada: HOJE, saida: HOJE, hospede: "Ana", cpf: "123.4", proprietario: "Marcos", comCarro: false }))
      .toEqual({ cpf: "O CPF precisa ter 11 dígitos." });
    expect(paraGravar({ id_unidade: 1, entrada: HOJE, saida: HOJE, hospede: "Ana", cpf: "123.456.789-09", comCarro: false }).cpf)
      .toBe("12345678909");
  });

  it("o cadastro pede unidade, período coerente, hóspede, CPF dele e placa de 7", () => {
    const e = problemasDaTemporada({ comCarro: true, veiculos: [{ placa: "ABC" }], entrada: "2026-11-10", saida: "2026-11-05" });
    expect(Object.keys(e).sort()).toEqual(["cpf", "hospede", "id_unidade", "proprietario", "saida", "veiculos"]);
    expect(e.cpf).toBe("Informe o CPF do hóspede responsável.");
    expect(problemasDaTemporada({ id_unidade: 1, entrada: HOJE, saida: HOJE, hospede: "Ana", cpf: "12345678909", proprietario: "Marcos", comCarro: false })).toEqual({});
  });

  it("acompanhante precisa de nome; o CPF dele é opcional, mas com 11 dígitos", () => {
    const base = { id_unidade: 1, entrada: HOJE, saida: HOJE, hospede: "Ana", cpf: "12345678909", proprietario: "Marcos", comCarro: false };
    expect(problemasDaTemporada({ ...base, acompanhantes: [{ nome: "Bruno", cpf: "" }] })).toEqual({});
    expect(problemasDaTemporada({ ...base, acompanhantes: [{ nome: "", cpf: "" }] }).acompanhantes).toMatch(/nome/);
    expect(problemasDaTemporada({ ...base, acompanhantes: [{ nome: "Bruno", cpf: "123" }] }).acompanhantes).toMatch(/11 dígitos/);
    const d = paraGravar({ ...base, acompanhantes: [{ nome: " Bruno ", cpf: "987.654.321-00" }, { nome: "Clara", cpf: "" }] });
    expect(d.acompanhantes).toEqual([{ nome: "Bruno", cpf: "98765432100" }, { nome: "Clara", cpf: null }]);
    expect(d.pessoas).toBe(3);
  });

  it("o CPF de um acompanhante também acha a liberação", () => {
    const lista = [{ id: 8, situacao: "agendada", entrada: HOJE, saida: HOJE, hospede: "Ana", cpf: "12345678909",
      acompanhantes: [{ nome: "Bruno", cpf: "98765432100" }], veiculos: [] }];
    const [achada] = acharPorCpf(lista, "987.654.321-00", HOJE);
    expect(achada.temporada.id).toBe(8);
    expect(achada.pessoa).toMatchObject({ nome: "Bruno", responsavel: false });
  });

  it("sem carro grava lista vazia; com carro grava a placa limpa", () => {
    expect(paraGravar({ id_unidade: "5", entrada: HOJE, saida: HOJE, hospede: " Ana ", comCarro: false, veiculos: [{ placa: "ABC1D23" }] }).veiculos).toEqual([]);
    const d = paraGravar({ id_unidade: "5", entrada: HOJE, saida: HOJE, hospede: "Ana", comCarro: true, veiculos: [{ placa: "abc-1d23", modelo: "Gol", cor: "" }] });
    expect(d).toMatchObject({ id_unidade: 5, hospede: "Ana", pessoas: 1, acompanhantes: [], veiculos: [{ placa: "ABC1D23", modelo: "Gol", cor: null }] });
  });
});

const mockCriar = vi.fn(async () => ({ success: true }));
vi.mock("../api/db", () => ({
  criar: (...a) => mockCriar(...a),
  editar: vi.fn(async () => ({ success: true })),
  remover: vi.fn(async () => ({ success: true })),
}));

const mockRpc = vi.fn(async () => ({ data: [
  { nome: "marcos pinto", bloco: "5", unidade: "206", vinculo: "Proprietário", status: "aprovado" },
  { nome: "Lia Reis", bloco: "5", unidade: "206", vinculo: "Locatário", status: "aprovado" },
] }));
vi.mock("../api/supabase", () => ({ supabase: { rpc: (...a) => mockRpc(...a) } }));

import JanelaDaTemporada from "../components/temporada/JanelaDaTemporada";
import AvisoDaTemporada from "../components/temporada/AvisoDaTemporada";

const hoje = hojeEmBrasilia();
const UNIDADES = [{ id: 5206, bloco: "5", unidade: "206" }];
const LIBERADA = {
  id: 1, id_unidade: 5206, entrada: hoje, saida: "2099-12-31", hospede: "ana lima", pessoas: 4,
  veiculos: [{ placa: "ABC1D23", modelo: "VW Gol", cor: "Prata" }], situacao: "agendada", created_by: "Marcos",
};
const envolver = (el) => <ToastProvider><ConfirmProvider>{el}</ConfirmProvider></ToastProvider>;

describe("a janela Temporada", () => {
  beforeEach(() => mockCriar.mockClear());

  it("lista com a placa, abre o ver no desenho de Encomendas", async () => {
    render(envolver(<JanelaDaTemporada aberta temporadas={[LIBERADA]} unidades={UNIDADES} user={{ cargo: "Sindico" }} onFechar={() => {}} />));
    const janela = screen.getByRole("dialog", { name: "Temporada" });
    expect(within(janela).getByText("ABC1D23")).toBeInTheDocument();
    expect(within(janela).getByRole("button", { name: /^Chegam hoje/ })).toHaveTextContent("1");
    await userEvent.click(within(janela).getByRole("button", { name: /Abrir a temporada de Ana Lima/ }));
    const ver = await screen.findByRole("dialog", { name: "Detalhes da temporada" });
    expect(within(ver).getByText("Veículo liberado")).toBeInTheDocument();
    expect(within(ver).getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  it("o porteiro vê, mas não libera nem edita", () => {
    render(envolver(<JanelaDaTemporada aberta temporadas={[LIBERADA]} unidades={UNIDADES} user={{ cargo: "Porteiro" }} onFechar={() => {}} />));
    expect(screen.queryByRole("button", { name: "Nova liberação" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Editar a temporada/ })).not.toBeInTheDocument();
  });

  it("a nova liberação diz o que falta no campo, e grava a placa limpa", async () => {
    const user = userEvent.setup();
    render(envolver(<JanelaDaTemporada aberta temporadas={[]} unidades={UNIDADES} user={{ cargo: "Sindico", nome: "Marcos" }} onFechar={() => {}} />));
    await user.click(screen.getAllByRole("button", { name: "Nova liberação" })[0]);
    const form = await screen.findByRole("dialog", { name: "Nova liberação de temporada" });
    await user.click(within(form).getByRole("button", { name: "Liberar temporada" }));
    expect(within(form).getByText("Escolha a unidade.")).toBeInTheDocument();
    expect(mockCriar).not.toHaveBeenCalled();

    await user.type(within(form).getByPlaceholderText(/Digite/), "5206");
    await user.click(within(within(form).getByRole("listbox")).getByRole("button", { name: /206/ }));
    // A 5206 tem proprietário no app: o nome aparece sozinho, sem campo para digitar.
    expect(await within(form).findByText("Marcos Pinto")).toBeInTheDocument();
    expect(within(form).queryByLabelText(/Nome do proprietário/)).not.toBeInTheDocument();
    await user.type(within(form).getByPlaceholderText("Nome e sobrenome"), "ana lima");
    await user.type(within(form).getByLabelText(/^CPF do hóspede/), "12345678909");
    await user.click(within(form).getByRole("button", { name: "Adicionar acompanhante" }));
    await user.type(within(form).getByLabelText("Nome do acompanhante 1"), "bruno lima");
    await user.type(within(form).getByLabelText("Placa do veículo"), "abc-1d23");
    // A saída: hoje mesmo vale (período de um dia).
    const saida = within(form).getByLabelText(/^Saída/);
    await user.type(saida, hoje);
    await user.click(within(form).getByRole("button", { name: "Liberar temporada" }));
    expect(mockCriar).toHaveBeenCalledTimes(1);
    const [tabela, dados] = mockCriar.mock.calls[0];
    expect(tabela).toBe("TEMPORADAS");
    expect(mockRpc).toHaveBeenCalledWith("moradores_no_app");
    expect(dados).toMatchObject({
      id_unidade: 5206, hospede: "Ana Lima", cpf: "12345678909", pessoas: 2, proprietario: "Marcos Pinto",
      acompanhantes: [{ nome: "Bruno Lima", cpf: null }], veiculos: [{ placa: "ABC1D23" }], created_by: "Marcos",
    });
  });
});

describe("unidade sem proprietário no app", () => {
  it("aparece o campo para escrever o proprietário, obrigatório", async () => {
    mockRpc.mockResolvedValueOnce({ data: [] });
    const user = userEvent.setup();
    render(envolver(<JanelaDaTemporada aberta temporadas={[]} unidades={UNIDADES} user={{ cargo: "Sindico" }} onFechar={() => {}} />));
    await user.click(screen.getAllByRole("button", { name: "Nova liberação" })[0]);
    const form = await screen.findByRole("dialog", { name: "Nova liberação de temporada" });
    await user.type(within(form).getByPlaceholderText(/Digite/), "5206");
    await user.click(within(within(form).getByRole("listbox")).getByRole("button", { name: /206/ }));
    expect(within(form).getByLabelText(/Nome do proprietário/)).toBeInTheDocument();
    await user.click(within(form).getByRole("button", { name: "Liberar temporada" }));
    expect(within(form).getByText("Informe o nome do proprietário que autorizou.")).toBeInTheDocument();
  });
});

describe("o aviso na chegada", () => {
  const rotulo = () => "B5-206";

  it("placa liberada: diz Liberado e preenche o crachá com um toque", async () => {
    const onUsar = vi.fn();
    render(<AvisoDaTemporada temporadas={[LIBERADA]} placa="abc1d23" rotuloUnidade={rotulo} usada={null} onUsar={onUsar} />);
    expect(screen.getByText("Liberado para temporada")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Usar e preencher o crachá" }));
    expect(onUsar).toHaveBeenCalledWith(LIBERADA, LIBERADA.veiculos[0], null);
  });

  it("o CPF digitado mostra a mesma caixa da placa, também para acompanhante", async () => {
    const comCpf = { ...LIBERADA, cpf: "12345678909", acompanhantes: [{ nome: "Bruno Lima", cpf: "98765432100" }] };
    const onUsar = vi.fn();
    render(<AvisoDaTemporada temporadas={[comCpf]} placa="" cpf="98765432100" rotuloUnidade={rotulo} usada={null} onUsar={onUsar} />);
    expect(screen.getByText("Liberado para temporada")).toBeInTheDocument();
    expect(screen.getByText("Acompanhante")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Usar e preencher o crachá" }));
    expect(onUsar.mock.calls[0][2]).toMatchObject({ nome: "Bruno Lima", responsavel: false });
    // Achada pelo CPF, a caixa mostra o carro da liberação e quem liberou.
    expect(screen.getByText(/ABC1D23/)).toBeInTheDocument();
    expect(screen.getByText("Liberado por")).toBeInTheDocument();
  });

  it("CPF sem liberação avisa igual à placa", () => {
    render(<AvisoDaTemporada temporadas={[LIBERADA]} placa="" cpf="11122233344" rotuloUnidade={rotulo} usada={null} onUsar={() => {}} />);
    expect(screen.getByText("Sem liberação para este CPF")).toBeInTheDocument();
  });

  it("placa sem liberação: avisa e oferece as que chegam hoje", () => {
    render(<AvisoDaTemporada temporadas={[LIBERADA]} placa="XYZ9K88" rotuloUnidade={rotulo} usada={null} onUsar={() => {}} />);
    expect(screen.getByText("Sem liberação para esta placa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "É este" })).toBeInTheDocument();
  });
});
