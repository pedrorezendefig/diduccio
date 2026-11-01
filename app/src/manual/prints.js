// prints.js
import { PAGINAS, PASTA_DOS_PRINTS } from "./paginas";
import { TELAS_DO_MENU } from "../auth/menu";
import { TABELAS, SENHA_DEMO } from "../demo/dados";

// O que o script de prints do Manual (scripts/prints-manual.mjs) fotografa.
// Fica fora do script para o teste conferir o plano sem abrir navegador.

export { PASTA_DOS_PRINTS };

// O login de exemplo que fotografa o passo: o do Cargo que o print pede
// (`print.cargo`) ou, sem pedido, o do primeiro Cargo da lista do menu para
// aquela tela, que é quem mais usa a tela (Encomendas: Porteiro).
const loginDoPrint = (tela, cargoPedido) => {
  const cargos = TELAS_DO_MENU[tela] ?? [];
  if (cargoPedido && !cargos.includes(cargoPedido)) {
    throw new Error(`O Cargo ${cargoPedido} não vê a tela ${tela}`);
  }
  const cargo = cargoPedido ?? cargos[0];
  const usuario = TABELAS.usuarios.find((u) => u.cargo === cargo);
  if (!usuario) throw new Error(`Nenhum login de exemplo vê a tela ${tela}`);
  return { email: usuario.email, senha: SENHA_DEMO };
};

/** Um item por passo com print, na ordem do conteúdo. */
export const planoDosPrints = (paginas = PAGINAS) =>
  paginas.flatMap((pagina) =>
    pagina.tarefas.flatMap((tarefa) =>
      tarefa.passos
        .filter((passo) => passo.print)
        .map((passo) => ({
          arquivo: passo.print.arquivo,
          rota: pagina.rota,
          ...loginDoPrint(pagina.tela, passo.print.cargo),
          acoes: passo.print.acoes ?? [],
        }))
    )
  );

/**
 * Para antes de abrir o navegador se o app não vai subir em modo demo: print
 * do Manual nunca mostra dado de morador de verdade (ADR 0003). `env` é o
 * ambiente que o Vite resolveu para o app.
 */
export const exigeModoDemo = (env) => {
  if (env.VITE_DEMO !== "true") {
    throw new Error(
      "Os prints do Manual só saem do modo demo (VITE_DEMO=true). Rode `npm run manual:prints` sem mudar o VITE_DEMO."
    );
  }
};
