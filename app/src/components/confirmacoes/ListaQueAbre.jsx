import React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { Skeleton } from "../../ui";

/**
 * A tabela das filas de Confirmações: clicar na linha abre os detalhes logo
 * abaixo dela; clicar de novo fecha.
 *
 * Não é o <Table> do ViT porque a linha precisa de um botão próprio (para
 * abrir com teclado e anunciar aberto/fechado) e de um painel embaixo. As
 * ações ficam FORA do botão da linha: botão dentro de botão não existe em
 * HTML, e clicar em "Aprovar" não pode abrir nem fechar a linha.
 *
 * colunas: [{ rotulo, largura }]   larguras em fr/px, como no CSS grid
 * celulas(item): uma célula por coluna
 * onAbrir(item): no lugar de abrir embaixo, a linha chama isto (a tela APP
 * abre um modal). Sem painel, sem aria-expanded.
 * Ordenar: a coluna com `ordem` (a chave) vira botão no cabeçalho; clicar
 * chama onOrdenar(chave). `ordenacao` = { chave, direcao: "asc" | "desc" }
 * desenha a seta na coluna ativa.
 * rotuloAcoes: o título em cima dos botões do fim da linha ("Ações").
 * propsDaLinha(item): atributos a mais na linha (o mapa da portaria acha a
 * linha pelo `id` e a marca com `data-destacada`).
 */
export default function ListaQueAbre({ colunas, larguraAcoes = "200px", itens, carregando, chave, celulas, acoes = () => null, detalhe, aberto, onAlternar, onAbrir, rotuloDaLinha, ordenacao, onOrdenar, rotuloAcoes = "Ações", propsDaLinha }) {
  const grade = { "--conf-colunas": colunas.map((c) => c.largura ?? "1fr").join(" "), "--conf-acoes": larguraAcoes };

  return (
    // Abrindo em modal, a seta de "expande embaixo" mentiria: some, e a
    // coluna dela também (conf-lista--modal zera a largura).
    <div className={`conf-lista${onAbrir ? " conf-lista--modal" : ""}`} style={grade}>
      {/* O cabeçalho tem a mesma forma da linha (colunas + ações), para os
          rótulos caírem exatamente em cima das células. */}
      {/* Só fica oculto para leitor de tela quando não tem botão de ordenar:
          aí os rótulos são decoração, e cada célula já diz o seu. */}
      <div className="conf-lista__cab" aria-hidden={onOrdenar ? undefined : "true"}>
        <div className="conf-lista__cols">
          <span />
          {colunas.map((c) => {
            if (!onOrdenar || !c.ordem) return <span key={c.rotulo}>{c.rotulo}</span>;
            const ativa = ordenacao?.chave === c.ordem;
            const Seta = !ativa ? ArrowUpDown : ordenacao.direcao === "asc" ? ArrowUp : ArrowDown;
            return (
              <button
                key={c.rotulo}
                type="button"
                className={`conf-lista__ordem${ativa ? " conf-lista__ordem--ativa" : ""}`}
                aria-label={`Ordenar por ${c.rotulo}${ativa ? (ordenacao.direcao === "asc" ? ", crescente" : ", decrescente") : ""}`}
                onClick={() => onOrdenar(c.ordem)}
              >
                {c.rotulo}<Seta size={12} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <span className="conf-lista__acoes-cab">{rotuloAcoes}</span>
      </div>
      {carregando
        ? Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="conf-linha conf-linha--esqueleto">
              <Skeleton w="60%" h={12} />
            </div>
          ))
        : itens.map((item) => {
            const id = chave(item);
            const estaAberto = !onAbrir && aberto === id;
            const painel = `conf-detalhe-${id}`;
            return (
              <div key={id} {...propsDaLinha?.(item)} className={`conf-linha${estaAberto ? " conf-linha--aberta" : ""}`}>
                <button
                  type="button"
                  className="conf-linha__abrir"
                  aria-expanded={onAbrir ? undefined : estaAberto}
                  aria-controls={onAbrir ? undefined : painel}
                  aria-label={rotuloDaLinha?.(item)}
                  onClick={() => (onAbrir ? onAbrir(item) : onAlternar(estaAberto ? null : id))}
                >
                  <span className="conf-linha__seta" aria-hidden="true">
                    {onAbrir ? null : estaAberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  {celulas(item).map((conteudo, i) => (
                    <span key={colunas[i].rotulo} className="conf-celula" data-rotulo={colunas[i].rotulo}>
                      {conteudo}
                    </span>
                  ))}
                </button>
                <div className="conf-linha__acoes">{acoes(item)}</div>
                {estaAberto && (
                  <div id={painel} className="conf-detalhe" role="region" aria-label="Detalhes">
                    {detalhe(item)}
                  </div>
                )}
              </div>
            );
          })}
    </div>
  );
}
