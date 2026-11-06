# Diduccio

O sistema de gestão do Diduccio, o Edifício Di Duccio, um dos prédios do Condomínio Novo Leblon, na Barra da Tijuca: portaria, encomendas, cadastro de moradores, reservas e administração. A base veio do ViT, o sistema do condomínio do Lucas. Curado em 2026-11-01 contra o código de `app/` (issue #2).

## Pessoas e cargos

**Morador**:
Pessoa ligada a uma Unidade, com CPF, telefone, Vínculo e Tipo de morador. Hoje não entra no sistema; a partir do App do morador entra com o Cargo Morador.
_Evitar_: condômino, residente, usuário

**Vínculo**:
A relação do Morador com a Unidade: Proprietário ou Locatário.
_Evitar_: inquilino

**Tipo de morador**:
O papel do Morador dentro da Unidade: Titular, Dependente ou Não Morador. O Titular é quem confirma o telefone e responde pela Unidade.

**Unidade**:
O apartamento do condomínio, identificado por bloco e número, com ocupação e situação de adimplência. Toda Encomenda, Reserva, Vaga e Notificação aponta para uma Unidade.
_Evitar_: apartamento, apto, imóvel

**Usuário**:
A conta de quem entra no sistema, ligada a um Cargo. O login é pelo CPF. Não confundir com Morador.
_Evitar_: login, conta

**Cargo**:
O papel do Usuário: Síndico, Auxiliar Administrativo, Porteiro, Conselheiro, Desenvolvedor e, com o App do morador, Morador. O Cargo define o que a tela mostra e o que o banco deixa fazer.
_Evitar_: perfil, role, permissão

**Síndico**:
Cargo que administra o condomínio: cadastros, reservas, atas, comunicados e tarefas. É o único, com o Desenvolvedor, que exclui registros. Não cria Usuários.

**Auxiliar Administrativo**:
Cargo que trabalha com o Síndico: cria e edita tudo que o Síndico vê, mas não exclui. No quadro de Tarefas vê só as suas.

**Porteiro**:
Cargo que opera a portaria: registra Encomenda, Retirada e Passagem, confere Vagas e pede e aplica TAG. Não vê o Código de retirada.

**Conselheiro**:
Cargo de leitura: vê as Assembleias e o painel com a receita das reservas.

**Desenvolvedor**:
Cargo de quem mantém o sistema. Tem tudo do Síndico e é o único que cria e gerencia Usuários.

## Portaria

**Encomenda**:
Pacote que chega na portaria para uma Unidade. Cada volume entra com foto e nota fiscal; a Encomenda recebe um Número da encomenda e, se a Unidade tem telefone, um Código de retirada.
_Evitar_: entrega, pacote, delivery

**Número da encomenda**:
Identificador de 4 dígitos e 1 letra que vai para o livro da portaria.

**Código de retirada**:
Código de 5 letras e números, sorteado quando a Encomenda é registrada, que o Morador apresenta para retirar.
_Evitar_: senha, token

**Retirada**:
O ato de alguém buscar a Encomenda, com assinatura na tela, nome, CPF e hora. Pode ser parcial, item a item, e feita por outra pessoa que não o Morador.
_Evitar_: baixa, entrega ao morador

**Aviso**:
A mensagem que diz ao Morador que a Encomenda chegou. Hoje é um link de WhatsApp que o Porteiro clica; com o App do morador vira notificação no celular, e o WhatsApp fica para quem não ativou.
_Evitar_: notificação (reservado para a Notificação de infração)

**Pessoa de fora**:
Quem entra no condomínio sem morar nele, de um de cinco tipos: Entregador, Motorista, Visitante, Temporada ou Serviço. O cadastro some sozinho após 3 meses sem Passagem.
_Evitar_: entregador (é só um dos tipos), terceiro

**Passagem**:
O registro de entrada e saída de uma Pessoa de fora na portaria, com cópia dos dados da pessoa naquele momento. A tela se chama Entradas e Saídas.
_Evitar_: chegada, visita, acesso

**Confirmação**:
A checagem, por WhatsApp, do telefone do Titular que vai receber os Avisos.

## Moradores

**Vaga**:
Vaga de carro ou moto de uma Unidade, com placa, modelo e cor.

**TAG**:
Etiqueta de acesso veicular. Passa por Solicitada (o Porteiro pede), Disponível (a administração libera) e Aplicada (o Porteiro cola no carro).
_Evitar_: adesivo, controle

## Reservas

**Reserva**:
Uso marcado de uma área comum: salão de festas ou churrasqueira. Cada área tem os próprios anexos; o salão tem taxa e lista de convidados.
_Evitar_: agendamento (reservado para o Atendimento)

**Ficha da piscina**:
Cadastro do Morador para usar a piscina, com foto e atestado médico com validade, que vira carteirinha. A piscina não se reserva.

**Mudança**:
Entrada ou saída de mudança de uma Unidade, marcada num período.

**Atendimento**:
Horário marcado com a administração, para um Morador, prestador de serviço, administradora ou funcionário. A tela se chama Agendamento.
_Evitar_: agendamento, reunião

## Administração

**Assembleia**:
A reunião dos condôminos. No sistema é a ata em PDF, o resumo feito por IA, as decisões e um chat que busca nas atas.
_Evitar_: ata (a ata é o documento da Assembleia)

**Comunicado**:
Texto da administração para os Moradores, escrito no editor ou gerado por IA, exportado em PDF ou imagem e compartilhado no WhatsApp. Não fica guardado.
_Evitar_: aviso, circular

**Notificação**:
Advertência formal a uma Unidade por infração. A regra do condomínio é que, depois de 2 Notificações, a terceira vira Multa. Existe no banco, sem tela.
_Evitar_: aviso, advertência

**Multa**:
A Notificação com valor a pagar.

**Tarefa**:
Item do quadro da administração, com responsável e notas, nas colunas A fazer, Em andamento, Aguardando e Concluído.

**Anexo**:
Arquivo guardado no sistema e ligado a um registro (Retirada, Reserva, Ficha da piscina, Notificação). Recibo de Retirada e carta de Notificação não se apagam.
_Evitar_: upload, arquivo

**Log**:
Registro das ações de cada Usuário, só inserção. O painel mostra as últimas ações de quem está logado.

**Auditoria**:
Registro das ações automáticas do sistema, como a limpeza de cadastros parados. Só o Síndico lê.

## Ajuda

**Manual**:
As páginas de ajuda dentro do app que explicam cada tela, com passo a passo e prints. Cada Usuário vê as páginas do próprio Cargo.
_Evitar_: tutorial, help, Processos

## O repositório

**App**:
O código do sistema em `app/`. PR que toca `app/` é PR do app e passa pelo `diduccio-revisor`; o resto é PR de ferramenta.
_Evitar_: plataforma, sistema, ViT

**App do morador**:
A parte do App que o Morador usa no celular, instalada como PWA, para ver as Encomendas da Unidade e receber o Aviso.
_Evitar_: app do condômino, aplicativo
