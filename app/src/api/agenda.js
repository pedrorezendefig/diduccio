// A Agenda do condomínio (0100): os eventos que aparecem no Calendário do
// app do morador.
//
// Quem pode é decidido no banco (só administração; ninguém apaga). Quem
// criou e quem cancelou vêm do banco (gatilho), não da tela. Os avisos aos
// moradores também saem do banco, quando "Avisar os moradores" está ligado.
import { supabase } from "./supabase";

export const TIPOS = [
  ["assembleia", "Assembleia"],
  ["manutencao", "Manutenção"],
  ["falta_agua", "Falta de água"],
  ["falta_luz", "Falta de luz"],
  ["dedetizacao", "Dedetização"],
  ["social", "Evento social"],
  ["outro", "Outro"],
];
export const NOME_DO_TIPO = Object.fromEntries(TIPOS);

const CAMPOS = "id, tipo, titulo, texto, inicio, fim, hora_inicio, hora_fim, local, blocos, avisar, cancelado_em, criado_em";

/** Os eventos que tocam o intervalo (cancelados também: ficam guardados). */
export async function listarEventos(de, ate) {
  const { data, error } = await supabase
    .from("eventos_condominio")
    .select(CAMPOS)
    .lte("inicio", ate)
    .or(`fim.gte.${de},and(fim.is.null,inicio.gte.${de})`)
    .order("inicio")
    .order("hora_inicio", { nullsFirst: true });
  if (error) return { success: false, message: error.message, data: [] };
  return { success: true, data: data ?? [] };
}

export async function listarFeriados(de, ate) {
  const { data, error } = await supabase.from("feriados").select("data, nome").gte("data", de).lte("data", ate);
  return error ? [] : data ?? [];
}

/** Os blocos do condomínio, do cadastro de unidades. */
export async function listarBlocos() {
  const { data, error } = await supabase.rpc("unidades_para_cadastro");
  if (error || !Array.isArray(data)) return [];
  return [...new Set(data.map((u) => Number(u.bloco)).filter(Boolean))].sort((a, b) => a - b);
}

/** O que o formulário manda: só os campos que a tela pode gravar. */
export function linhaDoEvento(f) {
  return {
    tipo: f.tipo,
    titulo: f.titulo.trim(),
    texto: f.texto.trim() || null,
    inicio: f.inicio,
    fim: f.fim && f.fim !== f.inicio ? f.fim : null,
    hora_inicio: f.diaInteiro ? null : f.horaInicio || null,
    hora_fim: f.diaInteiro || !f.horaInicio ? null : f.horaFim || null,
    local: f.local.trim() || null,
    blocos: f.todos || !f.blocos.length ? null : [...f.blocos].sort((a, b) => a - b),
    avisar: Boolean(f.avisar),
  };
}

/** O que falta ou está errado no formulário; vazio se pode salvar. */
export function errosDoEvento(f) {
  const e = {};
  if (f.titulo.trim().length < 3) e.titulo = "Escreva o título (pelo menos 3 letras).";
  if (!f.inicio) e.inicio = "Escolha o dia.";
  if (f.fim && f.inicio && f.fim < f.inicio) e.fim = "O fim vem depois do começo.";
  if (!f.diaInteiro && !f.horaInicio) e.horaInicio = "Informe a hora ou ligue Dia inteiro.";
  if (!f.diaInteiro && f.horaInicio && f.horaFim && f.horaFim <= f.horaInicio && !(f.fim && f.fim > f.inicio)) e.horaFim = "A hora de terminar vem depois da de começar.";
  if (!f.todos && !f.blocos.length) e.blocos = "Escolha ao menos um bloco, ou Todo o condomínio.";
  return e;
}

export async function salvarEvento(f, id = null) {
  const linha = linhaDoEvento(f);
  const q = id
    ? supabase.from("eventos_condominio").update(linha).eq("id", id).select("id").single()
    : supabase.from("eventos_condominio").insert(linha).select("id").single();
  const { data, error } = await q;
  return error ? { success: false, message: error.message } : { success: true, id: data.id };
}

/** Cancela: some do app e fica guardado. A hora e quem cancelou vêm do banco. */
export async function cancelarEvento(id) {
  const { error } = await supabase.from("eventos_condominio").update({ cancelado_em: new Date().toISOString() }).eq("id", id);
  return error ? { success: false, message: error.message } : { success: true };
}
