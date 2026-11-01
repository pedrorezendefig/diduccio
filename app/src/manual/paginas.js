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
// ordem. `{ clicar: "Rótulo" }` clica no primeiro botão com esse rótulo;
// com `papel: "tab"`, `"radio"` ou `"checkbox"`, clica na aba, na opção ou na
// caixa. `{ preencher: "Rótulo", com: "texto" }` digita no campo,
// `{ selecionar: "Rótulo", opcao: "Opção" }` escolhe na lista,
// `{ rolar: "Texto" }` rola a tela até o texto e
// `{ rolarAte: "Texto" }` rola a tela até o primeiro texto igual a esse.
// `cargo` (opcional) escolhe o login de exemplo que fotografa; sem ele, vale o
// primeiro Cargo da tela no menu.
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
  {
    id: "moradores",
    tela: "Moradores",
    area: "Moradores",
    rota: "/moradores",
    titulo: "Moradores",
    resumo: "Cadastrar o Morador na Unidade, com Vínculo e Tipo de morador, e corrigir o cadastro quando algo muda.",
    tarefas: [
      {
        id: "cadastrar",
        titulo: "Cadastrar um Morador",
        passos: [
          {
            titulo: "Conferir se já existe",
            texto: "Antes de cadastrar, busque pelo nome ou pelo CPF. Os filtros de bloco, Vínculo, Tipo de morador e status ajudam a achar quem já está na lista.",
            print: { arquivo: "moradores/lista.png", acoes: [] },
          },
          {
            titulo: "Preencher o cadastro",
            texto: "Toque em “Novo morador”. Nome completo e Unidade são obrigatórios; o CPF é opcional, mas não pode repetir. Em Vínculo, escolha Proprietário ou Locatário. Em Tipo de morador, escolha Titular, Dependente ou Não Morador: o Titular é quem confirma o telefone e responde pela Unidade. Toque em “Cadastrar”.",
            print: { arquivo: "moradores/novo-morador.png", acoes: [{ clicar: "Novo morador" }] },
          },
        ],
      },
      {
        id: "corrigir",
        titulo: "Consultar e corrigir um cadastro",
        passos: [
          {
            titulo: "Abrir o cadastro",
            texto: "Toque no olho na linha do Morador. O painel mostra a Unidade, o Tipo de morador, o Vínculo e os documentos. Com telefone cadastrado, aparecem os botões “Ligar” e “WhatsApp”.",
            print: { arquivo: "moradores/detalhe.png", acoes: [{ clicar: "Ver Aline Furtado" }] },
          },
          {
            titulo: "Editar o cadastro",
            texto: "Toque em “Editar” no painel, ou no lápis da linha, mude o que precisa e toque em “Salvar”. Quando o Morador deixa a Unidade, preencha a “Data de saída” e mude o status para Inativo. Excluir um cadastro é só com o Síndico.",
            print: { arquivo: "moradores/editar.png", acoes: [{ clicar: "Editar Aline Furtado" }] },
          },
        ],
      },
    ],
  },
  {
    id: "unidades",
    tela: "Unidades",
    area: "Moradores",
    rota: "/unidades",
    titulo: "Unidades",
    resumo: "Cadastrar a Unidade e manter em dia a ocupação e a adimplência.",
    tarefas: [
      {
        id: "cadastrar",
        titulo: "Cadastrar uma Unidade",
        passos: [
          {
            titulo: "Conferir a lista",
            texto: "O alto da tela mostra quantas Unidades estão ocupadas e quantas estão inadimplentes, com o total em aberto. Busque por bloco ou número e use os filtros de ocupação e situação.",
            print: { arquivo: "unidades/lista.png", acoes: [] },
          },
          {
            titulo: "Preencher o cadastro",
            texto: "Toque em “Nova unidade”, informe o bloco e o número e escolha a ocupação (Vazia ou Ocupada) e a situação (Adimplente ou Inadimplente). Toque em “Cadastrar”.",
            print: { arquivo: "unidades/nova-unidade.png", acoes: [{ clicar: "Nova unidade" }] },
          },
        ],
      },
      {
        id: "atualizar",
        titulo: "Atualizar a ocupação e a adimplência",
        passos: [
          {
            titulo: "Editar a Unidade",
            texto: "Toque no lápis na linha da Unidade. Bloco e número não mudam depois do cadastro. Ao escolher Inadimplente, aparece o campo “Valor em aberto”: use vírgula para os centavos. Toque em “Salvar”.",
            print: { arquivo: "unidades/editar.png", acoes: [{ clicar: "Editar unidade 1-101" }] },
          },
        ],
      },
      {
        id: "exportar",
        titulo: "Exportar a lista",
        passos: [
          {
            titulo: "Escolher as colunas",
            texto: "Toque em “Exportar” e escolha “Excel” ou “PDF”. No PDF, saem só as colunas marcadas.",
            print: { arquivo: "unidades/exportar.png", acoes: [{ clicar: "Exportar" }] },
          },
        ],
      },
    ],
  },
  {
    id: "confirmacao",
    tela: "Confirmação",
    area: "Moradores",
    rota: "/confirmacao",
    titulo: "Confirmação",
    resumo: "Confirmar por WhatsApp o telefone do Titular que vai receber os Avisos das Encomendas.",
    tarefas: [
      {
        id: "confirmar",
        titulo: "Confirmar o telefone do Titular",
        passos: [
          {
            titulo: "Enviar a mensagem",
            texto: "A tela lista os Titulares com telefone, separados nas abas “Sem envio”, “Aguardando”, “Confirmados” e “Sem resposta”. Na linha do Titular, toque no ícone de mensagem: o WhatsApp abre com a mensagem pronta e a linha passa para Aguardando.",
            print: { arquivo: "confirmacao/lista.png", acoes: [] },
          },
          {
            titulo: "Registrar a resposta",
            texto: "Quando o Titular responder, toque no ícone de confirmado. Se ele não responder, marque como sem resposta. Para mandar de novo, use o ícone de reenviar: a linha volta para Aguardando.",
            print: { arquivo: "confirmacao/confirmado.png", acoes: [{ clicar: "como confirmado" }] },
          },
        ],
      },
      {
        id: "numero",
        titulo: "Trocar o número",
        passos: [
          {
            titulo: "Alterar o número",
            texto: "Toque no ícone de telefone na linha, digite o número novo com DDD e toque em “Salvar e enviar”. O número muda também no cadastro do Morador, e o WhatsApp abre com a mensagem de Confirmação.",
            print: { arquivo: "confirmacao/alterar-numero.png", acoes: [{ clicar: "Alterar número de" }] },
          },
        ],
      },
    ],
  },
  {
    id: "festas",
    tela: "Festas",
    area: "Reservas",
    rota: "/festas",
    titulo: "Salão de festas",
    resumo: "Registrar a Reserva do salão de festas, com taxa e convidados, e gerar o contrato com o termo de responsabilidade.",
    tarefas: [
      {
        id: "reservar",
        titulo: "Reservar o salão de festas",
        passos: [
          {
            titulo: "Abrir a Reserva",
            texto: "Toque em “Nova reserva” e escolha a Unidade. Marque “Morador Cadastrado?” para escolher o Morador da Unidade e trazer nome, CPF e telefone. Se quem reserva não está cadastrado, preencha o responsável à mão.",
            print: { arquivo: "festas/nova-reserva.png", acoes: [{ clicar: "Nova reserva" }] },
          },
          {
            titulo: "Data, taxa e convidados",
            texto: "Informe a data, o telefone, a taxa e quantos convidados vêm. Unidade, responsável, CPF, telefone, data e taxa são obrigatórios. Em “Pago?”, diga se a taxa já entrou. Anexe o comprovante em “Adicionar arquivos” e toque em “Salvar Mudanças”. Se a data já tem Reserva com status Agendado, o sistema não deixa salvar; se a outra está Pendente, ele pergunta antes.",
            print: { arquivo: "festas/taxa-e-convidados.png", acoes: [{ clicar: "Nova reserva" }, { rolarAte: "Salvar Mudanças" }] },
          },
        ],
      },
      {
        id: "termo",
        titulo: "Gerar o contrato com o termo",
        passos: [
          {
            titulo: "Contrato da Reserva",
            texto: "Na linha da Reserva, toque nos três pontos e em “Gerar Contrato”. O PDF sai com os dados do responsável, a taxa, as regras do salão e o termo de responsabilidade, para o Morador assinar.",
            print: { arquivo: "festas/gerar-contrato.png", acoes: [{ clicar: "Ações da reserva de" }] },
          },
          {
            titulo: "Contrato em branco",
            texto: "Para preencher à mão, toque em “Contrato” no alto da tela. Sai o mesmo contrato, com os campos vazios.",
            print: { arquivo: "festas/lista.png", acoes: [] },
          },
        ],
      },
      {
        id: "consultar",
        titulo: "Consultar uma Reserva",
        passos: [
          {
            titulo: "Abrir a Reserva",
            texto: "Toque no olho na linha. O painel mostra o responsável, a data, os convidados, o valor da taxa, as observações e os comprovantes. O asterisco vermelho ao lado do olho avisa que a Reserva tem observação ou divergência.",
            print: { arquivo: "festas/detalhe.png", acoes: [{ clicar: "Ver reserva de" }] },
          },
        ],
      },
    ],
  },
  {
    id: "churrasqueira",
    tela: "Churrasqueira",
    area: "Reservas",
    rota: "/churrasqueira",
    titulo: "Churrasqueira",
    resumo: "Registrar a Reserva da churrasqueira CH-A ou CH-B e gerar o contrato.",
    tarefas: [
      {
        id: "reservar",
        titulo: "Reservar a churrasqueira",
        passos: [
          {
            titulo: "Abrir a Reserva",
            texto: "Toque em “Nova reserva” e escolha a Unidade. Marque “Morador Cadastrado?” para trazer os dados do Morador, ou preencha o responsável à mão.",
            print: { arquivo: "churrasqueira/nova-reserva.png", acoes: [{ clicar: "Nova reserva" }] },
          },
          {
            titulo: "Escolher a churrasqueira",
            texto: "Informe a data e a hora, o telefone, o RG, a taxa e os convidados, e escolha a churrasqueira, CH-A ou CH-B. Anexe o comprovante em “Adicionar arquivos” e toque em “Salvar Mudanças”. O choque de data vale para a mesma churrasqueira: Reserva Agendada impede, Pendente faz o sistema perguntar antes.",
            print: { arquivo: "churrasqueira/escolher.png", acoes: [{ clicar: "Nova reserva" }, { rolarAte: "Salvar Mudanças" }] },
          },
        ],
      },
      {
        id: "contrato",
        titulo: "Gerar o contrato",
        passos: [
          {
            titulo: "Contrato da Reserva",
            texto: "Na linha da Reserva, toque nos três pontos e em “Gerar Contrato”. Para um contrato em branco, toque em “Contrato” no alto da tela.",
            print: { arquivo: "churrasqueira/gerar-contrato.png", acoes: [{ clicar: "Ações da reserva de" }] },
          },
        ],
      },
    ],
  },
  {
    id: "piscina",
    tela: "Piscina",
    area: "Reservas",
    rota: "/piscina",
    titulo: "Piscina",
    resumo: "Cadastrar a Ficha da piscina, com foto e atestado médico, e baixar a carteirinha. A piscina não se reserva.",
    tarefas: [
      {
        id: "cadastrar",
        titulo: "Cadastrar a Ficha da piscina",
        passos: [
          {
            titulo: "Abrir a Ficha",
            texto: "Toque em “Novo cadastro” e escolha a Unidade. Marque “Morador Cadastrado?” para trazer nome, CPF e telefone do Morador.",
            print: { arquivo: "piscina/novo-cadastro.png", acoes: [{ clicar: "Novo cadastro" }] },
          },
          {
            titulo: "Atestado e foto",
            texto: "Informe a data de nascimento e a validade do atestado. Unidade, nome e validade são obrigatórios. Em “Documentação”, anexe a foto do rosto e o atestado médico, em imagem ou PDF, e toque em “Salvar Cadastro”.",
            print: { arquivo: "piscina/atestado.png", acoes: [{ clicar: "Novo cadastro" }, { rolarAte: "Salvar Cadastro" }] },
          },
        ],
      },
      {
        id: "carteirinha",
        titulo: "Baixar a carteirinha",
        passos: [
          {
            titulo: "Ver a carteirinha",
            texto: "Na lista, toque no olho na linha do Morador. A carteirinha aparece com a foto, a Unidade e a validade do atestado. Toque em “Baixar Carteirinha” para salvar a imagem.",
            print: { arquivo: "piscina/carteirinha.png", acoes: [{ clicar: "Ver ficha de" }] },
          },
          {
            titulo: "Atestado vencido",
            texto: "Na lista, o ícone vermelho ao lado da data de validade marca atestado vencido, e a Ficha mostra o mesmo alerta. Para achar quem precisa trazer atestado novo, filtre pelo período de validade.",
            print: { arquivo: "piscina/lista.png", acoes: [] },
          },
        ],
      },
    ],
  },
  {
    id: "mudancas",
    tela: "Mudanças",
    area: "Reservas",
    rota: "/mudancas",
    titulo: "Mudanças",
    resumo: "Marcar a Mudança de entrada ou saída de uma Unidade, com período e responsável.",
    tarefas: [
      {
        id: "marcar",
        titulo: "Marcar uma Mudança",
        passos: [
          {
            titulo: "Abrir a Mudança",
            texto: "Toque em “Nova mudança” e escolha a Unidade. Marque “Morador Cadastrado?” para trazer os dados do Morador, ou preencha o responsável à mão.",
            print: { arquivo: "mudancas/nova-mudanca.png", acoes: [{ clicar: "Nova mudança" }] },
          },
          {
            titulo: "Datas, tipo e período",
            texto: "Informe o início e a previsão de término, o telefone, o tipo (Entrada ou Saída) e o período (Manhã ou Tarde). Unidade, responsável, as duas datas e o telefone são obrigatórios. Toque em “Salvar Mudança”. Duas Mudanças no mesmo bloco e no mesmo dia travam o elevador: se a outra está Pendente, o sistema pergunta antes; nos outros status, não deixa salvar.",
            print: { arquivo: "mudancas/datas.png", acoes: [{ clicar: "Nova mudança" }, { rolarAte: "Salvar Mudança" }] },
          },
        ],
      },
      {
        id: "acompanhar",
        titulo: "Acompanhar as Mudanças",
        passos: [
          {
            titulo: "Filtrar a lista",
            texto: "A lista mostra a Unidade, o responsável, a data, o tipo, o período e o status. Filtre por status, tipo, turno ou período para ver as Mudanças da semana.",
            print: { arquivo: "mudancas/lista.png", acoes: [] },
          },
        ],
      },
    ],
  },
  {
    id: "agendamento",
    tela: "Agendamento",
    area: "Reservas",
    rota: "/agendamento",
    titulo: "Agendamento",
    resumo: "Marcar um Atendimento com a administração, para Morador, prestador de serviço, administradora ou funcionário.",
    tarefas: [
      {
        id: "marcar",
        titulo: "Marcar um Atendimento",
        passos: [
          {
            titulo: "Escolher o dia",
            texto: "No calendário, toque no dia. Dia com ponto já tem Atendimento, e à direita aparecem os horários livres, das 10h às 16h. Toque num horário livre ou em “Novo Agendamento”.",
            print: { arquivo: "agendamento/calendario.png", acoes: [] },
          },
          {
            titulo: "Preencher o Atendimento",
            texto: "Em “Tipo de Reunião”, escolha Morador, Prestador de Serviço, Administradora ou Funcionário; para Morador, escolha também a Unidade. Nome, data e hora de início são obrigatórios, e a duração vai de 30 minutos a 2 horas. Escreva o assunto e toque em “Salvar Agendamento”.",
            print: { arquivo: "agendamento/novo.png", acoes: [{ clicar: "Novo Agendamento" }] },
          },
        ],
      },
      {
        id: "remarcar",
        titulo: "Remarcar ou cancelar",
        passos: [
          {
            titulo: "Abrir o Atendimento",
            texto: "Em “Próximos”, ou na grade do dia, toque no Atendimento. Mude a data, a hora ou o status (Agendado, Confirmado, Realizado ou Cancelado) e toque em “Salvar Alterações”.",
            print: { arquivo: "agendamento/editar.png", acoes: [{ clicar: "Larissa Pontes" }] },
          },
        ],
      },
    ],
  },
  {
    id: "retirada",
    tela: "Encomendas",
    area: "Portaria",
    rota: "/encomendas",
    titulo: "Retirada",
    resumo: "Entregar a Encomenda com assinatura: inteira, só uma parte dos volumes ou para outra pessoa.",
    tarefas: [
      {
        id: "inteira",
        titulo: "Retirada inteira",
        passos: [
          {
            titulo: "Abrir a Encomenda",
            texto: "Na lista de Encomendas, toque em “Ver detalhes” na Encomenda de quem veio buscar. Confira a Unidade, o nome e quantos volumes são.",
            print: {
              arquivo: "retirada/detalhes.png",
              acoes: [{ clicar: "Ver detalhes" }],
            },
          },
          {
            titulo: "Conferir o Código de retirada",
            texto: "Toque em “Confirmar Entrega”. Se o Aviso foi enviado, peça o Código de retirada e digite no primeiro campo: ele é obrigatório, e o sistema confere se é desta Encomenda. Sem Aviso enviado, o campo fica fechado e a Retirada segue só pela identificação.",
            print: {
              arquivo: "retirada/entregar.png",
              acoes: [{ clicar: "Ver detalhes" }, { clicar: "Confirmar Entrega" }],
            },
          },
          {
            titulo: "Identificar quem retira",
            texto: "Preencha o nome e o CPF de quem está retirando. O CPF vai só com números.",
            print: {
              arquivo: "retirada/identificar.png",
              acoes: [
                { clicar: "Ver detalhes" },
                { clicar: "Confirmar Entrega" },
                { preencher: "Nome de quem está retirando", com: "Aline Furtado" },
                { preencher: "CPF de quem está retirando", com: "11144477735" },
              ],
            },
          },
          {
            titulo: "Assinar e concluir",
            texto: "Confira se todos os volumes estão marcados em “Itens entregues agora”, peça a assinatura no quadro e toque em “Concluir retirada”. A Retirada fica guardada e não pode ser alterada nem apagada.",
            print: {
              arquivo: "retirada/assinar.png",
              acoes: [
                { clicar: "Ver detalhes" },
                { clicar: "Confirmar Entrega" },
                { preencher: "Nome de quem está retirando", com: "Aline Furtado" },
                { preencher: "CPF de quem está retirando", com: "11144477735" },
                { rolar: "Assinatura de quem está retirando" },
              ],
            },
          },
        ],
      },
      {
        id: "parcial",
        titulo: "Retirada parcial",
        passos: [
          {
            titulo: "Desmarcar o que fica",
            texto: "Na Retirada, a lista “Itens entregues agora” vem com todos os volumes marcados. Desmarque os que não vão sair agora. Sempre que sobra volume, a “Observação” passa a ser obrigatória: é nela que você diz o que ficou na portaria.",
            print: {
              arquivo: "retirada/parcial.png",
              acoes: [
                { clicar: "Ver detalhes" },
                { clicar: "Confirmar Entrega" },
                { clicar: "Volume sem nota 1", papel: "checkbox" },
              ],
            },
          },
          {
            titulo: "Assinar só o que saiu",
            texto: "Identifique quem retira, escreva na “Observação” o que ficou na portaria, peça a assinatura e toque em “Concluir retirada”. Sem a Observação, o botão fica desligado. A assinatura vale para os volumes marcados.",
            print: {
              arquivo: "retirada/parcial-assinar.png",
              acoes: [
                { clicar: "Ver detalhes" },
                { clicar: "Confirmar Entrega" },
                { clicar: "Volume sem nota 1", papel: "checkbox" },
                { preencher: "Nome de quem está retirando", com: "Aline Furtado" },
                { preencher: "CPF de quem está retirando", com: "11144477735" },
                { preencher: "Observação", com: "Ficou 1 volume na portaria." },
                { rolar: "Assinatura de quem está retirando" },
              ],
            },
          },
          {
            titulo: "O resto continua aguardando",
            texto: "A Encomenda fica como “Parcialmente entregue” e continua na aba “Aguardando retirada”. Quando alguém voltar para buscar o resto, faça outra Retirada com os volumes que sobraram.",
            print: {
              arquivo: "retirada/lista.png",
              acoes: [],
            },
          },
        ],
      },
      {
        id: "outra-pessoa",
        titulo: "Retirada por outra pessoa",
        passos: [
          {
            titulo: "Identificar quem veio",
            texto: "Preencha o nome e o CPF de quem está na sua frente, não os do Morador. É essa pessoa que assina. Se o Aviso foi enviado, ela precisa trazer o Código de retirada que o Morador recebeu.",
            print: {
              arquivo: "retirada/outra-pessoa.png",
              acoes: [
                { clicar: "Ver detalhes" },
                { clicar: "Confirmar Entrega" },
                { preencher: "Nome de quem está retirando", com: "Marina Lopes" },
                { preencher: "CPF de quem está retirando", com: "52998224725" },
              ],
            },
          },
          {
            titulo: "Anotar quem autorizou",
            texto: "Use o campo “Observação” para registrar quem autorizou, por exemplo: vizinha do 206, autorizada pelo Morador por telefone.",
            print: {
              arquivo: "retirada/observacao.png",
              acoes: [
                { clicar: "Ver detalhes" },
                { clicar: "Confirmar Entrega" },
                { preencher: "Nome de quem está retirando", com: "Marina Lopes" },
                { preencher: "CPF de quem está retirando", com: "52998224725" },
                { preencher: "Observação", com: "Vizinha do 206, autorizada pelo Morador por telefone." },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    id: "entradas-e-saidas",
    tela: "Entregas",
    area: "Portaria",
    rota: "/entregas",
    titulo: "Entradas e Saídas",
    resumo: "Registrar a Passagem de quem entra sem morar no condomínio: a chegada, o tempo permitido e a saída.",
    tarefas: [
      {
        id: "chegada",
        titulo: "Registrar a chegada",
        passos: [
          {
            titulo: "Escolher o tipo",
            texto: "Em “Registrar chegada”, toque no tipo da Pessoa de fora: Entregador, Motorista, Visitante, Temporada ou Serviço. O tipo vem primeiro porque muda o resto do formulário.",
            print: {
              arquivo: "entradas-e-saidas/tipos.png",
              acoes: [{ clicar: "Visitante", papel: "radio" }],
            },
          },
          {
            titulo: "Identificar a pessoa",
            texto: "Digite o CPF. Se a pessoa já passou por aqui, o nome e o veículo vêm preenchidos e a tela pergunta se ela está com o mesmo veículo: toque em “Sim, é esse” ou em “Não, é outro”. Na primeira vez, digite nome e sobrenome.",
            print: {
              arquivo: "entradas-e-saidas/identificar.png",
              acoes: [
                { clicar: "Visitante", papel: "radio" },
                { preencher: "CPF", com: "52998224725" },
                { preencher: "Nome e sobrenome", com: "MARINA LOPES" },
              ],
            },
          },
          {
            titulo: "Unidade, veículo e quem liberou",
            texto: "Em “Unidade de destino”, digite 5205 ou bloco 5 apto 205 e escolha na lista. Depois o veículo, a placa e, em “Liberado por”, o nome de quem autorizou no apartamento.",
            print: {
              arquivo: "entradas-e-saidas/unidade.png",
              acoes: [
                { clicar: "Visitante", papel: "radio" },
                { preencher: "CPF", com: "52998224725" },
                { preencher: "Nome e sobrenome", com: "MARINA LOPES" },
                { preencher: "Liberado por", com: "Aline Furtado" },
              ],
            },
          },
          {
            titulo: "Tempo permitido e registro",
            texto: "Entregador, Motorista e Visitante começam com 15 minutos, que os botões de menos e mais mudam de 5 em 5. No Visitante dá para marcar “Ilimitado”. Temporada e Serviço ficam sem relógio. Toque em “Registrar chegada”.",
            print: {
              arquivo: "entradas-e-saidas/tempo.png",
              acoes: [
                { clicar: "Visitante", papel: "radio" },
                { rolar: "Tempo permitido" },
              ],
            },
          },
          {
            titulo: "Prestador de Serviço",
            texto: "No tipo Serviço, informe a empresa que o prestador representa. Se é serviço do próprio condomínio, como manutenção ou jardinagem, marque “É serviço do próprio condomínio”: some a Unidade de destino e quem libera é você.",
            print: {
              arquivo: "entradas-e-saidas/servico.png",
              acoes: [{ clicar: "Serviço", papel: "radio" }],
            },
          },
        ],
      },
      {
        id: "saida",
        titulo: "Registrar a saída",
        passos: [
          {
            titulo: "Ver quem está dentro",
            texto: "Toque na aba “Dentro agora”. O mapa mostra quem está no condomínio, e o número no alto avisa quantos passaram do tempo.",
            print: {
              arquivo: "entradas-e-saidas/dentro-agora.png",
              acoes: [{ clicar: "Dentro agora", papel: "tab" }],
            },
          },
          {
            titulo: "Fechar a Passagem",
            texto: "Na linha da pessoa, toque no botão de saída, o primeiro à direita. No computador, os botões da linha aparecem quando o mouse passa por ela. A Passagem fecha com a hora da saída.",
            print: {
              arquivo: "entradas-e-saidas/saida.png",
              acoes: [
                { clicar: "Dentro agora", papel: "tab" },
                { apontar: "Registrar saída de" },
              ],
            },
          },
        ],
      },
      {
        id: "cadastrados",
        titulo: "Consultar os cadastrados",
        passos: [
          {
            titulo: "Abrir a lista",
            texto: "Toque em “Cadastrados” para ver as Pessoas de fora que já passaram pela portaria e buscar pelo nome ou CPF. O cadastro some sozinho depois de 3 meses sem Passagem.",
            print: {
              arquivo: "entradas-e-saidas/cadastrados.png",
              acoes: [{ clicar: "Cadastrados" }],
            },
          },
        ],
      },
    ],
  },
  {
    id: "vagas",
    tela: "Vagas",
    area: "Portaria",
    rota: "/vagas",
    titulo: "Vagas",
    resumo: "Conferir no portão o carro, a moto e a TAG de cada Unidade.",
    tarefas: [
      {
        id: "conferir",
        titulo: "Conferir um veículo",
        passos: [
          {
            titulo: "Buscar a Unidade",
            texto: "Na aba “Vagas”, digite a Unidade, o modelo ou a placa na busca. Os filtros de bloco, de veículo e de status da TAG estreitam a lista.",
            print: {
              arquivo: "vagas/lista.png",
              acoes: [],
            },
          },
          {
            titulo: "Ver a Vaga",
            texto: "Toque no olho da linha para ver o carro e a moto da Unidade, com modelo e placa, e o status da TAG. Se a placa no portão não bate com a da Vaga, avise a administração, que é quem corrige o cadastro.",
            print: {
              arquivo: "vagas/detalhe.png",
              acoes: [{ clicar: "Ver vaga da unidade" }],
            },
          },
        ],
      },
    ],
  },
  {
    id: "tag",
    tela: "Vagas",
    area: "Portaria",
    rota: "/vagas",
    titulo: "TAG",
    resumo: "O caminho da TAG do veículo: Solicitada pela portaria, Disponível pela administração e Aplicada quando colada no carro.",
    tarefas: [
      {
        id: "solicitada",
        titulo: "Pedir a TAG (Solicitada)",
        passos: [
          {
            titulo: "Abrir o pedido",
            texto: "Em Vagas, toque na aba “TAGs” e depois em “Nova TAG”. Na aba “Vagas”, a etiqueta na linha da Unidade abre o mesmo pedido.",
            print: {
              arquivo: "tag/nova.png",
              acoes: [{ clicar: "TAGs", papel: "tab" }, { clicar: "Nova TAG" }],
            },
          },
          {
            titulo: "Preencher o pedido",
            texto: "Escolha a Unidade, digite o nome de quem pede e escolha o tipo de solicitante e o veículo. Placa, modelo e cor vêm da Vaga. Se a Unidade não tem esse veículo cadastrado, peça à administração para registrar na Vaga primeiro.",
            print: {
              arquivo: "tag/pedido.png",
              acoes: [
                { clicar: "TAGs", papel: "tab" },
                { clicar: "Nova TAG" },
                { preencher: "Nome do solicitante", com: "Aline Furtado" },
                { selecionar: "Tipo de solicitante", opcao: "Proprietário" },
              ],
            },
          },
          {
            titulo: "Registrar",
            texto: "Toque em “Registrar”. A TAG entra como Solicitada (na tela, “Solicitado”) e fica com a administração.",
            print: {
              arquivo: "tag/solicitada.png",
              acoes: [
                { clicar: "TAGs", papel: "tab" },
                { selecionar: "Filtrar por status", opcao: "Solicitado" },
              ],
            },
          },
        ],
      },
      {
        id: "disponivel",
        titulo: "Esperar a liberação (Disponível)",
        passos: [
          {
            titulo: "Acompanhar o status",
            texto: "A administração providencia a TAG e muda o status para Disponível. Filtre a aba “TAGs” por “Disponível” para ver as que já podem ser coladas.",
            print: {
              arquivo: "tag/disponivel.png",
              acoes: [
                { clicar: "TAGs", papel: "tab" },
                { selecionar: "Filtrar por status", opcao: "Disponível" },
              ],
            },
          },
        ],
      },
      {
        id: "aplicada",
        titulo: "Colar e marcar (Aplicada)",
        passos: [
          {
            titulo: "Abrir a TAG",
            texto: "Com o carro na portaria, cole a TAG e toque no lápis da linha. A portaria só edita a TAG Disponível: antes disso o pedido está com a administração.",
            print: {
              arquivo: "tag/editar.png",
              acoes: [
                { clicar: "TAGs", papel: "tab" },
                { selecionar: "Filtrar por status", opcao: "Disponível" },
                { clicar: "Editar TAG da unidade" },
              ],
            },
          },
          {
            titulo: "Marcar como Aplicada",
            texto: "Em “Status”, escolha “Aplicado” e toque em “Salvar”. A TAG passa a Aplicada.",
            print: {
              arquivo: "tag/aplicada.png",
              acoes: [
                { clicar: "TAGs", papel: "tab" },
                { selecionar: "Filtrar por status", opcao: "Disponível" },
                { clicar: "Editar TAG da unidade" },
                { selecionar: "Status", opcao: "Aplicado" },
                { rolar: "Status" },
              ],
            },
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
