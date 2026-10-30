import React from "react";
import { Package } from "lucide-react";
import { Card, PageHeader, EmptyState } from "../ui";

/**
 * Inventário de patrimônio.
 *
 * ATENÇÃO: esta tela nunca foi implementada.
 *
 * A versão anterior era uma maquete estática: nenhuma chamada ao backend,
 * nenhum estado, <tbody> vazio, e um componente TableRow declarado mas nunca
 * usado (que quebraria se fosse, porque referenciava um `Icon` inexistente).
 * Os números exibidos eram inventados: "R$ 1.240.500,00 em ativos",
 * "1.248 ativos totais", "+4,2% em relação ao mês anterior", e paginação
 * até a página 250.
 *
 * Repintar aquilo com a identidade ViT faria números fictícios parecerem
 * um relatório oficial do condomínio, que é pior do que uma tela feia.
 * Então a tela passa a declarar honestamente que o módulo não existe.
 *
 * Quando o módulo for construído, esta página vira o arquétipo Cadastro,
 * igual a Unidades: PageHeader, filtros, Table, modal de edição.
 */
export default function Patrimonio() {
  return (
    <div>
      <PageHeader
        title="Patrimônio"
        meta="Módulo ainda não implementado"
      />

      <Card padding="none">
        <EmptyState
          icon={<Package size={20} />}
          title="O inventário de patrimônio ainda não existe"
          description="Este módulo foi esboçado mas nunca chegou a ser construído: não há cadastro de ativos nem ligação com a planilha. Os números que apareciam aqui antes eram fictícios e foram removidos para não serem confundidos com dados reais do condomínio."
        />
      </Card>
    </div>
  );
}
