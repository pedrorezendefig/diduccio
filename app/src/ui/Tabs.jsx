import React from "react";

/**
 * Abas.
 *
 * items: [{ value, label, count }]
 * `count` aparece como pastilha monoespaçada ao lado do rótulo, útil para
 * fila de portaria ("Encomendas 14") sem precisar abrir a aba.
 */
export default function Tabs({ items, value, onChange, className = "", ...props }) {
  const classes = ["vit-tabs", className].filter(Boolean).join(" ");

  return (
    <div className={classes} role="tablist" {...props}>
      {items.map((item) => {
        const ativa = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={ativa}
            className="vit-tab"
            onClick={() => onChange?.(item.value)}
          >
            {item.label}
            {item.count !== undefined && item.count !== null && (
              <span className="vit-tab__count">{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
