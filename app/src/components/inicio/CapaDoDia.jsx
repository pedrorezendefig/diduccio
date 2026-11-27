import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, CalendarDays, Clock, SunMoon } from "lucide-react";
import { astroEm, ceuEm, horaEmBrasilia, periodoDoDia, relogio } from "../../lib/capa";
import { dataPorExtenso, saudacao } from "../../lib/inicio";
import { AssinaturaDaEmpresa } from "./pecas";

const L = 1150, A = 250;

/** Sorteio repetível: a capa é a mesma a cada abertura, só a luz muda. */
function sorteio(semente) {
  let s = semente;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

/** Prédios com janelas, estrelas e palmeiras: desenhados uma vez só. */
function desenharCenario() {
  const r = sorteio(17);
  const predios = [], janelas = [], estrelas = [];
  for (let x = 380; x < L;) {
    const w = 34 + r() * 56, h = 40 + r() * 90;
    predios.push({ x, y: A - h, w, h });
    for (let jx = x + 6; jx < x + w - 8; jx += 10) {
      for (let jy = A - h + 8; jy < A - 10; jy += 13) if (r() < 0.45) janelas.push({ x: jx, y: jy });
    }
    x += w + 3;
  }
  for (let i = 0; i < 60; i++) estrelas.push({ x: r() * L, y: r() * 140, r: r() * 1.2 + 0.4 });
  return { predios, janelas, estrelas };
}
const CENARIO = desenharCenario();

const FOLHAS = [[-58, 58], [-40, 40], [-20, 22], [20, 18], [44, 40], [60, 62]];
function Palmeira({ x, escala, lenta }) {
  return (
    <g transform={`translate(${x} ${A - 200 * escala})`}>
      <g className={`capa__palma${lenta ? " capa__palma--lenta" : ""}`}>
        <g transform={`scale(${escala})`}>
          <path d="M0 200 C 4 150, 10 110, 6 70" strokeWidth="5" fill="none" strokeLinecap="round" />
          {FOLHAS.map(([dx, dy]) => (
            <path key={dx} d={`M6 70 Q ${6 + dx / 2} 44 ${6 + dx} ${40 + dy}`} strokeWidth="4" fill="none" strokeLinecap="round" />
          ))}
        </g>
      </g>
    </g>
  );
}

/** A hora de Brasília, atualizada a cada minuto. */
function useHoraDeBrasilia() {
  const [hora, setHora] = useState(() => horaEmBrasilia());
  useEffect(() => {
    const id = setInterval(() => setHora(horaEmBrasilia()), 60_000);
    return () => clearInterval(id);
  }, []);
  return hora;
}

/**
 * A capa do Início: a saudação sobre o condomínio ilustrado, com o céu, a luz
 * e o sol ou a lua da hora de Brasília. À noite as janelas acendem e aparecem
 * estrelas. No canto, o relógio e o sino com os avisos do dia.
 */
export default function CapaDoDia({ nome, frase, avisos = [] }) {
  const hora = useHoraDeBrasilia();
  const cenario = CENARIO;
  const c = ceuEm(hora);
  const astro = astroEm(hora);
  const ax = 420 + astro.f * 680;
  // O ponto mais alto do arco fica abaixo do topo, que desbota: o astro não some.
  const ay = 205 - astro.altura * 125;
  const hoje = dataPorExtenso();
  const data = hoje.charAt(0).toUpperCase() + hoje.slice(1);

  return (
    <section className="capa ic-anim" style={{ "--i": 0 }} aria-label="Boas-vindas">
      <svg className="capa__arte" viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="capa-ceu" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.topo} />
            <stop offset=".62" stopColor={c.meio} />
            <stop offset="1" stopColor={c.base} />
          </linearGradient>
          <radialGradient id="capa-brilho">
            <stop offset="0" stopColor={c.astro} stopOpacity=".55" />
            <stop offset="1" stopColor={c.astro} stopOpacity="0" />
          </radialGradient>
          <mask id="capa-lua">
            <rect width={L} height={A} fill="#fff" />
            <circle cx={ax + 9} cy={ay - 6} r="20" fill="#000" />
          </mask>
        </defs>
        <rect width={L} height={A} fill="url(#capa-ceu)" />
        <g className="capa__estrelas" fill="#FBFAF8" style={{ opacity: c.estrelas }}>
          {cenario.estrelas.map((e, i) => <circle key={i} cx={e.x} cy={e.y} r={e.r} />)}
        </g>
        <circle cx={ax} cy={ay} r="110" fill="url(#capa-brilho)" style={{ opacity: astro.dia ? 1 : 0.35 }} />
        {astro.dia
          ? <circle className="capa__sol" cx={ax} cy={ay} r="26" fill={c.astro} />
          : <circle className="capa__lua" cx={ax} cy={ay} r="22" fill={c.astro} mask="url(#capa-lua)" />}
        <g fill={c.predios}>
          {cenario.predios.map((p, i) => <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} />)}
        </g>
        <g className="capa__janelas" fill="#F0DCA8" style={{ opacity: c.janelas }}>
          {cenario.janelas.map((j, i) => <rect key={i} x={j.x} y={j.y} width="4" height="6" />)}
        </g>
        <g stroke={c.palmeiras}>
          <Palmeira x={520} escala={0.85} />
          <Palmeira x={880} escala={1.05} lenta />
          <Palmeira x={1060} escala={0.75} />
        </g>
      </svg>
      <div className="capa__veu" aria-hidden="true" />

      <div className="capa__conteudo">
        <div className="capa__ola">
          <span className="capa__data"><CalendarDays size={16} aria-hidden="true" />{data}</span>
          <h1>{saudacao()}{nome ? `, ${nome}` : ""}.</h1>
          <p>{frase}</p>
          {/* A primeira assinatura: entra aqui e depois recolhe as letras; a do fim
              da página abre em seguida. */}
          <AssinaturaDaEmpresa />
        </div>
      </div>

      {/* No canto da capa, e não junto da saudação: fica no alto, à direita. */}
      <div className="capa__canto">
        <span className="capa__hora" title="Hora de Brasília">
          <SunMoon size={15} aria-hidden="true" />
          <span>{periodoDoDia(hora)}</span>
          <time>{relogio(hora)}</time>
        </span>
        <Sino avisos={avisos} />
      </div>
    </section>
  );
}

/** O sino: abre os avisos do dia, do mais grave para o menos. */
function Sino({ avisos }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  const n = avisos.length;
  return (
    <div className="capa__sino-area" ref={ref}>
      <button
        type="button"
        className="capa__sino"
        aria-label={n ? `${n === 1 ? "1 aviso" : `${n} avisos`} hoje` : "Nenhum aviso hoje"}
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <Bell size={18} aria-hidden="true" />
        {n > 0 && <i aria-hidden="true">{n > 9 ? "9+" : n}</i>}
      </button>
      {aberto && (
        <div className="capa__avisos" role="dialog" aria-label="Avisos de hoje">
          <b>Avisos de hoje</b>
          {n ? (
            <ul>
              {avisos.map((a, k) => (
                <li key={k}>
                  <span className={`capa__aviso-ico${a.grave ? " capa__aviso-ico--grave" : ""}`}>
                    {a.grave ? <AlertTriangle size={15} aria-hidden="true" /> : <Clock size={15} aria-hidden="true" />}
                  </span>
                  <span><b>{a.titulo}</b><small>{a.texto}</small></span>
                </li>
              ))}
            </ul>
          ) : <p>Nenhum aviso agora. Tudo em dia.</p>}
        </div>
      )}
    </div>
  );
}
