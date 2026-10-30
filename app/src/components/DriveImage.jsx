import React, { useState, useEffect } from "react";
import { FileText } from "lucide-react";
import { sessionParam } from "../auth/session";
import { reportarErro } from "../api/reporter";
import { API_URL, TOKEN } from "../api/config";

// ============================================================
// Exibição segura de arquivos do Google Drive (N7/LGPD).
// Busca os bytes pelo backend autenticado (action=getFoto) em vez de depender
// de URLs públicas/thumbnail do Drive — funciona com os arquivos PRIVADOS.
// Extraído de Piscina.jsx para uso em todas as telas.
// ============================================================

export const PIXEL_TRANSPARENTE = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

export function extrairFileIdDrive(source) {
  if (!source) return "";
  const s = source.toString();
  if (s.startsWith("data:")) return "";
  if (s.includes("id=")) return s.split("id=")[1].split("&")[0];
  const m = s.match(/\/d\/([\w-]+)/);
  if (m) return m[1];
  if (s.includes("http")) { const m2 = s.match(/[-\w]{25,}/); return m2 ? m2[0] : ""; }
  return s; // já é um id simples
}

// Tamanho padrão das miniaturas exibidas no app (px no maior lado).
// O backend usa &size=N para devolver a miniatura redimensionada do Drive,
// 10-20x menor que o arquivo original — carregamento muito mais rápido.
const TAMANHO_MINIATURA = 640;

// Cache em nível de módulo (compartilhado por todas as telas):
// uma vez baixada, a foto fica em memória — reabrir modal/re-render é instantâneo.
// Guarda Promises para deduplicar buscas simultâneas do mesmo arquivo.
// A chave inclui o tamanho (miniatura e original são entradas separadas).
const fotoCache = new Map();
export function fetchFotoCached(fileId, size) {
  if (!fileId) return Promise.resolve("");
  const chave = size ? `${fileId}@${size}` : fileId;
  if (fotoCache.has(chave)) return fotoCache.get(chave);
  const paramSize = size ? `&size=${size}` : "";
  const p = fetch(`${API_URL}?token=${TOKEN}&action=getFoto&fileId=${encodeURIComponent(fileId)}${paramSize}${sessionParam()}`)
    .then((r) => r.json())
    .then((d) => (d && d.success && d.base64 ? `data:${d.contentType || "image/jpeg"};base64,${d.base64}` : ""))
    .catch(() => "");
  // Se falhar/voltar vazio, descarta do cache para permitir nova tentativa depois.
  p.then((src) => { if (!src) fotoCache.delete(chave); });
  fotoCache.set(chave, p);
  return p;
}

// Inicia o download de uma foto antecipadamente (ao passar o mouse / tocar no item),
// para que já esteja em cache quando o modal abrir.
export function prefetchFoto(source) {
  const fileId = source && source.toString().startsWith("data:") ? "" : extrairFileIdDrive(source);
  if (fileId) fetchFotoCached(fileId, TAMANHO_MINIATURA);
}

// Abre um arquivo do Drive (foto, PDF, atestado...) buscando os bytes pelo backend
// autenticado e exibindo via blob URL — funciona mesmo com o arquivo PRIVADO no Drive.
// Abre a aba ANTES do fetch para não cair no bloqueador de popup.
/**
 * URL http(s) que NÃO é do Drive — hoje, o link assinado do Supabase Storage.
 *
 * Desde que os anexos novos passaram a viver no bucket, estas funções recebem
 * os dois formatos. Quem não é do Drive é usado como está: já é um endereço
 * pronto, com a autorização embutida e prazo de validade.
 */
function urlDireta(source) {
  const s = String(source ?? "");
  if (!/^https?:\/\//i.test(s)) return "";
  try {
    // Decide pelo HOST, e não por conseguir raspar um id da string.
    // `extrairFileIdDrive` tem um caso que casa qualquer sequência de 25+
    // caracteres de palavra numa URL — e o token de uma URL assinada é um JWT,
    // que casa com folga. Perguntar "dá para achar um fileId aqui?" devolvia
    // sim para o link do bucket, mandava a foto pelo caminho do Drive, e ela
    // virava pixel transparente sem erro nenhum.
    const host = new URL(s).hostname;
    return /(^|\.)(google|googleusercontent|gstatic)\.com$/i.test(host) ? "" : s;
  } catch {
    return "";
  }
}

/**
 * Os bytes de um anexo como data URL, venha ele do bucket ou do Drive.
 *
 * Existe porque gerar imagem do DOM (html-to-image, na carteirinha da piscina)
 * não aceita imagem de outro domínio: o canvas fica "sujo" e a exportação
 * falha. Com o arquivo no Drive isso já era resolvido embutindo o base64 do
 * `getFoto`; o link assinado do Storage é igualmente de outro domínio, então
 * precisa do mesmo tratamento — e é por isso que aqui se baixa em vez de só
 * apontar o `src`.
 */
export async function carregarComoDataUrl(source) {
  const s = String(source ?? "");
  if (!s) return "";
  if (s.startsWith("data:")) return s;

  const direta = urlDireta(s);
  if (direta) {
    try {
      const resp = await fetch(direta);
      if (!resp.ok) return "";
      const blob = await resp.blob();
      return await new Promise((resolve) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result || ""));
        leitor.onerror = () => resolve("");
        leitor.readAsDataURL(blob);
      });
    } catch {
      return "";
    }
  }

  const fileId = extrairFileIdDrive(s);
  return fileId ? await fetchFotoCached(fileId) : "";
}

export async function abrirArquivoDrive(source) {
  const direta = urlDireta(source);
  if (direta) { window.open(direta, "_blank", "noopener"); return; }

  const fileId = extrairFileIdDrive(source);
  if (!fileId) { reportarErro("Este arquivo não está disponível."); return; }
  const janela = window.open("about:blank", "_blank");
  const dataUrl = await fetchFotoCached(fileId);
  if (!dataUrl) {
    if (janela) janela.close();
    reportarErro("Não foi possível carregar o arquivo do Drive.");
    return;
  }
  const blob = await (await fetch(dataUrl)).blob();
  const url = URL.createObjectURL(blob);
  if (janela) janela.location = url;
}

/**
 * A URL aponta para algo que um `<img>` sabe desenhar?
 *
 * No Drive esta pergunta não existia: o `getFoto` devolvia a MINIATURA que o
 * Google gera, e até PDF virava imagem (a primeira página). O bucket entrega o
 * arquivo como ele é — um PDF dentro de um `<img>` vira o ícone de imagem
 * quebrada, bem em cima do "VER ARQUIVO" que já estava certo ali atrás.
 *
 * Sem extensão, assume que é imagem: é o comportamento antigo, e o `onError`
 * abaixo recolhe o que escapar.
 */
const EXTENSOES_DE_IMAGEM = ["jpg", "jpeg", "png", "webp", "heic", "gif", "avif", "bmp", "svg"];

function pareceImagem(url) {
  const s = String(url);
  // Data URL diz o tipo em si mesma — não precisa adivinhar pela extensão.
  if (s.startsWith("data:")) return s.startsWith("data:image");
  const caminho = s.split("?")[0];
  const ext = caminho.slice(caminho.lastIndexOf(".") + 1).toLowerCase();
  if (!ext || ext.length > 5 || ext === caminho.toLowerCase()) return true;
  return EXTENSOES_DE_IMAGEM.includes(ext);
}

/**
 * O arquivo é, com certeza, algo que NÃO se desenha?
 *
 * "Com certeza" é a palavra: só responde sim quando dá para saber pelo próprio
 * endereço — data URL com tipo declarado, ou caminho com extensão. Arquivo do
 * Drive não tem nem uma coisa nem outra, e para ele a resposta é não: quem
 * decide lá é o `DriveImage`, depois de buscar os bytes.
 */
export function naoEhImagem(source) {
  const s = String(source ?? "");
  if (!s) return false;
  if (s.startsWith("data:")) return !s.startsWith("data:image");
  if (!/^https?:\/\//i.test(s)) return false;
  return !urlDireta(s) ? false : !pareceImagem(s);
}

export function DriveImage({ source, localSrc, alt = "", style }) {
  // src imediato (sem estado): preview local em base64 ou um data: URL já pronto.
  const direta = urlDireta(source);
  const directSrc =
    localSrc ||
    // `data:` de PDF também não se desenha: no formulário de reserva ele ia
    // cru para o <img> e mostrava o ícone de erro do navegador — desde antes
    // da migração, porque ali o Drive nunca chegou a entrar na conta.
    (source && source.toString().startsWith("data:image") ? source.toString() : "") ||
    // Link assinado do Storage: vai direto para o <img>. Sem isto ele não é
    // data:, não tem fileId do Drive, e a imagem caía no pixel transparente —
    // arquivo no bucket, tela em branco, e nenhum erro em lugar nenhum.
    // Só se for imagem, porém: o resto fica no placeholder, que é o mesmo
    // destino que PDF do Drive sempre teve.
    (direta && pareceImagem(direta) ? direta : "");
  // `direta` sem ser imagem não é caso de buscar no Drive: o arquivo está no
  // bucket e simplesmente não se desenha. Sem esta guarda, cairia no
  // `extrairFileIdDrive` e sairia buscando um id que não existe.
  const fileId = directSrc || direta ? "" : extrairFileIdDrive(source);
  const [fetchedSrc, setFetchedSrc] = useState("");
  // Guarda QUAL src falhou, e não um booleano: trocar de src já desfaz a
  // falha sem precisar de um efeito que zere estado.
  const [srcFalho, setSrcFalho] = useState("");
  useEffect(() => {
    if (!fileId) return; // nada a buscar; o directSrc/placeholder cuida da exibição
    let cancelled = false;
    // Miniatura (TAMANHO_MINIATURA) — só usa como <img> se for imagem; PDF e afins
    // ficam no placeholder (o fundo da tela, ex.: ícone "VER ARQUIVO", continua visível).
    fetchFotoCached(fileId, TAMANHO_MINIATURA).then((src) => {
      if (!cancelled && src && src.startsWith("data:image")) setFetchedSrc(src);
    });
    return () => { cancelled = true; };
  }, [fileId]);
  const candidato = directSrc || fetchedSrc || PIXEL_TRANSPARENTE;
  const src = srcFalho && srcFalho === candidato ? PIXEL_TRANSPARENTE : candidato;
  // Rede de segurança para o que a extensão não previu: link expirado, arquivo
  // corrompido, tipo inesperado. Melhor o espaço vazio com "VER ARQUIVO" do que
  // um ícone de erro do navegador.
  return <img src={src} alt={alt} style={style} onError={() => setSrcFalho(candidato)} />
}

/**
 * Miniatura de um anexo na lista do formulário: imagem quando é imagem, ícone
 * de documento quando não é.
 *
 * O `DriveImage` sozinho resolve metade do problema — ele para de mostrar o
 * ícone de erro do navegador, mas deixa um quadrado vazio no lugar, e quadrado
 * vazio com uma borda e um X ao lado parece anexo que não carregou. Quem anexou
 * um PDF precisa VER que anexou um PDF.
 */
export function MiniaturaAnexo({ source, localSrc, alt = "Anexo", style, nome }) {
  if (naoEhImagem(localSrc || source)) {
    return (
      <div
        title={nome || alt}
        aria-label={nome ? `Documento ${nome}` : "Documento anexado"}
        role="img"
        style={{
          ...style,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 4,
          background: "var(--bg-subtle, rgba(127,127,127,.12))",
          color: "var(--fg-muted, #888)", fontSize: 10, textAlign: "center",
          overflow: "hidden", padding: 4, boxSizing: "border-box",
        }}
      >
        <FileText size={22} aria-hidden="true" />
        <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {nomeCurto(nome) || "Documento"}
        </span>
      </div>
    );
  }
  return <DriveImage source={source} localSrc={localSrc} alt={alt} style={style} />;
}

/** Só a extensão cabe em 90px; o nome inteiro viraria uma linha de reticências. */
function nomeCurto(nome) {
  if (!nome) return "";
  const ext = String(nome).split(".").pop();
  return ext && ext.length <= 5 ? ext.toUpperCase() : "";
}
