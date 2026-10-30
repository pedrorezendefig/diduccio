import React from "react";

/**
 * Cabeçalho de página.
 *
 * `meta` é a linha de contexto com os números que importam, por exemplo
 * "128 unidades · 117 ocupadas · 9 inadimplentes". Ela existe para o usuário
 * saber o estado da tela sem precisar ler a tabela.
 *
 * `titleProps` vai para o <h1>: a página que precisa levar o foco ao título
 * (quando o botão que tinha o foco fica desligado) passa `ref` e `tabIndex`.
 */
export default function PageHeader({
  title,
  meta,
  actions,
  titleProps,
  className = "",
  ...props
}) {
  const classes = ["vit-pagehead", className].filter(Boolean).join(" ");

  return (
    <header className={classes} {...props}>
      <div style={{ minWidth: 0 }}>
        <h1 className="vit-pagehead__title" {...titleProps}>{title}</h1>
        {meta && <p className="vit-pagehead__meta">{meta}</p>}
      </div>
      {actions && <div className="vit-pagehead__actions">{actions}</div>}
    </header>
  );
}
