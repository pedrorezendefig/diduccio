import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider, ConfirmProvider } from "../ui";
import BlocoDeNotas from "../components/BlocoDeNotas";

/**
 * O bloco de notas sozinho: salva sozinho depois de parar de digitar, salva
 * antes de fechar, e nunca some com o texto quando o salvamento falha.
 *
 * Relógio falso: o debounce é de 800 ms, e esperar de verdade deixaria o teste
 * lento e instável. O `userEvent` precisa saber do relógio falso, senão as
 * pausas dele entre teclas nunca terminam.
 *
 * E o Testing Library também: depois de cada interação ele espera um
 * `setTimeout(0)`, que no relógio falso nunca dispara — só sabe avançá-lo se
 * achar um `jest` global. Daí o `jest` de mentira. O `shouldAdvanceTime` do
 * dashboard.test resolveria de outro jeito, mas deixaria o tempo real andar o
 * relógio, e "ainda não salvou aos 500 ms" passaria a depender da máquina.
 */

let usuario;

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.jest = { advanceTimersByTime: (ms) => vi.advanceTimersByTime(ms) };
  usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
});

afterEach(() => {
  delete globalThis.jest;
  vi.useRealTimers();
});

/** Promessa que o teste resolve quando quiser. */
function adiada() {
  let resolver;
  const promessa = new Promise((r) => { resolver = r; });
  return { promessa, resolver };
}

function montar(props = {}) {
  const eventos = {
    onSalvar: vi.fn(async () => ({ success: true })),
    onFechar: vi.fn(),
    onVirarTarefa: vi.fn(),
    onVirarTodas: vi.fn(),
  };
  const r = render(
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <BlocoDeNotas textoInicial="" {...eventos} {...props} />
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
  return { ...eventos, ...props, desmontar: r.unmount };
}

const campo = () => screen.getByRole("textbox", { name: "Anotações" });
const passar = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

// O que está escrito na meta (visível) e o que o leitor de tela recebe (a
// região viva). São duas coisas de propósito: "Salvando…" a cada pausa seria
// falatório, e o anúncio espera a pessoa parar de digitar.
const estado = () => document.querySelector(".tar-notas__estado");
const anuncio = () => document.querySelector(".vit-modal [aria-live]");

/** Troca document.visibilityState e avisa, como o navegador faz ao travar a tela. */
function mudarVisibilidade(valor) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => valor });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  // Volta ao getter do protótipo.
  delete document.visibilityState;
});

describe("salvar sozinho", () => {
  it("digitar e esperar 800 ms salva uma vez, com o texto", async () => {
    const { onSalvar } = montar();
    await usuario.type(campo(), "Trocar lâmpada");
    expect(onSalvar).not.toHaveBeenCalled();
    await passar(800);
    expect(onSalvar).toHaveBeenCalledTimes(1);
    expect(onSalvar).toHaveBeenCalledWith("Trocar lâmpada");
    expect(estado()).toHaveTextContent(/^Salvo às \d{2}:\d{2}$/);
  });

  it("digitar de novo antes dos 800 ms recomeça a espera, e salva uma vez só", async () => {
    const { onSalvar } = montar();
    await usuario.type(campo(), "a");
    await passar(500);
    await usuario.type(campo(), "b");
    await passar(500);
    expect(onSalvar).not.toHaveBeenCalled();
    await passar(300);
    expect(onSalvar).toHaveBeenCalledTimes(1);
    expect(onSalvar).toHaveBeenCalledWith("ab");
  });

  it("mostra \"Salvando…\" enquanto o banco não responde, mas não o anuncia", async () => {
    const d = adiada();
    montar({ onSalvar: vi.fn(() => d.promessa) });
    await usuario.type(campo(), "x");
    await passar(800);
    expect(estado()).toHaveTextContent("Salvando…");
    expect(anuncio()).toHaveTextContent("");
    await act(async () => { d.resolver({ success: true }); });
    expect(estado()).toHaveTextContent(/^Salvo às/);
  });

  it("\"Salvo às\" só é anunciado depois de uns 2 s sem digitar", async () => {
    montar();
    expect(anuncio()).toHaveAttribute("aria-live", "polite");
    await usuario.type(campo(), "x");
    await passar(800);
    expect(estado()).toHaveTextContent(/^Salvo às/);
    expect(anuncio()).toHaveTextContent("");
    await passar(1300);
    expect(anuncio()).toHaveTextContent(/^Salvo às \d{2}:\d{2}$/);
  });

  it("voltar a digitar antes dos 2 s cancela o anúncio", async () => {
    montar();
    await usuario.type(campo(), "x");
    await passar(800);
    // A última tecla é esta: os 2 s contam daqui.
    await usuario.type(campo(), "y");
    await passar(1300);
    // O anúncio do primeiro salvamento não sai: a pessoa estava digitando.
    expect(anuncio()).toHaveTextContent("");
    await passar(600);
    expect(anuncio()).toHaveTextContent("");
    await passar(200);
    expect(anuncio()).toHaveTextContent(/^Salvo às/);
  });

  it("falha mostra e anuncia a mensagem e mantém o texto; digitar de novo tenta outra vez", async () => {
    const onSalvar = vi.fn()
      .mockResolvedValueOnce({ success: false, message: "Failed to fetch" })
      .mockResolvedValueOnce({ success: true });
    montar({ onSalvar });
    await usuario.type(campo(), "Ligar para a Enel");
    await passar(800);
    const frase = "Não foi possível salvar. Tentando de novo ao continuar digitando.";
    expect(estado()).toHaveTextContent(frase);
    expect(anuncio()).toHaveTextContent(frase);
    expect(campo()).toHaveValue("Ligar para a Enel");
    await usuario.type(campo(), "!");
    await passar(800);
    expect(onSalvar).toHaveBeenLastCalledWith("Ligar para a Enel!");
    expect(estado()).toHaveTextContent(/^Salvo às/);
  });

  it("voltar o texto ao que o banco tem apaga o aviso de erro e não salva", async () => {
    const onSalvar = vi.fn(async () => ({ success: false, message: "Failed to fetch" }));
    montar({ textoInicial: "a", onSalvar });
    await usuario.type(campo(), "{End}b");
    await passar(800);
    expect(estado()).toHaveTextContent(/Não foi possível salvar/);
    await usuario.type(campo(), "{Backspace}");
    expect(estado()).toHaveTextContent("");
    expect(anuncio()).toHaveTextContent("");
    await passar(2000);
    expect(onSalvar).toHaveBeenCalledTimes(1);
  });

  it("onSalvar que rejeita conta como falha, sem travar", async () => {
    montar({ onSalvar: vi.fn(async () => { throw new Error("Failed to fetch"); }) });
    await usuario.type(campo(), "x");
    await passar(800);
    expect(estado()).toHaveTextContent(/Não foi possível salvar/);
    expect(campo()).toHaveValue("x");
  });

  it("resposta velha não diz \"Salvo\" por cima de texto mais novo, e salva o novo depois", async () => {
    const d = adiada();
    const onSalvar = vi.fn().mockReturnValueOnce(d.promessa).mockResolvedValue({ success: true });
    montar({ onSalvar });
    await usuario.type(campo(), "a");
    await passar(800);
    expect(onSalvar).toHaveBeenCalledWith("a");
    await usuario.type(campo(), "b");
    await act(async () => { d.resolver({ success: true }); });
    expect(estado()).not.toHaveTextContent(/Salvo às/);
    await passar(800);
    expect(onSalvar).toHaveBeenCalledTimes(2);
    expect(onSalvar).toHaveBeenLastCalledWith("ab");
    expect(estado()).toHaveTextContent(/^Salvo às/);
  });

  it("nunca deixa dois salvamentos no ar ao mesmo tempo", async () => {
    // Se o segundo saísse antes de o primeiro voltar, a resposta do primeiro
    // poderia chegar por último e o banco ficaria com o texto velho.
    const d = adiada();
    const onSalvar = vi.fn().mockReturnValueOnce(d.promessa).mockResolvedValue({ success: true });
    montar({ onSalvar });
    await usuario.type(campo(), "a");
    await passar(800);
    await usuario.type(campo(), "b");
    await passar(800);
    expect(onSalvar).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolver({ success: true }); });
    await passar(0);
    expect(onSalvar).toHaveBeenCalledTimes(2);
    expect(onSalvar).toHaveBeenLastCalledWith("ab");
  });

  it("desmontar com alteração pendente salva na hora, uma vez, sem esperar o debounce", async () => {
    // A página pode desmontar o bloco sem passar pelo fechar (troca de rota):
    // a última frase digitada não pode ir junto.
    const { onSalvar, desmontar } = montar();
    await usuario.type(campo(), "x");
    desmontar();
    expect(onSalvar).toHaveBeenCalledTimes(1);
    expect(onSalvar).toHaveBeenCalledWith("x");
    await passar(2000);
    expect(onSalvar).toHaveBeenCalledTimes(1);
  });

  it("desmontar sem nada pendente não salva", async () => {
    const { onSalvar, desmontar } = montar({ textoInicial: "salvo" });
    desmontar();
    await passar(2000);
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it("desmontar com um salvamento no ar espera por ele e grava o texto mais novo", async () => {
    const d = adiada();
    const onSalvar = vi.fn().mockReturnValueOnce(d.promessa).mockResolvedValue({ success: true });
    const { desmontar } = montar({ onSalvar });
    await usuario.type(campo(), "a");
    await passar(800);
    await usuario.type(campo(), "b");
    desmontar();
    expect(onSalvar).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolver({ success: true }); });
    expect(onSalvar).toHaveBeenCalledTimes(2);
    expect(onSalvar).toHaveBeenLastCalledWith("ab");
  });

  it("a aba escondida (tela travada) salva na hora o que estava esperando o debounce", async () => {
    const { onSalvar } = montar();
    await usuario.type(campo(), "Anotado na reunião");
    act(() => { mudarVisibilidade("hidden"); });
    expect(onSalvar).toHaveBeenCalledWith("Anotado na reunião");
    await passar(2000);
    expect(onSalvar).toHaveBeenCalledTimes(1);
  });

  it("voltar a aba para visível não salva nada", async () => {
    const { onSalvar } = montar();
    await usuario.type(campo(), "x");
    act(() => { mudarVisibilidade("visible"); });
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it("pagehide também salva na hora", async () => {
    const { onSalvar } = montar();
    await usuario.type(campo(), "x");
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    expect(onSalvar).toHaveBeenCalledWith("x");
  });

  it("avisa a página quando há e quando deixa de haver texto por gravar", async () => {
    const onPendente = vi.fn();
    montar({ onPendente });
    await usuario.type(campo(), "ab");
    expect(onPendente).toHaveBeenCalledTimes(1);
    expect(onPendente).toHaveBeenLastCalledWith(true);
    await passar(800);
    expect(onPendente).toHaveBeenCalledTimes(2);
    expect(onPendente).toHaveBeenLastCalledWith(false);
  });

  it("abrir com texto que o banco ainda não tem agenda o salvamento", async () => {
    const { onSalvar } = montar({ textoInicial: "a\nb", textoSalvo: "a" });
    await passar(800);
    expect(onSalvar).toHaveBeenCalledWith("a\nb");
  });

  it("bloco que não carregou não grava sozinho ao abrir, mesmo com texto por gravar", async () => {
    // Sem saber o que o banco tem, só a pessoa digitando decide sobrescrever.
    const { onSalvar } = montar({ textoInicial: "a\nb", textoSalvo: "a", carregado: false });
    await passar(2000);
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it("o campo não aceita mais que o teto do banco", () => {
    montar();
    expect(campo()).toHaveAttribute("maxLength", "20000");
  });
});

describe("fechar", () => {
  it("fechar com alteração pendente salva antes de avisar a página", async () => {
    const ordem = [];
    const onSalvar = vi.fn(async (t) => { ordem.push(["salvar", t]); return { success: true }; });
    const onFechar = vi.fn((t, salvo) => ordem.push(["fechar", t, salvo]));
    montar({ onSalvar, onFechar });
    await usuario.type(campo(), "Pendente");
    await usuario.click(screen.getByRole("button", { name: "Fechar" }));
    expect(ordem).toEqual([["salvar", "Pendente"], ["fechar", "Pendente", true]]);
    await passar(2000);
    expect(onSalvar).toHaveBeenCalledTimes(1);
  });

  it("fechar sem alteração não salva", async () => {
    const { onSalvar, onFechar } = montar({ textoInicial: "já salvo" });
    await usuario.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onSalvar).not.toHaveBeenCalled();
    expect(onFechar).toHaveBeenCalledWith("já salvo", true);
  });

  it("Esc também salva antes de fechar", async () => {
    const { onSalvar, onFechar } = montar();
    await usuario.type(campo(), "x");
    await usuario.keyboard("{Escape}");
    expect(onSalvar).toHaveBeenCalledWith("x");
    expect(onFechar).toHaveBeenCalledWith("x", true);
  });

  it("se o salvamento ao fechar falha, fica aberto com o texto; insistir fecha e avisa que não salvou", async () => {
    const onSalvar = vi.fn(async () => ({ success: false, message: "Failed to fetch" }));
    const { onFechar } = montar({ onSalvar });
    await usuario.type(campo(), "Não perca");
    await usuario.click(screen.getByRole("button", { name: "Fechar" }));
    await passar(0);
    expect(onFechar).not.toHaveBeenCalled();
    expect(estado()).toHaveTextContent(/Não foi possível salvar/);
    expect(campo()).toHaveValue("Não perca");
    await usuario.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onFechar).toHaveBeenCalledWith("Não perca", false);
  });

  it("um salvamento que dá certo zera a insistência: a próxima falha ao fechar volta a segurar", async () => {
    const onSalvar = vi.fn()
      .mockResolvedValueOnce({ success: false, message: "Failed to fetch" })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, message: "Failed to fetch" });
    const { onFechar } = montar({ onSalvar });
    await usuario.type(campo(), "a");
    await usuario.click(screen.getByRole("button", { name: "Fechar" }));
    await passar(0);
    expect(onFechar).not.toHaveBeenCalled();
    // A rede voltou: o salvamento automático dá certo.
    await usuario.type(campo(), "b");
    await passar(800);
    expect(estado()).toHaveTextContent(/^Salvo às/);
    // Caiu de novo: a primeira tentativa de fechar volta a segurar o bloco.
    await usuario.type(campo(), "c");
    await usuario.click(screen.getByRole("button", { name: "Fechar" }));
    await passar(0);
    expect(onFechar).not.toHaveBeenCalled();
    expect(campo()).toHaveValue("abc");
  });

  it("bloco que não carregou avisa, e fechar sem digitar não grava vazio por cima", async () => {
    const { onSalvar, onFechar } = montar({ carregado: false });
    expect(screen.getByText(/Não consegui carregar o que estava salvo/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onSalvar).not.toHaveBeenCalled();
    expect(onFechar).toHaveBeenCalledWith("", true);
  });
});

/**
 * Aberto sem ter conseguido ler o banco, o bloco não sabe o que está lá: o
 * texto diferente do "salvo" pode ser só o desta tela, e gravá-lo apagaria o
 * que outro aparelho escreveu. Só digitar (ou limpar) autoriza gravar.
 */
describe("aberto sem leitura do banco", () => {
  const SEM_LEITURA = { textoInicial: "a\nb", textoSalvo: "a", carregado: false };

  it("fechar sem digitar não grava, fecha na hora e diz à página que não salvou", async () => {
    const { onSalvar, onFechar } = montar(SEM_LEITURA);
    await usuario.click(screen.getByRole("button", { name: "Fechar" }));
    await passar(0);
    expect(onSalvar).not.toHaveBeenCalled();
    expect(onFechar).toHaveBeenCalledWith("a\nb", false);
  });

  it("\"Virar tarefa\" sem digitar não grava, e entrega o texto assim mesmo", async () => {
    const { onSalvar, onVirarTarefa } = montar(SEM_LEITURA);
    await usuario.click(screen.getByRole("button", { name: "Virar em tarefa: b" }));
    await passar(0);
    expect(onSalvar).not.toHaveBeenCalled();
    expect(onVirarTarefa).toHaveBeenCalledWith("b", 1, "a\nb");
  });

  it("desmontar sem digitar não grava", async () => {
    const { onSalvar, desmontar } = montar(SEM_LEITURA);
    desmontar();
    await passar(2000);
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it("aba escondida ou pagehide sem digitar não gravam", async () => {
    const { onSalvar } = montar(SEM_LEITURA);
    act(() => { mudarVisibilidade("hidden"); });
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await passar(2000);
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it("depois de digitar um caractere, fechar grava", async () => {
    const { onSalvar, onFechar } = montar(SEM_LEITURA);
    await usuario.type(campo(), "{End}x");
    await usuario.click(screen.getByRole("button", { name: "Fechar" }));
    await passar(0);
    expect(onSalvar).toHaveBeenCalledWith("a\nbx");
    expect(onFechar).toHaveBeenCalledWith("a\nbx", true);
  });

  it("depois de digitar, desmontar grava", async () => {
    const { onSalvar, desmontar } = montar(SEM_LEITURA);
    await usuario.type(campo(), "{End}x");
    desmontar();
    expect(onSalvar).toHaveBeenCalledWith("a\nbx");
  });

  it("depois de digitar, a aba escondida grava", async () => {
    const { onSalvar } = montar(SEM_LEITURA);
    await usuario.type(campo(), "{End}x");
    act(() => { mudarVisibilidade("hidden"); });
    expect(onSalvar).toHaveBeenCalledWith("a\nbx");
  });

  it("limpar também conta como decisão da pessoa, e grava vazio", async () => {
    const { onSalvar } = montar(SEM_LEITURA);
    await usuario.click(screen.getByRole("button", { name: "Limpar bloco" }));
    await usuario.click(within(await screen.findByRole("dialog", { name: "Apagar todas as anotações?" })).getByRole("button", { name: "Apagar" }));
    await passar(0);
    expect(onSalvar).toHaveBeenCalledWith("");
  });
});

describe("passar para o quadro", () => {
  it("lista só as linhas com conteúdo, sem os espaços das pontas", () => {
    montar({ textoInicial: "  Trocar lâmpada \n\n   \nLigar para a Enel" });
    const lista = screen.getByRole("list", { name: "Passar para o quadro" });
    const itens = within(lista).getAllByRole("listitem");
    expect(itens.map((i) => within(i).getByText(/\S/, { selector: ".tar-notas__texto" }).textContent))
      .toEqual(["Trocar lâmpada", "Ligar para a Enel"]);
  });

  it("sem linha nenhuma diz que não há nada, e os botões do pé ficam desligados", () => {
    montar({ textoInicial: "  \n " });
    expect(screen.getByText("Nada anotado ainda.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Passar para o quadro" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Virar/ })).toBeDisabled();
  });

  it("a lista acompanha o que se digita", async () => {
    montar();
    await usuario.type(campo(), "a{Enter}{Enter}b");
    expect(screen.getByRole("button", { name: "Virar em tarefa: a" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Virar em tarefa: b" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Virar as 2 em tarefas" })).toBeEnabled();
  });

  it("\"Virar tarefa\" salva o pendente e entrega a linha, o índice e o texto", async () => {
    const { onSalvar, onVirarTarefa } = montar({ textoInicial: "a\n\nb\nc" });
    await usuario.type(campo(), "{End} d");
    await usuario.click(screen.getByRole("button", { name: "Virar em tarefa: b" }));
    expect(onSalvar).toHaveBeenCalledWith("a\n\nb\nc d");
    expect(onVirarTarefa).toHaveBeenCalledWith("b", 1, "a\n\nb\nc d");
  });

  it("\"Virar as N\" pergunta antes e só entrega confirmando", async () => {
    const { onVirarTodas } = montar({ textoInicial: "a\nb\nc" });
    await usuario.click(screen.getByRole("button", { name: "Virar as 3 em tarefas" }));
    const pergunta = await screen.findByRole("dialog", { name: "Criar 3 tarefas em A fazer?" });
    expect(within(pergunta).getByText("Cada linha vira uma tarefa com você como responsável.")).toBeInTheDocument();
    expect(onVirarTodas).not.toHaveBeenCalled();
    await usuario.click(within(pergunta).getByRole("button", { name: "Criar" }));
    expect(onVirarTodas).toHaveBeenCalledWith(["a", "b", "c"], "a\nb\nc");
  });

  it("desistir de \"Virar as N\" não faz nada", async () => {
    const { onVirarTodas, onFechar } = montar({ textoInicial: "a\nb" });
    await usuario.click(screen.getByRole("button", { name: "Virar as 2 em tarefas" }));
    const pergunta = await screen.findByRole("dialog", { name: "Criar 2 tarefas em A fazer?" });
    await usuario.click(within(pergunta).getByRole("button", { name: "Cancelar" }));
    expect(onVirarTodas).not.toHaveBeenCalled();
    expect(onFechar).not.toHaveBeenCalled();
  });

  it("com uma linha só, o botão e a pergunta falam no singular", async () => {
    montar({ textoInicial: "a" });
    await usuario.click(screen.getByRole("button", { name: "Virar 1 em tarefa" }));
    expect(await screen.findByRole("dialog", { name: "Criar 1 tarefa em A fazer?" })).toBeInTheDocument();
  });
});

describe("limpar", () => {
  it("pergunta antes; confirmando, esvazia e salva vazio", async () => {
    const { onSalvar } = montar({ textoInicial: "a\nb" });
    await usuario.click(screen.getByRole("button", { name: "Limpar bloco" }));
    const pergunta = await screen.findByRole("dialog", { name: "Apagar todas as anotações?" });
    expect(onSalvar).not.toHaveBeenCalled();
    await usuario.click(within(pergunta).getByRole("button", { name: "Apagar" }));
    await passar(0);
    expect(campo().value).toBe("");
    expect(onSalvar).toHaveBeenCalledWith("");
    expect(screen.getByText("Nada anotado ainda.")).toBeInTheDocument();
  });

  it("desistir deixa tudo como estava", async () => {
    const { onSalvar } = montar({ textoInicial: "a\nb" });
    await usuario.click(screen.getByRole("button", { name: "Limpar bloco" }));
    const pergunta = await screen.findByRole("dialog", { name: "Apagar todas as anotações?" });
    await usuario.click(within(pergunta).getByRole("button", { name: "Cancelar" }));
    expect(campo()).toHaveValue("a\nb");
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it("bloco vazio não oferece limpar", () => {
    montar({ textoInicial: "" });
    expect(screen.getByRole("button", { name: "Limpar bloco" })).toBeDisabled();
  });
});
