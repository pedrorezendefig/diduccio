import React, { useEffect, useRef, useState } from "react";

/** Quem pediu menos movimento no sistema não vê número correndo nem traço se desenhando. */
const poucoMovimento = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Número que sobe de 0 até o valor quando aparece. Sem animação (ou em
 * teste), mostra o valor direto: a tela nunca fica num número errado.
 */
export function Contador({ valor, duracao = 1100 }) {
  const alvo = Number(valor) || 0;
  const [semAnimacao] = useState(() => poucoMovimento() || typeof requestAnimationFrame === "undefined");
  const [atual, setAtual] = useState(() => (semAnimacao ? alvo : 0));
  const de = useRef(atual);
  useEffect(() => {
    if (semAnimacao) return undefined;
    const inicio = performance.now();
    const origem = de.current;
    let quadro;
    const passo = (t) => {
      const p = Math.min(1, (t - inicio) / duracao);
      const v = Math.round(origem + (alvo - origem) * (1 - Math.pow(1 - p, 3)));
      de.current = v;
      setAtual(v);
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    // Rede de segurança: se o navegador segurar os quadros (aba em segundo
    // plano), o número não fica parado no meio do caminho.
    const fim = setTimeout(() => { de.current = alvo; setAtual(alvo); }, duracao + 400);
    return () => { cancelAnimationFrame(quadro); clearTimeout(fim); };
  }, [alvo, duracao, semAnimacao]);
  return <span className="ini-num">{semAnimacao ? alvo : atual}</span>;
}

/** Mini-gráfico de linha com área. Se desenha da esquerda para a direita (CSS). */
export function Spark({ valores = [], tom = "marca" }) {
  const w = 112, h = 38;
  const vs = valores.length > 1 ? valores : [0, 0];
  const max = Math.max(...vs), min = Math.min(...vs);
  const pts = vs.map((v, i) => [i * (w - 4) / (vs.length - 1) + 2, h - 4 - (max === min ? 0.5 : (v - min) / (max - min)) * (h - 10)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const ult = pts[pts.length - 1];
  return (
    <svg className={`ini-spark ini-spark--${tom}`} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path className="ini-spark__area" d={`${d} L${ult[0]} ${h} L2 ${h} Z`} />
      <path className="ini-spark__linha" d={d} pathLength="1" />
      <circle className="ini-spark__ponto" cx={ult[0]} cy={ult[1]} r="3" />
    </svg>
  );
}

/** Cartão de métrica: rótulo com ícone, número que sobe, mini-gráfico e uma linha de contexto. */
export function Metrica({ Icone, rotulo, valor, sufixo, serie, tom, contexto, ordem = 0 }) {
  return (
    <article className="ini-metrica ini-anim" style={{ "--i": ordem }}>
      <span className="ini-metrica__rotulo">{Icone && <Icone size={14} aria-hidden="true" />}{rotulo}</span>
      <div className="ini-metrica__linha">
        <span className="ini-metrica__valor">
          {valor == null ? "–" : <Contador valor={valor} />}
          {sufixo && valor != null ? <small>{sufixo}</small> : null}
        </span>
        {serie && <Spark valores={serie} tom={tom} />}
      </div>
      {contexto && <span className="ini-metrica__contexto">{contexto}</span>}
    </article>
  );
}

/** As cores por tipo de compromisso. */
const COR_DO_EVENTO = { espaco: "espaco", portaria: "portaria", adm: "adm" };

/**
 * Os próximos dias em pílulas: o dia, e um pontinho por compromisso. Com
 * `onEscolher`, cada pílula é um botão: o dia escolhido fica verde e quem
 * usa mostra o que está marcado nele. Sem, é só leitura.
 */
export function DiasEmPilulas({ dias, selecionado = 0, onEscolher }) {
  const Tag = onEscolher ? "button" : "div";
  return (
    <div className="ini-dias" role={onEscolher ? "group" : "list"} aria-label="Próximos dias">
      {dias.map((d, i) => (
        <Tag
          key={d.dia}
          type={onEscolher ? "button" : undefined}
          role={onEscolher ? undefined : "listitem"}
          className={[
            "ini-dia ini-anim",
            i === selecionado ? "ini-dia--sel" : "",
            i === 0 ? "ini-dia--hoje" : "",
            onEscolher ? "ini-dia--botao" : "",
          ].join(" ")}
          style={{ "--i": 6 + i }}
          onClick={onEscolher ? () => onEscolher(i) : undefined}
          aria-pressed={onEscolher ? i === selecionado : undefined}
          title={d.itens.length ? d.itens.map((e) => `${e.titulo}${e.unidade ? ` ${e.unidade}` : ""}`).join(", ") : "livre"}
          aria-label={`${d.titulo ?? d.rotulo}: ${d.itens.length ? d.itens.map((e) => e.titulo).join(", ") : "livre"}`}
        >
          <small>{d.rotulo}</small>
          <b>{d.numero}</b>
          <span className="ini-dia__pontos" aria-hidden="true">
            {d.itens.length
              ? d.itens.slice(0, 4).map((e, k) => <i key={k} className={`ini-cor--${COR_DO_EVENTO[e.tipo]}`} />)
              : <i className="ini-cor--livre" />}
          </span>
        </Tag>
      ))}
    </div>
  );
}

/** Os próximos dias em lista: um dia por linha, com o que está marcado. */
export function DiasEmLista({ dias }) {
  return (
    <div className="ini-dlista">
      {dias.map((d, i) => (
        <div key={d.dia} className={`ini-dlista__dia${i === 0 ? " ini-dlista__dia--hoje" : ""}`}>
          <span className="ini-dlista__data"><b>{d.numero}</b><small>{d.rotulo}</small></span>
          <div className="ini-dlista__itens">
            {d.itens.length ? d.itens.map((e, k) => (
              <span key={k} className="ini-dlista__item">
                <i className={`ini-cor--${COR_DO_EVENTO[e.tipo]}`} aria-hidden="true" />
                <span className="ini-dlista__titulo">{e.titulo}</span>
                {e.unidade && <em>{e.unidade}</em>}
              </span>
            )) : <span className="ini-dlista__item ini-dlista__item--livre"><i className="ini-cor--livre" aria-hidden="true" />livre</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A assinatura da empresa de origem. No Diduccio o app não assina (o mesmo
 * que o mapa da portaria já fazia), então a peça não desenha nada; o nome
 * continua para as telas que a chamam não precisarem mudar.
 */
export function AssinaturaDaEmpresa() {
  return null;
}

/**
 * O botão grande do Início: anel com o número, título, texto e a seta. O
 * brilho que passa é CSS puro, para nunca ficar preso no meio.
 */
export function BotaoPrincipal({ numero, fracao = 1, titulo, texto, onClick, rotulo }) {
  return (
    <button type="button" className="ini-botao ini-anim" style={{ "--i": 3 }} onClick={onClick} aria-label={rotulo ?? titulo}>
      <span className="ini-botao__anel" aria-hidden="true">
        <svg viewBox="0 0 36 36">
          <circle className="ini-botao__trilho" cx="18" cy="18" r="15.9155" />
          <circle className="ini-botao__arco" cx="18" cy="18" r="15.9155" pathLength="100" style={{ "--fim": 100 - Math.round(Math.max(0, Math.min(1, fracao)) * 100) }} />
        </svg>
        <b>{numero == null ? "–" : <Contador valor={numero} />}</b>
      </span>
      <span className="ini-botao__texto">
        <b>{titulo}</b>
        <span>{texto}</span>
      </span>
      <span className="ini-botao__seta" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14 M12 5l7 7-7 7" /></svg>
      </span>
      <i className="ini-botao__brilho" aria-hidden="true" />
    </button>
  );
}
