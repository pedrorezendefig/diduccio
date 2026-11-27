import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Logo from "../brand/Logo";

afterEach(cleanup);

describe("Logo", () => {
  it("as 4 variantes renderizam", () => {
    for (const v of ["full", "horizontal", "inverse", "mark"]) {
      const { container } = render(<Logo variant={v} cliente="Exemplo" />);
      expect(container.querySelector("svg")).toBeInTheDocument();
      cleanup();
    }
  });

  it("expõe rótulo acessível com o cliente", () => {
    render(<Logo variant="horizontal" cliente="Exemplo" />);
    expect(screen.getByRole("img", { name: "Diduccio, Exemplo" })).toBeInTheDocument();
  });

  it("a linha de apoio está acentuada corretamente", () => {
    render(<Logo variant="full" />);
    expect(
      screen.getByText("Sistema de Administração de Condomínio")
    ).toBeInTheDocument();
  });

  it("o swoosh não aparece fora da variante full", () => {
    const { container } = render(<Logo variant="horizontal" cliente="Exemplo" />);
    // O swoosh é o único path com stroke; o símbolo reduzido é todo preenchido.
    expect(container.querySelectorAll("path[stroke]")).toHaveLength(0);
  });

  it("o swoosh aparece na variante full", () => {
    const { container } = render(<Logo variant="full" />);
    expect(container.querySelectorAll("path[stroke]").length).toBeGreaterThan(0);
  });

  it("o símbolo isolado sobrevive a 16px sem perder elementos", () => {
    const { container } = render(<Logo variant="mark" size={16} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "16");
    // 3 torres mais a base: 4 formas, nenhuma janela ou casa.
    expect(container.querySelectorAll("path, rect")).toHaveLength(4);
  });
});
