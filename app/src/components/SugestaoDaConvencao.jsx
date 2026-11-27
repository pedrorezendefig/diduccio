import React, { useState } from "react";
import { BookOpen, Check, Sparkles } from "lucide-react";
import { Button } from "../ui";
import { MODO_DEMO } from "../api/config";
import { chamarEdgeFunction } from "../api/edge";
import { listar } from "../api/db";
import { buscarPorPalavras, citacaoDo, decisoesDasAtas } from "../lib/convencao/convencao.ts";

/**
 * Sugere o item da Convenção que fundamenta a infração descrita.
 *
 * Quem escolhe é a IA (função `ia`, ação sugerir-artigo), mas só ENTRE os itens
 * guardados no sistema: o texto mostrado aqui é sempre o literal da
 * convenção, nunca o que a IA escreveu. Sem IA (demonstração, sem chave, cota
 * acabada), a busca por palavras responde no lugar.
 *
 * É sugestão: quem cadastra lê o trecho e decide. Nada é preenchido sem o
 * clique em "Usar este".
 */
export default function SugestaoDaConvencao({ descricao, tipo, onUsar, prontas = null }) {
  // `prontas`: as sugestões que já vieram com a redação da IA (RedacaoComIA).
  // A página remonta este componente com outra `key` a cada redação nova, então
  // elas entram como estado inicial.
  const [buscando, setBuscando] = useState(false);
  const [itens, setItens] = useState(prontas?.itens ?? null);
  const [origem, setOrigem] = useState(prontas?.origem ?? "");
  const [usado, setUsado] = useState("");

  const curta = String(descricao ?? "").trim().length < 10;

  const sugerir = async () => {
    if (curta || buscando) return;
    setBuscando(true);
    setUsado("");
    try {
      if (MODO_DEMO) {
        // Na demonstração nada sai da máquina: busca local na Convenção e nas
        // atas de exemplo.
        let decisoes = [];
        try {
          const r = await listar("ASSEMBLEIAS");
          decisoes = decisoesDasAtas(Array.isArray(r) ? r : r?.data ?? []);
        } catch {
          decisoes = [];
        }
        setItens(buscarPorPalavras(descricao, 3, decisoes));
        setOrigem("palavras");
        return;
      }
      // 25 s: o servidor desiste da IA em 15 s e responde com a busca local;
      // se nem isso chegar, a busca local roda aqui. O botão nunca gira à toa.
      const r = await chamarEdgeFunction("ia", { acao: "sugerir-artigo", descricao }, { limiteMs: 25000 });
      if (r.ok && Array.isArray(r.corpo?.itens)) {
        setItens(r.corpo.itens);
        setOrigem(r.corpo.origem || "ia");
      } else {
        // A função fora do ar não pode deixar a pessoa sem nada: a busca local
        // roda aqui mesmo, com o mesmo texto da convenção.
        setItens(buscarPorPalavras(descricao));
        setOrigem("palavras");
      }
    } finally {
      setBuscando(false);
    }
  };

  const usar = (artigo) => {
    onUsar(artigo);
    setUsado(artigo.ref);
  };

  return (
    <div className="conv">
      <Button
        variant="secondary"
        size="sm"
        iconLeft={<Sparkles size={15} />}
        loading={buscando}
        disabled={curta}
        onClick={sugerir}
      >
        Sugerir item da Convenção
      </Button>
      {curta && <span className="conv__dica">Escreva a descrição para pedir a sugestão.</span>}

      {itens && (
        <div className="conv__lista" aria-live="polite">
          <div className="conv__origem">
            {origem === "ia" ? "Sugestão da IA" : "Busca por palavras"} · confira o texto antes de usar
          </div>
          {itens.length ? itens.map((a) => (
            <article key={a.ref} className={`conv__item${usado === a.ref ? " conv__item--usado" : ""}`}>
              <div className="conv__topo">
                <BookOpen size={15} />
                <strong>{a.rotulo || `Item ${a.ref}`}</strong>
                <span className="conv__tema">{a.tema}</span>
                <Button
                  size="sm"
                  variant={usado === a.ref ? "ghost" : "secondary"}
                  iconLeft={usado === a.ref ? <Check size={14} /> : null}
                  onClick={() => usar(a)}
                >
                  {usado === a.ref ? "Usado" : "Usar este"}
                </Button>
              </div>
              {a.motivo && <p className="conv__motivo">{a.motivo}</p>}
              <blockquote className="conv__texto">“{a.texto}”</blockquote>
              <small className="conv__cita">{citacaoDo(a)}</small>
            </article>
          )) : (
            <p className="conv__vazio">
              Nenhum item da Convenção trata disso diretamente. Talvez a regra esteja no Regimento
              Interno; se for o caso, escreva a base à mão.
            </p>
          )}
          {itens.length > 0 && (
            <small className="conv__dica">
              {String(tipo).toUpperCase() === "MULTA"
                ? "Usar preenche a Base na Convenção / Regulamento."
                : "Usar acrescenta o fundamento ao fim da descrição, que vai na carta."}
            </small>
          )}
        </div>
      )}
    </div>
  );
}
