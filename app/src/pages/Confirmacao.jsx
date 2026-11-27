import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Car, CheckCheck, History, Megaphone, MessageCircle, MessageSquare, PackageCheck, UserRound } from "lucide-react";
import { supabase } from "../api/supabase";
import { PageHeader, Tabs, useToast } from "../ui";
import { erroLegivel, EVENTO_PENDENCIAS, prontosParaRetirar, solicitacaoEsperando, soRegistra } from "../lib/confirmacoes";
import { useAtualizar } from "../lib/useAtualizar";
import FilaCadastros from "../components/confirmacoes/FilaCadastros";
import FilaReservas from "../components/confirmacoes/FilaReservas";
import FilaSolicitacoes from "../components/confirmacoes/FilaSolicitacoes";
import FilaVeiculos from "../components/confirmacoes/FilaVeiculos";
import FilaWhatsapp from "../components/confirmacoes/FilaWhatsapp";
import FilaPendentes from "../components/confirmacoes/FilaPendentes";
import SolicitacoesFinalizadas from "../components/confirmacoes/SolicitacoesFinalizadas";
import HistoricoDeSolicitacoes from "../components/confirmacoes/HistoricoDeSolicitacoes";

// Moradores no app, veículos cadastrados e histórico moravam aqui também;
// foram para a tela APP, que é o que já passou pela aprovação.
// Pendentes: pronto, esperando o morador buscar. Concluídas: o que já fechou
// (pedido do usuário, 12/11/2026).
// Reclamações e sugestões (0110): registradas, com a conversa e o "Mandar para Tarefas".
const FILAS = ["cadastros", "reservas", "veiculos", "solicitacoes", "reclamacoes", "pendentes", "concluidas", "historico", "whatsapp"];

const buscarFilas = () => Promise.all([
  supabase.rpc("cadastros_para_aprovar"),
  supabase.rpc("reservas_para_aprovar"),
  supabase.rpc("pedidos_veiculo_para_aprovar"),
  supabase.rpc("tags_a_entregar"),
  supabase.rpc("solicitacoes_para_responder"),
]);

/**
 * Confirmações: tudo o que espera um "sim" da administração, uma aba por fila
 * (0065). Cadastros do app e reservas do app vêm de funções do banco que só a
 * administração chama; o WhatsApp é a confirmação de números de sempre.
 */
export default function Confirmacao({ user }) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [cadastros, setCadastros] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [veiculos, setVeiculos] = useState([]);
  const [tags, setTags] = useState([]);
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [whats, setWhats] = useState({ aFazer: null, meta: "" });

  // A busca devolve os dados; quem guarda no estado é o `then`, depois da
  // resposta (nada de setState no corpo do efeito).
  const aplicar = useCallback(([c, r, v, t, so]) => {
    const erro = c.error ?? r.error ?? v.error ?? t.error ?? so.error;
    if (erro) toast.error(erroLegivel(erro));
    setCadastros(Array.isArray(c.data) ? c.data : []);
    setReservas(Array.isArray(r.data) ? r.data : []);
    setVeiculos(Array.isArray(v.data) ? v.data : []);
    setTags(Array.isArray(t.data) ? t.data : []);
    setSolicitacoes(Array.isArray(so.data) ? so.data : []);
    setCarregando(false);
    window.dispatchEvent(new Event(EVENTO_PENDENCIAS));
  }, [toast]);
  const carregar = useCallback(() => buscarFilas().then(aplicar), [aplicar]);

  useEffect(() => { buscarFilas().then(aplicar); }, [aplicar]);
  // Sozinha: pedido novo ou mensagem do morador aparecem sem recarregar a página.
  useAtualizar(carregar, 15000);

  // Sem aba na URL, abre a primeira fila que tem alguém esperando.
  const pedida = params.get("fila");
  // Pedido de veículo esperando o morador pagar não conta: não é com a administração.
  const veiculosEsperando = veiculos.filter((p) => p.status !== "pagar").length;
  // Solicitação conta enquanto espera decisão ou quando o morador escreveu e
  // ninguém leu (0107).
  // Reclamação, sugestão e erro ficam na aba deles (0110); a de Solicitações
  // é só do que pede decisão.
  const pedidos = solicitacoes.filter((s) => !soRegistra(s.tipo));
  const registros = solicitacoes.filter((s) => soRegistra(s.tipo));
  const solicitacoesEsperando = pedidos.filter(solicitacaoEsperando).length;
  const registrosEsperando = registros.filter(solicitacaoEsperando).length;
  // Pronto e esperando o morador buscar: não entra no "esperando a
  // administração" (quem tem de agir agora é o morador).
  const pendentes = prontosParaRetirar({ tags, solicitacoes });
  const padrao = cadastros.length ? "cadastros" : reservas.length ? "reservas" : veiculosEsperando ? "veiculos"
    : solicitacoesEsperando ? "solicitacoes" : registrosEsperando ? "reclamacoes" : carregando ? "cadastros" : "whatsapp";
  const ativa = FILAS.includes(pedida) ? pedida : padrao;
  const trocar = (fila) => setParams({ fila }, { replace: true });

  const esperando = cadastros.length + reservas.length + veiculosEsperando + solicitacoesEsperando + registrosEsperando;
  const meta = carregando
    ? "Carregando"
    : esperando
      ? `${esperando} ${esperando === 1 ? "pedido esperando" : "pedidos esperando"} a administração`
      : "Nada esperando a administração";

  return (
    <div className="conf">
      <PageHeader title="Confirmações" meta={meta} />

      <Tabs
        className="conf-abas"
        value={ativa}
        onChange={trocar}
        items={[
          { value: "cadastros", label: <><UserRound size={16} aria-hidden="true" />Cadastros do app</>, count: carregando ? null : cadastros.length },
          { value: "reservas", label: <><CalendarDays size={16} aria-hidden="true" />Reservas</>, count: carregando ? null : reservas.length },
          { value: "veiculos", label: <><Car size={16} aria-hidden="true" />TAG e veículos</>, count: carregando ? null : veiculosEsperando },
          { value: "solicitacoes", label: <><MessageSquare size={16} aria-hidden="true" />Solicitações</>, count: carregando ? null : solicitacoesEsperando },
          { value: "reclamacoes", label: <><Megaphone size={16} aria-hidden="true" />Reclamações e sugestões</>, count: carregando ? null : registros.length },
          { value: "pendentes", label: <><PackageCheck size={16} aria-hidden="true" />Pendentes</>, count: carregando ? null : pendentes.length },
          { value: "concluidas", label: <><CheckCheck size={16} aria-hidden="true" />Concluídas</> },
          { value: "historico", label: <><History size={16} aria-hidden="true" />Histórico</> },
          { value: "whatsapp", label: <><MessageCircle size={16} aria-hidden="true" />WhatsApp</>, count: whats.aFazer },
        ]}
      />

      {ativa === "cadastros" && <FilaCadastros itens={cadastros} carregando={carregando} onMudou={carregar} />}
      {ativa === "reservas" && <FilaReservas itens={reservas} carregando={carregando} onMudou={carregar} />}
      {ativa === "veiculos" && <FilaVeiculos itens={veiculos} tags={tags} carregando={carregando} onMudou={carregar} />}
      {ativa === "solicitacoes" && <FilaSolicitacoes itens={pedidos} carregando={carregando} onMudou={carregar} />}
      {ativa === "reclamacoes" && <FilaSolicitacoes key="registros" registros itens={registros} carregando={carregando} onMudou={carregar} />}
      {ativa === "pendentes" && <FilaPendentes itens={pendentes} carregando={carregando} onMudou={carregar} />}
      {ativa === "concluidas" && <SolicitacoesFinalizadas />}
      {ativa === "historico" && <HistoricoDeSolicitacoes />}
      {/* Fica montada mesmo escondida: é ela que conta os pendentes da aba. */}
      <div hidden={ativa !== "whatsapp"}>
        <FilaWhatsapp user={user} onResumo={setWhats} />
      </div>
    </div>
  );
}
