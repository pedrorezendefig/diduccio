import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { numerosDasPaginas } from "../lib/paginas";
import { Paginador } from "../components/app/pecas";

describe("numerosDasPaginas", () => {
  it("até 7 páginas, mostra todas", () => {
    expect(numerosDasPaginas(1, 1)).toEqual([1]);
    expect(numerosDasPaginas(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it("no meio: primeira, vizinhas da atual e última, com reticências", () => {
    expect(numerosDasPaginas(10, 30)).toEqual([1, "…", 9, 10, 11, "…", 30]);
  });
  it("perto das pontas, três de cada lado", () => {
    expect(numerosDasPaginas(1, 30)).toEqual([1, 2, 3, 4, "…", 30]);
    expect(numerosDasPaginas(3, 30)).toEqual([1, 2, 3, 4, "…", 30]);
    expect(numerosDasPaginas(30, 30)).toEqual([1, "…", 27, 28, 29, 30]);
    expect(numerosDasPaginas(28, 30)).toEqual([1, "…", 27, 28, 29, 30]);
  });
});

describe("Paginador (20 por página: Piscina e Encomendas)", () => {
  it("some quando cabe numa página", () => {
    const { container } = render(<Paginador total={20} pagina={1} porPagina={20} onPagina={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra a faixa, marca a atual e troca de página", async () => {
    const onPagina = vi.fn();
    render(<Paginador total={312} pagina={2} porPagina={20} onPagina={onPagina} rotulo="Páginas das encomendas" />);
    expect(screen.getByRole("navigation", { name: "Páginas das encomendas" })).toHaveTextContent("21–40 de 312");
    expect(screen.getByRole("button", { name: "Página 2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Página 16" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(onPagina).toHaveBeenLastCalledWith(3);
    await userEvent.click(screen.getByRole("button", { name: "Página 16" }));
    expect(onPagina).toHaveBeenLastCalledWith(16);
  });

  it("na primeira página a seta de voltar fica desligada", () => {
    render(<Paginador total={45} pagina={1} porPagina={20} onPagina={() => {}} />);
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Próxima página" })).toBeEnabled();
  });
});
