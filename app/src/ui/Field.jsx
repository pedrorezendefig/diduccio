import React, { useId } from "react";

/**
 * Invólucro de campo de formulário.
 *
 * Faz a ligação de acessibilidade que quase sempre falta: `htmlFor` no rótulo,
 * `aria-describedby` apontando para ajuda e erro, e `aria-invalid` no controle.
 * O filho recebe essas props por clonagem, então basta escrever:
 *
 *   <Field label="CPF" help="Só números" error={erros.cpf}>
 *     <Input value={cpf} onChange={...} />
 *   </Field>
 *
 * Regras: rótulo sempre acima, erro sempre abaixo, placeholder nunca é rótulo.
 */
export default function Field({
  label,
  help,
  error,
  required = false,
  id,
  className = "",
  children,
  ...props
}) {
  const auto = useId();
  const campoId = id ?? `campo-${auto}`;
  const ajudaId = help ? `${campoId}-ajuda` : undefined;
  const erroId = error ? `${campoId}-erro` : undefined;
  const describedBy = [ajudaId, erroId].filter(Boolean).join(" ") || undefined;

  const filho = React.isValidElement(children)
    ? React.cloneElement(children, {
        id: children.props.id ?? campoId,
        "aria-describedby": children.props["aria-describedby"] ?? describedBy,
        "aria-invalid": error ? true : children.props["aria-invalid"],
        required: children.props.required ?? required,
      })
    : children;

  const classes = ["vit-field", className].filter(Boolean).join(" ");

  return (
    <div className={classes} {...props}>
      {label && (
        <label className="vit-field__label" htmlFor={campoId}>
          {label}
          {required && (
            <span className="vit-field__required" aria-hidden="true">*</span>
          )}
        </label>
      )}
      {filho}
      {help && !error && (
        <span className="vit-field__help" id={ajudaId}>{help}</span>
      )}
      {error && (
        <span className="vit-field__error" id={erroId}>{error}</span>
      )}
    </div>
  );
}
