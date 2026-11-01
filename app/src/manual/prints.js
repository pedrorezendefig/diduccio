// prints.js
import { PAGINAS } from "./paginas";
import { TELAS_DO_MENU } from "../auth/menu";
import { TABELAS, SENHA_DEMO } from "../demo/dados";

// O que o script de prints do Manual (scripts/prints-manual.mjs) fotografa.
// Fica fora do script para o teste conferir o plano sem abrir navegador.

/** A pasta dos prints, dentro de public/. É também o caminho no navegador. */
export const PASTA_DOS_PRINTS = "manual";

/** O endereço do print no app, a partir do `arquivo` declarado no passo. */
export const enderecoDoPrint = (arquivo) => `/${PASTA_DOS_PRINTS}/${arquivo}`;

// O login de exemplo que fotografa a página: o do primeiro Cargo da lista do
// menu para aquela tela, que é quem mais usa a tela (Encomendas: Porteiro).
const loginDaTela = (tela) => {
  const cargo = (TELAS_DO_MENU[tela] ?? [])[0];
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
          ...loginDaTela(pagina.tela),
          acoes: passo.print.acoes ?? [],
        }))
    )
  );
