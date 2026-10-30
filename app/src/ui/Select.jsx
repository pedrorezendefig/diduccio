import React from "react";

/** Caixa de seleção. A seta é desenhada em CSS, sem depender de asset. */
const Select = React.forwardRef(function Select(
  { invalid = false, className = "", children, ...props },
  ref
) {
  const classes = ["vit-select", className].filter(Boolean).join(" ");
  return (
    <select
      ref={ref}
      className={classes}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      {...props}
    >
      {children}
    </select>
  );
});

export default Select;
