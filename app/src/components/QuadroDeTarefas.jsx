import React, { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, Plus } from "lucide-react";
import { Button, Modal, Tabs } from "../ui";
import { CONCLUIDA, SITUACOES, classificarPrazo, iniciais } from "../lib/tarefas";
import { rotuloCurtoDaUnidade } from "../lib/unidades";

/**
 * As colunas (ou abas, no celular) e os cartões. Não busca nem grava nada:
 * devolve `onMover(tarefa, situacao)`, `onAbrir(tarefa)`, `onAdicionar(situacao)`
 * e `onMostrarAnteriores()`. A página decide o que fazer com cada um.
 *
 * Arrastar é o HTML5 nativo, sem biblioteca. A tarefa arrastada fica no estado
 * do componente, e não só no `dataTransfer`: o navegador só deixa ler o
 * `dataTransfer` no `drop`, e a coluna precisa saber no `dragover` se há algo
 * sendo arrastado para se destacar.
 */
function Cartao({ tarefa, pessoa, unidade, agora, estreito, arrastando, onInicio, onFim, onAbrir, onPedirMover }) {
  const prazo = classificarPrazo(tarefa, agora);
  const nome = pessoa?.nome ?? "Sem responsável";
  const classes = [
    "tar-cartao",
    arrastando ? "tar-cartao--arrastando" : "",
    tarefa.situacao === CONCLUIDA ? "tar-cartao--feita" : "",
  ].filter(Boolean).join(" ");

  return (
    <li
      className={classes}
      draggable={estreito ? undefined : "true"}
      onDragStart={estreito ? undefined : (e) => {
        // Firefox não começa o arrasto sem algum dado no dataTransfer. O tipo é
        // próprio para que soltar num campo de texto não cole o id.
        e.dataTransfer?.setData?.("application/x-vitta-tarefa", String(tarefa.id));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        onInicio(tarefa);
      }}
      onDragEnd={estreito ? undefined : onFim}
    >
      <div className="tar-cartao__topo">
        <button type="button" className="tar-cartao__titulo" onClick={() => onAbrir(tarefa)}>
          {tarefa.titulo}
        </button>
        <button
          type="button"
          className="tar-cartao__mover"
          data-mover={tarefa.id}
          title={estreito ? undefined : "Mover"}
          aria-label={`Mover ${tarefa.titulo}`}
          onClick={() => onPedirMover(tarefa)}
        >
          {estreito ? "Mover" : <ArrowRightLeft size={15} aria-hidden="true" />}
        </button>
      </div>
      <div className="tar-cartao__rodape">
        {/* O número é como se fala da tarefa fora da tela: "a 12 já foi?". */}
        <span className="tar-cartao__numero">#{tarefa.id}</span>
        {unidade && <span className="tar-unidade">{rotuloCurtoDaUnidade(unidade)}</span>}
        {prazo && <span className={`tar-prazo tar-prazo--${prazo.tom}`}>{prazo.texto}</span>}
        <span className="tar-cartao__espaco" />
        <span
          className="tar-avatar"
          role="img"
          data-cargo={pessoa?.cargo ?? ""}
          title={nome}
          aria-label={`Responsável: ${nome}`}
        >
          {pessoa ? iniciais(pessoa.nome) : "?"}
        </span>
      </div>
    </li>
  );
}

export default function QuadroDeTarefas({
  grupos,
  pessoaPorId,
  unidadePorId,
  agora,
  estreito = false,
  escondidas = 0,
  onMover,
  onAbrir,
  onAdicionar,
  onMostrarAnteriores,
}) {
  const [arrastada, setArrastada] = useState(null);
  const [alvo, setAlvo] = useState(null);
  const [movendo, setMovendo] = useState(null);
  const [aba, setAba] = useState(SITUACOES[0].id);
  const [anuncio, setAnuncio] = useState("");
  const raiz = useRef(null);
  const focoPendente = useRef(null);

  // O cartão movido é remontado em outra coluna e o foco cairia no <body>.
  // Devolvemos o foco ao botão Mover dele assim que a lista nova chega; se o
  // cartão ainda não está lá (a página grava antes de atualizar), esperamos.
  useEffect(() => {
    if (focoPendente.current == null) return;
    const botao = raiz.current?.querySelector(`[data-mover="${focoPendente.current}"]`);
    if (!botao) return;
    botao.focus();
    focoPendente.current = null;
  }, [grupos, aba]);

  const mover = (tarefa, situacao) => {
    const rotulo = SITUACOES.find((x) => x.id === situacao)?.rotulo ?? "";
    // O titulo entra no texto: duas tarefas seguidas para a mesma coluna dariam
    // texto igual e o leitor de tela nao leria a segunda.
    setAnuncio(`“${tarefa.titulo}” movida para ${rotulo}.`);
    onMover(tarefa, situacao);
  };

  const soltar = (situacao) => {
    const tarefa = arrastada;
    setArrastada(null);
    setAlvo(null);
    if (tarefa && tarefa.situacao !== situacao) mover(tarefa, situacao);
  };

  const escolher = (situacao) => {
    const tarefa = movendo;
    setMovendo(null);
    if (tarefa && tarefa.situacao !== situacao) {
      focoPendente.current = tarefa.id;
      // No celular só a aba ativa existe: sem trocá-la o cartão sumiria.
      if (estreito) setAba(situacao);
      mover(tarefa, situacao);
    }
  };

  const coluna = (s) => {
    const lista = grupos?.[s.id] ?? [];
    return (
      <section
        key={s.id}
        aria-label={s.rotulo}
        className={"tar-coluna" + (alvo === s.id ? " tar-coluna--alvo" : "")}
        onDragOver={estreito ? undefined : (e) => {
          if (!arrastada) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
          // A coluna de origem não é destino: soltar nela não faz nada.
          const destaque = s.id === arrastada.situacao ? null : s.id;
          if (alvo !== destaque) setAlvo(destaque);
        }}
        onDragLeave={estreito ? undefined : (e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setAlvo(null);
        }}
        onDrop={estreito ? undefined : (e) => {
          e.preventDefault();
          soltar(s.id);
        }}
      >
        {!estreito && (
          <div className="tar-coluna__topo">
            <h2 className="tar-coluna__nome">{s.rotulo}</h2>
            <span className="tar-coluna__conta">{lista.length}</span>
          </div>
        )}
        <ul className="tar-coluna__lista">
          {lista.map((t) => (
            <Cartao
              key={t.id}
              tarefa={t}
              pessoa={pessoaPorId.get(String(t.responsavel_id ?? ""))}
              unidade={unidadePorId.get(String(t.id_unidade ?? ""))}
              agora={agora}
              estreito={estreito}
              arrastando={arrastada?.id === t.id}
              onInicio={setArrastada}
              onFim={() => { setArrastada(null); setAlvo(null); }}
              onAbrir={onAbrir}
              onPedirMover={setMovendo}
            />
          ))}
        </ul>
        {lista.length === 0 && <p className="tar-coluna__vazia">Nenhuma tarefa aqui.</p>}
        {s.id === "A_FAZER" && (
          <button type="button" className="tar-coluna__acao" onClick={() => onAdicionar("A_FAZER")}>
            <Plus size={14} aria-hidden="true" /> Adicionar tarefa
          </button>
        )}
        {s.id === CONCLUIDA && escondidas > 0 && (
          <button type="button" className="tar-coluna__acao" onClick={onMostrarAnteriores}>
            Ver concluídas anteriores ({escondidas})
          </button>
        )}
      </section>
    );
  };

  return (
    <div ref={raiz}>
      <p className="tar-anuncio" aria-live="polite">{anuncio}</p>
      {estreito ? (
        <>
          <Tabs
            items={SITUACOES.map((s) => ({ value: s.id, label: s.rotulo, count: (grupos?.[s.id] ?? []).length }))}
            value={aba}
            onChange={setAba}
          />
          {coluna(SITUACOES.find((s) => s.id === aba))}
        </>
      ) : (
        <div className="tar-quadro">{SITUACOES.map(coluna)}</div>
      )}

      <Modal open={Boolean(movendo)} onClose={() => setMovendo(null)} title="Mover tarefa" size="sm">
        {movendo && (
          <>
            <p className="vit-modal__desc">{movendo.titulo}</p>
            <div className="tar-opcoes-mover">
              {SITUACOES.filter((s) => s.id !== movendo.situacao).map((s) => (
                <Button key={s.id} variant="secondary" onClick={() => escolher(s.id)}>
                  {s.rotulo}
                </Button>
              ))}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
