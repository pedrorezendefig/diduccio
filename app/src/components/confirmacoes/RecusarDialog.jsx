import React, { useState } from "react";
import { Button, Field, Modal, Textarea } from "../../ui";

/**
 * Recusar sempre pede o motivo: ele vai para o morador (no app e, no caso do
 * cadastro, por e-mail). O banco confere de novo (3 a 500 caracteres).
 *
 * Quem usa passa `key` com o id do alvo: cada recusa começa com o campo vazio.
 */
export default function RecusarDialog({ alvo, titulo, explicacao, onCancelar, onRecusar, salvando }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");

  const enviar = () => {
    const texto = motivo.trim();
    if (texto.length < 3) { setErro("Escreva o motivo. Ele vai para o morador."); return; }
    if (texto.length > 500) { setErro("Até 500 caracteres."); return; }
    onRecusar(texto);
  };

  return (
    <Modal
      open={Boolean(alvo)}
      onClose={onCancelar}
      title={titulo}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button variant="danger" onClick={enviar} loading={salvando}>Recusar</Button>
        </>
      }
    >
      {explicacao && <p className="vit-modal__desc app-export__texto">{explicacao}</p>}
      <Field label="Motivo da recusa" required error={erro} help={`${motivo.trim().length}/500`}>
        <Textarea
          value={motivo}
          autoFocus
          rows={4}
          maxLength={500}
          placeholder="Ex.: o nome não confere com o cadastro do apartamento."
          onChange={(e) => setMotivo(e.target.value)}
        />
      </Field>
    </Modal>
  );
}
