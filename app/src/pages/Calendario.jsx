import React from "react";
import { CalendarDays } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Card, PageHeader, EmptyState } from "../ui";

/**
 * Calendário de reservas.
 *
 * ATENÇÃO: esta tela nunca foi implementada.
 *
 * A versão anterior era uma maquete: o título dizia "Unidades" em vez de
 * "Calendário", não havia nenhuma chamada ao backend, nenhuma lista era
 * renderizada, e os quatro botões (Excel, PDF, Nova Unidade e Redefinir)
 * faziam console.log. Era a barra de filtros do cadastro de Unidades copiada,
 * filtrando uma lista que não existe.
 *
 * Como no Patrimônio, aplicar a identidade ViT numa maquete faria uma tela
 * morta parecer funcional. Então ela declara honestamente o que é, e aponta
 * para onde as reservas realmente estão hoje.
 *
 * Quando o calendário for construído, esta página vira a visão de agenda das
 * reservas de salão, churrasqueira, piscina e mudanças.
 */
export default function Calendario() {
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader title="Calendário" meta="Módulo ainda não implementado" />

      <Card padding="none">
        <EmptyState
          icon={<CalendarDays size={20} />}
          title="A visão de calendário ainda não existe"
          description="Este módulo foi esboçado mas nunca chegou a ser construído: não há ligação com a planilha nem lista de reservas. Enquanto isso, as reservas confirmadas aparecem no painel, e cada tipo tem sua própria tela."
          action={
            <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", justifyContent: "center" }}>
              <Button onClick={() => navigate("/festas")}>Salão de festas</Button>
              <Button onClick={() => navigate("/churrasqueira")}>Churrasqueira</Button>
              <Button onClick={() => navigate("/mudancas")}>Mudanças</Button>
            </div>
          }
        />
      </Card>
    </div>
  );
}
