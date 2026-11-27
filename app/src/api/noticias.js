// Notícias do app do morador (0079).
//
// Quem pode é decidido no banco (só administração; ninguém apaga). Quem
// publicou, quando, e quem retirou também: o gatilho grava, a tela não manda.
// Retirar não apaga: some do app do morador e fica guardada.
//
// Anexos (0082): vídeo, imagem e PDF, quantos quiser, no bucket
// `noticias-midia` (o `anexos` é só 10 MB e sem vídeo, de propósito).
import { supabase } from "./supabase";
import { enviarAnexo, removerAnexo, urlDoAnexo } from "./anexos";

const MIDIA = "noticias-midia";
/** O limite do bucket (0082). */
export const MAX_ANEXO = 50 * 1024 * 1024;
/** Um teto de bom senso para uma notícia só. */
export const MAX_ANEXOS = 20;
/** O `accept` do campo de arquivo: o que o app do morador mostra. */
export const ACEITA_ANEXO = "video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp,image/gif,application/pdf";

/** "video", "imagem" ou "pdf" pelo tipo do arquivo; null se o app não mostra. */
export function tipoDoAnexo(arquivo) {
  const t = arquivo?.type ?? "";
  if (/^video\/(mp4|webm|quicktime)$/.test(t)) return "video";
  if (/^image\/(jpeg|png|webp|gif)$/.test(t)) return "imagem";
  if (t === "application/pdf") return "pdf";
  return null;
}

/** "2,4 MB" */
export function tamanhoLegivel(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** O que há de errado com o arquivo, ou null se pode anexar. */
export function problemaDoAnexo(arquivo) {
  if (!tipoDoAnexo(arquivo)) return "Só vídeo (MP4, MOV, WebM), imagem (JPG, PNG, WebP, GIF) ou PDF.";
  if (arquivo.size > MAX_ANEXO) return "Passa de 50 MB. Encurte o vídeo ou diminua o arquivo.";
  return null;
}

const nomeLimpo = (nome) =>
  String(nome || "arquivo")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-80);

/** As notícias que o morador vê agora (a fixada primeiro). */
export async function listarNoticiasNoApp() {
  const { data, error } = await supabase
    .from("noticias")
    .select("id, titulo, fixada, publicada_em, caminho_pdf, noticia_anexos(count)")
    .is("retirada_em", null)
    .order("fixada", { ascending: false })
    .order("publicada_em", { ascending: false })
    .limit(20);
  if (error) return { success: false, message: error.message, data: [] };
  return {
    success: true,
    data: (data ?? []).map(({ noticia_anexos: a, ...n }) => ({ ...n, anexos: a?.[0]?.count ?? 0 })),
  };
}

/**
 * Publica. O PDF do comunicado e os anexos só sobem depois, porque a pasta
 * leva o id da notícia. O que falhar não derruba a notícia: ela fica no ar e
 * a resposta diz o que não subiu (`semPdf`, `falharam`), para a tela avisar.
 * `aoProgredir(feitos, total)` acompanha o envio dos anexos.
 */
export async function publicarNoticia({ titulo, texto, tamanhoTexto = null, fixada, pdf, anexos = [], aoProgredir }) {
  const { data, error } = await supabase
    .from("noticias")
    // tamanho_texto (0116): só vai quando escolhido; vazio = o padrão do app.
    .insert({ titulo: titulo.trim(), texto: texto.trim(), fixada: Boolean(fixada), ...(tamanhoTexto ? { tamanho_texto: tamanhoTexto } : {}) })
    .select("id")
    .single();
  if (error) return { success: false, message: error.message };
  const id = data.id;

  let semPdf = false;
  if (pdf) {
    semPdf = true;
    const envio = await enviarAnexo("noticias", id, pdf, "comunicado.pdf");
    if (envio.success) {
      const { error: e2 } = await supabase.from("noticias").update({ caminho_pdf: envio.caminho }).eq("id", id);
      semPdf = Boolean(e2);
    }
  }

  const falharam = await subirAnexos(id, anexos, 0, aoProgredir);
  return { success: true, id, semPdf, falharam };
}

/**
 * Sobe os arquivos para a pasta da notícia e grava cada um na tabela, a partir
 * da `ordemInicial`. Devolve os nomes dos que não subiram.
 */
async function subirAnexos(id, arquivos, ordemInicial, aoProgredir) {
  const falharam = [];
  const total = arquivos.length;
  aoProgredir?.(0, total);
  for (let i = 0; i < total; i++) {
    const arquivo = arquivos[i];
    const tipo = tipoDoAnexo(arquivo);
    const ordem = ordemInicial + i;
    const caminho = `${id}/${Date.now()}-${ordem}-${nomeLimpo(arquivo.name)}`;
    const ok =
      tipo &&
      !(await supabase.storage.from(MIDIA).upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })).error &&
      !(
        await supabase.from("noticia_anexos").insert({
          noticia_id: id, caminho, tipo, nome: String(arquivo.name || "arquivo").slice(0, 160), tamanho: arquivo.size, ordem,
        })
      ).error;
    if (!ok) falharam.push(arquivo.name);
    aoProgredir?.(i + 1, total);
  }
  return falharam;
}

/**
 * Acrescenta anexos numa notícia que já está no app (23/11/2026). Entram
 * depois dos que já existem. O banco deixa a administração inserir (0082).
 */
export async function acrescentarAnexosNaNoticia(id, arquivos, { ordemInicial = 0, aoProgredir } = {}) {
  const falharam = await subirAnexos(id, arquivos, ordemInicial, aoProgredir);
  return { success: falharam.length < arquivos.length, falharam };
}

/**
 * Todas as notícias, publicadas e arquivadas (retiradas), da mais nova para a
 * mais antiga: a janela "Notícias no app" do Comunicado filtra entre elas.
 */
export async function listarTodasAsNoticias() {
  const { data, error } = await supabase
    .from("noticias")
    .select("id, titulo, texto, tamanho_texto, fixada, publicada_em, retirada_em, caminho_pdf, noticia_anexos(count)")
    .order("publicada_em", { ascending: false })
    .order("id", { ascending: false })
    .limit(300);
  if (error) return { success: false, message: error.message, data: [] };
  return {
    success: true,
    data: (data ?? []).map(({ noticia_anexos: a, ...n }) => ({ ...n, anexos: a?.[0]?.count ?? 0 })),
  };
}

/** Edita o que o morador lê: título, texto (puro, com as quebras) e tamanho da letra (0116). */
export async function editarNoticia(id, { titulo, texto, tamanhoTexto = null }) {
  const { error } = await supabase
    .from("noticias")
    .update({ titulo: titulo.trim(), texto: texto.trim(), tamanho_texto: tamanhoTexto || null })
    .eq("id", id);
  return error ? { success: false, message: error.message } : { success: true };
}

/**
 * Volta a publicar uma notícia arquivada. O gatilho do 0079 limpa quem
 * retirou; a data de publicação continua a original. O PDF e os anexos ficam
 * no endereço novo que a retirada deu, que o app lê normalmente.
 */
export async function republicarNoticia(id) {
  const { error } = await supabase.from("noticias").update({ retirada_em: null }).eq("id", id);
  return error ? { success: false, message: error.message } : { success: true };
}

/**
 * Os anexos de uma notícia (0082), na ordem do app, cada um com um link
 * assinado para ver (imagem e vídeo em miniatura, PDF para abrir). O PDF do
 * comunicado não está aqui: ele é o `caminho_pdf` da própria notícia.
 */
export async function anexosDaNoticia(id) {
  const { data, error } = await supabase
    .from("noticia_anexos")
    .select("id, caminho, tipo, nome, tamanho, ordem")
    .eq("noticia_id", id)
    .order("ordem")
    .order("id");
  if (error) return { success: false, data: [] };
  const lista = data ?? [];
  const caminhos = lista.map((a) => a.caminho);
  const { data: links } = caminhos.length
    ? await supabase.storage.from(MIDIA).createSignedUrls(caminhos, 60 * 10)
    : { data: [] };
  const url = new Map((links ?? []).filter((l) => l?.signedUrl).map((l) => [l.path, l.signedUrl]));
  return { success: true, data: lista.map((a) => ({ ...a, url: url.get(a.caminho) ?? null })) };
}

/** Link para abrir o PDF do comunicado de uma notícia (bucket `anexos`). */
export const linkDoPdfDaNoticia = (caminho) => urlDoAnexo({ caminho_storage: caminho });

/**
 * Tira um anexo da notícia (0117). Primeiro o arquivo: o síndico apaga do
 * bucket; os outros cargos não apagam (política do 0082), então o arquivo
 * muda de endereço, o que derruba a cópia do CDN. Depois a linha: sem ela, o
 * morador não abre mais (anexos_da_noticia só lê a tabela).
 */
export async function tirarAnexoDaNoticia(anexo) {
  const { data: apagou } = await supabase.storage.from(MIDIA).remove([anexo.caminho]);
  if (!apagou?.length) {
    const pasta = anexo.caminho.split("/")[0];
    const novo = `${pasta}/removido-${Date.now()}-${anexo.caminho.split("/").pop()}`.slice(0, 200);
    await supabase.storage.from(MIDIA).move(anexo.caminho, novo);
  }
  const { error } = await supabase.from("noticia_anexos").delete().eq("id", anexo.id);
  return error ? { success: false, message: error.message } : { success: true };
}

/** Tira o PDF do comunicado da notícia: apaga o arquivo e limpa o caminho. */
export async function tirarPdfDaNoticia(id, caminho) {
  const { error } = await supabase.from("noticias").update({ caminho_pdf: null }).eq("id", id);
  if (error) return { success: false, message: error.message };
  // O arquivo: a administração apaga no bucket `anexos` (pasta noticias/).
  const r = await removerAnexo(caminho);
  return { success: true, arquivoFicou: !r.success };
}

export async function fixarNoticia(id, fixada) {
  const { error } = await supabase.from("noticias").update({ fixada }).eq("id", id);
  return error ? { success: false, message: error.message } : { success: true };
}

/**
 * Retira e muda o PDF de endereço.
 *
 * O banco já nega o PDF da notícia retirada, mas o CDN do Storage guarda a
 * resposta de quem baixou enquanto ela estava no ar e devolve de novo sem
 * reavaliar a permissão (nem com cache-control: provado no
 * verificar-noticias). Apagar o arquivo do endereço antigo é o que derruba
 * essa cópia; o PDF segue guardado para a administração no endereço novo.
 */
export async function retirarNoticia(id) {
  // O valor da data é do banco (gatilho); aqui só se diz "retirar".
  const { data, error } = await supabase
    .from("noticias")
    .update({ retirada_em: new Date().toISOString() })
    .eq("id", id)
    .select("caminho_pdf")
    .single();
  if (error) return { success: false, message: error.message };

  // Os anexos (0082) também mudam de endereço, pelo mesmo motivo do PDF.
  const anexosNoAr = await tirarAnexosDoAr(id);

  if (!data?.caminho_pdf) return { success: true, pdfNoAr: anexosNoAr > 0 };

  const novo = `noticias/${id}/retirada-${Date.now()}.pdf`;
  const { error: e1 } = await supabase.storage.from("anexos").move(data.caminho_pdf, novo);
  if (e1) return { success: true, pdfNoAr: true };
  const { error: e2 } = await supabase.from("noticias").update({ caminho_pdf: novo }).eq("id", id);
  return { success: true, pdfNoAr: anexosNoAr > 0, ...(e2 ? { caminhoNaoGravado: novo } : {}) };
}

/** Move cada anexo da notícia para um endereço novo. Devolve quantos não mudaram. */
async function tirarAnexosDoAr(id) {
  const { data: anexos, error } = await supabase.from("noticia_anexos").select("id, caminho").eq("noticia_id", id);
  if (error) return 1;
  let falhas = 0;
  for (const a of anexos ?? []) {
    const novo = `${id}/retirada-${Date.now()}-${a.id}-${a.caminho.split("/").pop()}`.slice(0, 200);
    const { error: e1 } = await supabase.storage.from(MIDIA).move(a.caminho, novo);
    if (e1) { falhas++; continue; }
    const { error: e2 } = await supabase.from("noticia_anexos").update({ caminho: novo }).eq("id", a.id);
    if (e2) falhas++;
  }
  return falhas;
}

/** Parágrafos (linha em branco) e, dentro deles, linhas (Enter): como o app mostra. */
export const paragrafosDoTexto = (texto) =>
  String(texto ?? "").replace(/\r\n?/g, "\n").split(/\n\s*\n/)
    .map((p) => p.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((linhas) => linhas.length);
