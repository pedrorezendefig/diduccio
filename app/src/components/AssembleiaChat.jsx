import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Sparkles, Bot } from "lucide-react";
import { Input } from "../ui";
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

  // As cores e o desenho moram em styles/assembleia.css, nos tokens do ViT
  // (o azul e o roxo de antes não eram do sistema).
  return (
    <>
      {aberto && (
        <div className="ch-painel" role="dialog" aria-label="Assistente das atas">
          <div className="ch-topo">
            <span className="ch-topo__icone" aria-hidden="true"><Bot size={18} /></span>
            <div className="ch-topo__nome">
              <strong>Assistente das atas</strong>
              <small><span className="ch-ponto" aria-hidden="true" /> Busca nas atas + IA</small>
            </div>
            <button type="button" className="ch-fechar" onClick={() => setAberto(false)} title="Fechar" aria-label="Fechar o assistente">
              <X size={18} />
            </button>
          </div>

          <div className="ch-corpo">
            {msgs.map((m, i) => (
              <div key={i} className={"ch-linha " + (m.de === "user" ? "ch-linha--eu" : "ch-linha--bot")}>
                <div className={"ch-balao " + (m.de === "user" ? "ch-balao--eu" : "ch-balao--bot")}>
                  {m.titulo && <div className="ch-balao__titulo">{m.titulo}</div>}
                  {m.texto && <div className="ch-balao__texto">{m.texto}</div>}
                  {m.itens && m.tipo === "decisoes" && (
                    <ol className="ch-decisoes">
                      {m.itens.map((d, k) => (<li key={k}><span className="asb-num">{k + 1}</span><span>{d}</span></li>))}
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
              <div className="ch-linha ch-linha--bot">
                <div className="ch-balao ch-balao--bot ch-digitando" aria-label="Respondendo"><span /><span /><span /></div>
              </div>
            )}

            {msgs.length <= 1 && sugestoes.length > 0 && (
              <div className="ch-sugestoes">
                {sugestoes.map((s, i) => (
                  <button key={i} type="button" className="ch-sugestao" onClick={() => enviar(s)}>
                    <Sparkles size={12} aria-hidden="true" /> {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={fimRef} />
          </div>

          <form className="ch-envio" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
            <Input placeholder="Pergunte sobre uma ata…" aria-label="Pergunta sobre as atas" value={input}
              onChange={(e) => setInput(e.target.value)} />
            <button className="ch-enviar" type="submit" disabled={!input.trim() || carregando} title="Enviar" aria-label="Enviar">
              <Send size={17} />
            </button>
          </form>
        </div>
      )}

      <button type="button" className={"ch-botao" + (aberto ? " ch-botao--aberto" : "")} onClick={() => setAberto((v) => !v)}
        title={aberto ? "Fechar" : "Perguntar sobre as atas"} aria-expanded={aberto}>
        {aberto ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </>
  );
}
