import React from "react";

/**
 * Rótulo de estado.
 *
 * tone: neutral (estado sem carga), muted (informação fraca),
 *       positive (em dia, aprovado, realizado), brand (destaque ativo),
 *       danger (inadimplente, atrasado, cancelado).
 *
 * `danger` é o único uso legítimo do terracota. Não usar para decorar.
 */
export default function Badge({
  tone = "neutral",
  className = "",
  children,
  ...props
}) {
  const classes = ["vit-badge", `vit-badge--${tone}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
}
