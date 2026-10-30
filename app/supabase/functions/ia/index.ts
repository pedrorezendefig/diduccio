// Proxy de IA: gera comunicado e resume ata de assembleia.
//
// Existe pelo mesmo motivo que `criar-usuario`: a chave da API não pode ir para
// o navegador. Chave de IA no bundle é chave publicada — qualquer um lê o
// JavaScript, e a conta passa a ser de quem achar. Aqui ela vive só no
// servidor, como Secret do projeto.
//
// Deploy:
//   npx supabase secrets set GEMINI_API_KEY=... GROQ_API_KEY=...
//   npx supabase functions deploy ia
//
// As quatro ações vivem numa função só porque compartilham tudo o que importa:
// a cascata de provedores (cascata.ts) e a regra de nunca devolver o erro cru
// do provedor. Separadas, isso seria copiado quatro vezes — e é copiando
// que uma delas fica para trás numa correção. A autorização, essa, é POR AÇÃO:
// ver AUTORIZACAO abaixo.

import { pedirEmCascata, type Chaves, type Tentativa } from "./cascata.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  // `apikey` e `x-client-info` entram aqui porque o supabase-js e o nosso
  // `chamarEdgeFunction` os mandam. O navegador pergunta antes (preflight) e,
  // se um cabeçalho enviado não estiver nesta lista, ele nem chega a fazer a
  // requisição — e o erro que aparece é "Failed to fetch", que parece queda de
  // rede. Foi assim que o Comunicado dizia "sem conexão com o servidor" com o
  // servidor no ar e respondendo.
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// A autorização acompanha o 0015, e NÃO é a mesma para as quatro ações.
//
// Gerar comunicado e resumir ata são escrita: o conselheiro está fora. Já
// perguntar sobre as atas é leitura, e o conselheiro lê atas — é exatamente a
// exceção que o 0015 abriu para ele. Uma lista só para tudo erraria de um lado
// ou do outro: ou tiraria do conselheiro o que ele pode, ou daria a ele o que
// não pode.
const CARGOS_COM_ESCRITA = ["Desenvolvedor", "Sindico", "Auxiliar Administrativo"];
const CARGOS_QUE_LEEM_ATAS = [...CARGOS_COM_ESCRITA, "Conselheiro"];

const AUTORIZACAO: Record<string, string[]> = {
  "comunicado": CARGOS_COM_ESCRITA,
  "resumir-ata-texto": CARGOS_COM_ESCRITA,
  "resumir-ata-pdf": CARGOS_COM_ESCRITA,
  "perguntar-atas": CARGOS_QUE_LEEM_ATAS,
};

const INSTRUCAO_ATA =
  "Você recebe a ata de uma assembleia de um condomínio (Diduccio). " +
  "Extraia as informações e retorne SOMENTE um JSON válido, sem markdown e sem crases, exatamente neste formato: " +
  '{"titulo": string, "data_assembleia": string, "resumo_geral": string, "decisoes": string[], "assinantes": string[]}. ' +
  "'titulo' é um título curto da assembleia. 'data_assembleia' é a data em que a assembleia ocorreu (dd/mm/aaaa se possível). " +
  "'resumo_geral' é um parágrafo resumindo o que foi tratado. 'decisoes' é a lista do que foi efetivamente decidido/aprovado/deliberado. " +
  "'assinantes' é a lista de nomes de quem assinou a ata. Não invente informação: se algo não constar, use string vazia ou lista vazia.";

const instrucaoComunicado = (assunto: string, tom: string) =>
  `Atue como um síndico profissional. Condomínio: Diduccio. Assunto: ${assunto}. Tom: ${tom}. ` +
  "Regras estritas: 1. Retorne o conteúdo dividido em duas partes exatamente assim: " +
  "[TITULO] Aqui o título curto em letras maiúsculas [CORPO] Aqui o conteúdo do comunicado em HTML. " +
  "2. No [CORPO], use apenas as tags: <p>, <strong>, <br>. 3. Não use markdown, não use crases. " +
  '4. Não inclua "Atenciosamente". 5. Não inclua saudações finais. ' +
  "6. O título sem ter escrito COMUNICADO já vem no meu código.";

/** A ata volta como JSON. Modelo às vezes embrulha em crases mesmo proibido. */
function lerAta(texto: string) {
  const limpo = texto.replace(/```json|```/gi, "").trim();
  try {
    const p = JSON.parse(limpo);
    return {
      titulo: String(p.titulo ?? ""),
      data_assembleia: String(p.data_assembleia ?? ""),
      resumo_geral: String(p.resumo_geral ?? ""),
      decisoes: Array.isArray(p.decisoes) ? p.decisoes.map(String) : [],
      assinantes: Array.isArray(p.assinantes) ? p.assinantes.map(String) : [],
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ success: false, message: "Método não suportado." }, 405);

  // Quem chamou? O token vem do navegador e é validado aqui. Confiar num cargo
  // mandado no corpo deixaria qualquer conta gastar a cota da IA do condomínio.
  const { createClient } = await import("jsr:@supabase/supabase-js@2");
  const comoUsuario = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: quem, error: erroQuem } = await comoUsuario.auth.getUser();
  if (erroQuem || !quem?.user) return responder({ success: false, message: "Não autenticado." }, 401);

  // `app_metadata`, nunca `user_metadata`: o segundo é editável pelo próprio
  // usuário, e daria a qualquer um o cargo que quisesse.
  const cargo = String(quem.user.app_metadata?.cargo ?? "");

  let corpo: any;
  try { corpo = await req.json(); } catch { return responder({ success: false, message: "Requisição inválida." }, 400); }
  const acao = String(corpo?.acao ?? "");

  const permitidos = AUTORIZACAO[acao];
  if (!permitidos) return responder({ success: false, message: "Ação desconhecida." }, 400);
  // Lista fechada, e não "todo mundo menos X": cargo novo ou vazio cai fora por
  // padrão. Uma negação por exclusão já deixou passar conta sem cargo neste
  // projeto — foi assim que um usuário sem cargo escreveu em `log` e `auditoria`.
  if (!permitidos.includes(cargo)) {
    return responder({ success: false, message: "Não autorizado." }, 403);
  }

  // Três chaves, na ordem da cascata (ver cascata.ts). A reserva é de OUTRO
  // projeto do Google: a cota gratuita é por dia e por projeto, e a principal
  // acabou num dia normal de uso.
  const chaves: Chaves = {
    gemini: Deno.env.get("GEMINI_API_KEY") ?? "",
    groq: Deno.env.get("GROQ_API_KEY") ?? "",
    geminiB: Deno.env.get("GEMINI_API_KEY_B") ?? "",
  };
  if (!chaves.gemini && !chaves.groq && !chaves.geminiB) {
    return responder({ success: false, message: "IA indisponível no momento." }, 503);
  }

  // -------------------------------------------------------------------------
  if (acao === "comunicado") {
    const assunto = String(corpo?.prompt ?? "").trim();
    const tom = String(corpo?.tom ?? "").trim();
    if (!assunto) return responder({ success: false, message: "Descreva o assunto." }, 400);

    const instrucao = instrucaoComunicado(assunto, tom);
    const r = await pedirEmCascata(chaves, [{ text: instrucao }], instrucao, false);
    if (!r.texto) {
      // O detalhe fica no log do servidor. Devolver a resposta crua do provedor
      // vaza modelo, cota e às vezes trechos da chave em mensagem de erro.
      console.error("comunicado falhou:", r.diagnostico.join(" | "));
      return responder({ success: false, message: mensagemDeFalha(r.sobrecarga, "Não foi possível gerar o conteúdo.") });
    }
    return responder({ success: true, texto: r.texto });
  }

  // -------------------------------------------------------------------------
  if (acao === "resumir-ata-texto") {
    // 60 mil caracteres cobrem ata longa sem estourar o limite do modelo.
    const ata = String(corpo?.texto ?? "").trim().slice(0, 60000);
    if (!ata) return responder({ success: false, message: "Não foi possível extrair texto do PDF." }, 400);

    const instrucao = `${INSTRUCAO_ATA}\n\nTEXTO DA ATA:\n${ata}`;
    const r = await pedirEmCascata(chaves, [{ text: instrucao }], instrucao, true);
    return responderAta(r);
  }

  // -------------------------------------------------------------------------
  if (acao === "resumir-ata-pdf") {
    // Ata escaneada: sem texto selecionável, o modelo faz o OCR. Só o Gemini lê
    // PDF: sem Groq, a queda é da chave principal para a reserva.
    let base64 = String(corpo?.pdfBase64 ?? "");
    if (base64.includes(",")) base64 = base64.split(",")[1];
    base64 = base64.replace(/\s/g, "");
    if (!base64) return responder({ success: false, message: "Anexe o PDF da ata." }, 400);
    if (base64.length > 20 * 1024 * 1024) return responder({ success: false, message: "PDF muito grande (máx. 15MB)." }, 400);
    if (!chaves.gemini && !chaves.geminiB) {
      return responder({ success: false, message: "Leitura de PDF indisponível no momento." }, 503);
    }

    // `instrucao` nula é o sinal para a cascata pular o Groq.
    const r = await pedirEmCascata(
      chaves,
      [{ inline_data: { mime_type: "application/pdf", data: base64 } }, { text: INSTRUCAO_ATA }],
      null,
      true,
    );
    return responderAta(r, "Não foi possível ler o PDF.");
  }

  // -------------------------------------------------------------------------
  if (acao === "perguntar-atas") {
    const pergunta = String(corpo?.pergunta ?? "").trim().slice(0, 500);
    if (!pergunta) return responder({ success: false, message: "Faça uma pergunta." }, 400);

    // As atas são lidas AQUI, com o token de quem perguntou, e não recebidas do
    // navegador. Aceitar o contexto pronto do cliente deixaria qualquer um
    // mandar texto arbitrário como se fosse ata do condomínio, e a resposta da
    // IA sairia com a autoridade de um documento oficial.
    // Como a consulta usa a sessão do usuário, o RLS do 0015 continua valendo:
    // quem não lê `assembleias` recebe zero linhas, não uma exceção.
    const { data: atas, error } = await comoUsuario
      .from("assembleias")
      .select("titulo, data_assembleia, resumo_geral, decisoes, assinantes")
      .order("data_assembleia", { ascending: false });
    if (error) return responder({ success: false, message: "Não foi possível ler as atas." }, 500);
    if (!atas?.length) return responder({ success: true, resposta: "Ainda não há atas cadastradas." });

    const lista = (v: unknown): string[] => {
      try { const p = JSON.parse(String(v ?? "[]")); return Array.isArray(p) ? p.map(String) : []; }
      catch { return []; }
    };
    const contexto = atas.map((a: any) => {
      const decisoes = lista(a.decisoes);
      const assinantes = lista(a.assinantes);
      return [
        `ATA: ${a.titulo ?? ""} | Data: ${a.data_assembleia ?? ""}`,
        `Resumo: ${a.resumo_geral ?? ""}`,
        `Decisões: ${decisoes.length ? decisoes.map((d, k) => `${k + 1}) ${d}`).join(" ") : "nenhuma"}`,
        `Assinaram: ${assinantes.length ? assinantes.join(", ") : "ninguém"}`,
      ].join("\n");
    }).join("\n\n").slice(0, 50000);

    const instrucao = [
      "Você é um assistente que responde perguntas sobre as atas de assembleia do condomínio Diduccio. " +
      "Use SOMENTE as informações abaixo. Se a resposta não estiver nos dados, diga que não encontrou essa informação nas atas. " +
      "Responda em português, de forma objetiva e curta. Ao listar decisões, numere-as.",
      "",
      "=== ATAS ===",
      contexto,
      "=== PERGUNTA ===",
      pergunta,
    ].join("\n");

    const r = await pedirEmCascata(chaves, [{ text: instrucao }], instrucao, false);
    if (!r.texto) {
      console.error("perguntar-atas falhou:", r.diagnostico.join(" | "));
      return responder({ success: false, message: mensagemDeFalha(r.sobrecarga, "Não foi possível responder agora.") });
    }
    return responder({ success: true, resposta: r.texto.replace(/```/g, "").trim() });
  }

  return responder({ success: false, message: "Ação desconhecida." }, 400);

  function mensagemDeFalha(sobrecarga: boolean, padrao: string) {
    return sobrecarga
      ? "A IA está sobrecarregada agora. Aguarde alguns segundos e tente novamente."
      : `${padrao} Tente novamente.`;
  }

  function responderAta(r: Tentativa, padrao = "Não foi possível gerar o resumo.") {
    if (!r.texto) {
      console.error("resumo de ata falhou:", r.diagnostico.join(" | "));
      return responder({ success: false, message: mensagemDeFalha(r.sobrecarga, padrao) });
    }
    const ata = lerAta(r.texto);
    if (!ata) {
      console.error("resumo de ata veio em formato inesperado:", r.texto.slice(0, 200));
      return responder({ success: false, message: "A IA respondeu num formato inesperado. Tente novamente." });
    }
    return responder({ success: true, ...ata });
  }
});
