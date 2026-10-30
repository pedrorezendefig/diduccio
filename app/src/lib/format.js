/**
 * Formatação e máscaras compartilhadas.
 *
 * Estas funções estavam duplicadas em Festas, Churrasqueira, Piscina e
 * Mudanças, com implementações idênticas verificadas byte a byte antes da
 * extração. São puras: entrada e saída determinísticas, sem estado.
 */

/** Remove tudo que não é dígito. */
export const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/**
 * 12345678901 -> 123.456.789-01
 *
 * Formata PARCIAL, e essa é a diferença que importa: a versão anterior usava um
 * regex que exigia os 11 dígitos, então quem digitava via texto cru até o
 * último número e a máscara aparecia de uma vez no fim. Com 11 dígitos o
 * resultado é idêntico ao de antes — o que muda é só o caminho até lá.
 */
export const maskCPF = (v) => {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

/** 121231234 -> 12.123.123-4 */
export const maskRG = (v) => {
  const d = soDigitos(v).slice(0, 10);
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{1})/, "$1.$2.$3-$4");
};

/** 11987654321 -> (11) 98765-4321 */
export const maskPhone = (v) => {
  const d = soDigitos(v).slice(0, 11);
  return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
};

/**
 * CPF parcialmente oculto para exibição em lista.
 * Mantém os 3 primeiros e os 2 do dígito: 123.***.***-01
 * Devolve o valor original quando não tem 11 dígitos.
 */
export const maskCPFPrivacy = (cpf) => {
  if (!cpf) return "";
  const d = soDigitos(cpf);
  if (d.length !== 11) return cpf;
  return `${d.substring(0, 3)}.***.***-${d.substring(9)}`;
};

/** RG parcialmente oculto: 12.***.***-4 */
export const maskRGPrivacy = (rg) => {
  if (!rg) return "";
  const d = soDigitos(rg);
  if (d.length < 5) return rg;
  return `${d.substring(0, 2)}.***.***-${d.slice(-1)}`;
};

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------
//
// O banco guarda `date`, `timestamptz` e `time` — tipos nativos, que não têm
// formato nenhum. A API devolve ISO ("2026-03-22"), que é o que ordena certo e
// toda biblioteca entende. O padrão brasileiro é assunto de exibição, e é aqui
// que ele acontece — num lugar só, para as telas não reinventarem cada uma o
// seu.

/**
 * `date` do Postgres -> "22/03/2026".
 *
 * Recorta a string em vez de passar por `new Date`, e isso é essencial:
 * `new Date("2026-03-22")` é interpretado como meia-noite UTC, e formatado em
 * Brasília (-03:00) vira 21/03/2026. Um dia a menos, em toda data do sistema.
 */
export const dataBR = (valor) => {
  if (!valor) return "";
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(valor);
};

/**
 * `timestamptz` do Postgres -> "02/06/2026 11:00:00".
 *
 * Aqui `new Date` é o certo: a string carrega o deslocamento ("-03:00" ou "Z"),
 * então o instante é inequívoco. Fixamos a exibição em São Paulo para que o
 * horário não mude se alguém abrir o sistema viajando.
 */
export const dataHoraBR = (valor, { comSegundos = true } = {}) => {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor);
  return d
    .toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      ...(comSegundos ? { second: "2-digit" } : {}),
    })
    .replace(",", ""); // pt-BR separa data e hora por vírgula; aqui não queremos
};

/**
 * Qualquer data do sistema -> milissegundos, para ORDENAR e FILTRAR.
 *
 * Existe porque a migração trocou o formato debaixo das telas. Toda ordenação
 * daqui foi escrita para "DD/MM/AAAA HH:mm", que é o que a planilha devolvia;
 * o Postgres devolve "2026-05-16". Um `"2026-05-16".split("/")` não estoura —
 * devolve um pedaço só, o dia vira a string inteira, o mês vira `undefined`, e
 * `new Date` disso é Invalid Date. A tela não quebra: ela apenas ordena errado
 * e filtra errado, para sempre, sem nada no console.
 *
 * (Num ponto do salão de festas o mesmo descuido estourava de verdade, porque
 * havia um segundo `.split` em cima do `undefined`. Foi o único que apareceu.)
 *
 * Aceita os dois formatos de propósito: enquanto houver tela não convertida, os
 * dois circulam ao mesmo tempo.
 *
 * Tudo em UTC — não para estar "certo" em Brasília, mas para ser CONSISTENTE:
 * o valor só serve para comparar com outro valor desta mesma função.
 */
export const dataParaMs = (valor) => {
  if (!valor) return 0;
  const s = String(valor).trim();

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] ?? 0), +(iso[5] ?? 0));

  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (br) return Date.UTC(+br[3], +br[2] - 1, +br[1], +(br[4] ?? 0), +(br[5] ?? 0));

  // Sobra: timestamptz completo com fuso ("2026-02-20T17:52:36+00:00") já foi
  // pego pelo primeiro caso; o que chegar aqui é formato inesperado.
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

/** `time` do Postgres ("17:00:00") -> "17:00". */
export const horaBR = (valor) => {
  if (!valor) return "";
  const m = String(valor).match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : String(valor);
};

/** Número para moeda brasileira. */
export const formatCurrency = (val) =>
  Number(val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Texto sem acento, sem caixa e sem espaço nas pontas, para comparar e buscar.
 *
 * NFD separa a letra do acento e a classe seguinte remove as marcas
 * combinantes (faixa U+0300 a U+036F, escrita com os caracteres literais —
 * eles são invisíveis no editor, então há teste cobrindo o comportamento).
 * Serve para que "Jônas" case com "jonas" na busca e para que o nome do
 * usuário case com o nome gravado no log.
 */
export const normalizarTexto = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
