import * as htmlToImage from "html-to-image";
import { carregarComoDataUrl } from "../DriveImage";

/** A carteirinha é desenhada sempre neste tamanho, o da arte (1011×639). */
export const LARGURA = 1011;
export const ALTURA = 639;

/** Lado do recorte gerado, em px: sobra para os 2× do download. */
const LADO_RECORTE = 600;

/** Recorta `img` no quadrado { x, y, lado } (px da foto) e devolve um JPEG. */
export function recortar(img, { x, y, lado }) {
  const canvas = document.createElement("canvas");
  canvas.width = LADO_RECORTE;
  canvas.height = LADO_RECORTE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#E8DEDC";
  ctx.fillRect(0, 0, LADO_RECORTE, LADO_RECORTE);
  ctx.drawImage(img, x, y, lado, lado, 0, 0, LADO_RECORTE, LADO_RECORTE);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Gera o PNG do cartão (2022×1278). A foto entra como base64 antes da captura:
 * com URL de fora, o html-to-image sujaria o canvas e o arquivo sairia sem ela.
 */
export async function imagemDaCarteirinha(node, urlFoto) {
  if (!node) throw new Error("A carteirinha não está na tela.");
  let restaurar = () => {};
  try {
    const base64 = urlFoto ? await carregarComoDataUrl(urlFoto) : null;
    const img = base64 ? node.querySelector(".cart__foto img") : null;
    if (img) {
      const original = img.src;
      restaurar = () => { img.src = original; };
      img.src = base64;
      await new Promise((ok) => {
        if (img.complete) return ok();
        img.onload = ok; img.onerror = ok;
        setTimeout(ok, 1500);
      });
    }
    // A Barlow carrega sob demanda: sem esperar, a primeira carteirinha baixada
    // podia sair na fonte reserva.
    await document.fonts?.ready;
    const opcoes = {
      width: LARGURA,
      height: ALTURA,
      pixelRatio: 2,
      skipAutoScale: true,
      backgroundColor: "#ffffff",
      style: { transform: "none" },
    };
    // Duas passadas de propósito: o Safari (o do iPhone inclusive) devolve a
    // primeira captura sem as imagens que ainda não estavam no cache dele.
    await htmlToImage.toBlob(node, opcoes);
    const blob = await htmlToImage.toBlob(node, opcoes);
    if (!blob) throw new Error("O navegador não conseguiu gerar a imagem.");
    return blob;
  } finally {
    restaurar();
  }
}
