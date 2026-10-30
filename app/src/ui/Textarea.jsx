import React from "react";

/** Área de texto. Redimensionável só na vertical, para não quebrar o layout. */
const Textarea = React.forwardRef(function Textarea(
  { invalid = false, className = "", ...props },
  ref
) {
  const classes = ["vit-textarea", className].filter(Boolean).join(" ");
  return (
    <textarea
      ref={ref}
      className={classes}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      {...props}
    />
  );
});

export default Textarea;
