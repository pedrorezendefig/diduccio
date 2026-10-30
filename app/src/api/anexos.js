// Anexos: Supabase Storage é a origem; o Drive ficou como cópia de segurança.
//
// Os 402 arquivos antigos (204 fotos de piscina, 193 atestados, 1 ata, 4
// uploads) foram copiados para o bucket; 399 chegaram, 3 já não existiam mais
// no Drive antes da migração. Nada foi apagado de lá, e `url_drive` / `file_id`
// continuam gravados — por isso quase toda linha hoje tem os DOIS endereços.
//
// `urlDoAnexo` decide pela forma do registro, e não por uma data de corte:
// havendo `caminho_storage`, ele vence; `url_drive` é o que sobra para as
// poucas linhas que não vieram.
import { supabase } from "./supabase";

const BUCKET = "anexos";

/** Segundos de vida da URL assinada. */
const VALIDADE = 60 * 10;

/**
 * Caminho de um anexo dentro do bucket.
 *
 * `<modulo>/<id>/<arquivo>` — e a primeira pasta NÃO é organização: é o que as
 * políticas do 0017 leem para decidir quem alcança o arquivo. Mudar o formato
 * aqui sem mexer lá abre ou fecha acesso sem querer.
 */
export function caminhoAnexo(modulo, idRegistro, nomeArquivo) {
  const limpo = String(nomeArquivo)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Barra viraria pasta nova e mudaria o módulo — que é quem decide a
    // permissão. O resto é higiene de nome de arquivo.
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${modulo}/${idRegistro}/${Date.now()}-${limpo}`;
}

/**
 * Sobe um arquivo. Devolve `{ success, caminho, message }`.
 *
 * Não lança: as telas já tratam `{ success: false }` em toda gravação, e um
 * caminho diferente para anexo só criaria mais um jeito de errar.
 */
export async function enviarAnexo(modulo, idRegistro, arquivo, nomeSugerido) {
  const { blob, nome } = normalizar(arquivo, nomeSugerido);
  if (!blob) return { success: false, message: "Arquivo inválido." };

  const caminho = caminhoAnexo(modulo, idRegistro, nome);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, blob, { contentType: blob.type, upsert: false });

  if (error) return { success: false, message: error.message };
  return { success: true, caminho, nome };
}

/** Extensão a partir do mime, para o arquivo abrir no programa certo depois. */
const EXTENSAO = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/heic": "heic", "application/pdf": "pdf",
};

/**
 * Aceita File (input de arquivo) ou data URL em base64.
 *
 * As telas herdadas do Apps Script leem o arquivo com FileReader e guardam
 * "data:application/pdf;base64,..." no estado, porque era assim que o anexo
 * viajava no corpo da requisição. O Storage quer bytes, não texto.
 */
function normalizar(arquivo, nomeSugerido) {
  if (arquivo instanceof Blob) {
    return { blob: arquivo, nome: nomeSugerido || arquivo.name || "arquivo" };
  }
  if (typeof arquivo !== "string" || !arquivo.startsWith("data:")) {
    return { blob: null, nome: "" };
  }

  const [cabecalho, base64] = arquivo.split(",");
  const tipo = cabecalho.match(/^data:([^;]+)/)?.[1] ?? "application/octet-stream";
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);

  return {
    blob: new Blob([bytes], { type: tipo }),
    nome: nomeSugerido || `anexo.${EXTENSAO[tipo] ?? "bin"}`,
  };
}

/**
 * URL para exibir ou baixar um anexo.
 *
 * O bucket é privado — ali dentro há atestado médico —, então não existe URL
 * permanente. Cada exibição pede uma assinada, que expira. Quem não tem
 * permissão recebe erro do próprio Storage, não uma imagem quebrada.
 */
export async function urlDoAnexo(registro) {
  // O bucket vem PRIMEIRO, e a ordem aqui é o detalhe que decide se a tela
  // mostra o arquivo ou um quadrado vazio. Depois da migração dos arquivos do
  // Drive, a mesma linha tem `url_drive` (a origem, preservada) e
  // `caminho_storage` (a cópia que o sistema realmente usa). Perguntando pelo
  // Drive antes, toda linha migrada continuaria apontando para lá — onde o
  // `getFoto` já não responde, porque não existe mais quem emita a sessão que
  // ele exige. Arquivo migrado, tela em branco, e nenhum erro em lugar nenhum.
  if (registro?.caminho_storage) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(registro.caminho_storage, VALIDADE);
    if (!error) return data.signedUrl;
  }

  // Só quem não foi migrado cai aqui — e continua sendo lido do Drive, como
  // sempre foi. `url_drive` nunca é apagado: é a cópia de segurança.
  return registro?.url_drive ?? null;
}

/**
 * Remove um anexo do bucket.
 *
 * Conferir `error` NÃO basta, e essa é a armadilha específica do Storage: o
 * `remove` responde sem erro nenhum quando a política barra — ele devolve a
 * lista do que REALMENTE saiu, que nesse caso vem vazia. Quem só olha o `error`
 * conclui "apagado" e deixa o arquivo lá, alcançável por URL assinada. Num
 * cadastro de piscina isso é o atestado médico de alguém continuar disponível
 * depois de o sistema afirmar que apagou.
 */
export async function removerAnexo(caminho) {
  if (!caminho) return { success: true };
  const { data, error } = await supabase.storage.from(BUCKET).remove([caminho]);
  if (error) return { success: false, message: error.message };
  if (!data?.length) return { success: false, message: "O arquivo não foi removido (sem permissão)." };
  return { success: true };
}

/**
 * Remove TUDO o que estiver na pasta de um registro: `<modulo>/<id>/`.
 *
 * Apagar só os caminhos que a linha guarda deixaria para trás o que ela já não
 * referencia — foto trocada antes do 0018, upload que falhou no meio, resto de
 * tentativa. Nada disso aparece em tela nenhuma, e é exatamente por isso que
 * ninguém iria notar: some do sistema e continua no bucket.
 *
 * Não mexe no Google Drive. Os arquivos de lá seguem intocados por decisão do
 * Lucas — o Drive é a cópia de segurança —, então excluir um cadastro migrado
 * limpa a cópia do bucket e deixa a original no Drive.
 */
export async function removerAnexosDoRegistro(modulo, idRegistro) {
  const pasta = `${modulo}/${idRegistro}`;
  const { data: itens, error } = await supabase.storage.from(BUCKET).list(pasta, { limit: 100 });
  if (error) return { success: false, message: error.message, removidos: 0 };
  if (!itens?.length) return { success: true, removidos: 0 };

  const caminhos = itens.map((i) => `${pasta}/${i.name}`);
  const { data: saiu, error: erroRemover } = await supabase.storage.from(BUCKET).remove(caminhos);
  if (erroRemover) return { success: false, message: erroRemover.message, removidos: 0 };

  // Mesma razão de `removerAnexo`: a lista devolvida é a verdade, não o `error`.
  const removidos = saiu?.length ?? 0;
  return removidos === caminhos.length
    ? { success: true, removidos }
    : { success: false, removidos, message: `${caminhos.length - removidos} arquivo(s) não saíram do bucket.` };
}
