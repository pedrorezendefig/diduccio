import React from "react";

/** Um par rótulo/valor do detalhe aberto. `mono` para o CPF mascarado. */
export default function Dado({ rotulo, mono, children }) {
  return (
    <div className="conf-dado">
      <dt>{rotulo}</dt>
      <dd className={mono ? "conf-dado__mono" : undefined}>{children}</dd>
    </div>
  );
}
