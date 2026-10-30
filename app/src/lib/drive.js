/**
 * Google Drive e planilha: helpers compartilhados.
 *
 * Estavam duplicados em Festas, Churrasqueira, Piscina e Mudanças.
 */

/** Extrai o ID de um arquivo do Drive a partir de qualquer formato de URL. */
export const extrairIdDrive = (url) => {
  const m = String(url ?? "").match(/[-\w]{25,}/);
  return m ? m[0] : null;
};

/**
 * Converte a URL do Drive na URL de exibição adequada.
 *
 * ATENÇÃO, mudança de comportamento na Piscina: as quatro páginas tinham
 * versões diferentes desta função. Festas, Churrasqueira e Mudanças tratavam
 * PDF separadamente e usavam o endpoint oficial de miniatura; a Piscina não
 * tratava PDF e apontava para lh3.googleusercontent.com, um formato antigo
 * (a linha com o endpoint novo estava comentada logo abaixo, sinal de
 * migração interrompida).
 *
 * Unificamos na versão do Festas, que é a correta: com isso os PDFs anexados
 * na Piscina passam a abrir, o que antes não acontecia.
 */
export const converterUrlDrive = (url) => {
  if (!url) return "";
  if (String(url).startsWith("data:image")) return url;

  const id = extrairIdDrive(url);

  // PDF não tem miniatura: abre no visualizador do Drive.
  if (String(url).toLowerCase().includes(".pdf")) {
    return id ? `https://drive.google.com/file/d/${id}/view` : url;
  }

  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w300` : url;
};

/**
 * Neutraliza fórmula em célula exportada.
 * "=CMD()" vira "'=CMD()", texto puro, para o Excel não executar.
 */
export const sanitizarCelula = (v) => {
  if (v == null) return v;
  const s = v.toString();
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

/** Tamanho máximo aceito em upload de anexo. */
export const MAX_ANEXO_BYTES = 10 * 1024 * 1024;

/**
 * Valida o anexo antes do upload.
 * Devolve { ok: true } ou { ok: false, motivo: "mensagem para o usuário" }.
 *
 * Diferente da versão antiga, NÃO chama alert(): quem chama decide como
 * mostrar, o que permite usar Toast ou erro inline no campo.
 */
export const validarAnexo = (file) => {
  if (!file) return { ok: false, motivo: "Nenhum arquivo selecionado." };

  const tipo = (file.type || "").toLowerCase();
  const aceito = tipo.startsWith("image/") || tipo === "application/pdf";
  if (!aceito) {
    return { ok: false, motivo: "Só é possível anexar imagem ou PDF." };
  }

  if (file.size > MAX_ANEXO_BYTES) {
    return { ok: false, motivo: "O arquivo passa de 10 MB. Reduza a resolução e tente de novo." };
  }

  return { ok: true };
};
