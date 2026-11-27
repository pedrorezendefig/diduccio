import React, { useEffect, useState } from "react";
import { supabase } from "../api/supabase";
import { nomeProprio } from "../lib/format";

const VINCULO = { "Proprietário": "proprietário", "Locatário": "inquilino" };

const quando = (iso) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/**
 * A notificação no app do morador (0099): desde quando está lá, se foi
 * corrigida depois, e quais titulares abriram e quando. Fica no detalhe da
 * notificação, junto dos envios por e-mail. Quem decide o que o morador vê é
 * o banco; aqui é só o registro.
 *
 * `versao` muda quando sai um envio novo ou entra um anexo: o e-mail e o
 * comprovante assinado são o que emite a notificação, e o bloco acompanha.
 */
export default function VistaNoApp({ id, versao = 0 }) {
  const [estado, setEstado] = useState({ fase: "carregando", d: null });

  useEffect(() => {
    let vivo = true;
    supabase
      .rpc("vistas_da_notificacao", { p_id: id })
      .then(({ data, error }) => vivo && setEstado(error ? { fase: "erro", d: null } : { fase: "pronto", d: data }))
      .catch(() => vivo && setEstado({ fase: "erro", d: null }));
    return () => {
      vivo = false;
    };
  }, [id, versao]);

  if (estado.fase === "carregando") return null;
  const d = estado.d;

  return (
    <div className="notif-historico">
      <strong>No app do morador</strong>
      {estado.fase === "erro" && <p className="notif-historico__texto">Não foi possível ver agora se está no app.</p>}
      {estado.fase === "pronto" && !d?.emitida_em && (
        <p className="notif-historico__texto">
          Ainda não está no app. Aparece para os titulares do apartamento quando for enviada por e-mail ou quando o comprovante assinado for anexado.
        </p>
      )}
      {estado.fase === "pronto" && d?.emitida_em && (
        <>
          <p className="notif-historico__texto">
            No app desde {quando(d.emitida_em)}
            {d.corrigida_em ? `. Corrigida em ${quando(d.corrigida_em)}; o morador vê a versão atual, com essa data.` : "."}
          </p>
          {d.vistas?.length ? (
            <ol>
              {d.vistas.map((v, i) => (
                <li key={i}>
                  Vista por {nomeProprio(v.nome || "titular")}
                  {VINCULO[v.vinculo] ? ` (${VINCULO[v.vinculo]})` : ""} em {quando(v.vista_em)}
                </li>
              ))}
            </ol>
          ) : (
            <p className="notif-historico__texto">Nenhum titular abriu ainda.</p>
          )}
        </>
      )}
    </div>
  );
}
