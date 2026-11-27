import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider } from "../ui/Toast";
import { ConfirmProvider } from "../ui/Confirm";

/**
 * APP: o que já passou pela aprovação. Moradores no app, veículos cadastrados
 * e histórico vieram de Confirmações; TAGs cadastradas e solicitações
 * finalizadas (0080) são novas.
 */
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../api/supabase", () => ({
  supabase: { rpc, storage: { from: () => ({ createSignedUrl: vi.fn() }) } },
}));

import AppDoMorador from "../pages/AppDoMorador";

const respostas = {};

beforeEach(() => {
  localStorage.clear();
  for (const k of Object.keys(respostas)) delete respostas[k];
  rpc.mockReset().mockImplementation(async (nome) => respostas[nome]?.() ?? { data: null, error: null });
});

const SINDICO = { nome: "Síndico", cargo: "Sindico" };
const montar = (rota = "/app", usuario = SINDICO) =>
  render(
    <MemoryRouter initialEntries={[rota]}>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AppDoMorador user={usuario} />
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>
  );

describe("as abas", () => {
  it("cinco abas, e abre em Moradores no app", async () => {
    montar();
    for (const aba of ["Moradores no app", "Veículos cadastrados", "Histórico", "TAGs cadastradas", "Solicitações finalizadas"]) {
      expect(screen.getByRole("tab", { name: new RegExp(aba) })).toBeInTheDocument();
    }
    expect(screen.getByRole("tab", { name: /Moradores no app/ })).toHaveAttribute("aria-selected", "true");
    expect(rpc).toHaveBeenCalledWith("moradores_no_app");
  });

  it("trocar de aba busca a lista daquela aba", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("tab", { name: /Histórico/ }));
    expect(rpc).toHaveBeenCalledWith("veiculos_do_condominio", { p_arquivados: true });
    await user.click(screen.getByRole("tab", { name: /Solicitações finalizadas/ }));
    expect(rpc).toHaveBeenCalledWith("solicitacoes_finalizadas");
  });
});

describe("veículos", () => {
  const VEICULOS = [
    { id: 31, veiculo: "Carro", placa: "RJO4F21", modelo: "Honda HR-V", cor: "Prata", tag: "colada", tag_numero: "004512", bloco: 5, unidade: 206, arquivado_em: null },
    { id: 32, veiculo: "Moto", placa: "KXP2B07", modelo: "Fazer", cor: "Preta", tag: null, tag_numero: null, bloco: 5, unidade: 206, arquivado_em: null },
    { id: 33, veiculo: "Carro", placa: "LMN1A23", modelo: "Onix", cor: "Branco", tag: null, tag_numero: null, bloco: 3, unidade: 104, arquivado_em: null },
  ];
  beforeEach(() => {
    respostas.veiculos_do_condominio = () => ({ data: VEICULOS, error: null });
    respostas.editar_veiculo = () => ({ data: null, error: null });
    respostas.arquivar_veiculo = () => ({ data: null, error: null });
  });

  it("clicar na linha abre para ver, sem formulário; o Editar do modal passa para a edição", async () => {
    const user = userEvent.setup();
    montar("/app?aba=veiculos");
    await user.click(await screen.findByRole("button", { name: /Carro RJO4F21, Bl 5 · 206: ver detalhes/ }));
    const ver = await screen.findByRole("dialog", { name: "Detalhes do veículo" });
    expect(within(ver).getAllByText("004512").length).toBeGreaterThan(0);
    expect(within(ver).queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(within(ver).getByRole("button", { name: "Editar" }));
    expect(await screen.findByRole("dialog", { name: "Editar carro" })).toBeInTheDocument();
  });

  it("olho e lápis na linha; o lápis edita e a etapa da TAG é escolhida em botões", async () => {
    const user = userEvent.setup();
    montar("/app?aba=veiculos");
    expect(rpc).toHaveBeenCalledWith("veiculos_do_condominio", { p_arquivados: false });
    expect(await screen.findByText("Nº 004512")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver o carro RJO4F21" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar o carro RJO4F21" }));
    const dialogo = await screen.findByRole("dialog", { name: "Editar carro" });
    expect(within(dialogo).getByRole("radio", { name: "Colada" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(dialogo).getByRole("radio", { name: "Na portaria" }));
    const numero = within(dialogo).getByLabelText(/Nº da TAG/);
    await user.clear(numero);
    await user.type(numero, "004999");
    await user.click(within(dialogo).getByRole("button", { name: "Salvar" }));
    expect(rpc).toHaveBeenCalledWith("editar_veiculo", expect.objectContaining({ p_id: 31, p_tag: "portaria", p_tag_numero: "004999" }));
  });

  it("sem cargo de administração, só o olho (e o modal sem Editar)", async () => {
    const user = userEvent.setup();
    montar("/app?aba=veiculos", { nome: "Fulano", cargo: "Porteiro" });
    await screen.findByText("RJO4F21");
    expect(screen.queryByRole("button", { name: /^Editar o/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver o carro RJO4F21" }));
    const ver = await screen.findByRole("dialog", { name: "Detalhes do veículo" });
    expect(within(ver).queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("mandar para o histórico chama o banco", async () => {
    const user = userEvent.setup();
    montar("/app?aba=veiculos");
    await user.click(await screen.findByRole("button", { name: "Editar a moto KXP2B07" }));
    await user.click(screen.getByRole("button", { name: "Mandar para o histórico" }));
    expect(rpc).toHaveBeenCalledWith("arquivar_veiculo", { p_id: 32, p_arquivar: true });
  });

  it("TAGs cadastradas: só os carros com TAG", async () => {
    montar("/app?aba=tags");
    expect(await screen.findByText("RJO4F21")).toBeInTheDocument();
    expect(screen.queryByText("KXP2B07")).not.toBeInTheDocument(); // moto
    expect(screen.queryByText("LMN1A23")).not.toBeInTheDocument(); // carro sem TAG
  });
});

describe("solicitações finalizadas", () => {
  const LISTA = [
    { id: 2470, tipo: "piscina", status: "concluida", fechada_em: "2026-10-30T15:00:00Z", quem: "Lucas Moraes",
      tipo_morador: "Titular", bloco: 5, unidade: 206, resumo: "Marina Moraes", motivo_recusa: null },
    { id: 2471, tipo: "obra", status: "recusada", fechada_em: "2026-10-29T15:00:00Z", quem: "Paula Lima",
      tipo_morador: "Titular", bloco: 2, unidade: 301, resumo: "Troca do piso", motivo_recusa: "Falta a RT" },
  ];
  const DETALHE = { id: 2470, tipo: "piscina", status: "concluida", dados: { para_quem: "Marina Moraes" }, cpf: "***.456.789-**", telefone: "21988770382", email: "l@x.com",
    mensagens: [
      { id: 1, autor: "morador", texto: "Obrigado!", inicial: false, em: "2026-10-30T14:00:00Z" },
      { id: 2, autor: "sistema", texto: "Concluída", inicial: false, em: "2026-10-30T15:00:00Z" },
    ] };
  beforeEach(() => {
    respostas.solicitacoes_finalizadas = () => ({ data: LISTA, error: null });
    respostas.detalhe_da_solicitacao = () => ({ data: DETALHE, error: null });
  });

  it("lista com a situação e o dia em que fechou; o filtro separa por situação", async () => {
    const user = userEvent.setup();
    montar("/app?aba=solicitacoes");
    expect(await screen.findByText("Concluída")).toBeInTheDocument();
    expect(screen.getByText("Recusada")).toBeInTheDocument();
    expect(screen.getByText("30/10/2026")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Recusadas/ }));
    expect(screen.queryByText("Concluída")).not.toBeInTheDocument();
    expect(screen.getByText("Recusada")).toBeInTheDocument();
  });

  it("a recusada mostra o motivo no modal", async () => {
    const user = userEvent.setup();
    montar("/app?aba=solicitacoes");
    await user.click(await screen.findByRole("button", { name: /Obra ou reforma Nº 2471/ }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Falta a RT")).toBeInTheDocument();
  });

  it("abre a conversa só para ler: sem resposta e sem mudar a situação", async () => {
    const user = userEvent.setup();
    montar("/app?aba=solicitacoes");
    await user.click(await screen.findByRole("button", { name: /Cartão da piscina Nº 2470/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("Obrigado!")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("detalhe_da_solicitacao", { p_id: 2470 });
    expect(screen.queryByLabelText("Resposta ao morador")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Concluir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recusar" })).not.toBeInTheDocument();
  });
});

describe("Moradores no app: registrar saída", () => {
  const MORADORES = [
    { id: 31, nome: "Paula Lima", primeiro_nome: "Paula", sobrenome: "Lima", cpf: "***.456.789-**",
      bloco: 2, unidade: 301, vinculo: "Locatário", tipo: "Titular", status: "aprovado",
      aprovado_em: "2026-03-10T14:00:00Z", saiu_em: null, saida_registrada_por: null, dependente: "Leo Lima" },
    { id: 32, nome: "Rui Souza", primeiro_nome: "Rui", sobrenome: "Souza", cpf: null,
      bloco: 1, unidade: 102, vinculo: "Locatário", tipo: "Titular", status: "saiu",
      aprovado_em: "2025-01-05T14:00:00Z", saiu_em: "2026-09-01T15:00:00Z", saida_registrada_por: "Síndico", dependente: null },
  ];
  const PREVIA = {
    id: 31, nome: "Paula Lima", vinculo: "Locatário", bloco: 2, unidade: 301, dependente: "Leo Lima", convite_pendente: false,
    veiculos: [{ veiculo: "Carro", placa: "RIO2A26", modelo: "Onix", cor: "Prata", tag: "colada", tag_numero: "88412" }],
    pedidos_veiculo: [{ id: 5, tipo: "tag", veiculo: "Carro", placa: "RIO2A26", status: "pagar" }],
    solicitacoes: [{ id: 2480, tipo: "Obra ou reforma", status: "aberta" }],
    reservas: [{ id: 77, data: "2026-11-20", espacos: ["SALAO"], valor: 100, status: "aprovada" }],
    encomendas: [{ etiqueta: "0412B", chegou: "2026-10-27T13:00:00Z", para: "Paula", deposito: false }],
  };
  const CADASTRO = {
    id: 31, cpf: "***.456.789-**", telefone: "21988770382", email: "paula@gmail.com", aviso_whatsapp: true,
    pedido_em: "2026-03-09T12:00:00Z", email_confirmado_em: "2026-03-09T12:05:00Z",
    no_condominio: [{ nome: "Paula Lima", vinculo: "Locatário", tipo: "Titular" }],
    no_app: [{ nome: "Leo L.", vinculo: "Locatário", tipo: "Dependente", status: "aprovado" }],
  };
  // Veículos do app: um no apartamento da Paula, um no de quem saiu (que não
  // é mais dele: o de agora é do apartamento).
  const VEICULOS = [
    { id: 41, veiculo: "Carro", placa: "RIO2A26", modelo: "Onix", cor: "Prata", tag: "colada", tag_numero: "88412", bloco: 2, unidade: 301 },
    { id: 42, veiculo: "Carro", placa: "NOV0A01", modelo: "Kwid", cor: "Branco", tag: null, tag_numero: null, bloco: 1, unidade: 102 },
  ];
  beforeEach(() => {
    respostas.veiculos_do_condominio = () => ({ data: VEICULOS, error: null });
    respostas.detalhe_do_cadastro = () => ({ data: CADASTRO, error: null });
    respostas.moradores_no_app = () => ({ data: MORADORES, error: null });
    respostas.previa_da_saida = () => ({ data: PREVIA, error: null });
    respostas.registrar_saida_do_morador = () => ({ data: { veiculos: 1, pedidos: 1, chamados: 1 }, error: null });
  });

  it("lista quem está no app e quem saiu, com o CPF mascarado e sem e-mail; filtro por situação", async () => {
    const user = userEvent.setup();
    montar();
    expect(await screen.findByText("Paula Lima")).toBeInTheDocument();
    expect(screen.getByText("Saiu em 01/09/2026")).toBeInTheDocument();
    expect(screen.getByText("***.456.789-**")).toBeInTheDocument();
    expect(screen.getByText("Não informado")).toBeInTheDocument(); // Rui, sem CPF
    expect(screen.queryByText("RIO2A26")).not.toBeInTheDocument(); // carro só no modal
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar saída" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Saíram/ }));
    expect(screen.queryByText("Paula Lima")).not.toBeInTheDocument();
    expect(screen.getByText("Rui Souza")).toBeInTheDocument();
  });

  it("a linha abre o cadastro do app: CPF mascarado, contato, carros e quem mais está no app; nada da ficha do sistema", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: /Paula Lima, Bl 2 · 301: ver cadastro/ }));
    const dialogo = await screen.findByRole("dialog");
    expect(rpc).toHaveBeenCalledWith("detalhe_do_cadastro", { p_id: 31 });
    expect(await within(dialogo).findByText("***.456.789-**")).toBeInTheDocument();
    expect(within(dialogo).getByText("(21) 98877-0382")).toBeInTheDocument();
    expect(within(dialogo).getByText("paula@gmail.com")).toBeInTheDocument();
    expect(within(dialogo).getByText("Leo L.")).toBeInTheDocument();
    expect(within(dialogo).getByText("RIO2A26")).toBeInTheDocument();
    expect(within(dialogo).getByText(/Onix/)).toBeInTheDocument();
    expect(within(dialogo).getByText("TAG colada")).toBeInTheDocument();
    expect(within(dialogo).queryByText(/ficha do condomínio/i)).not.toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Registrar saída" })).toBeInTheDocument();
  });

  it("o olho abre o cadastro; o lápis só aparece para quem está no app", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText("Paula Lima");
    expect(screen.getByRole("button", { name: "Editar o cadastro de Paula Lima" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar o cadastro de Rui Souza" })).not.toBeInTheDocument(); // saiu
    await user.click(screen.getByRole("button", { name: "Ver o cadastro de Paula Lima" }));
    const dialogo = await screen.findByRole("dialog", { name: "Cadastro no app" });
    expect(await within(dialogo).findByText("paula@gmail.com")).toBeInTheDocument();
  });

  it("sem cargo de administração, nada de lápis (nem no modal)", async () => {
    const user = userEvent.setup();
    montar("/app", { nome: "Fulano", cargo: "Porteiro" });
    await screen.findByText("Paula Lima");
    expect(screen.queryByRole("button", { name: /Editar o cadastro/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver o cadastro de Paula Lima" }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByText("paula@gmail.com");
    expect(within(dialogo).queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("o lápis edita nome, telefone, WhatsApp e CPF; CPF em branco mantém o de agora", async () => {
    const user = userEvent.setup();
    respostas.editar_cadastro_do_morador = () => ({ data: null, error: null });
    montar();
    await user.click(await screen.findByRole("button", { name: "Editar o cadastro de Paula Lima" }));
    const dialogo = await screen.findByRole("dialog", { name: "Editar o cadastro de Paula Lima" });
    const sobrenome = await within(dialogo).findByLabelText("Sobrenome");
    expect(within(dialogo).getByLabelText("Nome")).toHaveValue("Paula");
    expect(within(dialogo).getByLabelText("Telefone com DDD")).toHaveValue("(21) 98877-0382");
    expect(within(dialogo).getByText(/Agora: \*\*\*\.456\.789-\*\*/)).toBeInTheDocument();
    await user.clear(sobrenome);
    await user.type(sobrenome, "Lima Souza");
    await user.click(within(dialogo).getByRole("button", { name: "Salvar" }));
    expect(rpc).toHaveBeenCalledWith("editar_cadastro_do_morador", {
      p_id: 31, p_nome: "Paula", p_sobrenome: "Lima Souza", p_telefone: "(21) 98877-0382",
      p_aviso_whatsapp: true, p_cpf: null,
    });
    expect(await screen.findByText("Cadastro salvo")).toBeInTheDocument();
  });

  it("o CPF novo vai só com os números", async () => {
    const user = userEvent.setup();
    respostas.editar_cadastro_do_morador = () => ({ data: null, error: null });
    montar();
    await user.click(await screen.findByRole("button", { name: "Editar o cadastro de Paula Lima" }));
    const dialogo = await screen.findByRole("dialog", { name: "Editar o cadastro de Paula Lima" });
    await user.type(await within(dialogo).findByLabelText("CPF"), "52998224725");
    expect(within(dialogo).getByLabelText("CPF")).toHaveValue("529.982.247-25");
    await user.click(within(dialogo).getByRole("button", { name: "Salvar" }));
    expect(rpc).toHaveBeenCalledWith("editar_cadastro_do_morador", expect.objectContaining({ p_cpf: "52998224725" }));
  });

  it("quem já saiu: o cadastro abre sem o botão de saída", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: "Ver o cadastro de Rui Souza" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText(/Saída registrada em 01\/09\/2026 por Síndico/)).toBeInTheDocument();
    expect(within(dialogo).queryByRole("button", { name: "Registrar saída" })).not.toBeInTheDocument();
  });

  it("a saída explica em palavras simples o que acontece e o que fica com você; confirmar chama o banco", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: /Paula Lima, Bl 2 · 301: ver cadastro/ }));
    await user.click(await screen.findByRole("button", { name: "Registrar saída" }));
    const dialogo = await screen.findByRole("dialog", { name: "Paula deixou o apartamento?" });
    // Acontece sozinho
    expect(await within(dialogo).findByText(/Paula não consegue mais entrar no app/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/Leo Lima, o dependente, sai junto/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/Carro RIO2A26 \(Onix\)/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/Os 2 pedidos que estavam abertos no app são cancelados/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/O proprietário recebe um aviso/)).toBeInTheDocument();
    // Fica com você
    expect(within(dialogo).getByText(/Desativar no portão a TAG nº 88412/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/reserva de 20\/11\/2026 \(Salão de festas/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/encomenda 0412B/)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith("registrar_saida_do_morador", expect.anything());

    await user.click(within(dialogo).getByRole("button", { name: "Registrar saída" }));
    expect(rpc).toHaveBeenCalledWith("registrar_saida_do_morador", { p_id: 31 });
    expect(await screen.findByText("Saída de Paula Lima registrada")).toBeInTheDocument();
    expect(rpc.mock.calls.filter(([n]) => n === "moradores_no_app").length).toBeGreaterThanOrEqual(2);
  });

  it("cancelar não registra nada", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: /Paula Lima, Bl 2 · 301: ver cadastro/ }));
    await user.click(await screen.findByRole("button", { name: "Registrar saída" }));
    const dialogo = await screen.findByRole("dialog");
    await within(dialogo).findByText(/Leo Lima, o dependente, sai junto/);
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(rpc).not.toHaveBeenCalledWith("registrar_saida_do_morador", expect.anything());
  });
});

describe("a chave do WhatsApp", () => {
  beforeEach(() => {
    respostas.moradores_no_app = () => ({ data: [{ id: 31, nome: "Paula Lima", primeiro_nome: "Paula", sobrenome: "Lima", cpf: null,
      bloco: 2, unidade: 301, vinculo: "Locatário", tipo: "Titular", status: "aprovado", aprovado_em: "2026-03-10T14:00:00Z" }], error: null });
    respostas.detalhe_do_cadastro = () => ({ data: { id: 31, telefone: "21988770382", email: "p@x.com", aviso_whatsapp: true, no_app: [] }, error: null });
    respostas.editar_cadastro_do_morador = () => ({ data: null, error: null });
  });

  it("é um interruptor: desliga com um clique, e sem telefone fica desligado e travado", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: "Editar o cadastro de Paula Lima" }));
    const dialogo = await screen.findByRole("dialog", { name: "Editar o cadastro de Paula Lima" });
    const chave = await within(dialogo).findByRole("switch", { name: /Avisos por WhatsApp/ });
    expect(chave).toHaveAttribute("aria-checked", "true");
    await user.click(chave);
    expect(chave).toHaveAttribute("aria-checked", "false");
    await user.clear(within(dialogo).getByLabelText("Telefone com DDD"));
    expect(chave).toBeDisabled();
    await user.click(within(dialogo).getByRole("button", { name: "Salvar" }));
    expect(rpc).toHaveBeenCalledWith("editar_cadastro_do_morador", expect.objectContaining({ p_telefone: "", p_aviso_whatsapp: false }));
  });
});
