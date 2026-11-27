import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { readFileSync } from "node:fs";
import Sidebar from "../components/Sidebar";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function montar(props = {}) {
  const padrao = {
    active: "Dashboard",
    setActive: () => {},
    user: { nome: "Marcos Aurélio Pinto", cargo: "Sindico" },
    onLogout: () => {},
  };
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <Sidebar {...padrao} {...props} />
      </MemoryRouter>
    </ThemeProvider>
  );
}

const nav = () => screen.getByRole("complementary", { name: "Navegação principal" });

describe("Sidebar: permissões", () => {
  it("Porteiro vê a fila da portaria e não vê cadastros nem financeiro", () => {
    montar({ user: { nome: "Nivaldo Speranza", cargo: "Porteiro" } });
    const n = within(nav());
    expect(n.getByRole("button", { name: /^Encomendas/ })).toBeInTheDocument();
    expect(n.getByRole("button", { name: /^Entradas e Sa/ })).toBeInTheDocument();
    // Processos é só da administração: o guia é de Notificações e multas.
    expect(n.queryByRole("button", { name: /^Processos/ })).not.toBeInTheDocument();
    // Vagas entrou no 0037: ele vê de quem é a vaga e corrige a TAG. O que ele
    // pode fazer lá dentro é outro assunto, guardado no vagas-permissao.
    expect(n.getByRole("button", { name: /^Vagas/ })).toBeInTheDocument();
    expect(n.queryByRole("button", { name: /^Unidades/ })).not.toBeInTheDocument();
    expect(n.queryByRole("button", { name: /^Moradores(?! no app)/ })).not.toBeInTheDocument();
  });

  it("Conselheiro só vê Início e Assembleia", () => {
    montar({ user: { nome: "Ivone Tagliaferro", cargo: "Conselheiro" } });
    const n = within(nav());
    expect(n.getByRole("button", { name: /^Início/ })).toBeInTheDocument();
    expect(n.getByRole("button", { name: /^Assembleia/ })).toBeInTheDocument();
    expect(n.queryByRole("button", { name: /^Unidades/ })).not.toBeInTheDocument();
    expect(n.queryByRole("button", { name: /^Encomendas/ })).not.toBeInTheDocument();
    expect(n.queryByRole("button", { name: /^Salão de Festas/ })).not.toBeInTheDocument();
  });

  it("só o Desenvolvedor vê Usuários e o design system", () => {
    const { unmount } = montar({ user: { nome: "Lucas Sampaio", cargo: "Desenvolvedor" } });
    let n = within(nav());
    expect(n.getByRole("button", { name: /^Usuários/ })).toBeInTheDocument();
    expect(n.getByRole("button", { name: /^Design system/ })).toBeInTheDocument();
    unmount();

    montar({ user: { nome: "Marcos Aurélio Pinto", cargo: "Sindico" } });
    n = within(nav());
    expect(n.queryByRole("button", { name: /^Usuários/ })).not.toBeInTheDocument();
    expect(n.queryByRole("button", { name: /^Design system/ })).not.toBeInTheDocument();
  });

  it("categoria sem nenhum item permitido não aparece", () => {
    montar({ user: { nome: "Ivone Tagliaferro", cargo: "Conselheiro" } });
    const n = within(nav());
    expect(n.queryByText("Reservas")).not.toBeInTheDocument();
    expect(n.queryByText("Sistema")).not.toBeInTheDocument();
    expect(n.queryByText("Portaria")).not.toBeInTheDocument();
  });

  it("cargo desconhecido não vê nenhum item", () => {
    const { container } = montar({ user: { nome: "Alguém", cargo: "Visitante" } });
    expect(container.querySelectorAll(".vit-navitem")).toHaveLength(0);
    expect(container.querySelectorAll(".vit-sidebar__cat")).toHaveLength(0);
  });
});

/** Títulos das seções e os itens de cada uma, na ordem da tela. */
function secoes(container) {
  return [...container.querySelectorAll(".vit-sidebar__cat")].map((cat) => [
    cat.textContent,
    [...cat.nextElementSibling.querySelectorAll(".vit-navitem__texto")].map((el) => el.textContent),
  ]);
}

describe("Sidebar: oito áreas (as sete do ViT e a Ajuda do Diduccio)", () => {
  it("o Desenvolvedor vê as oito, na ordem, cada uma com as suas telas", () => {
    const { container } = montar({ user: { nome: "Lucas Sampaio", cargo: "Desenvolvedor" } });
    // O rótulo é o de tela, não a chave de permissão: `Entregas` continua
    // sendo a chave, e "Entradas e Saídas" é o que a pessoa lê. O mesmo com
    // `Confirmação`, que desde o 0065 aparece como "Confirmações".
    expect(secoes(container)).toEqual([
      ["Início", ["Início", "Tarefas"]],
      ["Portaria", ["Encomendas", "Entradas e Saídas", "Vagas"]],
      ["Cadastros", ["Unidades", "Moradores", "Piscina"]],
      ["Aplicativo do morador", ["Confirmações", "Moradores no app", "Comunicado", "Agenda", "Cotas extras"]],
      ["Comunicação", ["Notificações", "Assembleia"]],
      ["Reservas", ["Salão de Festas", "Churrasqueira", "Mudanças", "Agendamento"]],
      ["Ajuda", ["Manual"]],
      ["Sistema", ["Usuários", "Design system"]],
    ]);
  });

  it("o Dashboard está desligado para todos por enquanto", () => {
    for (const cargo of ["Desenvolvedor", "Sindico", "Porteiro", "Conselheiro"]) {
      const { unmount } = montar({ user: { nome: "Alguém", cargo } });
      expect(within(nav()).queryByRole("button", { name: /^Dashboard/ })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("o porteiro vê a sua fila e a Churrasqueira (só leitura, 0120)", () => {
    const { container } = montar({ user: { nome: "Nivaldo Speranza", cargo: "Porteiro" } });
    expect(secoes(container)).toEqual([
      ["Início", ["Início"]],
      ["Portaria", ["Encomendas", "Entradas e Saídas", "Vagas"]],
      ["Reservas", ["Churrasqueira"]],
      ["Ajuda", ["Manual"]],
    ]);
  });

  it("todo item do menu está em alguma área, e só em uma", () => {
    const fonte = readFileSync("src/components/Sidebar.jsx", "utf8");
    const permissoes = fonte.slice(fonte.indexOf("const PERMISSIONS"), fonte.indexOf("};", fonte.indexOf("const PERMISSIONS")));
    const chaves = [...permissoes.matchAll(/^ {2}"?([^":\s]+)"?: \[/gm)].map((m) => m[1]);
    const categorias = fonte.slice(fonte.indexOf("const CATEGORIAS"));
    for (const chave of chaves) {
      const vezes = categorias.split(`["${chave}", `).length - 1;
      expect(vezes, chave).toBe(1);
    }
  });
});

describe("Sidebar: estado ativo e navegação", () => {
  it("marca o item ativo com aria-current", () => {
    montar({ active: "Moradores" });
    expect(within(nav()).getByRole("button", { name: /^Moradores(?! no app)/ }))
      .toHaveAttribute("aria-current", "page");
  });

  it("apenas um item fica ativo por vez", () => {
    montar({ active: "Moradores" });
    const ativos = within(nav())
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-current") === "page");
    expect(ativos).toHaveLength(1);
  });

  it("clicar avisa o pai qual item foi escolhido", async () => {
    const setActive = vi.fn();
    montar({ setActive });
    await userEvent.click(within(nav()).getByRole("button", { name: /Vagas/ }));
    expect(setActive).toHaveBeenCalledWith("Vagas");
  });
});

describe("Sidebar: contadores", () => {
  it("mostra contador quando recebe, e some quando é zero", () => {
    montar({ contadores: { Encomendas: 14, Entregas: 0 } });
    const n = within(nav());
    expect(within(n.getByRole("button", { name: /^Encomendas/ })).getByText("14")).toBeInTheDocument();
    expect(n.getByRole("button", { name: /^Entradas e Sa/ }).textContent).not.toMatch(/\d/);
  });

  it("sem a prop, nenhum item mostra contador", () => {
    const { container } = montar();
    expect(container.querySelectorAll(".vit-navitem__contador")).toHaveLength(0);
  });
});

// O botão de perfil carrega o nome e o cargo como nome acessível. Não uso
// { expanded: false } porque o botão de menu mobile também expõe aria-expanded.
const botaoPerfil = () => screen.getByRole("button", { name: /Marcos Aurélio Pinto/ });

describe("Sidebar: perfil, tema e saída", () => {
  it("mostra nome e cargo, não só a inicial", () => {
    montar();
    expect(screen.getByText("Marcos Aurélio Pinto")).toBeInTheDocument();
    expect(screen.getByText("Sindico")).toBeInTheDocument();
  });

  it("o menu de perfil abre e fecha", async () => {
    montar();
    await userEvent.click(botaoPerfil());
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.click(botaoPerfil());
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("sempre abre no escuro, mesmo que da última vez estivesse no claro", () => {
    localStorage.setItem("darkMode", "false");
    montar();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Escuro" })).toHaveAttribute("aria-pressed", "true");
  });

  it("alterna o tema pelo menu", async () => {
    montar();
    await userEvent.click(botaoPerfil());
    await userEvent.click(screen.getByRole("menuitem", { name: /Modo claro/ }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("Sair chama onLogout", async () => {
    const onLogout = vi.fn();
    montar({ onLogout });
    await userEvent.click(botaoPerfil());
    await userEvent.click(screen.getByRole("menuitem", { name: /Sair do sistema/ }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("o controle Claro/Escuro do rodapé troca o tema sem abrir o menu", async () => {
    montar();
    const escuro = screen.getByRole("button", { name: "Escuro" });
    const claro = screen.getByRole("button", { name: "Claro" });
    // Abre no escuro.
    expect(escuro).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(claro);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(claro).toHaveAttribute("aria-pressed", "true");

    // Clicar no que já está ligado não alterna de volta.
    await userEvent.click(claro);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    await userEvent.click(escuro);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("Esc fecha o menu de perfil", async () => {
    montar();
    await userEvent.click(botaoPerfil());
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("Sidebar: gaveta mobile", () => {
  it("existe um botão de menu com nome acessível", () => {
    montar();
    expect(screen.getByRole("button", { name: "Abrir navegação" })).toBeInTheDocument();
  });

  it("abrir aplica a classe da gaveta, e Esc fecha", async () => {
    const { container } = montar();
    const botao = screen.getByRole("button", { name: "Abrir navegação" });
    await userEvent.click(botao);
    expect(container.querySelector(".vit-sidebar--aberta")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(container.querySelector(".vit-sidebar--aberta")).not.toBeInTheDocument();
  });

  it("navegar fecha a gaveta", async () => {
    const { container } = montar();
    await userEvent.click(screen.getByRole("button", { name: "Abrir navegação" }));
    await userEvent.click(within(nav()).getByRole("button", { name: /^Unidades/ }));
    expect(container.querySelector(".vit-sidebar--aberta")).not.toBeInTheDocument();
  });

  it("trava o scroll do fundo enquanto aberta e devolve ao fechar", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Abrir navegação" }));
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.keyboard("{Escape}");
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("devolve o foco ao botão de menu ao fechar", async () => {
    montar();
    const botao = screen.getByRole("button", { name: "Abrir navegação" });
    await userEvent.click(botao);
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(botao);
  });

  it("o fundo escurecido fecha a gaveta ao ser tocado", async () => {
    const { container } = montar();
    await userEvent.click(screen.getByRole("button", { name: "Abrir navegação" }));
    await userEvent.click(container.querySelector(".vit-gaveta-fundo"));
    expect(container.querySelector(".vit-sidebar--aberta")).not.toBeInTheDocument();
  });
});

describe("Sidebar: modo encolhido", () => {
  const alca = () => within(nav()).getByRole("button", { name: /menu$/ });

  it("começa aberto, e a alça encolhe e expande", async () => {
    const user = userEvent.setup();
    const { container } = montar();
    expect(alca()).toHaveAccessibleName("Encolher menu");
    expect(alca()).toHaveAttribute("aria-expanded", "true");

    await user.click(alca());
    expect(container.querySelector(".vit-sidebar--encolhida")).toBeInTheDocument();
    expect(alca()).toHaveAccessibleName("Expandir menu");
    expect(alca()).toHaveAttribute("aria-expanded", "false");

    await user.click(alca());
    expect(container.querySelector(".vit-sidebar--encolhida")).not.toBeInTheDocument();
  });

  it("encolhido, o item continua com nome acessível e navegando", async () => {
    const user = userEvent.setup();
    const setActive = vi.fn();
    montar({ setActive });
    await user.click(alca());

    // O texto só some da vista: quem usa leitor de tela continua ouvindo o nome.
    await user.click(within(nav()).getByRole("button", { name: /^Moradores(?! no app)/ }));
    expect(setActive).toHaveBeenCalledWith("Moradores");
  });

  it("encolhido, o contador vira bolinha sem repetir o número no texto", async () => {
    const user = userEvent.setup();
    montar({ contadores: { Encomendas: 14, "Confirmação": 3 } });
    await user.click(alca());

    const encomendas = within(nav()).getByRole("button", { name: /^Encomendas/ });
    expect(encomendas.querySelector(".vit-navitem__icone")).toHaveAttribute("data-contador", "9+");
    // Só um "14" no texto: o da bolinha vem do CSS.
    expect(within(encomendas).getAllByText("14")).toHaveLength(1);
    expect(
      within(nav()).getByRole("button", { name: /^Confirmações/ }).querySelector(".vit-navitem__icone")
    ).toHaveAttribute("data-contador", "3");
  });

  it("encolhido mostra todas as seções, mesmo as que a pessoa recolheu", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(within(nav()).getByRole("button", { name: "Seção Reservas" }));
    expect(within(nav()).queryByRole("button", { name: /^Salão de Festas/ })).not.toBeInTheDocument();

    await user.click(alca());
    expect(within(nav()).getByRole("button", { name: /^Salão de Festas/ })).toBeInTheDocument();

    // Ao expandir, o recolhido volta a valer.
    await user.click(alca());
    expect(within(nav()).queryByRole("button", { name: /^Salão de Festas/ })).not.toBeInTheDocument();
  });

  it("o estado sobrevive a recarregar a página", async () => {
    const user = userEvent.setup();
    const { unmount } = montar();
    await user.click(alca());
    unmount();

    const { container } = montar();
    expect(container.querySelector(".vit-sidebar--encolhida")).toBeInTheDocument();
  });
});

describe("Sidebar: categorias recolhíveis", () => {
  const secao = (titulo) =>
    within(nav()).getByRole("button", { name: `Seção ${titulo}` });

  it("a categoria começa aberta e recolhe ao clicar", async () => {
    const user = userEvent.setup();
    montar();

    expect(secao("Reservas")).toHaveAttribute("aria-expanded", "true");
    expect(within(nav()).getByRole("button", { name: /^Salão de Festas/ })).toBeVisible();

    await user.click(secao("Reservas"));

    expect(secao("Reservas")).toHaveAttribute("aria-expanded", "false");
    // hidden tira do fluxo e da árvore de acessibilidade de uma vez só.
    expect(within(nav()).queryByRole("button", { name: /^Salão de Festas/ })).not.toBeInTheDocument();
  });

  it("recolher uma categoria não mexe nas outras", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(secao("Reservas"));

    expect(secao("Início")).toHaveAttribute("aria-expanded", "true");
    expect(within(nav()).getByRole("button", { name: /^Início/ })).toBeVisible();
  });

  it("o estado sobrevive a recarregar a página", async () => {
    const user = userEvent.setup();
    const { unmount } = montar();

    await user.click(secao("Reservas"));
    unmount();

    montar();
    expect(secao("Reservas")).toHaveAttribute("aria-expanded", "false");
  });

  it("o título da seção assume o destaque quando esconde o item ativo", async () => {
    const user = userEvent.setup();
    const { container } = montar({ active: "Festas" });

    await user.click(secao("Reservas"));

    const titulo = container.querySelector(".vit-sidebar__cat--marcada");
    expect(titulo).toBeInTheDocument();
    expect(titulo.textContent).toBe("Reservas");
  });

  it("a seção não fica marcada quando o item ativo está em outra", async () => {
    const user = userEvent.setup();
    const { container } = montar({ active: "Dashboard" });

    await user.click(secao("Reservas"));

    expect(container.querySelector(".vit-sidebar__cat--marcada")).not.toBeInTheDocument();
  });

  it("o botão de seção não se confunde com um item", () => {
    montar();
    const n = within(nav());
    // Nenhuma área tem hoje nome de tela, mas o prefixo fica: é ele que diz
    // ao leitor de tela qual botão navega e qual recolhe.
    expect(n.getByRole("button", { name: "Seção Portaria" })).toBeInTheDocument();
    expect(n.queryByRole("button", { name: /^Portaria/ })).not.toBeInTheDocument();
  });
});
