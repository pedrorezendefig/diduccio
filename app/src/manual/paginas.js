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
  {
    id: "painel",
    tela: "Dashboard",
    area: "Administração",
    rota: "/dashboard",
    titulo: "Painel",
    resumo: "Os números do condomínio, os relatórios das reservas e a agenda do dia, na primeira tela depois de entrar.",
    tarefas: [
      {
        id: "ler",
        titulo: "Ler o painel",
        passos: [
          {
            titulo: "Relatórios, agenda e números",
            texto: "O painel abre logo depois de entrar. Em “Relatórios”, escolha o gráfico (“Receita”, “Reservas” ou “Status”) e o ano. Ao lado, “Hoje e amanhã” lista os compromissos dos próximos dois dias e “Abrir agenda completa” leva à agenda inteira. Embaixo ficam o recebido no ano com festas e churrasqueira, as Reservas ativas, as Encomendas aguardando na portaria e os carros registrados. O Conselheiro vê o recebido e os relatórios da receita; o número que o Cargo não pode ver aparece com um traço e a nota “fora do seu acesso”.",
            print: { arquivo: "painel/inicio.png", cargo: "Sindico" },
          },
        ],
      },
    ],
  },
  {
    id: "comunicado",
    tela: "Comunicado",
    area: "Administração",
    rota: "/comunicado",
    titulo: "Comunicado",
    resumo: "Escrever o Comunicado aos Moradores, com ajuda da IA, e mandar em PDF ou imagem pelo WhatsApp.",
    tarefas: [
      {
        id: "escrever",
        titulo: "Escrever o Comunicado",
        passos: [
          {
            titulo: "Gerar o texto com IA",
            texto: "Em “O que você quer comunicar?”, escreva o assunto, escolha o “Tom de Voz” (Formal, Amigável ou Urgente) e toque em “Gerar Comunicado”. O título e o texto aparecem na folha ao lado. Clique em qualquer parte da folha para corrigir; a barra de cima muda fonte, cor, alinhamento e listas. Também dá para escrever direto na folha, sem a IA.",
            print: { arquivo: "comunicado/escrever.png" },
          },
        ],
      },
      {
        id: "exportar",
        titulo: "Exportar e mandar no WhatsApp",
        passos: [
          {
            titulo: "Escolher como sai",
            texto: "Toque em “Exportar”. O Comunicado sai sempre em folha A4: “Baixar PDF” para imprimir ou anexar no e-mail, “Baixar JPEG” para uma imagem só e “Imprimir” para a impressora. Para o WhatsApp, toque em “Compartilhar”: no celular ele abre o WhatsApp com a imagem; no computador a imagem é baixada e você anexa na conversa. O Comunicado não fica guardado no sistema, então exporte antes de sair da tela.",
            print: { arquivo: "comunicado/exportar.png", acoes: [{ clicar: "Exportar" }] },
          },
        ],
      },
    ],
  },
  {
    id: "tarefas",
    tela: "Tarefas",
    area: "Administração",
    rota: "/tarefas",
    titulo: "Tarefas",
    resumo: "O quadro da administração: criar a Tarefa, escolher o responsável e mover entre as colunas até concluir.",
    tarefas: [
      {
        id: "quadro",
        titulo: "Acompanhar o quadro",
        passos: [
          {
            titulo: "Ler as colunas",
            texto: "Cada Tarefa fica numa coluna: A fazer, Em andamento, Aguardando e Concluído. “Todas” e “Minhas” filtram pelo responsável, e “Buscar tarefa” acha pelo título. O Auxiliar Administrativo vê só as Tarefas dele.",
            print: { arquivo: "tarefas/quadro.png" },
          },
          {
            titulo: "Mover uma Tarefa",
            texto: "Arraste o cartão para outra coluna ou toque em “Mover” no cartão e escolha a coluna nova.",
            print: { arquivo: "tarefas/mover.png", acoes: [{ clicar: "Mover" }] },
          },
        ],
      },
      {
        id: "criar",
        titulo: "Criar uma Tarefa",
        passos: [
          {
            titulo: "Preencher e salvar",
            texto: "Toque em “Nova tarefa”. Preencha o título, o responsável e, se quiser, a descrição, o prazo e a Unidade ligada. Escolha a situação e toque em “Salvar”. Para abrir uma Tarefa já criada, toque no cartão dela.",
            print: { arquivo: "tarefas/nova.png", acoes: [{ clicar: "Nova tarefa" }] },
          },
        ],
      },
      {
        id: "bloco",
        titulo: "Anotar no Bloco de notas",
        passos: [
          {
            titulo: "Anotar e passar para o quadro",
            texto: "Toque em “Bloco de notas” e escreva uma ideia por linha; o bloco salva sozinho. Em “Passar para o quadro”, toque em “Virar tarefa” ao lado de uma linha, ou no botão de baixo para virar todas de uma vez.",
            print: { arquivo: "tarefas/bloco.png", acoes: [{ clicar: "Bloco de notas" }] },
          },
        ],
      },
    ],
  },
  {
    id: "assembleia",
    tela: "Assembleia",
    area: "Administração",
    rota: "/assembleia",
    titulo: "Assembleia",
    resumo: "Enviar a ata em PDF, revisar o resumo feito pela IA e perguntar no chat sobre o que já foi decidido.",
    tarefas: [
      {
        id: "enviar",
        titulo: "Enviar a ata",
        passos: [
          {
            titulo: "Gerar o resumo",
            texto: "Arraste o PDF da ata para o quadro tracejado, ou clique nele para escolher o arquivo (só PDF, até 15 MB). Toque em “Gerar resumo com IA”. Aparece o rascunho com título, data, resumo geral, decisões e assinantes: corrija o que precisar e toque em “Salvar ata”, ou em “Descartar” para começar de novo. Só o Síndico, o Auxiliar Administrativo e o Desenvolvedor enviam atas.",
            print: { arquivo: "assembleia/enviar.png" },
          },
        ],
      },
      {
        id: "historico",
        titulo: "Ler o resumo de uma Assembleia",
        passos: [
          {
            titulo: "Abrir no histórico",
            texto: "Em “Histórico de assembleias”, toque na seta da Assembleia para ver o resumo geral, as decisões e quem assinou a ata.",
            print: { arquivo: "assembleia/historico.png", acoes: [{ clicar: "Expandir" }] },
          },
        ],
      },
      {
        id: "chat",
        titulo: "Perguntar sobre as atas",
        passos: [
          {
            titulo: "Abrir o chat",
            texto: "Toque no botão redondo no canto da tela para abrir o Assistente das Atas. Escreva a pergunta, por exemplo “o que foi decidido sobre a fachada?”, e envie. A resposta diz de qual Assembleia veio a informação.",
            print: { arquivo: "assembleia/chat.png", acoes: [{ clicar: "Perguntar sobre as atas" }] },
          },
        ],
      },
    ],
  },
  {
    id: "usuarios",
    tela: "Usuarios",
    area: "Administração",
    rota: "/usuarios",
    titulo: "Usuários",
    resumo: "Criar o Usuário de quem trabalha no condomínio, escolher o Cargo e gerar uma senha temporária.",
    tarefas: [
      {
        id: "criar",
        titulo: "Criar um Usuário",
        passos: [
          {
            titulo: "Cadastrar",
            texto: "Só o Desenvolvedor abre esta tela. Toque em “Novo usuário”. Preencha o nome, o e-mail e, se tiver, o CPF. Escolha o Cargo. A senha inicial é opcional: em branco, o sistema gera uma senha temporária. Toque em “Cadastrar”.",
            print: { arquivo: "usuarios/novo.png", acoes: [{ clicar: "Novo usuário" }] },
          },
        ],
      },
      {
        id: "editar",
        titulo: "Mudar o Cargo ou a senha",
        passos: [
          {
            titulo: "Editar na lista",
            texto: "Na lista, toque no lápis da linha do Usuário. Abre o mesmo cadastro, com o nome, o Cargo e a senha para mudar; o e-mail não muda. Para uma senha nova sem digitar, toque na chave da linha. A senha temporária aparece uma vez só, então copie e repasse na hora.",
            print: { arquivo: "usuarios/novo.png", acoes: [{ clicar: "Novo usuário" }] },
          },
        ],
      },
    ],
  },
];

/** A pasta dos prints, dentro de public/. É também o caminho no navegador. */
export const PASTA_DOS_PRINTS = "manual";

/** O endereço do print no app, a partir do `arquivo` declarado no passo. */
export const enderecoDoPrint = (arquivo) => `/${PASTA_DOS_PRINTS}/${arquivo}`;

/** As páginas do Manual que o Cargo vê, na ordem do conteúdo. */
export const paginasDoCargo = (cargo) => PAGINAS.filter((p) => podeVerTela(cargo, p.tela));
