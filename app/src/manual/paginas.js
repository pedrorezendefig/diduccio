// paginas.js
import { podeVerTela } from "../auth/menu";

// O conteúdo do Manual: uma página por tela do app.
//
// `tela` é a chave da tela no menu (src/auth/menu.js). É ela que decide quem
// vê a página: o Cargo vê a página se, e só se, vê a tela no menu. `area`
// agrupa as páginas na página inicial do Manual.
//
// Para escrever uma página nova, siga o glossário do CONTEXT.md e cite os
// botões com o rótulo exato da tela, entre aspas.
//
// `rota` é o endereço da tela no app. Um passo pode ter `print`: `arquivo` é o
// caminho do PNG dentro de public/manual/ e `acoes` são os cliques que o script
// de prints (`npm run manual:prints`) faz na tela antes de fotografar, em
// ordem. `{ clicar: "Rótulo" }` clica no primeiro botão com esse rótulo.
export const PAGINAS = [
  {
    id: "encomendas",
    tela: "Encomendas",
    area: "Portaria",
    rota: "/encomendas",
    titulo: "Encomendas",
    resumo: "Registrar a Encomenda que chegou, mandar o Aviso ao morador e registrar a Retirada.",
    tarefas: [
      {
        id: "registrar",
        titulo: "Registrar uma Encomenda",
        passos: [
          {
            titulo: "Abrir o cadastro",
            texto: "Toque em “Novo recebimento” e escolha a unidade. A busca aceita 5206, 206 ou “bloco 5”.",
            print: {
              arquivo: "encomendas/novo-recebimento.png",
              acoes: [{ clicar: "Novo recebimento" }],
            },
          },
          {
            titulo: "Conferir o destinatário",
            texto: "Se a unidade tem mais de um morador, escolha quem vai receber. Nome e telefone vêm preenchidos quando o telefone do Titular foi confirmado.",
          },
          {
            titulo: "Preencher os volumes",
            texto: "Informe quantos volumes chegaram, de 1 a 10. Em cada volume, digite o nº fiscal e tire a foto da etiqueta. A transportadora é opcional.",
          },
          {
            titulo: "Registrar a entrada",
            texto: "Toque em “Registrar entrada”. A Encomenda ganha um Número da encomenda, com 4 dígitos e 1 letra.",
          },
          {
            titulo: "Unidade sem telefone",
            texto: "Quando a unidade não tem telefone confirmado, o sistema mostra o Número da encomenda. Escreva esse número na própria encomenda, porque é por ele que o pacote é achado na prateleira, e toque em “Anotei”.",
          },
        ],
      },
      {
        id: "aviso",
        titulo: "Mandar o Aviso",
        passos: [
          {
            titulo: "Logo depois de registrar",
            texto: "Se a unidade tem telefone, o sistema pergunta se você quer enviar a notificação por WhatsApp. Toque em “Sim, enviar WhatsApp”.",
          },
          {
            titulo: "Enviar a mensagem",
            texto: "O WhatsApp abre com a mensagem pronta, com o Número da encomenda e o Código de retirada. Envie para o morador.",
          },
          {
            titulo: "Mandar de novo",
            texto: "Para repetir o Aviso, toque em “Ver detalhes” na Encomenda e depois em “Reenviar Notificação”.",
            print: {
              arquivo: "encomendas/detalhes.png",
              acoes: [{ clicar: "Ver detalhes" }],
            },
          },
          {
            titulo: "Encomenda sem código",
            texto: "Encomenda registrada sem telefone não tem Código de retirada, e por isso o Aviso por WhatsApp não sai.",
          },
        ],
      },
      {
        id: "retirada",
        titulo: "Registrar a Retirada",
        passos: [
          {
            titulo: "Abrir a Encomenda",
            texto: "Na lista, toque em “Ver detalhes” e depois em “Confirmar Entrega”.",
            print: {
              arquivo: "encomendas/retirada.png",
              acoes: [{ clicar: "Ver detalhes" }, { clicar: "Confirmar Entrega" }],
            },
          },
          {
            titulo: "Conferir o Código de retirada",
            texto: "Se o Aviso foi enviado, digite o código que a pessoa mostrar. Ele é obrigatório, e o sistema confere se é desta Encomenda. Sem Aviso enviado, o campo fica fechado e a Retirada segue só pela identificação.",
          },
          {
            titulo: "Identificar quem retira",
            texto: "Preencha o nome e o CPF de quem está retirando. Pode ser outra pessoa que não o morador.",
          },
          {
            titulo: "Conferir os volumes",
            texto: "Todos os volumes vêm marcados. Desmarque o que não sai agora: ele continua aguardando retirada.",
          },
          {
            titulo: "Assinar e concluir",
            texto: "Peça a assinatura na tela e toque em “Concluir retirada”. A Retirada fica guardada e não pode ser alterada nem apagada.",
          },
        ],
      },
    ],
  },
];

/** As páginas do Manual que o Cargo vê, na ordem do conteúdo. */
export const paginasDoCargo = (cargo) => PAGINAS.filter((p) => podeVerTela(cargo, p.tela));
