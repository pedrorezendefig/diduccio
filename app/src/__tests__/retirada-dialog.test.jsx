import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RetiradaDialog from "../components/RetiradaDialog";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider } from "../ui";

/**
 * O diálogo que substitui o livro de papel da portaria.
 *
 * O que estes testes protegem não é a aparência: é que o registro conte a
 * verdade. Cada regra aqui existe porque a alternativa produz um comprovante
 * que parece completo e não prova nada — e um registro que mente é pior que
 * registro nenhum, porque encerra a discussão.
 */

const registrar = vi.fn(async () => ({ success: true, id: 77 }));
// Quem do apartamento usa o app (0086). Vazio por padrão: o caminho de sempre.
const quem = vi.fn(async () => []);
vi.mock("../api/retiradas", () => ({
  registrarRetirada: (...args) => registrar(...args),
  quemRetiraPeloApp: (...args) => quem(...args),
}));

/**
 * Substitui SÓ a extração do PNG, mantendo o componente de assinatura real —
 * é dele que vem o `data-testid` que estes testes usam para desenhar.
 *
 * Motivo: no jsdom o `toBlob` nunca chama o callback, então a função real espera
 * os 5 segundos do prazo antes de desistir. Isso é o comportamento certo em
 * produção (o alternativo é ficar pendurado para sempre) e inviável aqui, onde
 * cada teste esperaria 5s. O prazo em si é testado em assinatura.test.jsx.
 *
 * Devolve `null` de propósito: é o que o navegador devolve quando não consegue
 * exportar, e serve para provar que o diálogo repassa isso em vez de fabricar
 * uma assinatura para contornar a recusa da camada de dados.
 */
vi.mock("../components/Assinatura", async (importarOriginal) => {
  const real = await importarOriginal();
  return { ...real, assinaturaParaBlob: async () => null };
});

// `notificado: "SIM"` não é enfeite: sem notificação enviada o campo de código
// nasce bloqueado, porque não existe código na mão de ninguém.
const PENDENTES = [
  { id: 1, nome: "Neide Carvalho", cod: "K7M2P", numero_encomenda: "2128K", id_morador: 90, notificado: "SIM" },
  { id: 2, nome: "Neide Carvalho", cod: "R4T8W", numero_encomenda: "3391B", id_morador: 90, notificado: "SIM" },
];

const aoConcluir = vi.fn();

/**
 * As mesmas encomendas, sem notificação enviada.
 *
 * Toda vez que um teste conclui a retirada SEM digitar código, é deste caminho
 * que ele fala: identificação manual, que existe para quem nunca recebeu
 * código. Com aviso enviado o código é obrigatório, então usar o fixture
 * notificado aqui deixaria o teste medindo outra coisa.
 */
const SEM_AVISO = PENDENTES.map((p) => ({ ...p, notificado: "NAO" }));

function montar(props = {}) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <RetiradaDialog
          aberto
          pendentes={PENDENTES}
          idUnidade={5302}
          usuario={{ nome: "Porteiro Teste" }}
          aoFechar={() => {}}
          aoConcluir={aoConcluir}
          {...props}
        />
      </ToastProvider>
    </ThemeProvider>
  );
}

/** O jsdom não tem canvas; o campo de assinatura registra o gesto de qualquer
 *  forma, e é o gesto que estes testes disparam. */
const desenhar = () => {
  const tela = screen.getByTestId("assinatura-tela");
  fireEvent.pointerDown(tela, { clientX: 5, clientY: 5 });
  fireEvent.pointerMove(tela, { clientX: 40, clientY: 30 });
  fireEvent.pointerUp(tela);
};

// A janela é em 3 passos (2026-11-04): Quem retira → O que sai → Assinar.
const continuar = () => userEvent.click(screen.getByRole("button", { name: "Continuar" }));
const concluirBtn = () => screen.getByRole("button", { name: /concluir/i });
const noPasso = (nome) =>
  expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent(nome);

/** Chega à assinatura (do passo em que estiver) e assina. */
const assinar = async () => {
  if (!screen.queryByTestId("assinatura-tela")) await continuar();
  desenhar();
};

// As caixas da conferência. O check "é quem usa o app" fica no passo 1.
const caixasDosItens = () =>
  within(screen.getByRole("group", { name: /itens entregues/i })).getAllByRole("checkbox");

/**
 * Identificação manual e Continuar. Com o check "é quem usa o app" marcado e
 * sem os campos na tela, desmarca primeiro: é o caminho de quem não tem app.
 */
const preencherIdentificacao = async () => {
  await new Promise((r) => setTimeout(r, 0));
  const doApp = screen.queryByLabelText(/quem usa o app/i);
  if (doApp?.checked && !screen.queryByLabelText(/nome de quem/i)) await userEvent.click(doApp);
  await userEvent.type(screen.getByLabelText(/nome de quem/i), "Filha da Neide");
  await userEvent.type(screen.getByLabelText(/cpf de quem/i), "11122233344");
  await continuar();
};

/** Vai até a lista do que sai (passando pela identificação, se preciso). */
const irParaItens = async () => {
  if (screen.queryByLabelText(/nome de quem/i) || screen.queryByLabelText(/quem usa o app/i)) {
    await preencherIdentificacao();
  }
  const mudar = screen.queryByRole("button", { name: "Mudar itens" });
  if (mudar) await userEvent.click(mudar);
};

beforeEach(() => {
  registrar.mockClear();
  registrar.mockResolvedValue({ success: true, id: 77 });
  aoConcluir.mockClear();
  quem.mockReset();
  quem.mockResolvedValue([]);
});
afterEach(cleanup);

describe("RetiradaDialog", () => {
  it("abre no passo Quem retira", () => {
    montar();
    noPasso("Quem retira");
    expect(screen.queryByRole("button", { name: /concluir/i })).toBeNull();
  });

  it("abre com todas as encomendas já marcadas", async () => {
    // O porteiro desmarca o que não saiu, e não marca o que saiu.
    montar({ pendentes: SEM_AVISO });
    await irParaItens();
    const caixas = caixasDosItens();
    expect(caixas).toHaveLength(2);
    for (const c of caixas) expect(c).toBeChecked();
  });

  it("uma encomenda só: da identificação vai direto para a assinatura", async () => {
    montar({ pendentes: SEM_AVISO.slice(0, 1) });
    await preencherIdentificacao();
    noPasso("Assinar");
    expect(screen.getByText(/Leva 1 volume de 1 encomenda/)).toBeInTheDocument();
  });

  it("não deixa concluir sem assinatura", async () => {
    montar({ pendentes: SEM_AVISO });
    await preencherIdentificacao();
    expect(concluirBtn()).toBeDisabled();
  });

  it("libera concluir depois de assinar", async () => {
    montar({ pendentes: SEM_AVISO });
    await preencherIdentificacao();
    await assinar();
    expect(concluirBtn()).toBeEnabled();
  });

  it("desmarcar tudo exige observação", async () => {
    // Assinatura sem nada ligado e sem explicação é comprovante que não prova nada.
    montar({ pendentes: SEM_AVISO });
    await irParaItens();
    for (const c of caixasDosItens()) await userEvent.click(c);
    await assinar();
    expect(concluirBtn()).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/observação/i), "Caixa sem cadastro");
    expect(concluirBtn()).toBeEnabled();
  });

  it("código que casa manda via=codigo e o titular da encomenda", async () => {
    // `idMorador` é o TITULAR, não quem retirou.
    montar();
    await userEvent.type(screen.getByLabelText(/código de retirada/i), "k7m2p");
    await preencherIdentificacao();
    await assinar();
    await userEvent.click(concluirBtn());
    await waitFor(() => expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({ via: "codigo", idMorador: 90, idUnidade: 5302 })
    ));
  });

  it("marcado 'é quem usa o app', nome e CPF não se digitam", async () => {
    // Vêm do cadastro da pessoa no app, depois do código ou do QR.
    montar();
    expect(screen.queryByLabelText(/nome de quem/i)).toBeNull();
    expect(screen.getByText(/o sistema descobre quem é/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/quem usa o app/i));
    expect(screen.getByLabelText(/nome de quem/i)).toBeEnabled();
    expect(screen.getByLabelText(/cpf de quem/i)).toBeEnabled();
  });

  it("com a trava ligada: desmarcado, o QR desliga, mas com aviso enviado o código continua obrigatório", async () => {
    // Auditoria 05/11 (V1): sem isto, desmarcar entregava a encomenda avisada
    // só com nome e CPF digitados. Desligada em 23/11 (decisão do usuário).
    montar({ codigoDeQuemNaoUsaOApp: true });
    await userEvent.click(screen.getByLabelText(/quem usa o app/i));
    expect(screen.getByRole("button", { name: /ler qr do celular/i })).toBeDisabled();
    expect(screen.getByLabelText(/código de retirada/i)).toBeRequired();
    expect(screen.getByText(/peça ao morador o código/i)).toBeInTheDocument();
  });

  it("sem a trava (padrão): desmarcado, com aviso enviado, segue sem código", async () => {
    montar();
    await userEvent.click(screen.getByLabelText(/quem usa o app/i));
    expect(screen.getByRole("button", { name: /ler qr do celular/i })).toBeDisabled();
    expect(screen.queryByLabelText(/código de retirada/i)).toBeNull();
    await userEvent.type(screen.getByLabelText(/nome de quem/i), "Filha da Neide");
    await userEvent.type(screen.getByLabelText(/cpf de quem/i), "11122233344");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
  });

  it("sem código, é identificação manual", async () => {
    montar({ pendentes: SEM_AVISO });
    await preencherIdentificacao();
    await assinar();
    await userEvent.click(concluirBtn());
    await waitFor(() => expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({ via: "identificacao", idMorador: null, nome: "Filha da Neide" })
    ));
  });

  it("manda só as encomendas marcadas", async () => {
    montar({ pendentes: SEM_AVISO });
    await irParaItens();
    await userEvent.click(caixasDosItens()[1]);
    await assinar();
    await userEvent.click(concluirBtn());
    await waitFor(() =>
      expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ entregas: [1] }))
    );
  });

  it("falha na gravação mostra a mensagem e NÃO conclui", async () => {
    registrar.mockResolvedValue({ success: false, message: "A assinatura não foi capturada." });
    montar({ pendentes: SEM_AVISO });
    await preencherIdentificacao();
    await assinar();
    await userEvent.click(concluirBtn());
    expect(await screen.findByText(/assinatura não foi capturada/i)).toBeInTheDocument();
    expect(aoConcluir).not.toHaveBeenCalled();
  });

  it("avisa quando o código digitado não é de nenhuma encomenda da unidade", async () => {
    montar();
    await userEvent.type(screen.getByLabelText(/código de retirada/i), "ZZZZZ");
    expect(await screen.findByText(/não é de nenhuma encomenda da unidade/i)).toBeInTheDocument();
  });

  it("não acusa desencontro enquanto o código está pela metade", async () => {
    montar();
    await userEvent.type(screen.getByLabelText(/código de retirada/i), "K7M");
    expect(screen.queryByText(/não é de nenhuma encomenda/i)).not.toBeInTheDocument();
  });

  it("não passa assinatura fabricada quando o canvas não exporta", async () => {
    // No jsdom `toBlob` não existe, então o blob é null; a camada de dados recusa.
    montar({ pendentes: SEM_AVISO });
    await preencherIdentificacao();
    await assinar();
    await userEvent.click(concluirBtn());
    await waitFor(() => expect(registrar).toHaveBeenCalled());
    expect(registrar.mock.calls[0][0].assinatura).toBeNull();
  });
});

/**
 * A unidade de conferência é a NOTA FISCAL (0029): o número impresso na
 * etiqueta identifica o pacote na prateleira.
 */
describe("itens da retirada", () => {
  const CADASTRO = [{
    id: 1, nome: "Neide Carvalho", numero_encomenda: "2128K",
    quantidade_encomenda: "2", notificado: "NAO", cod: "K7M2P", id_morador: 90,
  }];
  const NOTAS = [
    { id: 41, id_encomenda: 1, numero_fiscal: "8437", transportadora: "Correios" },
    { id: 42, id_encomenda: 1, numero_fiscal: "8438" },
    { id: 99, id_encomenda: 77, numero_fiscal: "0000" }, // de outro cadastro
  ];

  it("mostra uma caixa por nota, todas marcadas", async () => {
    montar({ pendentes: CADASTRO, notasFiscais: NOTAS });
    await irParaItens();
    expect(screen.getByLabelText("NF 8437 · Correios")).toBeChecked();
    expect(screen.getByLabelText("NF 8438")).toBeChecked();
    expect(screen.queryByLabelText(/0000/)).not.toBeInTheDocument();
  });

  it("volume declarado sem nota vira item genérico", async () => {
    montar({
      pendentes: [{ id: 1, nome: "Neide", quantidade_encomenda: "2", notificado: "SIM" }],
      notasFiscais: [],
    });
    await irParaItens();
    expect(caixasDosItens()).toHaveLength(2);
    expect(screen.getByLabelText("Volume sem nota 1")).toBeChecked();
  });

  it("ITEM JÁ RETIRADO não aparece de novo", async () => {
    montar({
      pendentes: [{ ...CADASTRO[0], volumes_retirados: 1 }],
      notasFiscais: NOTAS,
      jaRetirados: [{ id: 7, id_entrega: 1, id_nota: 41 }],
    });
    await irParaItens();
    expect(screen.queryByLabelText(/8437/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("NF 8438")).toBeChecked();
    expect(screen.getByText(/1 já retirado/)).toBeInTheDocument();
  });

  it("levar o que restou FECHA o cadastro", async () => {
    montar({
      pendentes: [{ ...CADASTRO[0], volumes_retirados: 1 }],
      notasFiscais: NOTAS,
      jaRetirados: [{ id: 7, id_entrega: 1, id_nota: 41 }],
    });
    await preencherIdentificacao();
    await assinar();
    await userEvent.click(concluirBtn());
    await waitFor(() => expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({ entregas: [1], itens: [{ id_entrega: 1, id_nota: 42 }] })
    ));
  });

  it("sobrando item, o cadastro NÃO fecha e vai como parcial", async () => {
    montar({ pendentes: CADASTRO, notasFiscais: NOTAS });
    await irParaItens();
    await userEvent.click(screen.getByLabelText("NF 8438"));
    await assinar();
    expect(concluirBtn()).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/observação/i), "NF 8438 nao estava na prateleira");
    await userEvent.click(concluirBtn());
    await waitFor(() => expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({ entregas: [], itens: [{ id_entrega: 1, id_nota: 41 }] })
    ));
  });

  it("levando tudo, o cadastro fecha", async () => {
    montar({ pendentes: CADASTRO, notasFiscais: NOTAS });
    await preencherIdentificacao();
    await assinar();
    await userEvent.click(concluirBtn());
    await waitFor(() => expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        entregas: [1],
        itens: [{ id_entrega: 1, id_nota: 41 }, { id_entrega: 1, id_nota: 42 }],
      })
    ));
  });

  it("desmarcar TUDO não é parcial, é nada", async () => {
    montar({ pendentes: CADASTRO, notasFiscais: NOTAS });
    await irParaItens();
    for (const c of caixasDosItens()) await userEvent.click(c);
    await assinar();
    await userEvent.type(screen.getByLabelText(/observação/i), "Nada estava na prateleira");
    await userEvent.click(concluirBtn());
    await waitFor(() => expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({ entregas: [], itens: [] })
    ));
  });
});

describe("código e QR", () => {
  it("desde o 0063 o morador tem o código (e o QR) no app", () => {
    montar({
      pendentes: [{ id: 1, nome: "Neide Carvalho", cod: "K7M2P", numero_encomenda: "2128K", notificado: "NAO" }],
    });
    expect(screen.getByLabelText(/código de retirada/i)).toBeEnabled();
    expect(screen.getByText(/tem o código no app/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ler QR/ })).toBeEnabled();
  });

  it("encomenda sem código nenhum: nem campo nem check, segue pela identificação", () => {
    montar({
      pendentes: [{ id: 1, nome: "Neide Carvalho", cod: null, numero_encomenda: "2128K", notificado: "NAO" }],
    });
    expect(screen.queryByLabelText(/código de retirada/i)).toBeNull();
    expect(screen.queryByLabelText(/quem usa o app/i)).toBeNull();
    expect(screen.getByLabelText(/nome de quem/i)).toBeEnabled();
  });

  it("ninguém da unidade no app: o campo não aparece", () => {
    montar({ pendentes: SEM_AVISO, temApp: false });
    expect(screen.queryByLabelText(/código de retirada/i)).toBeNull();
  });

  it("mais de uma encomenda da unidade: todas na lista, uma assinatura só", async () => {
    montar({ pendentes: SEM_AVISO });
    await irParaItens();
    expect(screen.getByText(/2 encomendas da unidade/)).toBeInTheDocument();
    expect(caixasDosItens()).toHaveLength(2);
  });

  it("aberta pelo QR, já vem com o código conferido", () => {
    montar({ codigoInicial: "K7M2P" });
    expect(screen.getByText(/Confere: #2128K/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/código de retirada/i)).toBeNull();
  });

  it("pelo app, Continuar só depois do código", async () => {
    montar({ pendentes: SEM_AVISO });
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/código de retirada/i), "ZZZZZ");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("outra encomenda da unidade fica de fora; o código dela inclui", async () => {
    montar({ pendentes: SEM_AVISO, temApp: true, idAberto: 1 });
    await userEvent.type(screen.getByLabelText(/código de retirada/i), "K7M2P");
    await preencherIdentificacao();
    noPasso("O que sai");
    expect(caixasDosItens()).toHaveLength(1);
    expect(screen.getByText(/#3391B · Neide Carvalho · 1 na prateleira/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/código de outra encomenda/i), "R4T8W");
    expect(caixasDosItens()).toHaveLength(2);
    expect(caixasDosItens()[1]).toBeChecked();
    expect(screen.getByText(/Confere: #3391B/)).toBeInTheDocument();
  });

  it("dois códigos, duas encomendas, uma assinatura", async () => {
    montar({ pendentes: SEM_AVISO, temApp: true, idAberto: 1 });
    await userEvent.type(screen.getByLabelText(/código de retirada/i), "K7M2P");
    await preencherIdentificacao();
    await userEvent.type(screen.getByLabelText(/código de outra encomenda/i), "R4T8W");
    await assinar();
    await userEvent.click(concluirBtn());
    await waitFor(() =>
      expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ entregas: [1, 2], via: "codigo" }))
    );
  });

  it("sem app e sem código na mão de ninguém, as outras encomendas entram marcando", async () => {
    montar({ pendentes: SEM_AVISO, idAberto: 1 });
    await preencherIdentificacao();
    const [aberta, outra] = caixasDosItens();
    expect(aberta).toBeChecked();
    expect(outra).not.toBeChecked();
    expect(screen.queryByLabelText(/código de outra encomenda/i)).toBeNull();
  });

  it("com a trava ligada: app na unidade e quem veio não usa, outra encomenda só entra pelo código dela", async () => {
    // Auditoria 05/11 (V1): o código chegou pelo app; sem ele, a outra
    // encomenda não vira caixa para marcar. Desligada em 23/11 (abaixo).
    montar({ pendentes: SEM_AVISO, temApp: true, idAberto: 1, codigoDeQuemNaoUsaOApp: true });
    await userEvent.click(screen.getByLabelText(/quem usa o app/i));
    await userEvent.type(screen.getByLabelText(/nome de quem/i), "Filha da Neide");
    await userEvent.type(screen.getByLabelText(/cpf de quem/i), "11122233344");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/código de retirada/i), "K7M2P");
    await continuar();
    expect(caixasDosItens()).toHaveLength(1);
    expect(screen.getByLabelText(/código de outra encomenda/i)).toBeInTheDocument();
  });

  it("com a trava ligada: notificada e quem veio não usa o app, sem o código não segue; com ele, segue", async () => {
    montar({ pendentes: PENDENTES.slice(0, 1), codigoDeQuemNaoUsaOApp: true });
    await userEvent.click(screen.getByLabelText(/quem usa o app/i));
    await userEvent.type(screen.getByLabelText(/nome de quem/i), "Filha da Neide");
    await userEvent.type(screen.getByLabelText(/cpf de quem/i), "11122233344");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/código de retirada/i), "K7M2P");
    await assinar();
    expect(concluirBtn()).toBeEnabled();
  });

  // Decisão do usuário (23/11/2026): no começo do app, quem não usa o app
  // retira com nome, CPF e assinatura, sem código. É o padrão agora.
  it("sem a trava (padrão): app na unidade e quem veio não usa, segue sem código", async () => {
    montar({ pendentes: SEM_AVISO, temApp: true, idAberto: 1 });
    await userEvent.click(screen.getByLabelText(/quem usa o app/i));
    expect(screen.queryByLabelText(/código de retirada/i)).toBeNull();
    await userEvent.type(screen.getByLabelText(/nome de quem/i), "Filha da Neide");
    await userEvent.type(screen.getByLabelText(/cpf de quem/i), "11122233344");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
    await continuar();
    // As outras encomendas do apartamento entram marcando, como sem app.
    expect(caixasDosItens()).toHaveLength(2);
  });

  it("sem a trava (padrão): marcado 'quem usa o app', o código continua sendo o caminho", async () => {
    montar({ pendentes: SEM_AVISO, temApp: true, idAberto: 1 });
    expect(screen.getByLabelText(/código de retirada/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("religar o app depois de marcar sem app não leva a encomenda marcada", async () => {
    // Auditoria 05/11 (V2): marcada sem app, a encomenda 2 virava texto ao
    // religar o app, mas seguia nos itens e saía como "conferida pelo código".
    montar({ pendentes: SEM_AVISO, idAberto: 1 });
    await preencherIdentificacao();                           // sem app
    await userEvent.click(caixasDosItens()[1]);               // marca a encomenda 2
    await userEvent.click(screen.getByRole("button", { name: "Voltar" }));
    await userEvent.click(screen.getByLabelText(/quem usa o app/i)); // religa o app
    await userEvent.type(screen.getByLabelText(/código de retirada/i), "K7M2P"); // código da 1
    await userEvent.type(screen.getByLabelText(/nome de quem/i), "Neide Carvalho");
    await userEvent.type(screen.getByLabelText(/cpf de quem/i), "11122233344");
    await continuar();
    await assinar();
    await userEvent.click(concluirBtn());
    await waitFor(() => expect(registrar).toHaveBeenCalled());
    const { itens, entregas } = registrar.mock.calls[0][0];
    expect(itens.every((i) => i.id_entrega === 1)).toBe(true);
    expect(entregas).toEqual([1]);
  });
});

/**
 * Quem veio é quem usa o app (2026-11-04).
 *
 * O código é da ENCOMENDA e serve a todos do apartamento no app. O QR diz qual
 * pessoa o mostrou; digitado, com mais de uma pessoa, o porteiro escolhe.
 */
describe("quem veio é quem usa o app", () => {
  // Como o banco responde desde a 0096: CPF mascarado e se há CPF no app.
  const TITULAR = { id: 41, nome: "Neide Carvalho", cpf: "***.222.333-**", tipo: "Titular", tem_cpf: true };
  const FILHA = { id: 42, nome: "Clara Carvalho", cpf: "***.666.777-**", tipo: "Dependente", tem_cpf: true };
  beforeEach(() => quem.mockResolvedValue([TITULAR, FILHA]));

  it("sem app na unidade, o check não aparece", () => {
    montar({ pendentes: SEM_AVISO, temApp: false });
    expect(screen.queryByLabelText(/quem usa o app/i)).toBeNull();
  });

  it("nasce marcado", () => {
    montar({ temApp: true });
    expect(screen.getByLabelText(/quem usa o app/i)).toBeChecked();
  });

  it("o QR diz que é a dependente: o cartão dela, e a janela segue sozinha para assinar", async () => {
    montar({ temApp: true, codigoInicial: "K7M2P", appInicial: 42 });
    expect(await screen.findByText("Clara Carvalho")).toBeInTheDocument();
    expect(quem).toHaveBeenCalledWith("K7M2P");
    expect(screen.queryByLabelText(/nome de quem/i)).toBeNull();
    await waitFor(() => noPasso("Assinar"), { timeout: 2000 });
    desenhar();
    await userEvent.click(concluirBtn());
    // O CPF não passa pelo navegador: vai o código e quem é, e o banco completa.
    await waitFor(() => expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({ via: "codigo", nome: "Clara Carvalho", pelaApp: { cod: "K7M2P", idApp: 42 } })
    ));
    expect(registrar.mock.calls[0][0].cpf).toBe("");
  });

  it("código digitado e duas pessoas no app: o porteiro escolhe quem é", async () => {
    montar({ temApp: true });
    await userEvent.type(screen.getByLabelText(/código de retirada/i), "K7M2P");
    await userEvent.click(await screen.findByRole("button", { name: /Neide Carvalho/ }));
    expect(screen.getByText(/Titular · CPF \*\*\*\.222\.333-\*\*/)).toBeInTheDocument();
  });

  it("uma pessoa só no app: o código já basta", async () => {
    quem.mockResolvedValue([TITULAR]);
    montar({ temApp: true });
    await userEvent.type(screen.getByLabelText(/código de retirada/i), "K7M2P");
    expect(await screen.findByText(/Titular · CPF/)).toBeInTheDocument();
  });

  it("pessoa do app sem CPF lá: o porteiro digita o CPF do documento", async () => {
    quem.mockResolvedValue([{ id: 43, nome: "Rui Carvalho", cpf: null, tipo: "Titular", tem_cpf: false }]);
    montar({ temApp: true, codigoInicial: "K7M2P", appInicial: 43 });
    expect(await screen.findByText(/sem CPF no app/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/cpf de quem/i), "11122233344");
    await waitFor(() => noPasso("Assinar"), { timeout: 2000 });
    desenhar();
    await userEvent.click(concluirBtn());
    await waitFor(() => expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({ pelaApp: null, cpf: "111.222.333-44" })
    ));
  });

  it("desmarcado: o porteiro digita o nome e o CPF de quem veio", async () => {
    montar({ temApp: true, codigoInicial: "K7M2P", appInicial: 42 });
    await screen.findByText("Clara Carvalho");
    await userEvent.click(screen.getByLabelText(/quem usa o app/i));
    expect(screen.getByLabelText(/nome de quem/i)).toHaveValue("");
    expect(screen.getByLabelText(/cpf de quem/i)).toHaveValue("");
    noPasso("Quem retira");
  });
});
