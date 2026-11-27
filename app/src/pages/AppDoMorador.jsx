import React from "react";
import { useSearchParams } from "react-router-dom";
import { Archive, Car, MessageSquareText, Tag, Users } from "lucide-react";
import { PageHeader, Tabs } from "../ui";
import MoradoresNoApp from "../components/confirmacoes/MoradoresNoApp";
import CadastroDeVeiculos from "../components/confirmacoes/CadastroDeVeiculos";
import SolicitacoesFinalizadas from "../components/confirmacoes/SolicitacoesFinalizadas";

const ABAS = ["moradores", "veiculos", "historico", "tags", "solicitacoes"];
// Quem corrige o cadastro do app e os veículos: a administração e o síndico (o
// banco confere de novo pelo `eh_administrativo`, 0070 e 0081).
const EDITA_CADASTRO = ["Sindico", "Auxiliar Administrativo", "Desenvolvedor"];

/**
 * APP: o que já está no app do morador, para consultar e corrigir. As filas do
 * que espera um "sim" ficam em Confirmações; aqui fica o que já passou por lá:
 * quem está no app, os veículos ativos e os do histórico, as TAGs e as
 * solicitações que fecharam. Mesmo desenho de Confirmações, aba na URL.
 */
export default function AppDoMorador({ user }) {
  const [params, setParams] = useSearchParams();
  const pedida = params.get("aba");
  const ativa = ABAS.includes(pedida) ? pedida : "moradores";
  const trocar = (aba) => setParams({ aba }, { replace: true });
  const podeEditar = EDITA_CADASTRO.includes(user?.cargo);

  return (
    <div className="conf">
      <PageHeader title="App do morador"meta="Moradores, veículos, TAGs e solicitações do app do morador" />

      <Tabs
        className="conf-abas"
        value={ativa}
        onChange={trocar}
        items={[
          { value: "moradores", label: <><Users size={16} aria-hidden="true" />Moradores no app</> },
          { value: "veiculos", label: <><Car size={16} aria-hidden="true" />Veículos cadastrados</> },
          { value: "historico", label: <><Archive size={16} aria-hidden="true" />Histórico</> },
          { value: "tags", label: <><Tag size={16} aria-hidden="true" />TAGs cadastradas</> },
          { value: "solicitacoes", label: <><MessageSquareText size={16} aria-hidden="true" />Solicitações finalizadas</> },
        ]}
      />

      {ativa === "moradores" && <MoradoresNoApp podeEditar={podeEditar} />}
      {/* `key` diferente: trocar de aba remonta e busca de novo, sem lista velha. */}
      {ativa === "veiculos" && <CadastroDeVeiculos key="veiculos" arquivados={false} podeEditar={podeEditar} />}
      {ativa === "historico" && <CadastroDeVeiculos key="historico" arquivados podeEditar={podeEditar} />}
      {ativa === "tags" && <CadastroDeVeiculos key="tags" arquivados={false} soComTag podeEditar={podeEditar} />}
      {ativa === "solicitacoes" && <SolicitacoesFinalizadas />}
    </div>
  );
}
