import { useEffect, useState } from "react";
import { supabase } from "../api/supabase";
import { EVENTO_PENDENCIAS } from "./confirmacoes";

/** Quem vê a página Confirmações (o mesmo do menu e do `eh_administrativo`). */
const CARGOS = ["Sindico", "Auxiliar Administrativo", "Desenvolvedor"];

/**
 * O número ao lado de "Confirmações" no menu: cadastros, reservas e pedidos
 * de veículo do app esperando a administração (0065, 0066). Busca ao trocar de tela, quando a página
 * avisa que algo mudou e a cada 5 minutos. Falhou, fica o último número.
 */
export function usePendencias(usuario, tela) {
  const [total, setTotal] = useState(0);
  const pode = CARGOS.includes(usuario?.cargo);

  useEffect(() => {
    if (!pode) return undefined;
    let vivo = true;
    const buscar = async () => {
      try {
        const { data, error } = await supabase.rpc("pendencias_da_administracao");
        if (vivo && !error && data) setTotal(Number(data.cadastros ?? 0) + Number(data.reservas ?? 0) + Number(data.veiculos ?? 0) + Number(data.solicitacoes ?? 0));
      } catch {
        // Sem rede: o menu só não atualiza agora.
      }
    };
    buscar();
    window.addEventListener(EVENTO_PENDENCIAS, buscar);
    const relogio = setInterval(buscar, 5 * 60_000);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_PENDENCIAS, buscar);
      clearInterval(relogio);
    };
  }, [pode, tela]);

  return pode ? total : 0;
}
