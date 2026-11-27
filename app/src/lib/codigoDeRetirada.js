// O código de retirada da encomenda, como a portaria o recebe: digitado ou lido
// do QR que o morador mostra no app (o QR leva só o código, 0063).
//
// O alfabeto é o do sorteio no banco (`sortear_cod_entrega`, 0020): letras sem
// o O e números de 2 a 9. Tudo o que não for exatamente isso é recusado: QR de
// outra coisa (um site, um boleto) não pode virar "código" na tela.

const FORMATO = /^[A-NP-Z2-9]{5}$/;

/** O código limpo, ou null se o texto não for um código de retirada. */
export function codigoDeRetirada(texto) {
  const c = String(texto ?? "").trim().toUpperCase().replace(/[\s-]/g, "");
  return FORMATO.test(c) ? c : null;
}

// Desde 2026-11-04 o QR do app leva também quem o mostra: "7KQ3M.42", em que
// 42 é o id do cadastro no app (`moradores_app.id`). O código é da encomenda e
// é o mesmo para todos do apartamento; o número diz se é o titular ou um
// dependente, e a portaria preenche o nome e o CPF dessa pessoa (0086).
// QR antigo, só com o código, continua valendo.
const QR = /^([A-NP-Z2-9]{5})(?:\.(\d{1,12}))?$/;

/** { codigo, idApp } do QR lido, ou null se não for QR de encomenda. */
export function lerQRDeRetirada(texto) {
  const t = String(texto ?? "").trim().toUpperCase().replace(/[\s-]/g, "");
  const m = QR.exec(t);
  return m ? { codigo: m[1], idApp: m[2] ? Number(m[2]) : null } : null;
}
