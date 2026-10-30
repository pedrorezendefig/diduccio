import React from "react";
import Skeleton from "./Skeleton";

/**
 * Tabela do ViT.
 *
 * columns: [{ key, label, align, width, sortable, render, tipo }]
 *   align: "left" (padrão) | "right"
 *   tipo:  "num" alinha à direita em monoespaçada tabular
 *          "id"  monoespaçada em verde, para código de unidade e protocolo
 *   render(linha, indice) devolve o conteúdo da célula.
 *
 * Regras que este componente garante:
 *   - cabeçalho fixo no scroll, sem zebra, só hairline entre linhas;
 *   - número sempre à direita, em mono, com tabular-nums;
 *   - célula sem valor recebe "-", nunca fica em branco;
 *   - ações de linha aparecem no hover mas seguem acessíveis por teclado;
 *   - abaixo de 768px vira lista de cards, nunca scroll horizontal.
 */
export default function Table({
  columns,
  rows,
  sort,
  onSort,
  loading = false,
  empty,
  rowActions,
  /**
   * Atributos extras para o <tr> de cada linha: `rowProps(linha, indice)`.
   *
   * Existe para quem precisa ENCONTRAR uma linha depois de renderizada — dar
   * um `id` para rolar até ela, marcar a que está em foco. Sem isto, quem
   * quisesse destacar uma linha teria que envolver o conteúdo de toda célula
   * num <span> com classe, e a marcação pararia na borda de cada coluna em vez
   * de cobrir a linha.
   */
  rowProps,
  getRowKey,
  maxHeight,
  responsiva = true,
  className = "",
  ...props
}) {
  const temAcoes = typeof rowActions === "function";

  const classeCelula = (col) => {
    if (col.tipo === "num") return "vit-table__num";
    if (col.tipo === "id") return "vit-table__id";
    return col.align === "right" ? "vit-table__num" : undefined;
  };

  /**
   * O cabeçalho precisa acompanhar o alinhamento da coluna.
   *
   * Só a célula recebia `vit-table__num`, então numa coluna de número o valor
   * ia para a direita e o rótulo ficava na esquerda — os dois pendurados em
   * pontas opostas da mesma coluna. Em "Entrada" e "Saída" na tela de Entregas
   * a distância passava de 50px e parecia que o horário estava embaixo da
   * coluna errada.
   *
   * Classe própria, e não a da célula: `vit-table__num` também troca a fonte
   * por monoespaçada, o que no cabeçalho brigaria com o caixa-alta espaçado.
   * Aqui só o alinhamento interessa.
   */
  const classeCabecalho = (col) =>
    col.tipo === "num" || col.align === "right" ? "vit-table__th-num" : undefined;

  const conteudo = (col, linha, i) => {
    const bruto = col.render ? col.render(linha, i) : linha[col.key];
    const vazio =
      bruto === null || bruto === undefined || bruto === "" ||
      (typeof bruto === "string" && bruto.trim() === "");
    if (vazio) return <span className="vit-table__vazio">-</span>;
    return bruto;
  };

  const aoOrdenar = (col) => {
    if (!col.sortable || !onSort) return;
    const mesma = sort?.key === col.key;
    onSort({ key: col.key, dir: mesma && sort.dir === "asc" ? "desc" : "asc" });
  };

  const marca = (col) => {
    if (!col.sortable) return null;
    const ativa = sort?.key === col.key;
    if (!ativa) return <span className="vit-table__sortmark" aria-hidden="true">↕</span>;
    return (
      <span className="vit-table__sortmark" aria-hidden="true">
        {sort.dir === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const classesWrap = [
    "vit-tablewrap",
    responsiva ? "vit-tablewrap--responsiva" : null,
    className,
  ].filter(Boolean).join(" ");

  // O vazio e o carregando saem FORA do <table>, para não criar linha falsa.
  if (!loading && (!rows || rows.length === 0) && empty) {
    return <div className="vit-tablewrap">{empty}</div>;
  }

  return (
    <div
      className={classesWrap}
      style={maxHeight ? { "--vit-table-max": maxHeight } : undefined}
      {...props}
    >
      <table className="vit-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={classeCabecalho(col)}
                style={col.width ? { width: col.width } : undefined}
                aria-sort={
                  sort?.key === col.key
                    ? sort.dir === "asc" ? "ascending" : "descending"
                    : col.sortable ? "none" : undefined
                }
              >
                {col.sortable && onSort ? (
                  <button
                    type="button"
                    className="vit-table__sort"
                    onClick={() => aoOrdenar(col)}
                  >
                    {col.label}
                    {marca(col)}
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
            {temAcoes && <th aria-label="Ações" />}
          </tr>
        </thead>
        <tbody>
          {loading
            ? // Esqueleto na forma da tabela final, não spinner no centro.
              Array.from({ length: 5 }, (_, i) => (
                <tr key={`skel-${i}`}>
                  {columns.map((col) => (
                    <td key={col.key} data-rotulo={col.label}>
                      <Skeleton w={col.tipo === "num" ? 56 : "70%"} h={11} />
                    </td>
                  ))}
                  {temAcoes && <td />}
                </tr>
              ))
            : rows.map((linha, i) => (
                <tr
                  key={getRowKey ? getRowKey(linha, i) : i}
                  {...(rowProps ? rowProps(linha, i) : null)}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={classeCelula(col)}
                      data-rotulo={col.label}
                    >
                      {conteudo(col, linha, i)}
                    </td>
                  ))}
                  {temAcoes && (
                    <td data-rotulo="Ações">
                      <div className="vit-table__acoes">{rowActions(linha, i)}</div>
                    </td>
                  )}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
