import React from "react";

/**
 * Botão do ViT.
 *
 * variant: primary (ação principal), secondary (ação alternativa),
 *          ghost (ação terciária, sem peso visual), danger (destrutiva).
 * size:    md (padrão), sm (dentro de tabela e barra de filtro).
 *
 * Estados de hover, active, focus-visible e disabled vivem em ui.css.
 * Nunca reimplementar hover com onMouseEnter.
 */
const Button = React.forwardRef(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    disabled = false,
    iconLeft,
    iconRight,
    type = "button",
    className = "",
    children,
    ...props
  },
  ref
) {
  const classes = [
    "vit-btn",
    `vit-btn--${variant}`,
    `vit-btn--${size}`,
    className,
  ].filter(Boolean).join(" ");

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span className="vit-btn__spinner" aria-hidden="true" />
      ) : (
        iconLeft
      )}
      {children}
      {!loading && iconRight}
    </button>
  );
});

export default Button;
