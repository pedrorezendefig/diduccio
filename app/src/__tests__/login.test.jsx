import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Skyline, { SkylineCarga } from "../brand/Skyline";

/**
 * A tela não fala mais direto com o backend: só chama `entrar` de
 * `../api/auth`, que já tem cobertura própria (auth.test.js). Aqui o que
 * importa é que a tela chame `entrar` com o identificador digitado, sem
 * mexer nele, e reaja certo ao resultado.
 */
const mockEntrar = vi.fn();
vi.mock("../api/auth", () => ({
  entrar: (...args) => mockEntrar(...args),
  sair: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const real = await vi.importActual("react-router-dom");
  return { ...real, useNavigate: () => mockNavigate };
});

import SelecaoUsuario from "../pages/SelecaoUsuario";

const USUARIO = { id: 3, email: "marcelo@nr.com", cargo: "Sindico" };

function montar(onSelectUser = vi.fn()) {
  return render(
    <MemoryRouter>
      <SelecaoUsuario onSelectUser={onSelectUser} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockEntrar.mockReset();
  mockNavigate.mockReset();
  sessionStorage.clear();
});

describe("Tela de acesso", () => {
  it("renderiza os campos de identificador e senha, e o botão de entrar", () => {
    montar();
    expect(screen.getByLabelText("E-mail ou CPF")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  it("login com e-mail chama entrar e navega para o Início", async () => {
    const user = userEvent.setup();
    const onSelectUser = vi.fn();
    mockEntrar.mockResolvedValue({
      success: true,
      usuario: USUARIO,
      deveTrocarSenha: false,
    });

    montar(onSelectUser);
    await user.type(screen.getByLabelText("E-mail ou CPF"), "marcelo@nr.com");
    await user.type(screen.getByLabelText("Senha"), "senha123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(mockEntrar).toHaveBeenCalledWith("marcelo@nr.com", "senha123"));
    expect(onSelectUser).toHaveBeenCalledWith(USUARIO);
    expect(JSON.parse(sessionStorage.getItem("usuarioLogado"))).toEqual(USUARIO);
    expect(mockNavigate).toHaveBeenCalledWith("/inicio");
  });

  it("login com CPF mascarado passa o identificador para entrar sem alterá-lo", async () => {
    const user = userEvent.setup();
    mockEntrar.mockResolvedValue({
      success: true,
      usuario: USUARIO,
      deveTrocarSenha: false,
    });

    montar();
    await user.type(screen.getByLabelText("E-mail ou CPF"), "111.222.333-44");
    await user.type(screen.getByLabelText("Senha"), "senha123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(mockEntrar).toHaveBeenCalledWith("111.222.333-44", "senha123")
    );
  });

  it("mostra a mensagem devolvida por entrar quando a credencial falha", async () => {
    const user = userEvent.setup();
    mockEntrar.mockResolvedValue({
      success: false,
      message: "Usuário ou senha incorretos.",
    });

    montar();
    await user.type(screen.getByLabelText("E-mail ou CPF"), "marcelo@nr.com");
    await user.type(screen.getByLabelText("Senha"), "errada");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Usuário ou senha incorretos.")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("quem precisa trocar a senha também entra no Início", async () => {
    const user = userEvent.setup();
    mockEntrar.mockResolvedValue({
      success: true,
      usuario: USUARIO,
      deveTrocarSenha: true,
    });

    montar();
    await user.type(screen.getByLabelText("E-mail ou CPF"), "marcelo@nr.com");
    await user.type(screen.getByLabelText("Senha"), "provisoria");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    // A exigência de trocar não desvia mais a navegação: a pessoa entra e o
    // modal vem por cima, decidido pelo App a partir do banco. O desvio daqui
    // só acontecia no login, e deixava passar quem recarregava a página com a
    // sessão ainda viva.
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/inicio"));
  });
});

describe("Skyline", () => {
  it("nenhuma janela cai fora do prédio dela", () => {
    const { container } = render(<Skyline />);
    const grupos = container.querySelectorAll("g");
    const num = (el, a) => parseFloat(el.getAttribute(a));

    const predios = [...grupos[0].querySelectorAll("rect")].map((r) => ({
      x: num(r, "x"), y: num(r, "y"), w: num(r, "width"), h: num(r, "height"),
    }));
    const janelas = [...grupos[1].querySelectorAll("rect")].map((r) => ({
      x: num(r, "x"), y: num(r, "y"), w: num(r, "width"), h: num(r, "height"),
    }));

    expect(predios.length).toBeGreaterThan(0);
    expect(janelas.length).toBeGreaterThan(0);

    const fora = janelas.filter((j) => {
      const cx = j.x + j.w / 2;
      const dono = predios.find((p) => cx > p.x && cx < p.x + p.w);
      if (!dono) return true;
      return (
        j.x < dono.x || j.x + j.w > dono.x + dono.w ||
        j.y < dono.y || j.y + j.h > dono.y + dono.h
      );
    });

    expect(fora).toEqual([]);
  });

  it("o desenho é o mesmo em toda renderização", () => {
    const a = render(<Skyline />).container.innerHTML;
    const b = render(<Skyline />).container.innerHTML;
    expect(a).toBe(b);
  });

  it("tem janelas sempre acesas, para a fachada não virar pisca-pisca", () => {
    const { container } = render(<Skyline />);
    expect(container.querySelectorAll(".vit-jan--fixa").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".vit-jan--anima").length).toBeGreaterThan(0);
  });

  it("as janelas animadas não compartilham a mesma duração", () => {
    const { container } = render(<Skyline />);
    const duracoes = new Set(
      [...container.querySelectorAll(".vit-jan--anima")].map(
        (r) => r.style.animationDuration
      )
    );
    // Durações iguais fariam a cidade piscar em coro.
    expect(duracoes.size).toBeGreaterThan(3);
  });

  it("o skyline de carregamento varre da esquerda para a direita", () => {
    const { container } = render(<SkylineCarga />);
    const janelas = [...container.querySelectorAll(".vit-jan-carga")];
    expect(janelas.length).toBeGreaterThan(0);

    // O atraso tem que crescer com o x: é isso que faz a onda atravessar.
    const pares = janelas.map((r) => ({
      x: parseFloat(r.getAttribute("x")),
      atraso: parseFloat(r.style.animationDelay),
    }));
    const maisAEsquerda = pares.reduce((a, b) => (a.x < b.x ? a : b));
    const maisADireita = pares.reduce((a, b) => (a.x > b.x ? a : b));
    expect(maisADireita.atraso).toBeGreaterThan(maisAEsquerda.atraso);
  });

  it("nenhuma janela do carregamento cai fora do prédio", () => {
    const { container } = render(<SkylineCarga />);
    const grupos = container.querySelectorAll("g");
    const num = (el, a) => parseFloat(el.getAttribute(a));
    const predios = [...grupos[0].querySelectorAll("rect")].map((r) => ({
      x: num(r, "x"), y: num(r, "y"), w: num(r, "width"), h: num(r, "height"),
    }));
    const janelas = [...grupos[1].querySelectorAll("rect")].map((r) => ({
      x: num(r, "x"), y: num(r, "y"), w: num(r, "width"), h: num(r, "height"),
    }));

    const fora = janelas.filter((j) => {
      const cx = j.x + j.w / 2;
      const dono = predios.find((p) => cx > p.x && cx < p.x + p.w);
      if (!dono) return true;
      return (
        j.x < dono.x || j.x + j.w > dono.x + dono.w ||
        j.y < dono.y || j.y + j.h > dono.y + dono.h
      );
    });

    expect(fora).toEqual([]);
  });
});
