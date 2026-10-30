import React from "react";

/**
 * Indicador numérico.
 *
 * Sem card em volta: uma barra vertical colorida à esquerda basta para agrupar.
 * O valor sai em monoespaçada com tabular-nums, então uma faixa de indicadores
 * não muda de largura quando os números atualizam.
 *
 * tone: brand (padrão), danger (inadimplência, atraso), neutral.
 */
export default function Stat({
  label,
  value,
  tone = "brand",
  hint,
  className = "",
  ...props
}) {
  const classes = ["vit-stat", `vit-stat--${tone}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...props}>
      <div className="vit-stat__label">{label}</div>
      <div className="vit-stat__value">{value}</div>
      {hint && <div className="vit-stat__hint">{hint}</div>}
    </div>
  );
}
