import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider } from "../ui";
import { readFileSync } from "node:fs";

/**
 * O modal fala com o servidor por um caminho só: a função `trocar-senha`, que
 * confere a atual, troca e marca. Nenhum teste toca rede.
 */
const mockEdge = vi.fn();
vi.mock("../api/edge", async (original) => ({ ...(await original()), chamarEdgeFunction: (...a) => mockEdge(...a) }));
vi.mock("../api/supabase", () => ({ supabase: { auth: {}, rpc: vi.fn() } }));

// A base de senhas vazadas: "não vazou", a não ser no teste que diz o contrário.
const mockVazada = vi.fn(async () => false);
vi.mock("../lib/senhaVazada", async (original) => ({ ...(await original()), senhaVazada: (...a) => mockVazada(...a) }));

import TrocarSenhaObrigatoria from "../components/TrocarSenhaObrigatoria";

const EMAIL = "lucas@email.com";
const PROVISORIA = "3o9Dcu8ZMGiB2A";
const NOVA = "senhaForte123";

const onTrocada = vi.fn();

function montar() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <TrocarSenhaObrigatoria email={EMAIL} onTrocada={onTrocada} />
      </ToastProvider>
    </ThemeProvider>
  );
}

/** Preenche os três campos. */
async function preencher(user, { atual = PROVISORIA, nova = NOVA, confirma = NOVA } = {}) {
  await user.type(screen.getByLabelText("Senha atual"), atual);
  await user.type(screen.getByLabelText("Nova senha"), nova);
  await user.type(screen.getByLabelText("Repita a nova senha"), confirma);
}

const botaoSalvar = () => screen.getByRole("button", { name: /Salvar nova senha/ });

beforeEach(() => {
  mockEdge.mockReset();
  onTrocada.mockReset();
  sessionStorage.clear();
});

describe("Troca obrigatória de senha", () => {
  it("não oferece saída: sem botão de fechar", () => {
    montar();
    // O Modal só desenha o X quando recebe `title` — por isso o cabeçalho vem
    // no corpo. Um X que não fecha nada seria pior do que nenhum.
    expect(screen.queryByRole("button", { name: "Fechar" })).not.toBeInTheDocument();
  });

  it("exige a senha atual antes de liberar o botão", async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText("Nova senha"), NOVA);
    await user.type(screen.getByLabelText("Repita a nova senha"), NOVA);

    expect(botaoSalvar()).toBeDisabled();
  });

  it("senhas diferentes mantêm o botão desabilitado", async () => {
    const user = userEvent.setup();
    montar();
    await preencher(user, { confirma: "outraSenha123" });
    expect(botaoSalvar()).toBeDisabled();
  });

  it("menos de 8 caracteres mantém o botão desabilitado", async () => {
    const user = userEvent.setup();
    montar();
    await preencher(user, { nova: "abc123", confirma: "abc123" });
    expect(botaoSalvar()).toBeDisabled();
  });

  it("repetir a senha atual como nova não passa", async () => {
    const user = userEvent.setup();
    montar();
    await preencher(user, { nova: PROVISORIA, confirma: PROVISORIA });

    expect(await screen.findByText(/diferente da atual/)).toBeInTheDocument();
    expect(botaoSalvar()).toBeDisabled();
  });

  it("senha nova que já vazou: recusa antes de chamar o servidor", async () => {
    const user = userEvent.setup();
    mockVazada.mockResolvedValueOnce(true);

    montar();
    await preencher(user);
    await user.click(botaoSalvar());

    expect(await screen.findByText(/apareceu em vazamentos/)).toBeInTheDocument();
    expect(mockVazada).toHaveBeenCalledWith(NOVA);
    expect(mockEdge).not.toHaveBeenCalled();
    expect(onTrocada).not.toHaveBeenCalled();
  });

  it("senha atual errada (resposta do servidor) não libera o app", async () => {
    const user = userEvent.setup();
    mockEdge.mockResolvedValue({ status: 200, ok: false, corpo: { success: false, message: "A senha atual está incorreta." } });

    montar();
    await preencher(user, { atual: "chuteErrado" });
    await user.click(botaoSalvar());

    expect(await screen.findByText("A senha atual está incorreta.")).toBeInTheDocument();
    expect(onTrocada).not.toHaveBeenCalled();
  });

  it("sucesso: uma chamada só, com a atual e a nova, e libera o app", async () => {
    const user = userEvent.setup();
    mockEdge.mockResolvedValue({ status: 200, ok: true, corpo: { success: true } });

    montar();
    await preencher(user);
    await user.click(botaoSalvar());

    await waitFor(() => expect(onTrocada).toHaveBeenCalled());
    expect(mockEdge).toHaveBeenCalledTimes(1);
    expect(mockEdge).toHaveBeenCalledWith("trocar-senha", { atual: PROVISORIA, nova: NOVA });
  });

  it("recusa da regra do Auth (em inglês) aparece traduzida", async () => {
    const user = userEvent.setup();
    mockEdge.mockResolvedValue({ status: 200, ok: false, corpo: { success: false, message: "Password should contain at least one character of each: abc" } });

    montar();
    await preencher(user);
    await user.click(botaoSalvar());

    expect(await screen.findByText(/maiúscula, letra minúscula e número/)).toBeInTheDocument();
    expect(onTrocada).not.toHaveBeenCalled();
  });

  it("sem conexão: mensagem clara e o modal continua", async () => {
    const user = userEvent.setup();
    mockEdge.mockResolvedValue({ falhaConexao: true });

    montar();
    await preencher(user);
    await user.click(botaoSalvar());

    expect(await screen.findByText(/Sem conexão/)).toBeInTheDocument();
    expect(onTrocada).not.toHaveBeenCalled();
  });

  it("falha só na marca avisa, mas libera: a senha já mudou", async () => {
    const user = userEvent.setup();
    mockEdge.mockResolvedValue({ status: 200, ok: true, corpo: { success: true, aviso: "Sua senha foi alterada, mas não conseguimos registrar a confirmação." } });

    montar();
    await preencher(user);
    await user.click(botaoSalvar());

    expect(await screen.findByText(/não conseguimos registrar a confirmação/)).toBeInTheDocument();
    await waitFor(() => expect(onTrocada).toHaveBeenCalled());
  });

  it("a tela não chama mais marcar_senha_trocada nem troca a senha pelo navegador", () => {
    const fonte = readFileSync("src/components/TrocarSenhaObrigatoria.jsx", "utf8");
    expect(fonte).not.toMatch(/marcar_senha_trocada"\)|rpc\(|updateUser\(/);
  });
});
