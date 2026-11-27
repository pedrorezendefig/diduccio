import React, { useState } from "react";
import { EyeOff, Mail, Paperclip, Plus, Reply, Send, X } from "lucide-react";
import { Button, Checkbox, Field, Input, Modal } from "../ui";
import {
  MAXIMO_DESTINATARIOS, MULTA, REMETENTE_MULTA, REMETENTE_NOTIFICACAO,
  RESPONDER_PARA, destinatariosIniciais, emailValido, emailsMarcados,
} from "../lib/notificacoes";

/**
 * A prévia do e-mail e a escolha de para quem vai, antes de o sistema enviar
 * (0077, função `enviar-notificacao`).
 *
 * O envio é automático, então a conferência que o rascunho do Gmail dava tem
 * que acontecer aqui: quem envia vê de qual endereço sai, para quem vai, o
 * assunto, os anexos e o texto, e marca ou desmarca cada destinatário.
 *
 * O morador sem e-mail no cadastro (ou o inquilino, que nem sempre tem conta)
 * entra digitado: o campo de acrescentar já vem aberto nesse caso. Com e-mail
 * cadastrado, ele aparece na lista e o campo fica atrás de uma caixa.
 */
export default function EnvioPorEmail({
  aberto, onClose, tipo, assunto, texto, anexos = [], emailDoMorador, enviando = false, onEnviar,
}) {
  // Cada abertura começa do cadastro: a página monta este componente só com o
  // modal aberto, com `key` do registro, então um e-mail acrescentado para um
  // envio nunca aparece marcado no envio de outra unidade.
  const temMorador = Boolean(String(emailDoMorador ?? "").trim());
  const [lista, setLista] = useState(() => destinatariosIniciais(tipo, emailDoMorador));
  const [acrescentar, setAcrescentar] = useState(!temMorador);
  const [novo, setNovo] = useState("");
  const [erroNovo, setErroNovo] = useState("");

  const marcados = emailsMarcados(lista);
  const multa = String(tipo).toUpperCase() === MULTA;
  const remetente = multa ? REMETENTE_MULTA : REMETENTE_NOTIFICACAO;

  const alternar = (email) =>
    setLista((l) => l.map((d) => (d.email === email ? { ...d, marcado: !d.marcado } : d)));
  const tirar = (email) => setLista((l) => l.filter((d) => d.email !== email));

  const adicionar = () => {
    const email = novo.trim().toLowerCase();
    if (!emailValido(email)) return setErroNovo("Escreva um e-mail completo, como nome@exemplo.com.");
    if (lista.some((d) => d.email === email)) return setErroNovo("Este e-mail já está na lista.");
    if (marcados.length >= MAXIMO_DESTINATARIOS) return setErroNovo(`São no máximo ${MAXIMO_DESTINATARIOS} destinatários por envio.`);
    setLista((l) => [...l, { email, rotulo: "Acrescentado", marcado: true, fixo: false, avulso: true }]);
    setNovo("");
    setErroNovo("");
  };

  return (
    <Modal
      open={aberto}
      onClose={enviando ? () => {} : onClose}
      title={multa ? "Enviar a multa por e-mail" : "Enviar a notificação por e-mail"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button
            variant="primary"
            iconLeft={<Send size={16} />}
            loading={enviando}
            disabled={!marcados.length}
            onClick={() => onEnviar(marcados)}
          >
            Enviar agora
          </Button>
        </>
      }
    >
      <div className="envio">
        <section className="envio__bloco" aria-label="Destinatários">
          <div className="envio__titulo"><Mail size={16} /> Para quem vai</div>
          <ul className="envio__lista">
            {lista.map((d) => (
              <li key={d.email} className="envio__item">
                <Checkbox
                  checked={d.marcado}
                  onChange={() => alternar(d.email)}
                  label={<span className="envio__quem"><strong>{d.rotulo}</strong><small>{d.email}</small></span>}
                />
                {d.avulso && (
                  <button type="button" className="envio__tirar" aria-label={`Tirar ${d.email}`} onClick={() => tirar(d.email)}>
                    <X size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {!temMorador && (
            <p className="envio__aviso">
              O morador desta notificação não tem e-mail cadastrado no app. Acrescente o e-mail
              dele (ou do inquilino) abaixo.
            </p>
          )}

          {temMorador && (
            <Checkbox
              checked={acrescentar}
              onChange={(e) => setAcrescentar(e.target.checked)}
              label="Acrescentar outro e-mail (inquilino, por exemplo)"
            />
          )}

          {acrescentar && (
            <div className="envio__novo">
              <Field label="E-mail" error={erroNovo}>
                <Input
                  type="email"
                  value={novo}
                  onChange={(e) => { setNovo(e.target.value); setErroNovo(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }}
                  placeholder="nome@exemplo.com"
                />
              </Field>
              <Button variant="secondary" iconLeft={<Plus size={16} />} onClick={adicionar}>Adicionar</Button>
            </div>
          )}

          <div className="envio__fixos">
            <span><EyeOff size={14} /> Vai também uma cópia oculta para o arquivo do condomínio. O morador não vê.</span>
            <span><Reply size={14} /> Respostas vão para {RESPONDER_PARA.join(" e ")}.</span>
          </div>
        </section>

        <section className="envio__bloco" aria-label="Prévia do e-mail">
          <div className="envio__titulo">Prévia</div>
          <dl className="envio__cabecalho">
            <dt>De</dt><dd>Condomínio Diduccio &lt;{remetente}&gt;</dd>
            <dt>Para</dt><dd>{marcados.length ? marcados.join(", ") : <em>ninguém marcado</em>}</dd>
            <dt>Assunto</dt><dd>{assunto}</dd>
            <dt>Anexos</dt>
            <dd>
              {anexos.length ? (
                <span className="envio__anexos">
                  {anexos.map((a) => <span key={a} className="envio__anexo"><Paperclip size={12} />{a}</span>)}
                </span>
              ) : <em>nenhum</em>}
            </dd>
          </dl>
          <div className="envio__corpo">{texto}</div>
        </section>
      </div>
    </Modal>
  );
}
