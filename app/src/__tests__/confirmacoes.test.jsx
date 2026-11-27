import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider } from "../ui/Toast";
import { ConfirmProvider } from "../ui/Confirm";
import { folhaDaReserva, esperaDesde, telefoneLegivel, apto } from "../lib/confirmacoes";

/**
 * Confirmações (0065): abas com contador, a linha que abre com CPF mascarado
 * e telefone completo, e a data da reserva em destaque.
 */
const { rpc, assinar } = vi.hoisted(() => ({ rpc: vi.fn(), assinar: vi.fn() }));
vi.mock("../api/db", () => ({
  listar: vi.fn(async () => []),
  criar: vi.fn(async () => ({ success: true })),
  editar: vi.fn(async () => ({ success: true })),
}));
vi.mock("../api/supabase", () => ({
  supabase: { rpc, storage: { from: () => ({ createSignedUrl: assinar }) } },
}));

import Confirmacao from "../pages/Confirmacao";

const HORA = 3_600_000;
const CADASTROS = [
  { id: 1, nome: "Marina Alves", bloco: 5, unidade: 206, vinculo: "Locatário", tipo: "Titular", pedido_em: new Date(Date.now() - 72 * HORA).toISOString() },
  { id: 2, nome: "Carlos Pereira", bloco: 3, unidade: 104, vinculo: "Proprietário", tipo: "Não Morador", pedido_em: new Date(Date.now() - 5 * HORA).toISOString() },
];
const RESERVAS = [
  { id: 9, data_reserva: "2026-10-28", faltam: 2, espacos: "Churrasqueira A", valor: 50, morador: "Renata Costa", bloco: 4, unidade: 102, pedido_em: new Date().toISOString(), data_anterior: null },
];
const DETALHE_CADASTRO = {
  id: 1, cpf: "***.456.789-**", telefone: "21988770382", email: "marina.alves@gmail.com", aviso_whatsapp: true,
  pedido_em: "2026-10-23T11:14:00Z", email_confirmado_em: "2026-10-23T11:20:00Z",
  no_condominio: [{ nome: "Lucas Moraes", vinculo: "Locatário", tipo: "Titular" }],
  no_app: [],
};
const DETALHE_RESERVA = {
  id: 9, cpf: "***.321.654-**", telefone: "21991025566", email: "renata@hotmail.com",
  pedido_em: "2026-10-24T22:42:00Z", enviada_em: "2026-10-24T22:51:00Z",
  comprovante: "reservas-morador/9/pix.jpg", ocupados: "", livres: "Churrasqueira B, Salão de festas",
};

const respostas = {
  cadastros_para_aprovar: () => ({ data: CADASTROS, error: null }),
  reservas_para_aprovar: () => ({ data: RESERVAS, error: null }),
  detalhe_do_cadastro: () => ({ data: DETALHE_CADASTRO, error: null }),
  detalhe_da_reserva: () => ({ data: DETALHE_RESERVA, error: null }),
  aprovar_cadastro: () => ({ data: null, error: null }),
  recusar_cadastro: () => ({ data: null, error: null }),
};

beforeEach(() => {
  localStorage.clear();
  rpc.mockReset().mockImplementation(async (nome) => respostas[nome]?.() ?? { data: null, error: null });
  assinar.mockReset().mockResolvedValue({ data: { signedUrl: "https://assinada/pix.jpg" }, error: null });
});

const montar = (rota = "/confirmacao") =>
  render(
    <MemoryRouter initialEntries={[rota]}>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Confirmacao user={{ nome: "Síndico", cargo: "Sindico" }} />
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>
  );

describe("as abas", () => {
  it("uma por fila, com o número de pedidos, e abre na primeira que tem alguém", async () => {
    montar();
    expect(await screen.findByRole("tab", { name: /Cadastros do app/ })).toHaveTextContent("2");
    expect(screen.getByRole("tab", { name: /Reservas/ })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /WhatsApp/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Cadastros do app/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("3 pedidos esperando a administração")).toBeInTheDocument();
  });

  it("a lista não traz CPF, telefone nem e-mail: só nome, apto e vínculo", async () => {
    montar();
    expect(await screen.findByText("Marina Alves")).toBeInTheDocument();
    expect(screen.getByText("Proprietário (não mora)")).toBeInTheDocument();
    expect(screen.queryByText(/\*\*\*/)).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith("detalhe_do_cadastro", expect.anything());
  });
});

describe("a linha que abre", () => {
  it("clicar abre os detalhes: CPF mascarado, telefone e e-mail completos, e o apto no condomínio", async () => {
    const user = userEvent.setup();
    montar();
    const linha = await screen.findByRole("button", { name: /Marina Alves, Bl 5 · 206: ver detalhes/ });
    expect(linha).toHaveAttribute("aria-expanded", "false");
    await user.click(linha);
    expect(linha).toHaveAttribute("aria-expanded", "true");
    expect(rpc).toHaveBeenCalledWith("detalhe_do_cadastro", { p_id: 1 });
    expect(await screen.findByText("***.456.789-**")).toBeInTheDocument();
    expect(screen.getByText("(21) 98877-0382")).toBeInTheDocument();
    expect(screen.getByText("marina.alves@gmail.com")).toBeInTheDocument();
    expect(screen.getByText(/Lucas Moraes/)).toBeInTheDocument();
    await user.click(linha);
    expect(linha).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("***.456.789-**")).not.toBeInTheDocument();
  });

  it("aprovar pede confirmação e chama o banco", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText("Marina Alves");
    await user.click(screen.getAllByRole("button", { name: "Aprovar" })[0]);
    expect(rpc).not.toHaveBeenCalledWith("aprovar_cadastro", expect.anything());
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Aprovar" }));
    expect(rpc).toHaveBeenCalledWith("aprovar_cadastro", { p_id: 1 });
  });

  it("recusar sem motivo não chama o banco; com motivo, chama", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText("Marina Alves");
    await user.click(screen.getAllByRole("button", { name: "Recusar" })[0]);
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Recusar" }));
    expect(within(dialogo).getByText(/Escreva o motivo/)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith("recusar_cadastro", expect.anything());
    await user.type(within(dialogo).getByRole("textbox"), "Nome não confere");
    await user.click(within(dialogo).getByRole("button", { name: "Recusar" }));
    expect(rpc).toHaveBeenCalledWith("recusar_cadastro", { p_id: 1, p_motivo: "Nome não confere" });
  });
});

describe("reservas", () => {
  it("a data em destaque: folhinha, dia da semana e quanto falta; e por extenso ao abrir", async () => {
    const user = userEvent.setup();
    montar("/confirmacao?fila=reservas");
    const linha = await screen.findByRole("button", { name: /Churrasqueira A, 28\/10\/2026, Renata Costa/ });
    expect(within(linha).getByText("OUT")).toBeInTheDocument();
    expect(within(linha).getByText("28")).toBeInTheDocument();
    expect(within(linha).getByText("Quarta")).toBeInTheDocument();
    expect(within(linha).getByText("daqui a 2 dias")).toBeInTheDocument();
    expect(linha.querySelector(".conf-dia--perto")).not.toBeNull();
    await user.click(linha);
    expect(await screen.findByText("quarta, 28 de outubro de 2026")).toBeInTheDocument();
    expect(await screen.findByText("***.321.654-**")).toBeInTheDocument();
    expect(assinar).toHaveBeenCalledWith("reservas-morador/9/pix.jpg", 600);
    expect(await screen.findByRole("img", { name: /Comprovante do PIX de Renata Costa/ })).toHaveAttribute("src", "https://assinada/pix.jpg");
  });
});

describe("TAG e veículos", () => {
  const PEDIDOS = [
    { id: 21, origem: "morador", tipo: "tag", veiculo: "Carro", placa: "RJO4F21", modelo: "Honda HR-V", cor: "Prata", com_tag: false, passar_tag: false,
      motivo_tag: "perdida", placa_em_outro: null, status: "pendente", valor: null, quem: "Lucas Moraes", vinculo: "Locatário", bloco: 5, unidade: 206, pedido_em: new Date().toISOString() },
    { id: 22, origem: "morador", tipo: "cadastrar", veiculo: "Carro", placa: "LTN8A43", modelo: "Fiat Argo", cor: "Branco", com_tag: true, passar_tag: false,
      motivo_tag: null, placa_em_outro: "Bl 3 · 104", status: "pendente", valor: null, quem: "Ana Souza", vinculo: "Locatário", bloco: 2, unidade: 301, pedido_em: new Date().toISOString() },
    { id: 23, origem: "morador", tipo: "trocar", veiculo: "Moto", placa: "KXP2B07", modelo: "CG 160", cor: "Preta", com_tag: false, passar_tag: false,
      motivo_tag: null, placa_em_outro: null, status: "pagar", valor: 50, quem: "Rita Neves", vinculo: "Locatário", bloco: 1, unidade: 105, pedido_em: new Date().toISOString() },
  ];
  const TAGS = [{ id: 5, placa: "ABC1D23", modelo: "Onix", cor: "Preto", tag: "pedida", desde: new Date().toISOString(), bloco: 4, unidade: 102 }];

  beforeEach(() => {
    respostas.pedidos_veiculo_para_aprovar = () => ({ data: PEDIDOS, error: null });
    respostas.tags_a_entregar = () => ({ data: TAGS, error: null });
    respostas.cobrar_pedido_veiculo = () => ({ data: null, error: null });
    respostas.marcar_tag = () => ({ data: null, error: null });
  });

  it("a aba conta só o que espera a administração (não o que espera o morador pagar)", async () => {
    montar("/confirmacao?fila=veiculos");
    expect(await screen.findByRole("tab", { name: /TAG e veículos/ })).toHaveTextContent("2");
    expect(screen.getByText("TAG roubada ou furtada")).toBeInTheDocument();
    expect(screen.getByText("Placa também no Bl 3 · 104")).toBeInTheDocument();
    expect(screen.getByText("Aguardando PIX")).toBeInTheDocument();
  });

  it("cobrar a TAG: R$ 50,00 por padrão", async () => {
    const user = userEvent.setup();
    montar("/confirmacao?fila=veiculos");
    await screen.findByText("TAG roubada ou furtada");
    await user.click(screen.getAllByRole("button", { name: "Cobrar" })[0]);
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByRole("textbox")).toHaveValue("50,00");
    await user.click(within(dialogo).getByRole("button", { name: "Cobrar" }));
    expect(rpc).toHaveBeenCalledWith("cobrar_pedido_veiculo", { p_id: 21, p_valor: 50 });
  });

  it("TAGs a entregar: chegou na portaria avisa o morador", async () => {
    const user = userEvent.setup();
    montar("/confirmacao?fila=veiculos");
    await user.click(await screen.findByRole("button", { name: "Chegou na portaria" }));
    expect(rpc).toHaveBeenCalledWith("marcar_tag", { p_veiculo_id: 5, p_situacao: "portaria" });
  });
});

describe("Solicitações", () => {
  const LISTA = [
    { id: 2479, tipo: "piscina", status: "falta_documento", enviada_em: new Date().toISOString(), ultima_msg_em: new Date().toISOString(),
      ultima_msg_de: "morador", nao_lida: true, quem: "Lucas Moraes", vinculo: "Locatário", tipo_morador: "Titular", bloco: 5, unidade: 206, resumo: "Marina Moraes" },
  ];
  const DETALHE = { id: 2479, tipo: "piscina", status: "falta_documento", dados: { para_quem: "Marina Moraes" }, cpf: "***.456.789-**", telefone: "21988770382", email: "l@x.com",
    mensagens: [
      { id: 1, autor: "morador", anexo: "solicitacoes-morador/2479/a.jpg", anexo_nome: "3x4.jpg", anexo_tipo: "foto3x4", inicial: true, em: new Date().toISOString() },
      { id: 2, autor: "morador", texto: "Mando o atestado amanhã.", inicial: false, em: new Date().toISOString() },
    ] };

  beforeEach(() => {
    respostas.solicitacoes_para_responder = () => ({ data: LISTA, error: null });
    respostas.detalhe_da_solicitacao = () => ({ data: DETALHE, error: null });
    respostas.responder_solicitacao = () => ({ data: null, error: null });
    respostas.mudar_situacao_da_solicitacao = () => ({ data: null, error: null });
  });

  it("a aba conta o que o morador escreveu e ninguém leu; a linha abre a conversa", async () => {
    const user = userEvent.setup();
    montar("/confirmacao?fila=solicitacoes");
    expect(await screen.findByRole("tab", { name: /Solicitações/ })).toHaveTextContent("1");
    await user.click(screen.getByRole("button", { name: /Cartão da piscina Nº 2479, Lucas Moraes, mensagem nova/ }));
    expect(await screen.findByText("Mando o atestado amanhã.")).toBeInTheDocument();
    expect(screen.getByText("***.456.789-**")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Foto 3x4: 3x4\.jpg/ })).toBeInTheDocument();
  });

  it("pedido sem decisão conta mesmo já lido; o resto, só com mensagem nova (0107, reteste de 12/11)", async () => {
    const agora = new Date().toISOString();
    const base = { enviada_em: agora, ultima_msg_em: agora, ultima_msg_de: "adm", nao_lida: false, quem: "Ana", vinculo: "Locatário", tipo_morador: "Titular", bloco: 1, unidade: 101, resumo: "" };
    respostas.solicitacoes_para_responder = () => ({ data: [
      { ...base, id: 18, tipo: "mudanca", status: "aberta" },
      { ...base, id: 19, tipo: "obra", status: "em_analise" },
      { ...base, id: 20, tipo: "obra", status: "aprovada" },
      { ...base, id: 21, tipo: "obra", status: "falta_documento" },
    ], error: null });
    montar("/confirmacao?fila=solicitacoes");
    expect(await screen.findByRole("tab", { name: /Solicitações/ })).toHaveTextContent("2");
    expect(screen.getByText(/pedidos? esperando a administração/)).toBeInTheDocument();
    expect(screen.queryByText("Nada esperando a administração")).not.toBeInTheDocument();
  });

  it("resposta pronta escreve no campo; enviar responde no chamado", async () => {
    const user = userEvent.setup();
    montar("/confirmacao?fila=solicitacoes");
    await user.click(await screen.findByRole("button", { name: /Cartão da piscina Nº 2479/ }));
    await user.click(await screen.findByRole("button", { name: "Está pronto. Pode retirar na administração." }));
    expect(screen.getByLabelText("Resposta ao morador")).toHaveValue("Está pronto. Pode retirar na administração.");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(rpc).toHaveBeenCalledWith("responder_solicitacao", { p_id: 2479, p_texto: "Está pronto. Pode retirar na administração.", p_caminho: null, p_nome: null });
  });

  it("marcar pronto muda a situação; recusar pede o motivo", async () => {
    const user = userEvent.setup();
    montar("/confirmacao?fila=solicitacoes");
    await user.click(await screen.findByRole("button", { name: /Cartão da piscina Nº 2479/ }));
    await user.click(await screen.findByRole("button", { name: "Marcar pronto" }));
    expect(rpc).toHaveBeenCalledWith("mudar_situacao_da_solicitacao", { p_id: 2479, p_status: "pronta", p_motivo: null });
    await user.click(screen.getByRole("button", { name: "Recusar" }));
    const dialogo = await screen.findByRole("dialog");
    await user.type(within(dialogo).getByRole("textbox"), "Atestado ilegível");
    await user.click(within(dialogo).getByRole("button", { name: "Recusar" }));
    expect(rpc).toHaveBeenCalledWith("mudar_situacao_da_solicitacao", { p_id: 2479, p_status: "recusada", p_motivo: "Atestado ilegível" });
  });
});

describe("os auxiliares", () => {
  it("folhinha: hoje, amanhã, passou e o destaque até 3 dias", () => {
    expect(folhaDaReserva("2026-11-01", 6)).toMatchObject({ mes: "NOV", dia: "01", semana: "Domingo", falta: "daqui a 6 dias", perto: false, extenso: "domingo, 1º de novembro de 2026" });
    expect(folhaDaReserva("2026-10-27", 1)).toMatchObject({ falta: "amanhã", perto: true });
    expect(folhaDaReserva("2026-10-26", 0)).toMatchObject({ falta: "é hoje", perto: true });
    expect(folhaDaReserva("2026-10-20", -6)).toMatchObject({ falta: "a data já passou" });
    expect(folhaDaReserva("", 0)).toBeNull();
  });
  it("espera, telefone e apartamento", () => {
    const agora = Date.parse("2026-10-26T12:00:00Z");
    expect(esperaDesde("2026-10-26T11:30:00Z", agora)).toBe("agora");
    expect(esperaDesde("2026-10-26T07:00:00Z", agora)).toBe("5 h");
    expect(esperaDesde("2026-10-25T11:00:00Z", agora)).toBe("1 dia");
    expect(esperaDesde("2026-10-23T12:00:00Z", agora)).toBe("3 dias");
    expect(telefoneLegivel("5521988770382")).toBe("(21) 98877-0382");
    expect(telefoneLegivel("2126541200")).toBe("(21) 2654-1200");
    expect(apto(5, 206)).toBe("Bl 5 · 206");
  });
});
