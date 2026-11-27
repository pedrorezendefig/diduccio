import React from "react";

/**
 * Caixa de marcação com rótulo clicável.
 *
 * O rótulo vem por prop e não por Field, porque em checkbox o texto fica ao
 * lado do controle e precisa estar dentro do mesmo <label> para a área de
 * clique cobrir os dois.
 *
 * O <input> de verdade continua aqui (teclado, leitor de tela, formulário),
 * só invisível: o que se vê é a caixa desenhada ao lado dele, um quadrado com
 * borda que ganha o check verde ao marcar. A caixa nativa muda de cara em cada
 * navegador e não segue o tema.
 */
const Checkbox = React.forwardRef(function Checkbox(
  { label, className = "", ...props },
  ref
) {
  const classes = ["vit-check", className].filter(Boolean).join(" ");
  return (
    <label className={classes}>
      <input ref={ref} type="checkbox" className="vit-check__campo" {...props} />
      <span className="vit-check__caixa" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label && <span className="vit-check__rotulo">{label}</span>}
    </label>
  );
});

export default Checkbox;
