'use strict';

/* Curadoria funcional das tabelas do banco: alimenta o popover do Mapa da app.
   Uma linha por tabela dizendo O QUE ela guarda em linguagem de negócio, mais
   notas opcionais por coluna importante. Tabela nova sem verbete aparece no
   popover só com os dados técnicos (o painel avisa discreto que falta verbete).
   Fonte do vocabulário: CONTEXT.md + docs/spec/snapshots/ENTIDADES.md. */

export const TABELAS = {
  unidades: { resumo: 'As unidades do condomínio: bloco, número e ocupação.' },
  moradores: { resumo: 'Quem mora em cada unidade: CPF, telefone, vínculo, entrada e saída.' },
  vagas: { resumo: 'Vagas de carro e moto por unidade, com placa e modelo.' },
  tags: { resumo: 'TAGs de acesso veicular. O porteiro pede, a administração muda o status.' },
  confirmacao: { resumo: 'Confirmação do telefone do morador feita por WhatsApp.' },
  usuarios: { resumo: 'Contas do sistema (síndico, porteiro, auxiliar, conselheiro, dev) ligadas ao auth.users.' },
  entregadores: { resumo: 'Cadastro de entregador ou visitante. Some sozinho após 3 meses sem visita.' },
  entregadores_chegadas: { resumo: 'Histórico de entradas e saídas na portaria, com cópia dos dados da pessoa.' },
  entregas: { resumo: 'As encomendas: código de retirada sorteado no banco e status do aviso ao morador.' },
  entregas_foto: { resumo: 'Fotos da encomenda no recebimento.' },
  entregas_nf: { resumo: 'Notas fiscais anexadas à encomenda.' },
  entregas_recebimento: { resumo: 'Anexos do recebimento da encomenda.' },
  retiradas: { resumo: 'Evento de retirada assinado na tela, com CPF e hora.' },
  retirada_itens: { resumo: 'Retirada parcial, item a item, de uma encomenda.' },
  festas: { resumo: 'Reservas do salão de festas.' },
  uploads_festas: { resumo: 'Anexos das reservas de festa.' },
  churrasqueira: { resumo: 'Reservas da churrasqueira.' },
  uploads_churrasqueira: { resumo: 'Anexos das reservas de churrasqueira.' },
  piscina: { resumo: 'Ficha da piscina por morador, com foto e atestado médico.' },
  uploads_piscina: { resumo: 'Foto e atestado da ficha da piscina.' },
  mudancas: { resumo: 'Agendamento de mudança (entrada ou saída).' },
  agendamentos: { resumo: 'Atendimentos marcados com a administração.' },
  assembleias: { resumo: 'Atas de assembleia: PDF, resumo e decisões.' },
  compras: { resumo: 'Compras do condomínio e a aprovação com assinatura. Sem tela ainda.' },
  compras_produtos: { resumo: 'Itens de cada compra.' },
  uploads_compras: { resumo: 'Anexos das compras.' },
  assinatura: { resumo: 'Assinatura em base64 da aprovação de compra.' },
  notas: { resumo: 'Notas fiscais de compra.' },
  multas: { resumo: 'Multas antigas (legado).' },
  notificacoes: { resumo: 'Notificação e multa por unidade. A cada 2 notificações, a 3ª é multa. Sem tela ainda.' },
  notificacoes_anexos: { resumo: 'Carta assinada da notificação.' },
  tarefas: { resumo: 'Quadro kanban da administração.' },
  notas_tarefas: { resumo: 'Bloco de notas pessoal de cada usuário.' },
  log: { resumo: 'Registro de ações, só inserção. O Dashboard lê daqui.' },
  auditoria: { resumo: 'Trilha de auditoria, só inserção. O front ainda não escreve nela.' },
  tentativas_login: { resumo: 'Contagem de tentativas de login por conta e origem.' },
};
