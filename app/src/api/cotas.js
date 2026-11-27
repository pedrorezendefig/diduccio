// Cotas extras (0101): o que aparece na tela Cotas extras do app do morador.
//
// Quem pode é decidido no banco (só administração; ninguém apaga). Quem
// criou, quando foi corrigida e quem encerrou vêm do banco (gatilho). Os
// avisos aos moradores também saem do banco: cota nova avisa, correção não,
// encerrar antes do fim avisa.
import { supabase } from "./supabase";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const CAMPOS = "id, titulo, descricao, valor_parcela, parcelas, primeiro_mes, ultimo_mes, assembleia_id, criado_em, atualizado_em, encerrado_em";

/** "AAAA-MM" de hoje em Brasília. */
export const mesDeHoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);

/** "2026-09" + 9 meses = "2027-06". */
export function somarMeses(mes, n) {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** "setembro de 2026". */
export const mesPorExtenso = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
/** "set/26". */
export const mesCurto = (mes) => `${CURTOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;

/** "R$ 1.500,00". */
export const reais = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");

/** "150,00" ou "1.500" → 150 / 1500. Vazio ou inválido → NaN. */
export function lerValor(texto) {
  const limpo = String(texto ?? "").replace(/[^\d,.]/g, "");
  if (!limpo) return NaN;
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/\.(?=\d{3}(\D|$))/g, "");
  return Number(normal);
}

/** Ativa, Terminou ou Encerrada, e a parcela do mês. */
export function situacaoDaCota(c, hoje = mesDeHoje()) {
  const primeiro = c.primeiro_mes.slice(0, 7);
  const ultimo = (c.ultimo_mes ?? `${somarMeses(primeiro, c.parcelas - 1)}-01`).slice(0, 7);
  if (c.encerrado_em) return { chave: "encerrada", nome: "Encerrada", atual: null };
  if (ultimo < hoje) return { chave: "terminou", nome: "Terminou", atual: null };
  const atual = hoje < primeiro ? 0 : (Number(hoje.slice(0, 4)) - Number(primeiro.slice(0, 4))) * 12 + Number(hoje.slice(5, 7)) - Number(primeiro.slice(5, 7)) + 1;
  return { chave: "ativa", nome: "Ativa", atual };
}

/** "3 de 10 (set/26 a jun/27)" ou "6 (jan/27 a jun/27)" se ainda não começou. */
export function parcelasPorExtenso(c, hoje = mesDeHoje()) {
  const primeiro = c.primeiro_mes.slice(0, 7);
  const ultimo = somarMeses(primeiro, c.parcelas - 1);
  const s = situacaoDaCota(c, hoje);
  const quantas = s.atual ? `${s.atual} de ${c.parcelas}` : String(c.parcelas);
  return c.parcelas === 1 ? `${quantas} (${mesCurto(primeiro)})` : `${quantas} (${mesCurto(primeiro)} a ${mesCurto(ultimo)})`;
}

export async function listarCotas() {
  const { data, error } = await supabase.from("cotas_extras").select(CAMPOS).order("primeiro_mes", { ascending: false }).order("id", { ascending: false });
  if (error) return { success: false, message: error.message, data: [] };
  return { success: true, data: data ?? [] };
}

/** As assembleias cadastradas no sistema, da mais recente para a mais antiga. */
export async function listarAssembleias() {
  const { data, error } = await supabase.from("assembleias").select("id, titulo, data_assembleia, resumo_geral, decisoes").order("data_assembleia", { ascending: false, nullsFirst: false });
  return error ? [] : data ?? [];
}

/** O que o formulário manda: só os campos que a tela pode gravar. */
export function linhaDaCota(f) {
  return {
    titulo: f.titulo.trim(),
    descricao: f.descricao.trim() || null,
    valor_parcela: Math.round(lerValor(f.valor) * 100) / 100,
    parcelas: Number(f.parcelas),
    primeiro_mes: `${f.primeiroMes}-01`,
    assembleia_id: f.assembleiaId || null,
  };
}

/** O que falta ou está errado no formulário; vazio se pode salvar. */
export function errosDaCota(f) {
  const e = {};
  if (f.titulo.trim().length < 3) e.titulo = "Escreva o título (pelo menos 3 letras).";
  const v = lerValor(f.valor);
  if (!(v > 0)) e.valor = "Informe o valor de cada parcela.";
  else if (v > 100000) e.valor = "Valor alto demais para uma parcela.";
  const n = Number(f.parcelas);
  if (!Number.isInteger(n) || n < 1 || n > 120) e.parcelas = "De 1 a 120 parcelas.";
  if (!/^\d{4}-\d{2}$/.test(f.primeiroMes ?? "")) e.primeiroMes = "Escolha o mês da primeira parcela.";
  return e;
}

export async function salvarCota(f, id = null) {
  const linha = linhaDaCota(f);
  const q = id
    ? supabase.from("cotas_extras").update(linha).eq("id", id).select("id").single()
    : supabase.from("cotas_extras").insert(linha).select("id").single();
  const { data, error } = await q;
  return error ? { success: false, message: error.message } : { success: true, id: data.id };
}

/** Encerra: some do app e fica guardada. A hora e quem encerrou vêm do banco. */
export async function encerrarCota(id) {
  const { error } = await supabase.from("cotas_extras").update({ encerrado_em: new Date().toISOString() }).eq("id", id);
  return error ? { success: false, message: error.message } : { success: true };
}
