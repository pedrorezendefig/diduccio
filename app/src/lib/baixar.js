/**
 * Entrega ao usuário um arquivo gerado dentro do navegador.
 *
 * O jeito antigo — `link.href = dataUrl; link.click()` com a âncora solta na
 * memória — funciona no desktop e falha calado no celular, que foi o defeito
 * relatado na carteirinha da piscina. São dois motivos somados:
 *
 *  1. a âncora precisa estar NO documento. Chrome de Android ignora clique
 *     programático em elemento que nunca foi inserido na página;
 *  2. `data:` de imagem em pixelRatio 2 passa de 1 MB de texto na URL, e o
 *     Safari recusa navegar para `data:` desse tamanho. `blob:` não tem esse
 *     teto porque o dado não viaja dentro do endereço.
 *
 * E no celular quase ninguém quer um arquivo na pasta Downloads: quer a foto
 * salva na galeria ou mandada no WhatsApp. Por isso, em tela de toque, a folha
 * nativa de compartilhamento vem primeiro — é ela que oferece "Salvar imagem".
 * No desktop nada muda: continua baixando o arquivo, que é o que o botão diz.
 */

import { ehTelaDeToque } from "./dispositivo";

export const COMPARTILHADO = "compartilhado";
export const CANCELADO = "cancelado";
export const BAIXADO = "baixado";

/**
 * @returns {Promise<"compartilhado"|"cancelado"|"baixado">} o que aconteceu, para
 * a tela decidir se avisa algo. Cancelar a folha de compartilhamento é escolha
 * do usuário, não erro, e não deve virar toast vermelho.
 */
export async function entregarArquivo(blob, nome, opcoes = {}) {
  const nav = opcoes.nav ?? (typeof navigator === "undefined" ? null : navigator);
  const doc = opcoes.doc ?? (typeof document === "undefined" ? null : document);
  const criarUrl = opcoes.criarUrl ?? ((b) => URL.createObjectURL(b));
  const revogarUrl = opcoes.revogarUrl ?? ((u) => URL.revokeObjectURL(u));
  const celular = opcoes.celular ?? ehTelaDeToque();

  if (!blob) throw new Error("Não há arquivo para entregar.");
  if (!doc) throw new Error("Sem documento onde ancorar o download.");

  if (celular && typeof nav?.canShare === "function" && typeof nav?.share === "function") {
    const arquivo = new File([blob], nome, { type: blob.type || "application/octet-stream" });
    // `canShare` com arquivo dá false em navegador que compartilha só texto —
    // chamar `share` ali derrubaria a função sem baixar nada.
    if (nav.canShare({ files: [arquivo] })) {
      try {
        await nav.share({ files: [arquivo], title: nome });
        return COMPARTILHADO;
      } catch (err) {
        if (err?.name === "AbortError") return CANCELADO;
        // Qualquer outro erro (iOS recusa `share` fora do gesto do toque, por
        // exemplo) não pode terminar sem arquivo: segue para o download.
      }
    }
  }

  const url = criarUrl(blob);
  const link = doc.createElement("a");
  link.href = url;
  link.download = nome;
  link.rel = "noopener";
  link.style.display = "none";
  doc.body.appendChild(link);
  link.click();
  link.remove();
  // Revogar na hora corta o download em andamento em alguns navegadores.
  setTimeout(() => revogarUrl(url), 60000);
  return BAIXADO;
}

/** Tira do nome do morador o que sistema de arquivos recusa. */
export function nomeDeArquivo(base, extensao) {
  const limpo = String(base ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return `${limpo || "arquivo"}.${extensao}`;
}
