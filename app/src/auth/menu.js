// menu.js
import { ROLES } from "./permissions";

// Quem vê cada tela no menu. Saiu do Sidebar para o Manual ler a mesma
// tabela: o Cargo vê a página de uma tela se, e só se, vê a tela no menu.
// Mexer aqui é mexer em acesso.
export const TELAS_DO_MENU = {
  // A entrada do sistema: todos os cargos (o botão grande muda por cargo).
  Inicio: [ROLES.PORTEIRO, ROLES.SINDICO, ROLES.AUX, ROLES.DEV, ROLES.CONSELHEIRO],
  // Desligado por enquanto para todos (pedido de 2026-11-04): o Início com a
  // capa já mostra os números e os relatórios. A tela continua no código; para
  // religar, volte a lista para os cinco cargos e ligue DASHBOARD_ATIVO no App.
  Dashboard: [],

  // Quadro de tarefas da administração (0042).
  Tarefas: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],

  Unidades: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  Moradores: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  // A portaria confere placa no portão o dia inteiro, e é ela que precisa
  // corrigir o cadastro quando o morador troca de carro num sábado à noite.
  // Quem libera de verdade é o 0037; isto só faz o menu aparecer.
  Vagas: [ROLES.PORTEIRO, ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  Piscina: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  Comunicado: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  "Notificações": [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  Assembleia: [ROLES.SINDICO, ROLES.AUX, ROLES.CONSELHEIRO, ROLES.DEV],
  // Cotas extras (0101): o que aparece no app do morador; o banco só deixa
  // a administração gravar (eh_administrativo).
  Cotas: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  // Agenda do condomínio (0100): eventos que aparecem no Calendário do app do
  // morador; o banco só deixa a administração ler e gravar (eh_administrativo).
  Calendario: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],

  Encomendas: [ROLES.PORTEIRO, ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  Entregas: [ROLES.PORTEIRO, ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  "Confirmação": [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  // O app do morador já aprovado: os mesmos de Confirmações, que é de onde
  // essas listas saíram (as funções do banco exigem `eh_administrativo`).
  App: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],

  Festas: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  // O porteiro vê, só leitura (0120): é ele quem abre o espaço no dia.
  Churrasqueira: [ROLES.PORTEIRO, ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  "Mudanças": [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  Agendamento: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],

  // O Manual é de todo Cargo; cada um vê dentro só as páginas das próprias
  // telas (ADR 0003).
  Manual: [ROLES.PORTEIRO, ROLES.SINDICO, ROLES.AUX, ROLES.DEV, ROLES.CONSELHEIRO],

  Usuarios: [ROLES.DEV],
  Vitrine: [ROLES.DEV],
};

export const podeVerTela = (cargo, tela) => (TELAS_DO_MENU[tela] ?? []).includes(cargo);
