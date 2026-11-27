import React, { useState } from "react";
import { PackageCheck } from "lucide-react";
import { supabase } from "../../api/supabase";
import { Button, EmptyState, useConfirm, useToast } from "../../ui";
import { apto, erroLegivel, esperaLonga, EVENTO_PENDENCIAS, perguntaDeFinalizar, prontoHa } from "../../lib/confirmacoes";

/**
 * Pendentes: o que está pronto e espera o morador buscar na portaria ou na
 * administração (a TAG que chegou, o cartão da piscina pronto...). Quando ele
 * busca, a administração conclui aqui: a TAG vira "colada" e a solicitação,
 * "concluída" (o morador é avisado). Os itens vêm de `prontosParaRetirar`.
 */
export default function FilaPendentes({ itens, carregando, onMudou }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [salvando, setSalvando] = useState(null);

  const concluir = async (item) => {
    const onde = [apto(item.bloco, item.unidade), item.quem].filter(Boolean).join(", ");
    const ok = await confirmar(item.tipo === "tag"
      ? {
          title: "A TAG foi colada?",
          description: `${item.detalhe} · ${onde}. Confirme só depois que o morador passou na portaria e a TAG foi colada.`,
          confirmLabel: "Sim, foi colada",
          cancelLabel: "Voltar",
        }
      : perguntaDeFinalizar(item.titulo, onde));
    if (!ok) return;
    setSalvando(item.chave);
    const { error } = item.tipo === "tag"
      ? await supabase.rpc("marcar_tag", { p_veiculo_id: item.id, p_situacao: "colada" })
      : await supabase.rpc("mudar_situacao_da_solicitacao", { p_id: item.id, p_status: "concluida", p_motivo: null });
    setSalvando(null);
    if (error) { toast.error(erroLegivel(error)); return; }
    toast.success(item.feito);
    window.dispatchEvent(new Event(EVENTO_PENDENCIAS));
    onMudou?.();
  };

  if (carregando) return <p className="conf-pend__vazio">Carregando…</p>;
  if (!itens.length) {
    return (
      <EmptyState
        icon={<PackageCheck size={28} aria-hidden="true" />}
        title="Nada esperando o morador buscar"
        description="Quando uma TAG chegar na portaria ou uma solicitação ficar pronta (o cartão da piscina, por exemplo), ela aparece aqui até ser concluída."
      />
    );
  }

  return (
    <section className="conf-tags conf-pend" aria-labelledby="conf-pend-titulo">
      <h3 id="conf-pend-titulo"><PackageCheck size={16} aria-hidden="true" />Prontos, esperando o morador buscar</h3>
      <p>Quando o morador buscar, conclua aqui. Ele recebe o aviso no app.</p>
      <ul>
        {itens.map((item) => (
          <li key={item.chave}>
            <span className="conf-duas">
              <b>{item.titulo}</b>
              <small>{[apto(item.bloco, item.unidade), item.quem, item.detalhe].filter(Boolean).join(" · ")}</small>
            </span>
            <span className={esperaLonga(item.desde) ? "conf-espera conf-espera--longa" : "conf-espera"}>
              {prontoHa(item.desde)}
            </span>
            <span className="conf-tags__acoes">
              <Button size="sm" variant="primary" disabled={salvando === item.chave} onClick={() => concluir(item)}>
                {item.acao}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
