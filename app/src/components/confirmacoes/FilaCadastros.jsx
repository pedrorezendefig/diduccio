import React, { useCallback, useState } from "react";
import { AlertTriangle, UserCheck } from "lucide-react";
import { supabase } from "../../api/supabase";
import { Button, EmptyState, useConfirm, useToast } from "../../ui";
import { dataHoraBR } from "../../lib/format";
import { apto, erroLegivel, esperaDesde, esperaLonga, telefoneLegivel } from "../../lib/confirmacoes";
import ListaQueAbre from "./ListaQueAbre";
import RecusarDialog from "./RecusarDialog";
import Dado from "./Dado";

const COLUNAS = [
  { rotulo: "Quem", largura: "minmax(0, 1.6fr)" },
  { rotulo: "Apto", largura: "minmax(0, .8fr)" },
  { rotulo: "Vínculo", largura: "minmax(0, 1fr)" },
  { rotulo: "Pediu há", largura: "minmax(0, .7fr)" },
];

const vinculoDe = (c) => (c.tipo === "Não Morador" ? `${c.vinculo} (não mora)` : c.vinculo);

/**
 * Cadastros do app esperando a administração (0065). A lista vem só com nome,
 * apartamento e vínculo; telefone, e-mail e o CPF mascarado chegam quando a
 * linha abre, por `detalhe_do_cadastro`.
 */
export default function FilaCadastros({ itens, carregando, onMudou }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [aberto, setAberto] = useState(null);
  const [detalhes, setDetalhes] = useState({});
  const [recusando, setRecusando] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const alternar = useCallback(async (id) => {
    setAberto(id);
    if (id == null || detalhes[id]?.dados) return;
    setDetalhes((d) => ({ ...d, [id]: { carregando: true } }));
    const { data, error } = await supabase.rpc("detalhe_do_cadastro", { p_id: id });
    setDetalhes((d) => ({ ...d, [id]: error ? { erro: erroLegivel(error) } : { dados: data } }));
  }, [detalhes]);

  const aprovar = async (c) => {
    const ok = await confirmar({
      title: `Aprovar o cadastro de ${c.nome}?`,
      description: `${apto(c.bloco, c.unidade)}, ${vinculoDe(c).toLowerCase()}. A pessoa recebe um e-mail e já pode entrar no app.`,
      confirmLabel: "Aprovar",
    });
    if (!ok) return;
    setSalvando(true);
    const { error } = await supabase.rpc("aprovar_cadastro", { p_id: c.id });
    setSalvando(false);
    if (error) { toast.error(erroLegivel(error)); return; }
    toast.success(`Cadastro de ${c.nome} aprovado`);
    setAberto(null);
    onMudou();
  };

  const recusar = async (motivo) => {
    const c = recusando;
    setSalvando(true);
    const { error } = await supabase.rpc("recusar_cadastro", { p_id: c.id, p_motivo: motivo });
    setSalvando(false);
    if (error) { toast.error(erroLegivel(error)); return; }
    setRecusando(null);
    toast.success(`Cadastro de ${c.nome} recusado`);
    setAberto(null);
    onMudou();
  };

  if (!carregando && itens.length === 0) {
    return (
      <EmptyState
        icon={<UserCheck size={20} />}
        title="Nenhum cadastro esperando"
        description="Quem se cadastra no app e confirma o e-mail aparece aqui para a administração aprovar."
      />
    );
  }

  return (
    <>
      <ListaQueAbre
        colunas={COLUNAS}
        itens={itens}
        carregando={carregando}
        chave={(c) => c.id}
        aberto={aberto}
        onAlternar={alternar}
        rotuloDaLinha={(c) => `${c.nome}, ${apto(c.bloco, c.unidade)}: ver detalhes`}
        celulas={(c) => [
          <strong key="n">{c.nome}</strong>,
          apto(c.bloco, c.unidade),
          vinculoDe(c),
          <span key="e" className={esperaLonga(c.pedido_em) ? "conf-espera conf-espera--longa" : "conf-espera"}>
            {esperaDesde(c.pedido_em)}
          </span>,
        ]}
        acoes={(c) => (
          <>
            <Button size="sm" variant="ghost" className="conf-recusar" disabled={salvando} onClick={() => setRecusando(c)}>Recusar</Button>
            <Button size="sm" variant="primary" disabled={salvando} onClick={() => aprovar(c)}>Aprovar</Button>
          </>
        )}
        detalhe={(c) => <DetalheDoCadastro cadastro={c} estado={detalhes[c.id]} />}
      />

      <RecusarDialog
        key={recusando?.id ?? "nenhum"}
        alvo={recusando}
        titulo={recusando ? `Recusar o cadastro de ${recusando.nome}` : ""}
        explicacao="O motivo aparece para a pessoa no app e vai por e-mail."
        salvando={salvando}
        onCancelar={() => setRecusando(null)}
        onRecusar={recusar}
      />
    </>
  );
}

function DetalheDoCadastro({ cadastro, estado }) {
  if (!estado || estado.carregando) return <p className="conf-detalhe__aviso">Carregando os detalhes…</p>;
  if (estado.erro) return <p className="conf-detalhe__aviso conf-detalhe__aviso--erro">{estado.erro}</p>;
  const d = estado.dados;

  return (
    <div className="conf-detalhe__grade">
      <dl className="conf-dados">
        <Dado rotulo="CPF" mono>{d.cpf || "Ainda não informado"}</Dado>
        <Dado rotulo="Telefone">{telefoneLegivel(d.telefone) || "Ainda não informado"}</Dado>
        <Dado rotulo="E-mail">{d.email}</Dado>
        <Dado rotulo="Avisos pelo WhatsApp">{d.aviso_whatsapp ? "Aceitou" : "Não aceitou"}</Dado>
        <Dado rotulo="Pediu em">{dataHoraBR(d.pedido_em, { comSegundos: false })}</Dado>
        <Dado rotulo="E-mail confirmado em">{d.email_confirmado_em ? dataHoraBR(d.email_confirmado_em, { comSegundos: false }) : "Não confirmado"}</Dado>
      </dl>
      <div className="conf-contexto">
        <div className="conf-bloco">
          <small>{apto(cadastro.bloco, cadastro.unidade)} no condomínio</small>
          {d.no_condominio.length
            ? d.no_condominio.map((m, i) => (
                <span key={i}>{m.nome}{m.vinculo ? ` · ${String(m.vinculo).toLowerCase()}` : ""}</span>
              ))
            : <span className="conf-bloco__vazio">Ninguém cadastrado</span>}
        </div>
        <div className="conf-bloco">
          <small>Já no app neste apto</small>
          {d.no_app.length
            ? d.no_app.map((m, i) => (
                <span key={i}>
                  {m.nome} · {String(m.vinculo).toLowerCase()}
                  {m.tipo === "Dependente" ? " · dependente" : ""}
                  {m.status === "pendente" ? " (em análise)" : ""}
                </span>
              ))
            : <span className="conf-bloco__vazio">Ninguém</span>}
        </div>
      </div>
      {d.no_condominio.length === 0 && (
        <p className="conf-alerta">
          <AlertTriangle size={16} aria-hidden="true" />
          O condomínio não tem morador cadastrado neste apartamento. Confira com a pessoa antes de aprovar.
        </p>
      )}
    </div>
  );
}

