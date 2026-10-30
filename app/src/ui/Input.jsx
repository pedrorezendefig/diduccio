import React from "react";

/** Campo de texto. O rótulo é responsabilidade do Field, nunca do placeholder. */
const Input = React.forwardRef(function Input(
  { invalid = false, className = "", ...props },
  ref
) {
  const classes = ["vit-input", className].filter(Boolean).join(" ");
  return (
    <input
      ref={ref}
      className={classes}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      {...props}
    />
  );
});

export default Input;
