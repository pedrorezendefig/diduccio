import React from "react";

/**
 * Superfície de conteúdo.
 *
 * Regra do design system: card NÃO tem sombra, só borda. Sombra é reservada
 * para elevação real (dropdown, modal, popover). Se você precisa de sombra
 * num card, provavelmente precisa de um Modal.
 */
export default function Card({
  padding = "md",
  as: Tag = "div",
  className = "",
  children,
  ...props
}) {
  const classes = ["vit-card", `vit-card--${padding}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} {...props}>
      {children}
    </Tag>
  );
}
