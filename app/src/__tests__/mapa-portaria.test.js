// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ZONAS, BLOCOS_NO_MAPA, ZONA_SEM_DESTINO, PINOS_VISIVEIS,
  SEM_PRAZO, NO_PRAZO, ESTOURADO,
  contarPorEstado, distribuirNoMapa, estadoDoPino, iniciais, pinosDaZona, zonaDaChegada,
} from "../lib/mapa-portaria";

/**
 * O mapa da portaria.
 *
 * Ele responde uma pergunta só — quem está dentro, e onde —, e o jeito de
 * errá-la é silencioso: uma pessoa que cai em zona nenhuma some do mapa sem
 * derrubar nada, e o porteiro passa a confiar numa planta incompleta.
 */

const AGORA = new Date("2026-09-01T15:00:00Z").getTime();
const haMinutos = (m) => new Date(AGORA - m * 60000).toISOString();

const chegada = (extra = {}) => ({
  id: 1, nome: "Ana Silva", bloco: "5", apartamento: "206",
  horario_entrada: haMinutos(5), horario_saida: null, minutos_permitidos: 15,
  ...extra,
});

describe("a planta", () => {
  it("tem os seis blocos que existem, na ordem em que se fala deles", () => {
    // Não há bloco 6 nem 7 no Diduccio. E a ORDEM é o pedido: quem procura
    // o bloco 3 vai direto ao terceiro da fila em vez de varrer o desenho.
    expect(BLOCOS_NO_MAPA).toEqual(["1", "2", "3", "4", "5", "8"]);
  });

  it("tem o pátio no meio e o salão embaixo", () => {
    // São o que faz o desenho ser reconhecível como o condomínio dele. Sem
    // referência nenhuma, seis retângulos soltos não dizem onde é o quê.
    const ids = ZONAS.map((z) => z.id);
    expect(ids).toContain("COMUM");
    expect(ids).toContain("SALAO");
  });

  it("o miolo leva o nome do condomínio, sem assinatura", () => {
    // Foi o pedido, e é o que ancora a planta: sem nome no meio, o desenho
    // poderia ser de qualquer condomínio.
    const patio = ZONAS.find((z) => z.id === "COMUM");
    expect(patio.rotulo).toBe("Diduccio");
    expect(patio.assinatura).toBeUndefined();
    expect(patio.tipo).toBe("patio");
  });

  it("nenhuma zona assina no Diduccio", () => {
    // Assinatura repetida em cada bloco viraria marca d'água, e o mapa deixaria
    // de ser mapa para virar cartaz.
    const assinam = ZONAS.filter((z) => z.assinatura).map((z) => z.id);
    expect(assinam).toEqual([]);
  });

  it("nenhuma zona sai da planta", () => {
    // Posição em porcentagem: passar de 100 empurra o bloco para fora do
    // quadro, e ele some sem aviso porque a planta tem `overflow: hidden`.
    for (const z of ZONAS) {
      expect(z.x + z.w, `${z.id} passa da direita`).toBeLessThanOrEqual(100);
      expect(z.y + z.h, `${z.id} passa de baixo`).toBeLessThanOrEqual(100);
      expect(z.x).toBeGreaterThanOrEqual(0);
      expect(z.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("nenhuma zona se sobrepõe a outra", () => {
    // Duas zonas empilhadas escondem os pinos de uma delas atrás da outra.
    const sobrepostas = [];
    for (let i = 0; i < ZONAS.length; i += 1) {
      for (let j = i + 1; j < ZONAS.length; j += 1) {
        const a = ZONAS[i];
        const b = ZONAS[j];
        const cruza =
          a.x < b.x + b.w && b.x < a.x + a.w &&
          a.y < b.y + b.h && b.y < a.y + a.h;
        if (cruza) sobrepostas.push(`${a.id}×${b.id}`);
      }
    }
    expect(sobrepostas).toEqual([]);
  });

  it("a ordem dá a volta no pátio: 1 na esquerda, sobe, atravessa, desce no 8", () => {
    // É a diferença entre um mapa que se lê de relance e um que se decifra.
    // Fora de ordem, o porteiro varre os seis prédios toda vez.
    const de = (id) => ZONAS.find((z) => z.id === id);

    // O 1 fica na lateral esquerda, embaixo do 2.
    expect(de("1").x).toBe(de("2").x);
    expect(de("1").y).toBeGreaterThan(de("2").y);

    // Do 2 ao 5, a fileira de cima, da esquerda para a direita.
    expect(de("2").x).toBeLessThan(de("3").x);
    expect(de("3").x).toBeLessThan(de("4").x);
    expect(de("4").x).toBeLessThan(de("5").x);
    // E é fileira mesmo: os quatro na mesma altura.
    for (const id of ["3", "4", "5"]) expect(de(id).y).toBe(de("2").y);

    // O 8 desce pela direita, na mesma altura do 1 e do lado oposto.
    expect(de("8").y).toBe(de("1").y);
    expect(de("8").x).toBeGreaterThan(de("1").x);
  });

  it("o pátio fica no meio, entre as laterais, e o salão fecha embaixo", () => {
    const de = (id) => ZONAS.find((z) => z.id === id);
    const patio = de("COMUM");
    // No miolo: começa depois do bloco 1 e acaba antes do 8.
    expect(patio.x).toBeGreaterThan(de("1").x + de("1").w);
    expect(patio.x + patio.w).toBeLessThan(de("8").x);
    // E abaixo da fileira de cima.
    expect(patio.y).toBeGreaterThan(de("2").y + de("2").h);
    // O salão fecha a planta por baixo de tudo.
    expect(de("SALAO").y).toBeGreaterThan(patio.y + patio.h);
  });
});

describe("cada zona tem espaço para a gente que recebe", () => {
  it("bloco cabe pino, e não só o nome", () => {
    // Uma área de 6% de altura não comporta um pino de 26px: o mapa vira
    // enfeite e a informação vai toda para a lista. Foi por isso que as áreas
    // não seguem as medidas do croqui.
    for (const z of ZONAS.filter((x) => x.tipo === "bloco")) {
      expect(z.h, `bloco ${z.id} é baixo demais para caber pino`).toBeGreaterThanOrEqual(18);
      expect(z.w, `bloco ${z.id} é estreito demais`).toBeGreaterThanOrEqual(16);
    }
  });

  it("o pátio é a maior área livre da planta", () => {
    // Ele recolhe todo mundo sem destino — o prestador do condomínio, a linha
    // antiga com bloco estragado — e é a zona que mais cresce sem aviso.
    const patio = ZONAS.find((z) => z.id === "COMUM");
    const maiorBloco = Math.max(...ZONAS.filter((z) => z.tipo === "bloco").map((z) => z.w * z.h));
    expect(patio.w * patio.h).toBeGreaterThan(maiorBloco);
  });
});

describe("onde cada pessoa aparece", () => {
  it("vai para o bloco do destino", () => {
    expect(zonaDaChegada(chegada({ bloco: "5" }))).toBe("5");
    expect(zonaDaChegada(chegada({ bloco: "8" }))).toBe("8");
  });

  it("aceita o bloco escrito de outros jeitos", () => {
    // A tela grava "5", mas a planilha migrada tem linha com "Bloco 5" e outra
    // com "05". Sem normalizar, a mesma pessoa some do mapa dependendo de como
    // o bloco dela foi digitado há dois anos.
    expect(zonaDaChegada(chegada({ bloco: "05" }))).toBe("5");
    expect(zonaDaChegada(chegada({ bloco: "Bloco 5" }))).toBe("5");
    expect(zonaDaChegada(chegada({ bloco: 5 }))).toBe("5");
  });

  it("quem não tem destino fica na área comum", () => {
    // Serviço do próprio condomínio. Some do mapa se cair em zona nenhuma — e
    // é justamente quem circula pela área comum.
    expect(zonaDaChegada(chegada({ bloco: null }))).toBe(ZONA_SEM_DESTINO);
    expect(zonaDaChegada(chegada({ bloco: "" }))).toBe(ZONA_SEM_DESTINO);
    expect(zonaDaChegada({})).toBe(ZONA_SEM_DESTINO);
  });

  it("bloco que não existe na planta também cai na área comum", () => {
    // Melhor visível no lugar errado do que invisível: uma linha antiga com
    // bloco 7 continua sendo alguém que está lá dentro.
    expect(zonaDaChegada(chegada({ bloco: "7" }))).toBe(ZONA_SEM_DESTINO);
  });

  it("ninguém se perde: todo mundo cai em alguma zona", () => {
    const gente = [
      chegada({ id: 1, bloco: "1" }), chegada({ id: 2, bloco: null }),
      chegada({ id: 3, bloco: "7" }), chegada({ id: 4, bloco: "Bloco 8" }),
    ];
    const total = distribuirNoMapa(gente, AGORA)
      .reduce((soma, z) => soma + z.pessoas.length, 0);
    expect(total).toBe(gente.length);
  });
});

describe("a cor do pino", () => {
  it("com prazo correndo é o amarelo", () => {
    expect(estadoDoPino(chegada({ minutos_permitidos: 15 }), AGORA)).toBe(NO_PRAZO);
  });

  it("passou do combinado é o vermelho", () => {
    const c = chegada({ horario_entrada: haMinutos(23), minutos_permitidos: 15 });
    expect(estadoDoPino(c, AGORA)).toBe(ESTOURADO);
  });

  it("sem prazo não pisca", () => {
    // Hóspede de temporada e prestador. Piscar tudo é o mesmo que não piscar
    // nada: o amarelo deixaria de significar "o relógio está contra".
    expect(estadoDoPino(chegada({ minutos_permitidos: null }), AGORA)).toBe(SEM_PRAZO);
  });

  it("no minuto exato do limite ainda não estourou", () => {
    const c = chegada({ horario_entrada: haMinutos(15), minutos_permitidos: 15 });
    expect(estadoDoPino(c, AGORA)).toBe(NO_PRAZO);
  });
});

describe("a ordem dentro do bloco", () => {
  it("o estourado vem primeiro, e o sem prazo por último", () => {
    // O pino que interessa é o que já passou do tempo. No fim da fila, ele
    // ficaria escondido atrás dos outros num bloco cheio — e é ele o motivo de
    // olhar o mapa.
    const gente = [
      chegada({ id: "a", minutos_permitidos: null }),
      chegada({ id: "b", horario_entrada: haMinutos(2), minutos_permitidos: 60 }),
      chegada({ id: "c", horario_entrada: haMinutos(40), minutos_permitidos: 15 }),
      chegada({ id: "d", horario_entrada: haMinutos(12), minutos_permitidos: 15 }),
    ];
    const bloco5 = distribuirNoMapa(gente, AGORA).find((z) => z.id === "5");
    expect(bloco5.pessoas.map((p) => p.chegada.id)).toEqual(["c", "d", "b", "a"]);
  });
});

describe("bloco cheio não vira rolagem", () => {
  const time = (n) => Array.from({ length: n }, (_, i) =>
    chegada({ id: i, minutos_permitidos: 15, horario_entrada: haMinutos(i) }));

  it("até o limite, mostra todo mundo", () => {
    const { mostrar, sobra } = pinosDaZona(time(PINOS_VISIVEIS));
    expect(mostrar).toHaveLength(PINOS_VISIVEIS);
    expect(sobra).toBe(0);
  });

  it("acima do limite, abre espaço para o '+N'", () => {
    // Um pino a menos, porque o "+N" ocupa o lugar de um deles. Sem isso a fila
    // cresceria justamente quando o objetivo era encurtá-la.
    const { mostrar, sobra } = pinosDaZona(time(10));
    expect(mostrar).toHaveLength(PINOS_VISIVEIS - 1);
    expect(sobra).toBe(10 - (PINOS_VISIVEIS - 1));
    expect(mostrar.length + 1).toBe(PINOS_VISIVEIS);
  });

  it("quem fica de fora é o menos urgente", () => {
    // A lista chega ordenada por gravidade. Cortar do fim é o que garante que o
    // pino vermelho nunca é o escondido.
    const gente = [
      ...Array.from({ length: 8 }, (_, i) =>
        chegada({ id: `livre${i}`, minutos_permitidos: null })),
      chegada({ id: "vermelho", horario_entrada: haMinutos(90), minutos_permitidos: 15 }),
    ];
    const bloco5 = distribuirNoMapa(gente, AGORA).find((z) => z.id === "5");
    const { mostrar } = pinosDaZona(bloco5.pessoas);
    expect(mostrar.map((p) => p.chegada.id)).toContain("vermelho");
  });

  it("lista vazia não estoura", () => {
    expect(pinosDaZona([]).mostrar).toEqual([]);
    expect(pinosDaZona().sobra).toBe(0);
  });
});

describe("a legenda conta certo", () => {
  it("soma cada estado", () => {
    const gente = [
      chegada({ id: 1, minutos_permitidos: null }),
      chegada({ id: 2, minutos_permitidos: 15 }),
      chegada({ id: 3, horario_entrada: haMinutos(90), minutos_permitidos: 15 }),
      chegada({ id: 4, horario_entrada: haMinutos(90), minutos_permitidos: 15 }),
    ];
    expect(contarPorEstado(gente, AGORA)).toEqual({
      [SEM_PRAZO]: 1, [NO_PRAZO]: 1, [ESTOURADO]: 2,
    });
  });

  it("lista vazia não estoura", () => {
    expect(contarPorEstado([], AGORA)[NO_PRAZO]).toBe(0);
    expect(contarPorEstado(undefined, AGORA)[NO_PRAZO]).toBe(0);
    expect(distribuirNoMapa(undefined, AGORA).length).toBe(ZONAS.length);
  });
});

describe("as iniciais do pino", () => {
  it("primeira letra do nome e do sobrenome", () => {
    expect(iniciais("Ana Silva")).toBe("AS");
    expect(iniciais("josé carlos de oliveira")).toBe("JO");
  });

  it("nome de uma palavra só usa uma letra", () => {
    expect(iniciais("Ana")).toBe("A");
  });

  it("sem nome não imprime lixo", () => {
    expect(iniciais("")).toBe("?");
    expect(iniciais(null)).toBe("?");
    expect(iniciais("   ")).toBe("?");
  });
});

describe("o desenho do mapa", () => {
  const componente = () => readFileSync("src/components/MapaDaPortaria.jsx", "utf8");
  const css = () => readFileSync("src/styles/mapa.css", "utf8");

  it("as zonas vêm da lib, e não de uma lista escrita no componente", () => {
    const src = componente();
    expect(src).toContain('from "../lib/mapa-portaria"');
    expect(src, "planta escrita à mão no componente").not.toMatch(/const ZONAS = \[/);
  });

  it("o pino é botão, e não um texto que por acaso responde ao clique", () => {
    // Ele leva a pessoa até a linha dela na lista. Um <span> com onClick não
    // recebe foco, não responde ao Enter e não é anunciado como acionável.
    const src = componente();
    expect(src).toMatch(/<button\s+type="button"\s+className="mapa__pino"/);
    expect(src).toMatch(/onClick=\{\(\) => onEscolher\?\.\(p\.chegada\)\}/);
    // E o rótulo diz o que o clique faz, não só quem é a pessoa.
    expect(src).toMatch(/ver na lista/);
  });

  it("o pino apontado fica marcado, e tem foco visível", () => {
    // A marca precisa estar dos dois lados: depois de rolar até a lista, sem
    // ela não dá para saber qual pino levou até ali.
    expect(componente()).toMatch(/data-marcado=\{/);
    const folha = css();
    expect(folha).toMatch(/\.mapa__pino\[data-marcado="sim"\] \{/);
    expect(folha).toMatch(/\.mapa__pino:focus-visible \{[^}]*outline:/);
  });

  it("o rótulo e os pinos ficam por cima do corpo, não misturados a ele", () => {
    // O corpo do prédio carrega a textura das lajes. Sem camada própria, o nome
    // do bloco cai em cima das linhas e deixa de ser legível.
    expect(componente()).toMatch(/className="mapa__conteudo"/);
    expect(componente()).toMatch(/className="mapa__predio" aria-hidden="true"/);
  });

  it("cada pino diz quem é, para quem não enxerga cor", () => {
    // A cor sozinha nunca é informação: quem não distingue amarelo de vermelho
    // precisa do texto, e no celular não existe hover.
    const src = componente();
    expect(src).toMatch(/aria-label=\{`\$\{descrever\(p\)\}/);
    expect(src).toMatch(/title=\{descrever\(p\)\}/);
  });

  it("o pino sem destino é descrito como serviço do condomínio", () => {
    expect(componente()).toContain('partes.push("serviço do condomínio")');
  });

  it("toda classe do mapa tem regra", () => {
    const folha = css();
    const usadas = [
      "mapa", "mapa__legenda", "mapa__chave", "mapa__ponto", "mapa__planta",
      "mapa__zona", "mapa__predio", "mapa__conteudo", "mapa__rotulo",
      "mapa__assinatura", "mapa__conta", "mapa__pinos", "mapa__pino",
      "mapa__sobra", "mapa__vazio",
    ];
    const semRegra = usadas.filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(folha));
    expect(semRegra).toEqual([]);
  });

  it("o bloco não ganha barra de rolagem", () => {
    // Foi o defeito relatado: com rolagem, o pino que pisca some atrás de uma
    // barra de 70 pixels que ninguém vai usar — e o mapa esconde justamente o
    // que existe para mostrar.
    // Ancorado no começo da linha: `.mapa__zona[data-tipo="patio"] .mapa__pinos`
    // vem antes no arquivo e termina com o mesmo texto. Sem a âncora, o teste
    // examinava a regra do pátio e deixava a rolagem passar — foi exatamente o
    // que aconteceu na primeira versão dele.
    const regra = css().match(/\n\.mapa__pinos \{[^}]*\}/)?.[0] ?? "";
    expect(regra, "não achou a regra dos pinos").not.toBe("");
    expect(regra, "voltou a rolar dentro do bloco").not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
    expect(componente()).toMatch(/pinosDaZona\(z\.pessoas\)\.sobra > 0/);
  });

  it("o nome do condomínio é o maior texto da planta, e vem centrado", () => {
    const regra = css().match(/\[data-tipo="patio"\] \.mapa__rotulo \{[^}]*\}/)?.[0] ?? "";
    expect(regra).toMatch(/font-size: var\(--text-2xl\)/);
    expect(regra).toMatch(/text-align: center/);
    expect(regra).toMatch(/justify-content: center/);
  });

  it("a assinatura fica apagada, embaixo do nome", () => {
    // Ela assina, não anuncia: competir com o nome do condomínio seria virar
    // propaganda no meio de uma tela de trabalho.
    const regra = css().match(/\.mapa__assinatura \{[^}]*\}/)?.[0] ?? "";
    expect(regra).toMatch(/opacity: \.\d/);
    expect(regra).toMatch(/color: var\(--fg-muted\)/);
    // E some no celular seria perder a assinatura justamente onde o sistema
    // mais é usado — por isso ela tem tamanho próprio lá, e não `display:none`.
    const celular = css().slice(css().indexOf("@media (max-width: 768px)"));
    expect(celular).toMatch(/\.mapa__assinatura \{[^}]*font-size/);
    expect(celular).not.toMatch(/\.mapa__assinatura \{[^}]*display: none/);
  });

  it("os dois estados piscam, e piscam diferente", () => {
    // Foi o pedido: amarelo com o tempo correndo, vermelho quando esgota. Dois
    // ritmos diferentes se distinguem de longe mesmo por quem não separa bem as
    // duas cores.
    const folha = css();
    expect(folha).toMatch(/@keyframes mapa-pisca-aviso/);
    expect(folha).toMatch(/@keyframes mapa-pisca-estourado/);
    expect(folha).toMatch(/\[data-estado="no-prazo"\]\s*\{[^}]*animation: mapa-pisca-aviso/);
    expect(folha).toMatch(/\[data-estado="estourado"\]\s*\{[^}]*animation: mapa-pisca-estourado/);
  });

  it("quem pediu menos movimento não perde a informação", () => {
    const folha = css();
    const bloco = folha.slice(folha.indexOf("@media (prefers-reduced-motion"));
    expect(bloco).toContain("animation: none");
    // A cor e o anel continuam: desligar a animação não pode desligar o aviso.
    expect(bloco).toMatch(/box-shadow: 0 0 0 3px var\(--alert-200\)/);
  });

  it("bloco é desenhado como prédio, e não como retângulo com nome", () => {
    // Um mapa que parece o lugar é lido de relance; um que parece formulário
    // precisa ser decifrado, e aí o porteiro volta para a lista. As lajes são
    // o que diz "prédio" — sem elas o bloco vira caixa.
    const corpo = css().match(/\n\.mapa__predio \{[^}]*\}/)?.[0] ?? "";
    expect(corpo, "o corpo do prédio sumiu").not.toBe("");
    expect(corpo).toMatch(/box-shadow: 0 6px/);
    const lajes = css().match(/\.mapa__predio::after \{[^}]*\}/)?.[0] ?? "";
    expect(lajes).toMatch(/repeating-linear-gradient\(\s*to bottom/);
  });

  it("as lajes começam abaixo da linha do nome", () => {
    // Laje passando por trás do nome do bloco deixa o nome ilegível, e é o
    // primeiro texto que alguém procura no mapa.
    const lajes = css().match(/\.mapa__predio::after \{[^}]*\}/)?.[0] ?? "";
    expect(lajes).toMatch(/inset: 2\dpx 0 0/);
  });

  it("o prédio com gente se destaca do vazio", () => {
    // É o que se vê primeiro, de longe, e é o que interessa. Sem o destaque, os
    // seis blocos ficam iguais e o mapa não responde nada de relance.
    expect(css()).toMatch(
      /\[data-cheia="sim"\] \.mapa__predio \{[^}]*border-color: var\(--brand-500\)/
    );
  });

  it("o pátio leva o nome do condomínio, e não parece construção", () => {
    // Tracejado e arredondado: é vazio, e vazio desenhado como prédio faria o
    // miolo virar mais um bloco.
    const folha = css();
    const patio = folha.match(/\[data-tipo="patio"\] \.mapa__predio \{[^}]*\}/)?.[0] ?? "";
    expect(patio).toMatch(/border: 1\.5px dashed/);
    expect(patio).toMatch(/box-shadow: none/);
    // E o nome dele é o do condomínio, em caixa normal — não é rótulo de zona.
    expect(folha).toMatch(
      /\[data-tipo="patio"\] \.mapa__rotulo \{[^}]*text-transform: none/
    );
  });

  it("a placa com o nome não cai em cima das lajes", () => {
    // Ancorado no começo da linha: sem isso o `match` pega uma das variantes
    // `... .mapa__rotulo`, que terminam com o mesmo texto, e o teste passaria a
    // examinar a regra errada.
    const regra = css().match(/\n\.mapa__rotulo \{[^}]*\}/)?.[0] ?? "";
    expect(regra).toMatch(/z-index: 1/);
  });

  it("o tema escuro tem prédio próprio", () => {
    // Sem isso o bloco fica um retângulo branco brilhando no meio da tela
    // escura.
    expect(css()).toMatch(/\[data-theme="dark"\] \.mapa__predio \{/);
  });

  it("a planta é 4:3 e cabe na tela do celular", () => {
    // Mais larga que alta porque a fileira de cima tem quatro blocos e as
    // laterais um cada.
    const folha = css();
    expect(folha).toMatch(/\.mapa__planta \{[^}]*aspect-ratio: 4 \/ 3/);
    expect(folha, "altura fixa achataria os blocos em faixas no celular")
      .not.toMatch(/\.mapa__planta \{[^}]*\bheight: \d/);
  });

  it("o pino tem alvo de leitura no celular", () => {
    // O "+N" encolhe junto: em tamanhos diferentes a fila fica com um degrau
    // no meio.
    expect(css()).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.mapa__pino,\s*\.mapa__sobra \{[^}]*width: 22px/
    );
  });
});
