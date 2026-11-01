// menu.js
import { ROLES } from "./permissions";

// Quem vê cada tela no menu. Saiu do Sidebar para o Manual ler a mesma
// tabela: o Cargo vê a página de uma tela se, e só se, vê a tela no menu.
// Mexer aqui é mexer em acesso.
export const TELAS_DO_MENU = {
  Dashboard: [ROLES.PORTEIRO, ROLES.SINDICO, ROLES.AUX, ROLES.DEV, ROLES.CONSELHEIRO],

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
  Assembleia: [ROLES.SINDICO, ROLES.AUX, ROLES.CONSELHEIRO, ROLES.DEV],

  Encomendas: [ROLES.PORTEIRO, ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  Entregas: [ROLES.PORTEIRO, ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  "Confirmação": [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],

  // O Manual é de todo Cargo; cada um vê dentro só as páginas das próprias
  // telas (ADR 0003).
  Manual: [ROLES.PORTEIRO, ROLES.SINDICO, ROLES.AUX, ROLES.DEV, ROLES.CONSELHEIRO],

  Festas: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  Churrasqueira: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  "Mudanças": [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],
  Agendamento: [ROLES.SINDICO, ROLES.AUX, ROLES.DEV],

  Usuarios: [ROLES.DEV],
  Vitrine: [ROLES.DEV],
};

export const podeVerTela = (cargo, tela) => (TELAS_DO_MENU[tela] ?? []).includes(cargo);
