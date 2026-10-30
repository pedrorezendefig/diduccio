import React from "react";

/**
 * Estado vazio.
 *
 * Regra: vazio sempre diz O QUE FAZER A SEGUIR. "Nenhum registro encontrado"
 * sozinho é um beco sem saída. Passar sempre `description` e, quando houver
 * ação possível, `action`.
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
  ...props
}) {
  const classes = ["vit-empty", className].filter(Boolean).join(" ");

  return (
    <div className={classes} {...props}>
      {icon && (
        <div className="vit-empty__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="vit-empty__title">{title}</p>
      {description && <p className="vit-empty__desc">{description}</p>}
      {action}
    </div>
  );
}
