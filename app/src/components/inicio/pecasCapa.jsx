import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowRight, ArrowUp, CalendarDays, ChartLine, CircleCheck, CircleDollarSign,
  Megaphone, MessageSquare, Package, SquareCheckBig, UserCheck,
} from "lucide-react";

const poucoMovimento = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Número que conta de 0 até o valor. O valor certo fica num texto só para o
 * leitor de tela: ele não ouve a contagem, e o teste lê o número final.
 */
export function Contagem({ valor, formatar = (n) => n.toLocaleString("pt-BR"), duracao = 1100 }) {
  const alvo = Number(valor) || 0;
  const [semAnimacao] = useState(() => poucoMovimento() || typeof requestAnimationFrame === "undefined");
  const [atual, setAtual] = useState(() => (semAnimacao ? alvo : 0));
  const de = useRef(atual);
  useEffect(() => {
    if (semAnimacao) { setAtual(alvo); return undefined; }
    const inicio = performance.now();
    const origem = de.current;
    let quadro;
    const passo = (t) => {
      const p = Math.min(1, (t - inicio) / duracao);
      const v = origem + (alvo - origem) * (1 - Math.pow(1 - p, 3));
      de.current = v;
      setAtual(v);
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    // Aba em segundo plano segura os quadros: o número não fica no meio.
    const fim = setTimeout(() => { de.current = alvo; setAtual(alvo); }, duracao + 400);
    return () => { cancelAnimationFrame(quadro); clearTimeout(fim); };
  }, [alvo, duracao, semAnimacao]);
  return (
    <span>
      <span className="ic-so-leitor">{formatar(alvo)}</span>
      <span aria-hidden="true">{formatar(Math.round(atual))}</span>
    </span>
  );
}

/** Mini-gráfico: linha que se desenha, área e o último ponto destacado. */
export function MiniGrafico({ valores }) {
  const w = 120, h = 56;
  const vs = valores?.length > 1 ? valores : null;
  if (!vs) return null;
  const max = Math.max(...vs), min = Math.min(...vs);
  const P = vs.map((v, i) => [4 + (i * (w - 8)) / (vs.length - 1), 6 + (h - 14) * (max === min ? 0.5 : 1 - (v - min) / (max - min))]);
  const d = P.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
  const u = P[P.length - 1];
  return (
    <svg className="ic-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
      <path className="ic-spark__area" d={`${d}L${u[0]} ${h}L4 ${h}Z`} />
      <path className="ic-spark__linha" d={d} pathLength="1" />
      {P.map((p, i) => (i % 2 === 0 && i !== P.length - 1 ? <circle key={i} className="ic-spark__pt" cx={p[0]} cy={p[1]} r="1.8" /> : null))}
      <circle className="ic-spark__pt ic-spark__pt--fim" cx={u[0]} cy={u[1]} r="3" />
    </svg>
  );
}

/**
 * Cartão de número: rótulo em duas linhas com ícone, número que conta,
 * mini-gráfico à direita (numa coluna só dele) e a linha de contexto.
 * `dica.tipo`: "sobe" (seta verde), "desce", "alerta" (triângulo) ou nada.
 */
export function Numero({ ordem, Icone, linhas, valor, formatar, serie, tom, dica }) {
  const alerta = dica?.tipo === "alerta";
  const Seta = dica?.tipo === "sobe" ? ArrowUp : dica?.tipo === "desce" ? ArrowDown : alerta ? AlertTriangle : null;
  return (
    <article className={`ic-num ic-anim ic-tom--${tom}`} style={{ "--i": ordem }}>
      <span className="ic-num__rotulo">
        <span className="ic-num__ico"><Icone size={18} aria-hidden="true" /></span>
        <span>{linhas[0]}<br />{linhas[1]}</span>
      </span>
      <MiniGrafico valores={serie} />
      <span className={`ic-num__valor${alerta ? " ic-num__valor--alerta" : ""}`}>
        {valor == null ? "–" : <Contagem valor={valor} formatar={formatar} />}
      </span>
      {dica?.texto && (
        <span className={`ic-num__dica ic-num__dica--${dica.tipo || "neutra"}`}>
          {Seta && <Seta size={14} aria-hidden="true" />}{dica.texto}
        </span>
      )}
    </article>
  );
}

/**
 * A faixa do Modo foco é um botão só, de ponta a ponta, como o botão grande do
 * Início anterior: é a única porta para a tela do Modo foco, que não está no
 * menu. Ela abre sempre, com ou sem pedido esperando.
 */
export function FaixaFoco({ numero, fracao, titulo = "Modo foco", texto, botao, onClick, ordem = 5, grave = false }) {
  // O anel e o botão têm a mesma cor, pela gravidade: verde em dia, laranja
  // com algo esperando, vermelho quando já passou do prazo ou acumulou.
  const tem = numero > 0;
  const nivel = !tem ? "" : grave ? " ic-foco--tem ic-foco--grave" : " ic-foco--tem";
  return (
    <button type="button" className={`ic-foco ic-anim${nivel}`} style={{ "--i": ordem }}
      onClick={onClick} aria-label={`${titulo}: ${texto}`}>
      <span className="ic-foco__anel" aria-hidden="true">
        <svg viewBox="0 0 36 36">
          <circle className="ic-foco__trilho" cx="18" cy="18" r="15.9155" />
          <circle className="ic-foco__arco" cx="18" cy="18" r="15.9155" pathLength="100" style={{ "--fim": 100 - Math.round(Math.max(0, Math.min(1, fracao)) * 100) }} />
        </svg>
        <b>{numero == null ? "–" : <Contagem valor={numero} />}</b>
      </span>
      <span className="ic-foco__texto"><b>{titulo}</b><span>{texto}</span></span>
      <span className={`ic-botao${tem ? " ic-botao--prim" : ""}`} aria-hidden="true">
        {botao}<ArrowRight size={16} aria-hidden="true" />
      </span>
      <PalmeirasDoFoco />
      <i className="ic-foco__brilho" aria-hidden="true" />
    </button>
  );
}

/**
 * O coqueiro da capa, em pé, com a base do tronco em (x, chão). Vai dentro de
 * um <svg> com fill="none" e stroke="currentColor". `lenta`: balanço mais
 * lento, para dois vizinhos não balançarem juntos.
 */
const FOLHAS = [[-58, 58], [-40, 40], [-20, 22], [20, 18], [44, 40], [60, 62]];
export function Palma({ x, escala, chao, lenta = false }) {
  return (
    <g transform={`translate(${x} ${chao - 200 * escala})`}>
      <g className={`ic-foco__palma${lenta ? " ic-foco__palma--lenta" : ""}`}>
        <g transform={`scale(${escala})`}>
          <path d="M0 200 C 4 150, 10 110, 6 70" strokeWidth="5" />
          {FOLHAS.map(([dx, dy]) => <path key={dx} d={`M6 70 Q ${6 + dx / 2} 44 ${6 + dx} ${40 + dy}`} strokeWidth="4" />)}
        </g>
      </g>
    </g>
  );
}

/** Três palmeiras do mesmo desenho da capa, de enfeite, à direita da faixa do Modo foco. */
function PalmeirasDoFoco() {
  return (
    <svg className="ic-foco__palmas" viewBox="0 0 320 120" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <Palma x={70} escala={0.5} chao={120} />
        <Palma x={170} escala={0.68} chao={120} lenta />
        <Palma x={265} escala={0.46} chao={120} />
      </g>
    </svg>
  );
}

const ICONES = { encomenda: Package, app: UserCheck, chamado: MessageSquare, inadimplente: CircleDollarSign, tarefa: SquareCheckBig };

/** Cartão com título, ícone e link à direita. */
export function Cartao({ ordem, Icone, titulo, acao, children, className = "" }) {
  return (
    <section className={`ic-cartao ic-anim ${className}`} style={{ "--i": ordem }}>
      <header className="ic-cartao__topo">
        <h2><Icone size={18} aria-hidden="true" />{titulo}</h2>
        {acao}
      </header>
      {children}
    </section>
  );
}

export function Link({ children, onClick }) {
  return <button type="button" className="ic-link" onClick={onClick}>{children}<ArrowRight size={15} aria-hidden="true" /></button>;
}

/** Suas pendências: cada linha leva para onde se resolve. */
export function Pendencias({ ordem, itens, carregando, vazio, onIr, verTodas }) {
  return (
    <Cartao ordem={ordem} Icone={CircleCheck} titulo="Suas pendências" acao={verTodas}>
      {carregando ? <Esqueleto linhas={4} /> : itens.length ? (
        <ul className="ic-lista">
          {itens.map((p, k) => {
            const Icone = ICONES[p.icone] ?? Package;
            return (
              <li key={p.chave} className="ic-anim" style={{ "--i": ordem + 1 + k }}>
                <button type="button" className={`ic-pend ic-tom--${p.tom}`} onClick={() => onIr(p.destino)}>
                  <span className="ic-pend__ico"><Icone size={17} aria-hidden="true" /></span>
                  <span className="ic-pend__texto"><b>{p.titulo}</b><small>{p.texto}</small></span>
                  <span className="ic-selo">{p.selo}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="ic-vazio">
          <span className="ic-vazio__ok"><CircleCheck size={22} aria-hidden="true" /></span>
          <b>{vazio.titulo}</b><span>{vazio.texto}</span>
        </div>
      )}
    </Cartao>
  );
}

export function Esqueleto({ linhas = 3 }) {
  return (
    <div className="ic-esqueleto" aria-hidden="true">
      {Array.from({ length: linhas }, (_, i) => <span key={i} />)}
    </div>
  );
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/**
 * Gráfico do ano, mês a mês, com linhas verticais e o mês atual destacado.
 * Clicar num ponto (ou Enter nele) mostra o mês e o valor numa etiqueta;
 * clicar de novo ou Esc fecha. A área de clique é maior que o ponto.
 */
function GraficoDoAno({ valores, rotulo, formatar, ano }) {
  const [sel, setSel] = useState(null);
  const w = 340, h = 220, base = h - 26;
  const vs = valores.length ? valores : [0];
  const mx = Math.max(...vs, 1) * 1.12, mn = Math.min(...vs) * 0.55;
  const passo = vs.length > 1 ? (w - 20) / (vs.length - 1) : 0;
  const P = vs.map((v, i) => [10 + i * passo, 12 + (base - 24) * (1 - (v - mn) / (mx - mn || 1))]);
  let d = `M${P[0][0]} ${P[0][1]}`;
  for (let i = 1; i < P.length; i++) {
    const [x0, y0] = P[i - 1], [x1, y1] = P[i], cx = (x0 + x1) / 2;
    d += ` C${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`;
  }
  const u = P[P.length - 1];
  const nome = (i) => `${MESES_LONGOS[i]} de ${ano}`;
  const alternar = (i) => setSel((atual) => (atual === i ? null : i));
  const teclas = (e, i) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(i); }
    if (e.key === "Escape") setSel(null);
  };
  // A etiqueta fica em cima do ponto; perto das pontas, encosta para dentro.
  const dica = sel == null ? null : { x: (P[sel][0] / w) * 100, y: (P[sel][1] / h) * 100 };
  const lado = dica == null ? "" : dica.x < 18 ? " ic-graf-dica--esq" : dica.x > 82 ? " ic-graf-dica--dir" : "";
  return (
    <div className="ic-graf-box">
      <svg className="ic-graf" viewBox={`0 0 ${w} ${h}`} role="group"
        aria-label={`${rotulo}: ${vs.map((v, i) => `${MESES[i]} ${formatar(v)}`).join(", ")}`}>
        {P.map((p, i) => <path key={i} className={`ic-graf__guia${i === sel ? " ic-graf__guia--sel" : ""}`} d={`M${p[0]} 8V${base}`} />)}
        <path className="ic-graf__area" d={`${d} L${u[0]} ${base} L${P[0][0]} ${base} Z`} />
        <path className="ic-graf__linha" d={d} pathLength="1" />
        {P.slice(0, -1).map((p, i) => <circle key={i} className={`ic-graf__pt${i === sel ? " ic-graf__pt--sel" : ""}`} cx={p[0]} cy={p[1]} r="3" />)}
        <circle className={`ic-graf__pt ic-graf__pt--fim${sel === P.length - 1 ? " ic-graf__pt--sel" : ""}`} cx={u[0]} cy={u[1]} r="5" />
        {P.map((p, i) => <text key={i} className="ic-graf__mes" x={p[0]} y={h - 6} textAnchor="middle">{MESES[i]}</text>)}
        {P.map((p, i) => (
          <circle key={`alvo-${i}`} className="ic-graf__alvo" cx={p[0]} cy={p[1]} r="14"
            role="button" tabIndex={0} aria-pressed={i === sel}
            aria-label={`${nome(i)}: ${formatar(vs[i])}`}
            onClick={() => alternar(i)} onKeyDown={(e) => teclas(e, i)} />
        ))}
      </svg>
      {dica && (
        <div className={`ic-graf-dica${lado}`} style={{ left: `${dica.x}%`, top: `${dica.y}%` }} role="status">
          <small>{nome(sel)}</small>
          <b>{formatar(vs[sel])}</b>
        </div>
      )}
    </div>
  );
}

/**
 * Relatórios: abas em pílula, o total do ano com a variação sobre o mesmo
 * período do ano passado, e o gráfico. `series` é { chave: { nome, valores,
 * total, variacao, rotulo, formatar, tom } }.
 */
export function Relatorios({ ordem, series, carregando }) {
  const chaves = Object.keys(series);
  const [escolhida, setAba] = useState(null);
  // As séries chegam depois (carregando, a lista é vazia): sem escolha, vale a
  // primeira. É ela que aparece ligada e no gráfico.
  const aba = series[escolhida] ? escolhida : chaves[0];
  const s = series[aba];
  return (
    <Cartao ordem={ordem} Icone={ChartLine} titulo="Relatórios" className={`ic-tom--${s?.tom ?? "marca"}`}
      acao={(
        <span className="ic-abas" role="group" aria-label="Tipo de relatório">
          {chaves.map((k) => (
            <button key={k} type="button" aria-pressed={k === aba} onClick={() => setAba(k)}>{series[k].nome}</button>
          ))}
        </span>
      )}>
      {carregando || !s ? <Esqueleto linhas={5} /> : (
        <div key={aba} className="ic-rel">
          <div className="ic-rel__total">{s.total == null ? "–" : <Contagem valor={s.total} formatar={s.formatar} duracao={800} />}</div>
          <div className="ic-rel__linha">
            <span>{s.rotulo}</span>
            {s.variacao != null && (
              <span className={`ic-delta${s.variacao < 0 ? " ic-delta--desce" : ""}`} title={`em relação ao mesmo período de ${s.anoPassado}`}>
                {s.variacao < 0 ? <ArrowDown size={13} aria-hidden="true" /> : <ArrowUp size={13} aria-hidden="true" />}
                {s.variacao > 0 ? "+" : ""}{s.variacao}%
              </span>
            )}
          </div>
          <GraficoDoAno valores={s.valores} rotulo={s.rotulo} formatar={s.formatar} ano={s.anoPassado ? s.anoPassado + 1 : new Date().getFullYear()} />
        </div>
      )}
    </Cartao>
  );
}

/** Próximos dias: os dias em botões e, embaixo, o que está marcado no escolhido. */
export function ProximosDias({ ordem, dias, carregando, acao }) {
  const [sel, setSel] = useState(0);
  const dia = dias?.[sel];
  return (
    <Cartao ordem={ordem} Icone={CalendarDays} titulo="Próximos dias" acao={acao}>
      {carregando || !dias ? <Esqueleto linhas={3} /> : (
        <>
          <div className="ic-dias" role="group" aria-label="Escolha o dia">
            {dias.map((d, i) => (
              <button key={d.dia} type="button" className="ic-dia" aria-pressed={i === sel} onClick={() => setSel(i)}
                aria-label={`${i === 0 ? "Hoje" : d.sigla} ${d.numero}: ${d.itens.length ? `${d.itens.length} ${d.itens.length === 1 ? "compromisso" : "compromissos"}` : "livre"}`}>
                <small>{d.sigla}</small>
                <b>{d.numero}</b>
                <span className="ic-dia__pts" aria-hidden="true">
                  {d.itens.slice(0, 4).map((e, k) => <i key={k} className={`ic-cor--${e.tipo}`} />)}
                </span>
              </button>
            ))}
          </div>
          <ul key={dia.dia} className="ic-agenda" aria-live="polite">
            {dia.itens.length ? dia.itens.map((e, k) => (
              <li key={k}>
                <i className={`ic-cor--${e.tipo}`} aria-hidden="true" />
                <time>{e.hora || "dia todo"}</time>
                <span>{e.titulo}{e.unidade ? ` · ${e.unidade}` : ""}{e.detalhe ? ` · ${e.detalhe}` : ""}</span>
              </li>
            )) : <li className="ic-agenda__livre">{sel === 0 ? "Nada marcado para hoje." : "Nada marcado neste dia."}</li>}
          </ul>
        </>
      )}
    </Cartao>
  );
}

/** Fique por dentro: um atalho com ícone, frase e botão. */
export function FiquePorDentro({ ordem, texto, botao, Icone = Megaphone, onClick }) {
  return (
    <section className="ic-cartao ic-dentro ic-anim" style={{ "--i": ordem }}>
      <span className="ic-dentro__ico"><Icone size={24} aria-hidden="true" /></span>
      <span className="ic-dentro__texto"><b>Fique por dentro!</b><span>{texto}</span></span>
      <button type="button" className="ic-botao ic-botao--prim" onClick={onClick}>{botao}</button>
      <svg className="ic-dentro__folha" viewBox="0 0 120 100" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M110 100 C 100 70, 90 50, 70 34" /><path d="M70 34 Q 50 20 20 26" /><path d="M70 34 Q 56 8 30 4" />
          <path d="M70 34 Q 80 10 100 6" /><path d="M70 34 Q 40 40 14 60" />
        </g>
      </svg>
    </section>
  );
}
