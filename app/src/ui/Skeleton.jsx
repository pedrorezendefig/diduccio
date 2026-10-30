import React from "react";

/**
 * Placeholder de carregamento.
 *
 * Regra: o esqueleto imita a FORMA do conteúdo final. Não usar spinner
 * centralizado, que não diz nada sobre o que está vindo. Compor vários
 * Skeleton para desenhar a linha de tabela, o card ou o formulário que
 * vai aparecer.
 */
export default function Skeleton({
  w = "100%",
  h = 12,
  radius,
  count = 1,
  gap = 8,
  className = "",
  style,
  ...props
}) {
  const classes = ["vit-skel", className].filter(Boolean).join(" ");

  const um = (i) => (
    <span
      key={i}
      className={classes}
      aria-hidden="true"
      style={{
        width: w,
        height: h,
        borderRadius: radius ?? "var(--radius-sm)",
        ...style,
      }}
      {...props}
    />
  );

  if (count === 1) return um(0);

  return (
    <span style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: count }, (_, i) => um(i))}
    </span>
  );
}
