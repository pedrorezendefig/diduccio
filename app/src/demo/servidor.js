// Backend falso do modo demo — responde no lugar do Apps Script.
//
// Fala o mesmo dialeto do backend real: GET `?sheet=X` devolve a aba inteira,
// POST com `action` faz add/edit/delete e as operações especiais. O estado vive
// em memória: o que a apresentação criar ou apagar vale até dar F5, e nunca sai
// da máquina.

import { TABELAS, SENHA_DEMO } from "./dados";

/** Cópia mutável das tabelas. Recarregar a página zera tudo. */
const estado = Object.fromEntries(
  Object.entries(TABELAS).map(([nome, linhas]) => [nome, linhas.map((l) => ({ ...l }))])
);

const ok = (extra = {}) => ({ success: true, ...extra });
const falha = (message) => ({ success: false, message });

/** Latência fingida: sem ela a tela nunca mostra skeleton nem estado de carga. */
const LATENCIA_MS = 260;
const esperar = () => new Promise((r) => setTimeout(r, LATENCIA_MS));

const proximoId = (aba) =>
  String(Math.max(0, ...estado[aba].map((l) => Number(l.id) || 0)) + 1);

// ---------------------------------------------------------------- GET

function responderGet(params) {
  const aba = params.get("sheet");
  const action = params.get("action");

  if (action === "getFoto") {
    // A demo não tem arquivo nenhum no Drive. As telas já tratam a ausência.
    return falha("Arquivo indisponível no modo demonstração.");
  }

  if (!aba) return falha("Parâmetro `sheet` ausente.");

  if (aba === "usuarios") {
    // Espelha o backend real: a listagem pré-login não devolve credenciais.
    return estado.usuarios.map(({ id, nome, email, cargo }) => ({ id, nome, email, cargo }));
  }

  const linhas = estado[aba];
  if (!linhas) return [];
  return linhas.map((l) => ({ ...l }));
}

// ---------------------------------------------------------------- POST

const RESUMO_DEMO = {
  titulo: "Assembleia Extraordinária — Demonstração",
  data_assembleia: new Date().toISOString().slice(0, 10),
  resumo_geral:
    "Documento processado no modo demonstração. Em produção este resumo é gerado " +
    "por IA a partir do PDF enviado, preservando os números e os nomes citados na ata.",
  decisoes: [
    "Aprovada a previsão orçamentária para o próximo exercício.",
    "Autorizada a contratação de empresa para manutenção dos elevadores.",
    "Definido novo horário de silêncio: das 22h às 8h, todos os dias.",
  ],
  assinantes: ["Marcos Aurélio Pinto (síndico)", "Solange Ribeiro (secretária)"],
};

/** O demo imita o gatilho do 0042: o banco real carimba estes campos, não a tela. */
function carimbarTarefaNova(t) {
  const agora = new Date().toISOString();
  t.created_at = agora;
  t.concluida_em = t.situacao === "CONCLUIDA" ? agora : null;
  t.movida_em = null;
  t.movida_por = null;
}

/** O demo imita o gatilho do 0020: Número da encomenda sempre, Código de
 *  retirada só quando há telefone (sem telefone não sai o Aviso). */
const sortear = (alfabeto, n) =>
  Array.from({ length: n }, () => alfabeto[Math.floor(Math.random() * alfabeto.length)]).join("");
export function carimbarEncomendaNova(e) {
  if (!e.numero_encomenda) e.numero_encomenda = `${1000 + Math.floor(Math.random() * 9000)}${sortear("ABCDEFGHJKLMNPQRSTUVWXYZ", 1)}`;
  if (!e.cod && String(e.telefone ?? "").trim()) e.cod = sortear("ABCDEFGHIJKLMNPQRSTUVWXYZ23456789", 5);
}

function carimbarTarefaEditada(antes, depois) {
  if (depois.situacao === antes.situacao) return;
  const agora = new Date().toISOString();
  depois.movida_em = agora;
  // A demo não sabe quem está logado (o `editar` não manda sessão): vazio, e
  // não o nome de quem moveu da vez anterior.
  depois.movida_por = null;
  depois.concluida_em = depois.situacao === "CONCLUIDA" ? agora : null;
}

function responderPost(corpo) {
  const { action, sheet } = corpo;

  switch (action) {
    case "login": {
      const u = estado.usuarios.find(
        (x) => String(x.email).toLowerCase() === String(corpo.email).toLowerCase()
      );
      if (!u) return falha("Usuário não encontrado.");
      if (corpo.senha !== SENHA_DEMO) {
        return falha(`Senha incorreta. No modo demonstração a senha é "${SENHA_DEMO}".`);
      }
      return ok({ data: { ...u }, session: `demo-${u.id}` });
    }

    case "add": {
      if (!sheet || !estado[sheet]) return falha(`Aba desconhecida: ${sheet}`);
      // eslint-disable-next-line no-unused-vars
      const { token, session, action: _a, sheet: _s, ...linha } = corpo;
      const nova = { ...linha, id: linha.id || proximoId(sheet) };
      if (sheet === "TAREFAS") carimbarTarefaNova(nova);
      if (sheet === "ENTREGAS") carimbarEncomendaNova(nova);
      estado[sheet].push(nova);
      return ok({ data: nova });
    }

    case "edit": {
      if (!sheet || !estado[sheet]) return falha(`Aba desconhecida: ${sheet}`);
      // eslint-disable-next-line no-unused-vars
      const { token, session, action: _a, sheet: _s, ...linha } = corpo;
      const i = estado[sheet].findIndex((l) => String(l.id) === String(linha.id));
      if (i < 0) return falha("Registro não encontrado.");
      const editada = { ...estado[sheet][i], ...linha };
      if (sheet === "TAREFAS") carimbarTarefaEditada(estado[sheet][i], editada);
      estado[sheet][i] = editada;
      return ok({ data: estado[sheet][i] });
    }

    case "delete": {
      // Unidades manda delete sem `sheet` — o padrão do backend real é UNIDADES.
      const aba = sheet || "UNIDADES";
      if (!estado[aba]) return falha(`Aba desconhecida: ${aba}`);
      const antes = estado[aba].length;
      estado[aba] = estado[aba].filter((l) => String(l.id) !== String(corpo.id));
      return antes === estado[aba].length ? falha("Registro não encontrado.") : ok();
    }

    // ----- Portaria: chegadas de entregadores -----
    case "listarChegadas":
      return ok({ chegadas: estado.CHEGADAS.map((c) => ({ ...c })) });

    case "registrarEntrega": {
      const nova = {
        id: proximoId("CHEGADAS"),
        cpf: corpo.cpf,
        nome: corpo.nome,
        veiculo: corpo.veiculo,
        placa: corpo.placa,
        bloco: corpo.bloco,
        apartamento: corpo.apartamento,
        liberado_por: corpo.liberado_por,
        registrado_por: corpo.registrado_por,
        entrada: new Date().toISOString().slice(0, 16).replace("T", " "),
        saida: "",
      };
      estado.CHEGADAS.unshift(nova);
      // Entregador novo entra no cadastro, como no backend real.
      if (corpo.cpf && !estado.ENTREGADORES.some((e) => e.cpf === corpo.cpf)) {
        estado.ENTREGADORES.push({
          id: proximoId("ENTREGADORES"),
          nome: corpo.nome,
          cpf: corpo.cpf,
          empresa: "",
          telefone: "",
          status: "Ativo",
        });
      }
      return ok({ data: nova });
    }

    case "registrarSaida": {
      const c = estado.CHEGADAS.find((x) => String(x.id) === String(corpo.id));
      if (!c) return falha("Chegada não encontrada.");
      c.saida = new Date().toISOString().slice(0, 16).replace("T", " ");
      return ok({ data: { ...c } });
    }

    case "excluirChegada":
      estado.CHEGADAS = estado.CHEGADAS.filter((x) => String(x.id) !== String(corpo.id));
      return ok();

    case "editarEntregador": {
      const e = estado.ENTREGADORES.find((x) => x.cpf === corpo.cpf);
      if (!e) return falha("Entregador não encontrado.");
      e.nome = corpo.nome ?? e.nome;
      return ok({ data: { ...e } });
    }

    case "excluirEntregador":
      estado.ENTREGADORES = estado.ENTREGADORES.filter((x) => x.cpf !== corpo.cpf);
      return ok();

    // ----- Atas -----
    case "resumirAta":
    case "resumirAtaTexto":
      return ok(RESUMO_DEMO);

    case "salvarAta": {
      const nova = {
        id: proximoId("ASSEMBLEIAS"),
        titulo: corpo.titulo,
        data_assembleia: corpo.data_assembleia,
        pdf_id: "",
        resumo: [corpo.resumo_geral, ...(corpo.decisoes || [])].filter(Boolean).join(" "),
        resumo_geral: corpo.resumo_geral,
        decisoes: corpo.decisoes || [],
        assinantes: corpo.assinantes || [],
        criado_por: corpo.criado_por || "",
        status: "Publicada",
      };
      estado.ASSEMBLEIAS.unshift(nova);
      return ok({ data: nova });
    }

    case "excluirAta":
      estado.ASSEMBLEIAS = estado.ASSEMBLEIAS.filter((a) => String(a.id) !== String(corpo.id));
      return ok();

    case "perguntarAtas": {
      const termo = String(corpo.pergunta || "").toLowerCase();
      const achada = estado.ASSEMBLEIAS.find((a) =>
        String(a.resumo || "").toLowerCase().includes(termo.split(" ").find((p) => p.length > 4) || "§")
      );
      return ok({
        resposta: achada
          ? `Segundo a ata "${achada.titulo}" (${achada.data_assembleia}): ${achada.resumo}`
          : "Não encontrei essa informação nas atas cadastradas. " +
            "No modo demonstração a busca é literal — em produção quem responde é a IA sobre o texto integral das atas.",
      });
    }

    // ----- Comunicados -----
    case "gerarIA":
      return ok({
        texto:
          "[TITULO] Comunicado aos moradores [CORPO] " +
          "<p>Prezados moradores,</p>" +
          `<p>${corpo.prompt || "Assunto do comunicado"}.</p>` +
          "<p>Pedimos a atenção de todos para o cumprimento das orientações acima. " +
          "A administração permanece à disposição na portaria e pelos canais habituais.</p>" +
          "<p>Atenciosamente,<br/>Administração</p>" +
          "<p><em>Texto de demonstração — em produção este conteúdo é gerado por IA.</em></p>",
      });

    default:
      // O backend real cria/atualiza pela combinação sheet+id quando não há
      // action reconhecida. Mantemos o mesmo comportamento tolerante.
      if (sheet && estado[sheet]) return responderPost({ ...corpo, action: corpo.id ? "edit" : "add" });
      return falha(`Ação não suportada no modo demonstração: ${action}`);
  }
}

// ---------------------------------------------------------------- entrada

/** Processa uma requisição já normalizada e devolve o corpo da resposta. */
export async function atender({ url, metodo, corpo }) {
  await esperar();
  if (metodo === "POST") {
    let dados = {};
    try {
      dados = typeof corpo === "string" ? JSON.parse(corpo) : corpo || {};
    } catch {
      return falha("Corpo inválido.");
    }
    return responderPost(dados);
  }
  return responderGet(new URL(url).searchParams);
}
