// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  LIMITE_PADRAO, LIMITE_POR_ROTA, TEMPO_DE_RESPOSTA,
  ATIVA, PERGUNTANDO, EXPIRADA,
  faseDaSessao, formatarContagem, limiteDaRota,
} from "../auth/inatividade";

/**
 * A sessão parada.
 *
 * Errar aqui não quebra tela nenhuma: erra para um lado e o terminal da
 * portaria fica aberto a noite toda; erra para o outro e o porteiro é
 * derrubado no meio do turno. Os dois só aparecem em produção, semanas depois.
 */

const HORA = 60 * 60 * 1000;
const MIN = 60 * 1000;

describe("o prazo de cada tela", () => {
  it("a portaria tem uma hora, e o resto do sistema duas", () => {
    // Mais CURTO na portaria, e não mais longo: a tela dela fica num lugar de
    // passagem, aberta o turno inteiro. A contagem é de inatividade, então ela
    // só avança quando não há ninguém ali — que é justamente quando a sessão
    // aberta vira risco.
    expect(limiteDaRota("/entregas")).toBe(HORA);
    expect(LIMITE_PADRAO).toBe(2 * HORA);
    expect(limiteDaRota("/encomendas")).toBe(2 * HORA);
    expect(limiteDaRota("/dashboard")).toBe(2 * HORA);
  });

  it("rota com barra sobrando ou com busca continua sendo a mesma rota", () => {
    // `/entregas/` e `/entregas?x=1` são a mesma tela. Sem normalizar, elas
    // cairiam no padrão de 2 horas sem nada avisar.
    expect(limiteDaRota("/entregas/")).toBe(HORA);
    expect(limiteDaRota("/entregas?aba=dentro")).toBe(HORA);
  });

  it("rota desconhecida cai no padrão, e não em zero", () => {
    // Zero derrubaria a pessoa no instante seguinte.
    expect(limiteDaRota("/nao-existe")).toBe(LIMITE_PADRAO);
    expect(limiteDaRota(undefined)).toBe(LIMITE_PADRAO);
    expect(limiteDaRota("")).toBe(LIMITE_PADRAO);
  });

  it("o mapa de prazos por rota é o único lugar que decide isso", () => {
    expect(Object.keys(LIMITE_POR_ROTA)).toEqual(["/entregas"]);
  });
});

describe("as três fases", () => {
  const AGORA = new Date("2026-09-02T12:00:00Z").getTime();
  const paradoHa = (ms) => AGORA - ms;

  it("mexendo, está ativa", () => {
    const r = faseDaSessao({ ultimoAcesso: paradoHa(10 * MIN), agora: AGORA, limite: HORA });
    expect(r.fase).toBe(ATIVA);
  });

  it("no minuto do limite, pergunta", () => {
    // Foi o pedido: "só caso não tenha nenhum clique no período de 1 hora ele
    // aparece o pop up".
    const r = faseDaSessao({ ultimoAcesso: paradoHa(HORA), agora: AGORA, limite: HORA });
    expect(r.fase).toBe(PERGUNTANDO);
    expect(r.restante).toBe(TEMPO_DE_RESPOSTA);
  });

  it("um instante ANTES do limite ainda não pergunta", () => {
    const r = faseDaSessao({ ultimoAcesso: paradoHa(HORA - 1), agora: AGORA, limite: HORA });
    expect(r.fase).toBe(ATIVA);
  });

  it("a contagem do aviso desce", () => {
    const r = faseDaSessao({
      ultimoAcesso: paradoHa(HORA + 30 * 1000), agora: AGORA, limite: HORA,
    });
    expect(r.fase).toBe(PERGUNTANDO);
    expect(r.restante).toBe(TEMPO_DE_RESPOSTA - 30 * 1000);
  });

  it("sem resposta no prazo, expira", () => {
    const r = faseDaSessao({
      ultimoAcesso: paradoHa(HORA + TEMPO_DE_RESPOSTA), agora: AGORA, limite: HORA,
    });
    expect(r.fase).toBe(EXPIRADA);
    expect(r.restante).toBe(0);
  });

  it("o aviso NÃO é tempo a mais roubado do prazo", () => {
    // O limite é quando a pergunta aparece; o tempo de resposta vem depois
    // dele. Descontar a resposta de dentro do limite faria a pergunta aparecer
    // antes da hora que o Lucas pediu.
    const r = faseDaSessao({
      ultimoAcesso: paradoHa(HORA - MIN), agora: AGORA, limite: HORA,
    });
    expect(r.fase).toBe(ATIVA);
  });

  it("sem carimbo nenhum, a sessão está ativa", () => {
    // É o estado de quem acabou de entrar, antes do primeiro carimbo. Tratar
    // ausência como expiração derrubaria a pessoa no próprio login.
    expect(faseDaSessao({ ultimoAcesso: null }).fase).toBe(ATIVA);
    expect(faseDaSessao({ ultimoAcesso: "" }).fase).toBe(ATIVA);
    expect(faseDaSessao({ ultimoAcesso: "abacaxi" }).fase).toBe(ATIVA);
    expect(faseDaSessao({}).fase).toBe(ATIVA);
  });

  it("o computador que dormiu e acordou depois de tudo já expirou", () => {
    const r = faseDaSessao({ ultimoAcesso: paradoHa(9 * HORA), agora: AGORA, limite: HORA });
    expect(r.fase).toBe(EXPIRADA);
  });
});

describe("a contagem regressiva", () => {
  it("mostra minuto e segundo", () => {
    expect(formatarContagem(2 * MIN)).toBe("2:00");
    expect(formatarContagem(119 * 1000)).toBe("1:59");
    expect(formatarContagem(9 * 1000)).toBe("0:09");
  });

  it("nunca mostra negativo nem lixo", () => {
    expect(formatarContagem(-5000)).toBe("0:00");
    expect(formatarContagem(0)).toBe("0:00");
    expect(formatarContagem(undefined)).toBe("0:00");
    expect(formatarContagem(NaN)).toBe("0:00");
  });

  it("arredonda para cima: 0,4s ainda é 1 segundo na tela", () => {
    // Para baixo, a contagem mostraria "0:00" com tempo restante — e a pessoa
    // veria o aviso parado em zero sem nada acontecer.
    expect(formatarContagem(400)).toBe("0:01");
  });
});

describe("o guarda da sessão", () => {
  const fonte = () => readFileSync("src/components/GuardaDeSessao.jsx", "utf8");
  const app = () => readFileSync("src/App.jsx", "utf8");

  it("mexer o mouse NÃO renova enquanto a pergunta está na tela", () => {
    // É a regra inteira do aviso. Sem ela, um esbarrão na mesa manteria o
    // terminal aberto a noite toda, e "você ainda está aí?" seria decorativo.
    expect(fonte()).toMatch(/if \(faseRef\.current !== ATIVA\) return;/);
  });

  it("só o clique no botão renova", () => {
    const src = fonte();
    expect(src).toMatch(/const continuar = \(\) => \{[\s\S]*?sessionStorage\.setItem\("ultimoAcesso"/);
    expect(src).toContain("Continuar conectado");
  });

  it("o aviso não fecha sozinho: sem X, sem Esc, sem clicar fora", () => {
    // Um aviso que se fecha por engano é um aviso que não avisou.
    expect(fonte()).toMatch(/<Modal open size="sm"[\s\S]*?onClose=\{undefined\}>/);
  });

  it("dá saída pela porta da frente também", () => {
    expect(fonte()).toContain("Sair agora");
  });

  it("a gravação de atividade é limitada a uma por segundo", () => {
    // `mousemove` dispara dezenas de vezes por segundo, e cada uma virava uma
    // gravação em sessionStorage.
    expect(fonte()).toMatch(/if \(agora - ultimaGravacao < 1000\) return;/);
  });

  it("deslogar acontece em efeito, não durante o render", () => {
    // Chamar onExpirar no meio da renderização derruba a árvore no meio do
    // caminho, e o React reclama com razão.
    expect(fonte()).toMatch(/useEffect\(\(\) => \{\s*if \(ativo && fase === EXPIRADA\) onExpirar\?\.\(\);/);
  });

  it("mora dentro do Router, senão não sabe em que tela está", () => {
    const src = fonte();
    expect(src).toContain('from "react-router-dom"');
    expect(src).toMatch(/const \{ pathname \} = useLocation\(\)/);
    expect(app()).toMatch(/<Router>\s*<GuardaDeSessao ativo=\{Boolean\(usuarioLogado\)\} onExpirar=\{handleLogout\} \/>/);
  });

  it("o App não tem mais o alert que travava a aba", () => {
    // `alert()` congela a aba inteira e não diz quanto tempo resta — e quem
    // estava longe da tela nem chega a ler.
    const src = app();
    expect(src, "o alert voltou").not.toMatch(/alert\("Sua sessão expirou/);
    expect(src, "sobrou o temporizador antigo").not.toMatch(/const TEMPO_LIMITE/);
  });

  it("as classes do aviso têm regra de estilo", () => {
    const css = readFileSync("src/styles/ui.css", "utf8");
    for (const classe of ["vit-sessao-contagem", "vit-sessao-acoes"]) {
      expect(new RegExp(`\\.${classe}(?![\\w-])`).test(css), `${classe} sem regra`).toBe(true);
    }
  });
});
