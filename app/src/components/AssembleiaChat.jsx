import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Sparkles, Bot } from "lucide-react";
import { useTheme } from "../theme/useTheme";
import { chamarEdgeFunction, mensagemDaEdgeFunction } from "../api/edge";
import { dataBR } from "../lib/format";

function norm(s) { return (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

function parseLista(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
}

// A data da ata aparece na pergunta? Aceita dd/mm/aaaa, dd/mm e "8 de junho
// de 2026" / "8 de junho".
//
// A coluna é `date` e chega "2026-07-07": passa pelo dataBR ANTES de ler dia,
// mês e ano. Lendo o ISO direto, a expressão pegava "26-07-07" e nenhuma
// pergunta com a data brasileira achava a ata — só o botão de sugestão
// acertava, e por coincidência, porque também estava em ISO.
function dataBate(dataStr, qn) {
  const m = dataBR(dataStr).match(/(\d{1,2})\D+(\d{1,2})\D+(\d{2,4})/);
  if (!m) return false;
  const d = m[1], mo = m[2], y = m[3];
  const dd = d.padStart(2, "0"), mm = mo.padStart(2, "0");
  const meses = ["", "janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const nomeMes = meses[parseInt(mm, 10)] || "";
  const variantes = [
    `${dd}/${mm}/${y}`, `${dd}/${mm}`, `${parseInt(d, 10)}/${parseInt(mo, 10)}/${y}`, `${parseInt(d, 10)}/${parseInt(mo, 10)}`,
    `${dd}-${mm}-${y}`, `${parseInt(d, 10)} de ${nomeMes} de ${y}`, `${parseInt(d, 10)} de ${nomeMes}`,
  ];
  return variantes.some((v) => qn.includes(norm(v)));
}

// Responde na hora SÓ quando a pergunta é uma listagem direta (decisões / assinantes /
// resumo) de uma ata identificada por data ou "última/primeira". Perguntas específicas
// ("qual a porcentagem?", "quanto?", "por quê?") retornam null e vão para a IA.
function responderLocal(pergunta, atas) {
  if (!atas.length) return null;
  const qn = norm(pergunta);

  // Intenção de LISTAGEM (precisa ser explícita — evita capturar "porcentagem aprovada" etc.)
  const querAssinantes = /quem\s+assin|assinaram|assinou|quem\s+assinou|lista de assin/.test(qn);
  const querResumo = /\bresum|do que (se )?trat|sobre o que (foi|se|trat)|em que consist/.test(qn);
  const querDecisoes = /o que foi (decidido|deliberado|aprovado|votado)|o que (se )?decidiu|quais (foram )?as decis|todas as decis|liste?\s+as decis|decis(o|õ)es (da|de|do|na|no)\b/.test(qn);
  if (!querAssinantes && !querResumo && !querDecisoes) return null; // pergunta específica → IA

  // Alvo por data explícita ou "última/primeira" (sem busca fuzzy por palavra-chave).
  let ata = null;
  if (/ultim|mais recent|recent/.test(qn)) ata = atas[0];
  else if (/primeir|mais antig|antiga/.test(qn)) ata = atas[atas.length - 1];
  else {
    const porData = atas.filter((a) => dataBate(a.data_assembleia, qn));
    if (porData.length === 1) ata = porData[0];
  }
  if (!ata) return null; // sem ata clara → IA

  const cab = `${ata.titulo || "Ata"} — ${dataBR(ata.data_assembleia) || "s/ data"}`;
  const decisoes = parseLista(ata.decisoes);
  const assinantes = parseLista(ata.assinantes);

  if (querAssinantes) {
    return { titulo: cab, texto: assinantes.length ? "Assinaram:" : "Nenhum assinante registrado.", itens: assinantes, tipo: "assinantes" };
  }
  if (querResumo) {
    return { titulo: cab, texto: ata.resumo_geral || "Sem resumo registrado." };
  }
  return { titulo: cab, texto: decisoes.length ? "Decisões:" : "Nenhuma decisão registrada.", itens: decisoes, tipo: "decisoes" };
}

export default function AssembleiaChat({ atas }) {
  const { theme } = useTheme();
  const dark = theme.isDark;
  const [aberto, setAberto] = useState(false);
  const [input, setInput] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [msgs, setMsgs] = useState([
    { de: "bot", texto: "Olá! Pergunte sobre as atas — ex.: “o que foi decidido em 08/06/2026?”, “quem assinou a última ata?”" },
  ]);
  const fimRef = useRef(null);

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, aberto, carregando]);

  const sugestoes = [];
  const dataUltima = dataBR(atas[0]?.data_assembleia);
  if (dataUltima) sugestoes.push(`O que foi decidido em ${dataUltima}?`);
  if (dataUltima) sugestoes.push(`Quem assinou a ata de ${dataUltima}?`);

  const enviar = async (texto) => {
    const pergunta = (texto ?? input).trim();
    if (!pergunta || carregando) return;
    setInput("");
    setMsgs((m) => [...m, { de: "user", texto: pergunta }]);

    const local = responderLocal(pergunta, atas);
    if (local) {
      setMsgs((m) => [...m, { de: "bot", ...local }]);
      return;
    }

    // fallback de IA — com timeout para nunca travar o chat.
    setCarregando(true);
    try {
      // As atas NÃO viajam daqui: a Edge Function as lê do banco com o token de
      // quem perguntou. Mandar o contexto pronto do navegador deixaria qualquer
      // um enviar texto inventado como se fosse ata do condomínio, e a resposta
      // sairia com a autoridade de um documento oficial.
      const r = await chamarEdgeFunction("ia", { acao: "perguntar-atas", pergunta });
      setMsgs((m) => [...m, {
        de: "bot",
        texto: r.ok
          ? (r.corpo.resposta || "Não encontrei essa informação nas atas.")
          : mensagemDaEdgeFunction(r, "Não foi possível responder agora."),
      }]);
    } finally {
      setCarregando(false);
    }
  };

  const vars = {
    "--ch-card": theme.bgCard, "--ch-border": theme.border, "--ch-text": theme.text,
    "--ch-sec": theme.textSecondary, "--ch-field": dark ? "#0f172a" : "#f8fafc",
    "--ch-bot": dark ? "#1e293b" : "#f1f5f9",
  };

  return (
    <div style={vars}>
      <style>{CSS}</style>

      {aberto && (
        <div className="ch-panel">
          <div className="ch-head">
            <div className="ch-head-ico"><Bot size={18} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Assistente das Atas</div>
              <div style={{ fontSize: 11.5, opacity: .85, display: "flex", alignItems: "center", gap: 5 }}>
                <span className="ch-dot" /> online · busca + IA
              </div>
            </div>
            <button className="ch-x" onClick={() => setAberto(false)} title="Fechar"><X size={18} /></button>
          </div>

          <div className="ch-body">
            {msgs.map((m, i) => (
              <div key={i} className={"ch-row " + (m.de === "user" ? "ch-row-user" : "ch-row-bot")}>
                <div className={"ch-bubble " + (m.de === "user" ? "ch-b-user" : "ch-b-bot")}>
                  {m.titulo && <div className="ch-b-title">{m.titulo}</div>}
                  {m.texto && <div className="ch-b-text">{m.texto}</div>}
                  {m.itens && m.tipo === "decisoes" && (
                    <ol className="ch-decisoes">
                      {m.itens.map((d, k) => (<li key={k}><span className="ch-num">{k + 1}</span><span>{d}</span></li>))}
                    </ol>
                  )}
                  {m.itens && m.tipo === "assinantes" && (
                    <div className="ch-assinantes">
                      {m.itens.map((a, k) => (<span key={k} className="ch-chip">{a}</span>))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {carregando && (
              <div className="ch-row ch-row-bot">
                <div className="ch-bubble ch-b-bot ch-typing"><span /><span /><span /></div>
              </div>
            )}

            {msgs.length <= 1 && sugestoes.length > 0 && (
              <div className="ch-sug">
                {sugestoes.map((s, i) => (
                  <button key={i} className="ch-sug-btn" onClick={() => enviar(s)}><Sparkles size={12} /> {s}</button>
                ))}
              </div>
            )}
            <div ref={fimRef} />
          </div>

          <form className="ch-input-row" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
            <input className="ch-input" placeholder="Pergunte sobre uma ata…" value={input}
              onChange={(e) => setInput(e.target.value)} />
            <button className="ch-send" type="submit" disabled={!input.trim() || carregando} title="Enviar"><Send size={17} /></button>
          </form>
        </div>
      )}

      <button className={"ch-fab" + (aberto ? " ch-fab-open" : "")} onClick={() => setAberto((v) => !v)}
        title={aberto ? "Fechar" : "Perguntar sobre as atas"}>
        {aberto ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}

const CSS = `
@keyframes chIn { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes chPop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes chBlink { 0%,80%,100% { opacity: .25; } 40% { opacity: 1; } }

.ch-fab {
  position: fixed; right: 24px; bottom: 24px; z-index: 3000;
  width: 58px; height: 58px; border-radius: 50%; border: none; cursor: pointer;
  display: grid; place-items: center; color: #fff;
  background: linear-gradient(135deg, #0ea5e9, #0369a1 55%, #4f46e5);
  box-shadow: 0 14px 30px -8px rgba(3,105,161,.7);
  transition: transform .18s, box-shadow .18s;
}
.ch-fab:hover { transform: translateY(-2px) scale(1.05); box-shadow: 0 18px 36px -8px rgba(3,105,161,.85); }
.ch-fab-open { background: linear-gradient(135deg, #475569, #334155); }

.ch-panel {
  position: fixed; right: 24px; bottom: 94px; z-index: 3000;
  width: 370px; max-width: calc(100vw - 32px);
  height: 520px; max-height: calc(100vh - 130px);
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--ch-card); border: 1px solid var(--ch-border);
  border-radius: 18px; box-shadow: 0 24px 60px -18px rgba(2,6,23,.55);
  animation: chIn .28s cubic-bezier(.2,.8,.2,1) both;
}

.ch-head {
  display: flex; align-items: center; gap: 11px; padding: 14px 16px; color: #fff;
  background: linear-gradient(135deg, #0369a1, #075985 45%, #3730a3);
}
.ch-head-ico { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center;
  background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.28); }
.ch-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 0 3px rgba(74,222,128,.28); display: inline-block; }
.ch-x { margin-left: auto; background: transparent; border: none; color: rgba(255,255,255,.85); cursor: pointer; display: grid; place-items: center; }
.ch-x:hover { color: #fff; }

.ch-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.ch-body::-webkit-scrollbar { width: 8px; }
.ch-body::-webkit-scrollbar-thumb { background: var(--ch-border); border-radius: 8px; }

.ch-row { display: flex; }
.ch-row-user { justify-content: flex-end; }
.ch-row-bot { justify-content: flex-start; }
.ch-bubble { max-width: 84%; padding: 10px 13px; border-radius: 15px; font-size: 13.7px; line-height: 1.5; animation: chPop .2s ease both; }
.ch-b-user { color: #fff; border-bottom-right-radius: 5px; background: linear-gradient(135deg, #0ea5e9, #0369a1); }
.ch-b-bot { color: var(--ch-text); background: var(--ch-bot); border: 1px solid var(--ch-border); border-bottom-left-radius: 5px; }
.ch-b-title { font-weight: 700; font-size: 13px; margin-bottom: 5px; }
.ch-b-text { white-space: pre-wrap; }

.ch-decisoes { list-style: none; margin: 9px 0 2px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ch-decisoes li { display: flex; gap: 9px; align-items: flex-start; }
.ch-num { flex: none; width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; margin-top: 1px;
  font-size: 11px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #0ea5e9, #4f46e5); }
.ch-assinantes { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.ch-chip { font-size: 12.5px; font-weight: 500; padding: 4px 10px; border-radius: 999px;
  background: rgba(245,158,11,.14); color: #b45309; border: 1px solid rgba(245,158,11,.3); }

.ch-typing { display: inline-flex; gap: 4px; }
.ch-typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--ch-sec); animation: chBlink 1.2s infinite; }
.ch-typing span:nth-child(2) { animation-delay: .2s; }
.ch-typing span:nth-child(3) { animation-delay: .4s; }

.ch-sug { display: flex; flex-direction: column; gap: 7px; margin-top: 2px; }
.ch-sug-btn { text-align: left; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; cursor: pointer;
  padding: 8px 11px; border-radius: 11px; color: #0284c7; background: var(--ch-field); border: 1px dashed var(--ch-border); transition: background .15s, border-color .15s; }
.ch-sug-btn:hover { background: rgba(2,132,199,.1); border-color: #7dd3fc; }

.ch-input-row { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--ch-border); background: var(--ch-card); }
.ch-input { flex: 1; padding: 11px 13px; border-radius: 12px; font-size: 13.5px; font-family: inherit;
  color: var(--ch-text); background: var(--ch-field); border: 1px solid var(--ch-border); outline: none; transition: border-color .15s, box-shadow .15s; }
.ch-input:focus { border-color: #0ea5e9; box-shadow: 0 0 0 3px rgba(14,165,233,.16); }
.ch-send { flex: none; width: 44px; border-radius: 12px; border: none; cursor: pointer; color: #fff; display: grid; place-items: center;
  background: linear-gradient(135deg, #0ea5e9, #0369a1); transition: opacity .15s, transform .12s; }
.ch-send:disabled { opacity: .45; cursor: not-allowed; }
.ch-send:not(:disabled):active { transform: scale(.94); }

@media (max-width: 560px) {
  .ch-panel { right: 12px; left: 12px; width: auto; bottom: 88px; }
  .ch-fab { right: 16px; bottom: 16px; }
}
`;
