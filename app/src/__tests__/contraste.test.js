import { describe, it, expect } from "vitest";
import { CLARO, ESCURO, MARCA } from "../theme/tokens";

/**
 * Auditoria de contraste WCAG, calculada e não estimada.
 *
 * Trava as combinações que o design system promete. Se alguém mexer num
 * token e quebrar a legibilidade, o teste falha antes de chegar na tela.
 *
 * Limiares WCAG 2.1:
 *   AA  texto normal      4.5:1
 *   AA  texto grande      3.0:1  (>=24px, ou >=18.66px em negrito)
 *   AA  elemento gráfico  3.0:1
 *   AAA texto normal      7.0:1
 */

const canal = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const luminancia = (hex) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
};

const contraste = (a, b) => {
  const la = luminancia(a);
  const lb = luminancia(b);
  const claro = Math.max(la, lb);
  const escuro = Math.min(la, lb);
  return (claro + 0.05) / (escuro + 0.05);
};

/** Arredonda para uma casa, para a mensagem de falha ser legível. */
const r1 = (n) => Math.round(n * 10) / 10;

describe("contraste: tema claro", () => {
  const casos = [
    ["texto principal sobre papel", CLARO.text, CLARO.paper, 4.5],
    ["texto principal sobre superfície", CLARO.text, CLARO.surface, 4.5],
    ["texto secundário sobre papel", CLARO["text-secondary"], CLARO.paper, 4.5],
    ["texto secundário sobre superfície", CLARO["text-secondary"], CLARO.surface, 4.5],
    ["título sobre papel", CLARO.ink, CLARO.paper, 7],
    ["link e rótulo de marca sobre papel", MARCA["brand-700"], CLARO.paper, 4.5],
    ["link de marca sobre superfície", MARCA["brand-700"], CLARO.surface, 4.5],
    ["texto de alerta sobre papel", MARCA["alert-600"], CLARO.paper, 4.5],
    ["branco sobre botão primário", "#FFFFFF", MARCA["brand-600"], 4.5],
    ["branco sobre botão destrutivo", CLARO.paper, MARCA["alert-600"], 4.5],
    ["badge positivo: brand-700 sobre brand-100", MARCA["brand-700"], MARCA["brand-100"], 4.5],
    ["badge de alerta: alert-700 sobre alert-100", MARCA["alert-700"], "#F9DEE3", 4.5],
    // O pino amarelo do mapa: texto dentro dele, e o contorno que o separa da
    // planta. Amarelo é a cor mais fácil de errar — clareia até sumir no fundo
    // claro, e aí "o tempo está correndo" deixa de ser visível justamente para
    // quem olha de longe.
    ["iniciais no pino de aviso", MARCA["aviso-700"], MARCA["aviso-100"], 4.5],
    ["texto de aviso sobre papel", MARCA["aviso-700"], CLARO.paper, 4.5],
    ["contorno do pino de aviso sobre a planta", MARCA["aviso-600"], CLARO["surface-2"], 3],
  ];

  it.each(casos)("%s", (_nome, frente, fundo, minimo) => {
    const c = contraste(frente, fundo);
    expect(r1(c), `${frente} sobre ${fundo} deu ${r1(c)}:1, precisa de ${minimo}:1`)
      .toBeGreaterThanOrEqual(minimo);
  });
});

describe("contraste: tema escuro", () => {
  const casos = [
    ["texto principal sobre papel", ESCURO.text, ESCURO.paper, 4.5],
    ["texto principal sobre superfície", ESCURO.text, ESCURO.surface, 4.5],
    ["texto secundário sobre papel", ESCURO["text-secondary"], ESCURO.paper, 4.5],
    ["texto secundário sobre superfície", ESCURO["text-secondary"], ESCURO.surface, 4.5],
    ["texto apagado sobre papel", ESCURO["text-muted"], ESCURO.paper, 3],
    ["acento de marca sobre papel", MARCA["brand-400"], ESCURO.paper, 4.5],
    ["link de marca sobre superfície", MARCA["brand-300"], ESCURO.surface, 4.5],
    ["texto de alerta sobre papel", MARCA["alert-400"], ESCURO.paper, 4.5],
    ["texto sobre botão primário (--fg-on-brand)", "#FFFFFF", MARCA["brand-600"], 4.5],
    ["item ativo da sidebar: brand-300 sobre #2E1A16", MARCA["brand-300"], "#2E1A16", 4.5],
    ["aviso do mapa sobre papel escuro", MARCA["aviso-400"], ESCURO.paper, 4.5],
  ];

  it.each(casos)("%s", (_nome, frente, fundo, minimo) => {
    const c = contraste(frente, fundo);
    expect(r1(c), `${frente} sobre ${fundo} deu ${r1(c)}:1, precisa de ${minimo}:1`)
      .toBeGreaterThanOrEqual(minimo);
  });
});

describe("contraste: limites conhecidos e documentados", () => {
  it("brand-500 é cor de marca, não de texto corrido", () => {
    // Documentado na spec: 4.4:1 no papel. Passa para texto grande e para
    // elemento gráfico, reprova para corpo. É por isso que link e rótulo
    // usam brand-700 em vez de brand-500.
    const c = contraste(MARCA["brand-500"], CLARO.paper);
    expect(c).toBeGreaterThanOrEqual(3);   // serve como gráfico e texto grande
    expect(c).toBeLessThan(4.5);           // e NÃO serve para texto corrido
  });

  it("a borda tem contraste suficiente para ser percebida", () => {
    // Divisória não é texto: 1.5:1 já a torna visível sem virar uma grade
    // pesada. O limiar de 3:1 do WCAG vale para controle de interface.
    expect(contraste(CLARO.border, CLARO.surface)).toBeGreaterThanOrEqual(1.15);
    expect(contraste(ESCURO.border, ESCURO.surface)).toBeGreaterThanOrEqual(1.15);
  });

  it("a borda de input passa no limiar de componente", () => {
    expect(contraste(CLARO["border-strong"], CLARO.surface)).toBeGreaterThanOrEqual(1.4);
  });
});

describe("contraste: texto sobre fundo de marca (--fg-on-brand)", () => {
  /**
   * A rampa da marca NÃO inverte com o tema: brand-600/700/800 e alert-600
   * têm o mesmo valor no claro e no escuro. Quem escreve por cima deles
   * precisa de uma cor que também não inverta.
   *
   * O bug que estes testes travam: --btn-primary-fg era var(--paper), que
   * vira #0A0A0A no tema escuro. Todo botão primário, todo selo de marca,
   * o avatar da lateral e a célula "Recebido" do painel ficavam com texto
   * quase preto sobre verde escuro. Por isso existe --fg-on-brand.
   */
  const ON_BRAND = "#FFFFFF"; // valor de --fg-on-brand, fixo nos dois temas

  const casos = [
    ["botão primário (brand-600)", MARCA["brand-600"], 4.5],
    ["avatar da lateral (brand-700)", MARCA["brand-700"], 4.5],
    ["célula em destaque do painel (brand-800)", MARCA["brand-800"], 4.5],
    ["painel de marca (brand-900)", MARCA["brand-900"], 4.5],
    ["botão de exclusão (alert-600)", MARCA["alert-600"], 4.5],
  ];

  it.each(casos)("%s", (_nome, fundo, minimo) => {
    expect(r1(contraste(ON_BRAND, fundo))).toBeGreaterThanOrEqual(minimo);
  });

  it("--paper do tema escuro seria ilegível nestes fundos", () => {
    // Guarda a razão de --fg-on-brand existir. Se alguém trocar de volta
    // por var(--paper), este teste explica o estrago.
    expect(contraste(ESCURO.paper, MARCA["brand-600"])).toBeLessThan(4.5);
    expect(contraste(ESCURO.paper, MARCA["brand-800"])).toBeLessThan(4.5);
  });
});

describe("contraste: lateral verde (brand-900), nos dois temas", () => {
  // A lateral não segue o tema: é brand-900 no claro e no escuro, então estes
  // pares valem para os dois. Os fundos translúcidos (hover, ativo) só
  // clareiam o verde em 8–16%, e o texto deles é o mais claro da lista.
  const ON_BRAND = "#FBFAF8";
  const fundo = MARCA["brand-900"];

  const casos = [
    ["nome do item (brand-200)", MARCA["brand-200"], fundo, 4.5],
    ["título da seção e cargo (brand-300)", MARCA["brand-300"], fundo, 4.5],
    ["item ativo e nome no perfil", ON_BRAND, fundo, 7],
    ["ícone no ladrilho do ativo (brand-500)", ON_BRAND, MARCA["brand-500"], 3],
    ["número do contador do ativo", MARCA["brand-900"], MARCA["brand-300"], 4.5],
    ["bolinha do modo encolhido", MARCA["brand-900"], MARCA["brand-300"], 4.5],
    ["inicial no avatar", MARCA["brand-900"], MARCA["brand-300"], 4.5],
    ["opção de tema ligada (brand-700)", ON_BRAND, MARCA["brand-700"], 4.5],
  ];

  it.each(casos)("%s", (_nome, texto, atras, minimo) => {
    expect(r1(contraste(texto, atras))).toBeGreaterThanOrEqual(minimo);
  });
});
