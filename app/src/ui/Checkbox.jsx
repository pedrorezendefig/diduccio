import React from "react";

/**
 * Caixa de marcação com rótulo clicável.
 *
 * O rótulo vem por prop e não por Field, porque em checkbox o texto fica ao
 * lado do controle e precisa estar dentro do mesmo <label> para a área de
 * clique cobrir os dois.
 */
const Checkbox = React.forwardRef(function Checkbox(
  { label, className = "", ...props },
  ref
) {
  const classes = ["vit-check", className].filter(Boolean).join(" ");
  return (
    <label className={classes}>
      <input ref={ref} type="checkbox" {...props} />
      {label && <span>{label}</span>}
    </label>
  );
});

export default Checkbox;
