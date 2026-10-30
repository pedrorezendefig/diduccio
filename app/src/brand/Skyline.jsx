import React from "react";
import { MARCA, CLARO } from "../theme/tokens";

/**
 * Skyline da marca ViT, com janelas que acendem.
 *
 * A geometria é gerada aqui, não escrita à mão: são 287 janelas, e mantê-las
 * como markup daria um arquivo ilegível e impossível de ajustar.
 *
 * As cores saem do espelho em JS dos tokens, nunca de var(): estas cores vão
 * em ATRIBUTO de apresentação de SVG (fill), que não resolve variável CSS.
 * Mesma razão documentada em src/theme/tokens.js.
 *
 * O painel onde isto aparece é verde-escuro nos dois temas, então a rampa da
 * marca serve para claro e escuro sem inversão.
 */

/** LCG com semente fixa: o desenho precisa ser idêntico em todo carregamento. */
function sorteador(semente) {
  let s = semente;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const CHAO = 300;

/* Larguras e alturas escolhidas a mão. Sorteio puro gera silhueta sem ritmo,
   com todos os prédios parecendo do mesmo tamanho. */
const PREDIOS = [
  { x: 0,    w: 96,  h: 150 },
  { x: 100,  w: 74,  h: 222 },
  { x: 178,  w: 112, h: 118 },
  { x: 294,  w: 88,  h: 268 },
  { x: 386,  w: 68,  h: 176 },
  { x: 458,  w: 104, h: 210 },
  { x: 566,  w: 80,  h: 140 },
  { x: 650,  w: 92,  h: 252 },
  { x: 746,  w: 70,  h: 166 },
  { x: 820,  w: 118, h: 196 },
  { x: 942,  w: 76,  h: 238 },
  { x: 1022, w: 98,  h: 132 },
  { x: 1124, w: 76,  h: 184 },
];

const JAN_L = 9, JAN_A = 12, PASSO_X = 21, PASSO_Y = 25;

/* Durações que não são múltiplas entre si: com elas as janelas nunca
   sincronizam e a fachada não vira pisca-pisca. */
const DURACOES = [9, 11, 13, 17, 19, 23, 29];

function gerarJanelas() {
  const rnd = sorteador(20260728);
  const janelas = [];

  for (const p of PREDIOS) {
    const topo = CHAO - p.h;
    const cols = Math.floor((p.w - 10) / PASSO_X);
    const rows = Math.floor((p.h - 9) / PASSO_Y);
    const vao = cols * PASSO_X - (PASSO_X - JAN_L);
    const x0 = p.x + (p.w - vao) / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = +(x0 + c * PASSO_X).toFixed(1);
        const y = +(topo + 16 + r * PASSO_Y).toFixed(1);
        if (y + JAN_A > CHAO - 6) continue;

        const sorte = rnd();
        // Duas temperaturas de luz. Com uma cor só a fachada vira adesivo.
        const cor = rnd() < 0.62 ? CLARO.paper : MARCA["brand-100"];

        if (sorte < 0.2) {
          // Sempre acesa: ancora o desenho para não ficar tudo piscando.
          janelas.push({ x, y, cor, classe: "vit-jan vit-jan--fixa" });
        } else if (sorte < 0.52) {
          const dur = DURACOES[Math.floor(rnd() * DURACOES.length)];
          // Atraso negativo: a tela abre com a cidade já em movimento, em vez
          // de acender todas as janelas de uma vez.
          const atraso = -(rnd() * dur).toFixed(1);
          janelas.push({
            x, y, cor,
            classe: "vit-jan vit-jan--anima",
            estilo: { animationDuration: `${dur}s`, animationDelay: `${atraso}s` },
          });
        } else {
          janelas.push({ x, y, cor, classe: "vit-jan" });
        }
      }
    }
  }
  return janelas;
}

const JANELAS = gerarJanelas();

export default function Skyline({ className }) {
  return (
    // slice e não none: com "none" o SVG estica e as janelas viram retângulos
    // deformados, diferentes a cada largura de tela. YMax ancora no chão.
    <svg
      className={className}
      viewBox={`0 0 1200 ${CHAO}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <g>
        {PREDIOS.map((p) => (
          <rect
            key={p.x}
            x={p.x} y={CHAO - p.h} width={p.w} height={p.h}
            fill={MARCA["brand-800"]}
          />
        ))}
      </g>
      <g>
        {JANELAS.map((j, i) => (
          <rect
            key={i}
            className={j.classe}
            x={j.x} y={j.y} width={JAN_L} height={JAN_A}
            fill={j.cor}
            style={j.estilo}
          />
        ))}
      </g>
    </svg>
  );
}

/* ================= VERSÃO DE CARREGAMENTO ================= */

const CHAO_MINI = 54;
const LARG_MINI = 168;

const PREDIOS_MINI = [
  { x: 0,   w: 16, h: 24 },
  { x: 19,  w: 12, h: 38 },
  { x: 34,  w: 20, h: 18 },
  { x: 57,  w: 14, h: 46 },
  { x: 74,  w: 18, h: 30 },
  { x: 95,  w: 13, h: 42 },
  { x: 111, w: 22, h: 22 },
  { x: 136, w: 12, h: 34 },
  { x: 151, w: 17, h: 28 },
];

const MJ_L = 3, MJ_A = 4, MPASSO_X = 5, MPASSO_Y = 7;
const VARREDURA = 1.2; // segundos que a onda leva para cruzar a largura

function gerarJanelasMini() {
  const janelas = [];
  for (const p of PREDIOS_MINI) {
    const topo = CHAO_MINI - p.h;
    const cols = Math.max(1, Math.floor((p.w - 4) / MPASSO_X));
    const rows = Math.max(1, Math.floor((p.h - 5) / MPASSO_Y));
    const vao = cols * MPASSO_X - (MPASSO_X - MJ_L);
    const x0 = p.x + (p.w - vao) / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = +(x0 + c * MPASSO_X).toFixed(1);
        const y = +(topo + 5 + r * MPASSO_Y).toFixed(1);
        if (y + MJ_A > CHAO_MINI - 2) continue;
        // Atraso proporcional ao x: é isto que cria a varredura.
        janelas.push({ x, y, atraso: +((x / LARG_MINI) * VARREDURA).toFixed(2) });
      }
    }
  }
  return janelas;
}

const JANELAS_MINI = gerarJanelasMini();

/**
 * Mesmo skyline em miniatura, para o estado de carregamento.
 *
 * Aqui as luzes NÃO piscam ao acaso: acendem numa varredura da esquerda para a
 * direita, em laço. Piscar aleatório diz "cidade"; varredura diz "trabalhando",
 * que é o que um carregamento precisa dizer.
 */
export function SkylineCarga({ className, rotulo = "Carregando" }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${LARG_MINI} ${CHAO_MINI}`}
      role="img"
      aria-label={rotulo}
    >
      <g>
        {PREDIOS_MINI.map((p) => (
          <rect
            key={p.x}
            x={p.x} y={CHAO_MINI - p.h} width={p.w} height={p.h}
            rx="1" fill="currentColor"
          />
        ))}
      </g>
      <g>
        {JANELAS_MINI.map((j, i) => (
          <rect
            key={i}
            className="vit-jan-carga"
            x={j.x} y={j.y} width={MJ_L} height={MJ_A}
            style={{ animationDelay: `${j.atraso}s` }}
          />
        ))}
      </g>
    </svg>
  );
}
