// A capa ilustrada do Início: o céu do condomínio na hora de Brasília. Tudo
// aqui é cálculo puro (recebe a hora por parâmetro), para os testes não
// dependerem do relógio de quem roda.

/** A hora de Brasília em horas decimais: 13:30 vira 13.5. */
export function horaEmBrasilia(agora = Date.now()) {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "numeric", minute: "numeric", hourCycle: "h23",
  }).formatToParts(new Date(agora));
  const h = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(partes.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}

const volta = (h) => ((h % 24) + 24) % 24;

/** "Madrugada", "Amanhecer", "Manhã", "Tarde", "Entardecer" ou "Noite". */
export function periodoDoDia(h) {
  const x = volta(h);
  if (x < 5) return "Madrugada";
  if (x < 7) return "Amanhecer";
  if (x < 12) return "Manhã";
  if (x < 17) return "Tarde";
  if (x < 19) return "Entardecer";
  return "Noite";
}

/** "21:05" a partir de 21.08. */
export function relogio(h) {
  const x = volta(h);
  const total = Math.round(x * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Quadros-chave do dia. Entre um e outro as cores são misturadas, então a capa
 * muda devagar ao longo da hora, sem degrau. As cores são da ilustração (céu,
 * prédios, palmeiras) e não do sistema: o céu não segue o tema claro/escuro.
 *
 *   [hora, céu topo, céu meio, céu base, prédios, palmeiras, janelas acesas, estrelas, astro]
 */
const QUADROS = [
  // Noite: o topo é verde bem escuro, não preto, para o céu não virar uma tarja.
  [0, "#24110E", "#241310", "#301A16", "#130907", "#040A06", 0.9, 1, "#FEE4DC"],
  [5, "#1A0D0B", "#3A221E", "#525252", "#1A0C0A", "#100706", 0.7, 0.6, "#FEE4DC"],
  [6.5, "#2B4A5E", "#C98E6A", "#F2C38A", "#2E1D1A", "#1C100E", 0.25, 0, "#FFC27A"],
  [9, "#6FA7C9", "#A9CFD9", "#EEDCD9", "#4A322E", "#2E1D1A", 0, 0, "#FFF3D0"],
  [12, "#5B9DC8", "#9CCBE0", "#EFE0DD", "#4A302C", "#301C18", 0, 0, "#FFF7DD"],
  [16, "#6C9EC0", "#CFBBB8", "#EBD9A8", "#442E2A", "#2B1A17", 0, 0, "#FFE7A8"],
  [18, "#3C4E6E", "#D0835A", "#F0B36A", "#2C1E1C", "#1A100E", 0.4, 0, "#FFB066"],
  [19.5, "#142238", "#2E3F55", "#6B5A5A", "#1A100E", "#110908", 0.8, 0.5, "#FEE4DC"],
  [21, "#10212A", "#12262A", "#2E1B18", "#140A08", "#050C07", 0.9, 1, "#FEE4DC"],
  [24, "#24110E", "#241310", "#301A16", "#130907", "#040A06", 0.9, 1, "#FEE4DC"],
];

const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export function misturar(a, b, t) {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** As cores e as intensidades da capa numa hora qualquer. */
export function ceuEm(h) {
  const x = volta(h);
  let i = QUADROS.findIndex((q) => q[0] > x);
  if (i < 1) i = 1;
  const a = QUADROS[i - 1], b = QUADROS[i];
  const t = (x - a[0]) / (b[0] - a[0]);
  const num = (k) => a[k] + (b[k] - a[k]) * t;
  return {
    topo: misturar(a[1], b[1], t), meio: misturar(a[2], b[2], t), base: misturar(a[3], b[3], t),
    predios: misturar(a[4], b[4], t), palmeiras: misturar(a[5], b[5], t),
    janelas: num(6), estrelas: num(7), astro: misturar(a[8], b[8], t),
  };
}

/**
 * Onde o astro está: o sol faz um arco das 6h às 18h e a lua o mesmo arco das
 * 18h às 6h. `f` vai de 0 (nascendo, à esquerda) a 1 (se pondo, à direita).
 */
export function astroEm(h) {
  const x = volta(h);
  const dia = x >= 6 && x < 18;
  const f = dia ? (x - 6) / 12 : volta(x - 18) / 12;
  return { dia, f, altura: Math.sin(Math.PI * f) };
}
