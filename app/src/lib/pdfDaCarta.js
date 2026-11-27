import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * A folha da notificação em PDF A4, para ir anexada ao e-mail (0077).
 *
 * Mesmo caminho do Comunicado (html2canvas + jsPDF), com duas diferenças: a
 * carta pode passar de uma página, então a imagem é fatiada em quantas folhas
 * precisar; e sai em JPEG, porque um PNG de A4 em escala 2 pesa megabytes e o
 * e-mail tem teto de tamanho.
 *
 * Fotografa um CLONE fora da tela, com largura de A4: a folha da tela está
 * dentro de um modal com rolagem e largura da janela, e fotografá-la direto
 * sairia cortada ou espremida.
 *
 * Devolve o PDF em base64, sem o prefixo `data:`.
 */
export async function pdfDaFolha(elemento) {
  if (!elemento) throw new Error("A folha da carta não está na tela.");
  const clone = elemento.cloneNode(true);
  Object.assign(clone.style, {
    position: "absolute",
    left: "-9999px",
    top: "0",
    width: "794px",
    maxWidth: "none",
    margin: "0",
    border: "none",
    borderRadius: "0",
    boxShadow: "none",
    padding: "76px 76px",
    background: "#fff",
  });
  document.body.appendChild(clone);
  try {
    const canvas = await html2canvas(clone, { scale: 2, useCORS: true, width: 794, windowWidth: 794, backgroundColor: "#fff" });
    const pdf = new jsPDF("p", "mm", "a4");
    const larguraMm = 210;
    const alturaPaginaMm = 297;
    const alturaImagemMm = (canvas.height * larguraMm) / canvas.width;
    const imagem = canvas.toDataURL("image/jpeg", 0.88);
    let deslocamento = 0;
    pdf.addImage(imagem, "JPEG", 0, 0, larguraMm, alturaImagemMm);
    while (alturaImagemMm - deslocamento > alturaPaginaMm + 1) {
      deslocamento += alturaPaginaMm;
      pdf.addPage();
      pdf.addImage(imagem, "JPEG", 0, -deslocamento, larguraMm, alturaImagemMm);
    }
    return pdf.output("datauristring").split(",")[1];
  } finally {
    document.body.removeChild(clone);
  }
}
