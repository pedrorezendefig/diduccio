import React, { useEffect, useState } from "react";
import { MODO_DEMO } from "../api/config";
import { chamarEdgeFunction } from "../api/edge";
import { supabase } from "../api/supabase";
import { nomeProprio } from "../lib/format";

const quando = (iso) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/**
 * Os envios por e-mail (0077) de uma notificação, com a prova de que chegou.
 *
 * O e-mail sai pelo Resend e não pela caixa da Hostinger, então não aparece em
 * "Enviados" do adm@. A situação de cada envio vem do próprio Resend
 * (`enviar-notificacao` com acao "status"): entregue, devolvido, aberto...
 * Cada destinatário fica numa linha: endereço longo quebra em vez de sumir.
 */
/**
 * A situação de cada envio, perguntada ao Resend. Usada pela lista de envios e
 * pela linha "E-mail" da ficha, com uma consulta só.
 * `null` enquanto confere; `{}` se a consulta falhou.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSituacoesDosEnvios(id, envios, celula) {
  const [situacoes, setSituacoes] = useState(null);
  const chave = envios.map((e) => celula(e, "id")).join(",");

  useEffect(() => {
    if (MODO_DEMO || !envios.length) return undefined;
    let vivo = true;
    setSituacoes(null);
    chamarEdgeFunction("enviar-notificacao", { acao: "status", id_notificacao: Number(id) })
      .then((r) => vivo && setSituacoes(r.ok ? r.corpo?.situacoes ?? {} : {}))
      .catch(() => vivo && setSituacoes({}));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, chave]);

  return situacoes;
}

/** A situação que o Resend devolveu, só quando ele respondeu de fato. */
const situacaoConhecida = (situacoes, envio, celula) => {
  const s = situacoes?.[celula(envio, "id")];
  return s && s.evento ? s : null;
};

/**
 * O status do e-mail na ficha, embaixo de "Emitida em", pelo envio mais
 * recente. O envio só é gravado depois que o Resend aceitou, então "Enviado"
 * vale mesmo sem a consulta; a entrega (ou a falha) entra quando ele responde.
 */
export function StatusDoEmail({ envios, situacoes, celula }) {
  if (!envios.length) return <span className="notif-status notif-status--neutro">Não enviado</span>;
  const ultimo = envios[0];
  const s = MODO_DEMO ? null : situacaoConhecida(situacoes, ultimo, celula);
  const falhou = s?.tom === "erro";
  return (
    <span className="notif-status-linha">
      <span className={`notif-status notif-status--${falhou ? "erro" : "ok"}`}>{falhou ? "Com falha" : "Enviado"}</span>
      <span className="notif-status-linha__detalhe">
        {/* A entrega ("Entregue", "aberto") fica só na caixa do envio, embaixo;
            aqui, a data. Só a falha troca a data pelo motivo. */}
        {falhou ? s.texto : `em ${quando(celula(ultimo, "enviado_em"))}`}
      </span>
    </span>
  );
}

/**
 * A linha "Leitura" da ficha, embaixo de "E-mail": se alguém abriu. Junta o
 * que existe: o e-mail aberto (evento "opened" do Resend, pelo envio mais
 * recente; o Resend não diz qual destinatário abriu) e o titular que abriu no
 * app (0099, com nome e hora). Consulta de novo cada vez que o registro abre.
 */
export function StatusDaLeitura({ id, envios, situacoes, celula }) {
  // Guardado junto do id: ao trocar de registro, o do anterior não aparece.
  const [lido, setLido] = useState({ id: null, d: null });
  const app = lido.id === id ? lido.d : null;

  useEffect(() => {
    if (MODO_DEMO || id == null) return undefined;
    let vivo = true;
    supabase
      .rpc("vistas_da_notificacao", { p_id: id })
      .then(({ data, error }) => vivo && setLido({ id, d: error ? {} : data ?? {} }))
      .catch(() => vivo && setLido({ id, d: {} }));
    return () => {
      vivo = false;
    };
  }, [id, envios.length]);

  const s = envios.length && !MODO_DEMO ? situacaoConhecida(situacoes, envios[0], celula) : null;
  const abriuEmail = ["opened", "clicked"].includes(String(s?.evento ?? ""));
  const vistas = app?.vistas ?? [];
  const primeira = vistas.length
    ? vistas.reduce((a, b) => (String(a.vista_em) <= String(b.vista_em) ? a : b))
    : null;

  if (!abriuEmail && !primeira && app === null && !MODO_DEMO) {
    return <span className="notif-status-linha__detalhe">Conferindo…</span>;
  }
  if (!abriuEmail && !primeira) {
    return <span className="notif-status notif-status--neutro">Ainda não lida</span>;
  }
  return (
    <span className="notif-leitura">
      {abriuEmail && (
        <span className="notif-status-linha">
          <span className="notif-status notif-status--ok">Lida</span>
          <span className="notif-status-linha__detalhe">e-mail aberto</span>
        </span>
      )}
      {primeira && (
        <span className="notif-status-linha">
          {!abriuEmail && <span className="notif-status notif-status--ok">Lida</span>}
          <span className="notif-status-linha__detalhe">
            no app por {nomeProprio(primeira.nome || "titular")} em {quando(primeira.vista_em)}
            {vistas.length > 1 ? ` (+${vistas.length - 1})` : ""}
          </span>
        </span>
      )}
    </span>
  );
}

export default function EnviosDaNotificacao({ envios, situacoes, celula }) {
  return (
    <section className="notif-envios">
      <h4 className="notif-envios__titulo">
        Envios por e-mail{envios.length > 1 ? <span>{envios.length}</span> : null}
      </h4>
      {envios.length ? (
        <ol className="notif-envios__lista">
          {envios.map((e) => {
            const s = MODO_DEMO ? null : situacaoConhecida(situacoes, e, celula);
            const para = celula(e, "destinatarios") || [];
            return (
              <li key={celula(e, "id")} className="notif-envio">
                <div className="notif-envio__topo">
                  <div>
                    <strong>{quando(celula(e, "enviado_em"))}</strong>
                    <span>por {celula(e, "enviado_por")}</span>
                  </div>
                  {s && <span className={`notif-status notif-status--${s.tom === "erro" ? "erro" : s.tom === "ok" ? "ok" : "neutro"}`}>{s.texto}</span>}
                </div>
                <div className="notif-envio__para">
                  <span>Para</span>
                  <ul>{para.map((d) => <li key={d}>{d}</li>)}</ul>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="notif-envios__vazio">Ainda não foi enviado por e-mail.</p>
      )}
      {envios.length > 0 && (
        <p className="notif-envios__nota">
          Não aparece em "Enviados" do adm@: o sistema envia direto. A cópia fica na caixa de entrada do adm@.
        </p>
      )}
    </section>
  );
}
