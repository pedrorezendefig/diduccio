# Diduccio

Rascunho gerado na instalação do fluxo. Curar no primeiro `/grill-with-docs`.

O sistema de gestão do Condomínio Diduccio: portaria, encomendas, cadastro de moradores, reservas e administração. A base veio do ViT, o sistema do condomínio do Lucas, e os termos abaixo foram lidos das tabelas e telas de `app/`.

## Pessoas e cargos

**Morador**:
Pessoa que mora numa Unidade, com CPF, telefone e vínculo (proprietário, inquilino, dependente). Hoje não entra no sistema; é quem recebe o aviso de encomenda.
_Evitar_: condômino, residente, usuário

**Unidade**:
O apartamento ou casa do condomínio, identificado por bloco e número. Toda encomenda, reserva e vaga aponta para uma Unidade.
_Evitar_: apartamento, apto, imóvel

**Cargo**:
O papel de quem entra no sistema: Síndico, Auxiliar Administrativo, Porteiro, Conselheiro ou Desenvolvedor. O Cargo vem no token de login e define o que a tela mostra e o que o banco deixa fazer (RLS).
_Evitar_: perfil, role, permissão

**Porteiro**:
Cargo que opera a portaria: registra Entregador, Encomenda e Retirada. Não edita cadastro de Morador nem vê CPF completo.

**Síndico**:
Cargo que administra tudo: cadastros, reservas, atas, comunicados, usuários.

**Conselheiro**:
Cargo só de leitura das atas de Assembleia.

**Usuário**:
A conta de quem entra no sistema, ligada a um Cargo. Não confundir com Morador.
_Evitar_: login, conta

## Portaria

**Encomenda**:
Pacote que chega na portaria para uma Unidade. Nasce com foto, nota fiscal opcional e um Código de retirada sorteado no banco.
_Evitar_: entrega, pacote, delivery

**Entregador**:
Pessoa de fora que entra no condomínio para entregar ou visitar. O cadastro some sozinho após 3 meses sem visita.
_Evitar_: visitante, prestador

**Chegada**:
O registro de entrada e saída de um Entregador na portaria, com cópia dos dados da pessoa naquele momento.
_Evitar_: visita, acesso

**Código de retirada**:
Número sorteado pelo banco quando a Encomenda é registrada. O Morador apresenta o código para retirar.

**Retirada**:
O ato de o Morador buscar a Encomenda, com assinatura na tela, CPF e hora. Pode ser parcial, item a item.
_Evitar_: baixa, entrega ao morador

**Aviso**:
A mensagem que avisa o Morador de que a Encomenda chegou. Hoje é um link de WhatsApp que o Porteiro clica; o Diduccio quer que vire notificação no celular.
_Evitar_: notificação (reservado para a Notificação de infração)

## Moradores

**Vaga**:
Vaga de carro ou moto de uma Unidade, com placa e modelo.

**TAG**:
Etiqueta de acesso veicular. O Porteiro pede, a administração aplica e muda o status.
_Evitar_: adesivo, controle

**Confirmação**:
A checagem do telefone do Morador feita por WhatsApp.

## Reservas

**Reserva**:
Uso marcado de uma área comum: salão de festas, churrasqueira, piscina. Cada área tem a própria tabela e os próprios anexos.
_Evitar_: agendamento (reservado para o Atendimento)

**Ficha da piscina**:
Cadastro do Morador para usar a piscina, com foto e atestado médico, que vira carteirinha.

**Mudança**:
Agendamento de entrada ou saída de mudança de uma Unidade.

**Atendimento**:
Horário marcado de um Morador com a administração.
_Evitar_: agendamento, reunião

## Administração

**Assembleia**:
A reunião dos condôminos. No sistema é a ata em PDF, o resumo feito por IA e as decisões.
_Evitar_: ata (a ata é o documento da Assembleia)

**Comunicado**:
Texto da administração para os Moradores, escrito no editor ou gerado por IA, exportado em PDF ou imagem.
_Evitar_: aviso, circular

**Notificação**:
Advertência formal a uma Unidade por infração. A cada 2 Notificações, a terceira vira Multa. Existe no banco, sem tela.
_Evitar_: aviso, advertência

**Tarefa**:
Item do quadro kanban da administração.

**Anexo**:
Arquivo guardado no bucket privado `anexos` do Supabase, acessado por URL assinada. A primeira pasta do caminho diz de que módulo ele é.
_Evitar_: upload, arquivo

**Log**:
Registro de ação no sistema, só inserção. O Dashboard lê daqui.
_Evitar_: auditoria (tabela separada, ainda sem uso)

## O repositório

**Diduccio OS**:
O painel local, só de leitura, que mostra issues, PRs, produção e documentação (`tools/workflow-dashboard/`).

**App**:
O código do sistema em `app/`. PR que toca `app/` é PR do app e passa pelo `diduccio-revisor`; o resto é PR de ferramenta.
_Evitar_: plataforma, sistema, ViT
