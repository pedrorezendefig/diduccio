import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlertTriangle, Eye, FileText, FileWarning, Gavel, Image as ImageIcon,
  AlignCenter, AlignJustify, AlignLeft, Bold, Italic, Mail, MessageSquareText, Paperclip, Plus,
  Printer, Redo, Trash2, Undo, X,
} from "lucide-react";
import { listar, criar, editar, remover } from "../api/db";
import { MODO_DEMO } from "../api/config";
import { chamarEdgeFunction, mensagemDaEdgeFunction } from "../api/edge";
import EnvioPorEmail from "../components/EnvioPorEmail";
import VistaNoApp from "../components/VistaNoApp";
import EnviosDaNotificacao, { StatusDaLeitura, StatusDoEmail, useSituacoesDosEnvios } from "../components/EnviosDaNotificacao";
import SugestaoDaConvencao from "../components/SugestaoDaConvencao";
import RedacaoComIA from "../components/RedacaoComIA";
import { citacaoDo } from "../lib/convencao/convencao.ts";
import { pdfDaFolha } from "../lib/pdfDaCarta";
import { enviarAnexo, urlDoAnexo, removerAnexo } from "../api/anexos";
import { validarAnexo } from "../lib/drive";
import { can } from "../auth/permissions";
import {
  Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Textarea, useConfirm, useToast,
} from "../ui";
import ListaQueAbre from "../components/confirmacoes/ListaQueAbre";
import BuscaUnidade from "../components/BuscaUnidade";
import { Chave, Ficha, Filtros, Iniciais, Opcoes } from "../components/app/pecas";
import { nomeProprio } from "../lib/format";
import {
  NOTIFICACAO, MULTA, LIMITE, DESTINATARIOS_EMAIL,
  assuntoDoEmail, cadeiaDe, corpoDoEmail, dataPorExtenso, exigeMulta,
  errosDosDadosDaMulta, htmlDaNotificacao, htmlParaTexto, motivosDaUnidade, nomeDaCarta,
  REMETENTE_MULTA, REMETENTE_NOTIFICACAO,
  notificacoesAntesDe, notificacoesEmAberto, ordemNoMotivo, registrosDaCadeia,
  resumoDoMotivo, rotuloDaUnidade, sugestoesDeDestinatario,
} from "../lib/notificacoes";
import { supabase } from "../api/supabase";

const celula = (linha, chave) => {
  if (!linha) return "";
  const alvo = String(chave).toLowerCase();
  const achada = Object.keys(linha).find((k) => k.toLowerCase() === alvo);
  return achada ? linha[achada] : "";
};

const ASSUNTO_PADRAO = {
  [NOTIFICACAO]: "Notificação de descumprimento de normas condominiais",
  [MULTA]: "Multa por descumprimento de normas condominiais",
};

const FORM_VAZIO = {
  tipo: NOTIFICACAO,
  id_unidade: "",
  id_morador: "",
  destinatario: "",
  assunto: ASSUNTO_PADRAO[NOTIFICACAO],
  descricao: "",
  ocorrido_em: "",
  justificativa: "",
  // Reincidência (0075): quem cadastra diz se é o mesmo motivo de uma
  // notificação anterior da unidade, e qual. A contagem da multa é dentro dele.
  reincidencia: false,
  id_reincidencia_de: "",
  // Dados da multa (0076): só pedidos quando o registro é multa.
  multa_valor: "",
  multa_base: "",
  multa_vencimento: "",
  multa_forma_cobranca: "",
};

/** Quantas linhas a lista mostra de cada vez; "Mostrar mais" soma outras tantas. */
const LOTE = 30;

/** "B5-206", o rótulo curto da lista (a carta e o e-mail usam o longo). */
const unidadeCurta = (valor) => {
  const d = String(valor ?? "").replace(/\D/g, "");
  return d.length >= 4 ? `B${d.slice(0, -3)}-${d.slice(-3)}` : String(valor ?? "");
};

// Sugestões, não lista fechada: quem cadastra pode escrever outra forma.
const FORMAS_DE_COBRANCA = [
  "Boleto junto com a cota condominial",
  "Boleto avulso",
  "PIX",
];

export default function Notificacoes({ user }) {
  const toast = useToast();
  const confirmar = useConfirm();

  const [registros, setRegistros] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [moradores, setMoradores] = useState([]);
  const [comApp, setComApp] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("TODOS");
  const [ordem, setOrdem] = useState({ chave: "created_at", direcao: "desc" });
  const [limite, setLimite] = useState(LOTE);

  const [form, setForm] = useState(FORM_VAZIO);
  const [erros, setErros] = useState({});
  const [modalAberto, setModalAberto] = useState(false);
  const [aberto, setAberto] = useState(null);


  const [anexos, setAnexos] = useState([]);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [textoSujo, setTextoSujo] = useState(false);
  // O envio por e-mail (0077): o registro aberto na prévia, o andamento e o
  // histórico de envios.
  const [envioAberto, setEnvioAberto] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [envios, setEnvios] = useState([]);
  // A última redação da IA no cadastro aberto: as sugestões que vieram junto
  // abrem prontas na lista da Convenção. `versao` remonta a lista a cada uma.
  const [redacao, setRedacao] = useState({ versao: 0, itens: [], origem: "" });
  const folhaRef = useRef(null);
  const [salvandoTexto, setSalvandoTexto] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      const [n, u, m, ax] = await Promise.all([
        listar("NOTIFICACOES"), listar("UNIDADES"), listar("MORADORES"),
        listar("NOTIFICACOES_ANEXOS"),
      ]);
      const arranjo = (x) => (Array.isArray(x) ? x : x?.data ?? []);
      setRegistros(arranjo(n));
      setUnidades(arranjo(u));
      setMoradores(arranjo(m));
      setAnexos(arranjo(ax));
      // Quem usa o app (0064/0097), como em Encomendas. Sem a função ou sem
      // permissão, as sugestões ficam só com o cadastro.
      try {
        const { data, error } = await supabase.rpc("moradores_com_app");
        if (!error && Array.isArray(data)) {
          setComApp(Object.fromEntries(data.map((l) => [String(l.unidade_id), l.nomes ?? []])));
        }
      } catch {
        /* segue sem os nomes do app */
      }
      // O registro dos envios (0077) é à parte: sem ele a tela continua de pé,
      // só não mostra o histórico de envio.
      try {
        setEnvios(arranjo(await listar("NOTIFICACOES_ENVIOS")));
      } catch {
        setEnvios([]);
      }
    } catch (err) {
      toast.error(err?.message || "Não foi possível carregar as notificações.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
    // `carregar` nasce de novo a cada render; incluí-la aqui faria a tela
    // recarregar em laço. A carga inicial acontece uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escolher a unidade é busca (BuscaUnidade), com a regra do cadastro de
  // encomenda: "5206", "206" e "5" acham. Ela trabalha com o objeto da unidade.
  const unidadePorId = useMemo(
    () => new Map((unidades ?? []).map((u) => [String(celula(u, "id")), u])),
    [unidades]
  );

  const moradoresDaUnidade = useMemo(
    () => sugestoesDeDestinatario(
      (moradores ?? [])
        .filter((m) => String(celula(m, "id_unidade")) === String(form.id_unidade))
        .map((m) => ({ id: celula(m, "id"), nome: celula(m, "nome") })),
      form.id_unidade ? comApp[String(form.id_unidade)] : []
    ),
    [moradores, comApp, form.id_unidade]
  );

  // A contagem é do MOTIVO escolhido. Sem reincidência marcada, a infração é a
  // primeira do seu motivo e não há o que contar.
  const motivos = useMemo(() => motivosDaUnidade(registros, form.id_unidade), [registros, form.id_unidade]);
  const cadeiaEscolhida = form.reincidencia ? form.id_reincidencia_de : "";
  const emAberto = notificacoesEmAberto(registros, form.id_unidade, cadeiaEscolhida);
  const travado = exigeMulta(registros, form.id_unidade, cadeiaEscolhida);
  // A trava só morde quando ainda se está tentando NOTIFICAR. Escolhida a
  // multa, o painel some — ele já cumpriu a função.
  const precisaJustificar = travado && form.tipo === NOTIFICACAO;

  const contagem = useMemo(() => ({
    TODOS: (registros ?? []).length,
    [NOTIFICACAO]: (registros ?? []).filter((r) => celula(r, "tipo") === NOTIFICACAO).length,
    [MULTA]: (registros ?? []).filter((r) => celula(r, "tipo") === MULTA).length,
  }), [registros]);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const valor = (r) => {
      if (ordem.chave === "id_unidade") return Number(celula(r, "id_unidade")) || 0;
      return String(celula(r, ordem.chave) ?? "").toLowerCase();
    };
    const sinal = ordem.direcao === "asc" ? 1 : -1;
    return (registros ?? [])
      .filter((r) => filtroTipo === "TODOS" || celula(r, "tipo") === filtroTipo)
      .filter((r) => {
        if (!termo) return true;
        const alvo = [
          rotuloDaUnidade(celula(r, "id_unidade")), unidadeCurta(celula(r, "id_unidade")),
          celula(r, "destinatario"), celula(r, "assunto"), celula(r, "descricao"),
        ].join(" ").toLowerCase();
        return alvo.includes(termo);
      })
      .slice()
      .sort((a, b) => {
        const va = valor(a), vb = valor(b);
        return va < vb ? -sinal : va > vb ? sinal : 0;
      });
  }, [registros, busca, filtroTipo, ordem]);
  const ordenar = (chave) => setOrdem((o) => ({ chave, direcao: o.chave === chave && o.direcao === "asc" ? "desc" : "asc" }));

  const abrirNovo = (tipo = NOTIFICACAO) => {
    setForm({ ...FORM_VAZIO, tipo });
    setErros({});
    // Sugestões da redação anterior eram de outro caso.
    setRedacao({ versao: 0, itens: [], origem: "" });
    setModalAberto(true);
  };

  const campo = (chave, valor) => {
    setForm((f) => {
      const novo = { ...f, [chave]: valor };
      // Trocar de unidade invalida o destinatário sugerido da anterior: o nome
      // de outro apartamento numa notificação é erro grave e silencioso.
      if (chave === "id_unidade") {
        novo.destinatario = "";
        novo.id_morador = "";
        // O motivo escolhido é da unidade anterior: a reincidência não viaja.
        novo.reincidencia = false;
        novo.id_reincidencia_de = "";
      }
      // Mudou o motivo (ou deixou de ser reincidência): a multa que a trava
      // tinha empurrado era daquele motivo, e volta a ser notificação.
      // O assunto padrão acompanha o tipo; o que a pessoa escreveu, não.
      if (chave === "tipo" && Object.values(ASSUNTO_PADRAO).includes(f.assunto)) {
        novo.assunto = ASSUNTO_PADRAO[valor];
      }
      // Deixou de ser reincidência: o motivo escolhido sai junto. O tipo fica
      // como está: é escolha de quem cadastra, e há multa direta.
      if (chave === "reincidencia" && !valor) novo.id_reincidencia_de = "";
      return novo;
    });
    setErros((e) => ({ ...e, [chave]: "" }));
  };

  /**
   * O item escolhido da Convenção. Na multa ele é a Base (campo próprio); na
   * notificação não há campo de base, e o fundamento vai ao fim da descrição,
   * que é o parágrafo da carta. Não repete se o mesmo item já está lá.
   */
  const usarArtigo = (artigo) => {
    const cita = citacaoDo(artigo);
    if (form.tipo === MULTA) {
      campo("multa_base", cita);
      return;
    }
    if (form.descricao.includes(cita)) return;
    const fundamento = `Fundamento: ${cita}: "${artigo.texto}"`;
    campo("descricao", `${form.descricao.trimEnd()}\n\n${fundamento}`);
  };

  const validar = () => {
    const e = {};
    if (!form.id_unidade) e.id_unidade = "Escolha a unidade.";
    if (!form.destinatario.trim()) e.destinatario = "Diga a quem a notificação se dirige.";
    if (!form.assunto.trim()) e.assunto = "O assunto vai no título e na carta.";
    if (!form.descricao.trim()) e.descricao = "Descreva a infração. É este texto que sai na carta.";
    if (form.reincidencia && !form.id_reincidencia_de) {
      e.id_reincidencia_de = "Escolha de qual notificação esta é reincidência.";
    }
    // Multa não exige notificação anterior: há infração que a Convenção ou a lei
    // pune com multa já na primeira vez (multa direta). O que a sustenta, nesse
    // caso, é a base informada nos dados da multa, que é obrigatória.
    if (form.tipo === MULTA) {
      Object.assign(e, errosDosDadosDaMulta({
        valor: form.multa_valor,
        base: form.multa_base,
        vencimento: form.multa_vencimento,
        formaCobranca: form.multa_forma_cobranca,
      }));
    }
    if (precisaJustificar && !form.justificativa.trim()) {
      e.justificativa = "Este motivo já tem 2 notificações. Justifique por que não é multa.";
    }
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const salvar = async () => {
    if (!validar() || salvando) return;
    setSalvando(true);
    try {
      const r = await criar("NOTIFICACOES", {
        tipo: form.tipo,
        id_unidade: Number(form.id_unidade),
        id_morador: form.id_morador ? Number(form.id_morador) : null,
        destinatario: form.destinatario.trim(),
        assunto: form.assunto.trim(),
        descricao: form.descricao.trim(),
        ocorrido_em: form.ocorrido_em || null,
        id_reincidencia_de: cadeiaEscolhida ? Number(cadeiaEscolhida) : null,
        // Notificação não leva dado de multa (o banco recusa, 0076).
        ...(form.tipo === MULTA
          ? {
              multa_valor: Number(String(form.multa_valor).replace(",", ".")),
              multa_base: form.multa_base.trim(),
              multa_vencimento: form.multa_vencimento,
              multa_forma_cobranca: form.multa_forma_cobranca.trim(),
            }
          : { multa_valor: null, multa_base: null, multa_vencimento: null, multa_forma_cobranca: null }),
        // Só grava justificativa quando ela de fato contornou a regra. Guardar
        // texto solto em registro que não contornou nada confunde quem lê depois.
        justificativa: precisaJustificar ? form.justificativa.trim() : null,
        created_by: user?.nome || "Sistema",
      });
      if (!r?.success) throw new Error(r?.message || "Não foi possível salvar.");
      toast.success(form.tipo === MULTA ? "Multa registrada." : "Notificação registrada.");
      setModalAberto(false);
      await carregar();
      setAberto(r.data ?? null);
    } catch (err) {
      toast.error(err?.message || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (registro) => {
    const ok = await confirmar({
      title: "Excluir este registro?",
      // Apagar uma notificação apaga a contagem que leva à multa. Quem
      // confirma precisa saber disso antes, não depois.
      description:
        "Apagar muda a contagem da unidade: uma infração que hoje exigiria multa " +
        "pode voltar a caber como notificação. Não dá para desfazer.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    const r = await remover("NOTIFICACOES", celula(registro, "id"));
    if (!r?.success) {
      // A primeira notificação de um motivo não sai enquanto houver
      // reincidências ligadas a ela (0075, `on delete restrict`): soltá-las
      // zeraria a contagem que leva à multa.
      const ligadas = /foreign key|violates|23503/i.test(String(r?.message || ""));
      return toast.error(
        ligadas
          ? "Esta é a primeira notificação de um motivo com reincidências. Exclua as reincidências antes."
          : r?.message || "Não foi possível excluir."
      );
    }
    toast.success("Registro excluído.");
    setAberto(null);
    await carregar();
  };

  /**
   * A carta é editável, como o comunicado.
   *
   * A folha nasce montada a partir dos campos, mas cada caso tem um parágrafo
   * próprio. O que for editado é gravado em `texto` e passa a ser a carta —
   * senão o papel entregue ao morador e o registro que sustenta a multa
   * seguinte divergem já na primeira correção de redação.
   */
  const editor = useEditor({
    extensions: [StarterKit, TextAlign.configure({ types: ["heading", "paragraph"] })],
    content: "",
    editorProps: { attributes: { class: "notif-editor" } },
    onUpdate: () => setTextoSujo(true),
  });

  useEffect(() => {
    if (!editor || !aberto || celula(aberto, "tipo") !== NOTIFICACAO) return;
    // `false` no segundo argumento: carregar a carta não é edição do usuário, e
    // sem isso o registro nasceria marcado como "não salvo" só por ter aberto.
    editor.commands.setContent(htmlDaNotificacao(aberto, dadosDo(aberto)), false);
    setTextoSujo(false);
    // `dadosDo` nasce de novo a cada render; o que decide recarregar a folha é
    // trocar de registro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, aberto]);

  const salvarTexto = async () => {
    if (!editor || !aberto || salvandoTexto) return;
    setSalvandoTexto(true);
    try {
      const html = editor.getHTML();
      const r = await editar("NOTIFICACOES", celula(aberto, "id"), { texto: html });
      if (!r?.success) throw new Error(r?.message || "Não foi possível salvar o texto.");
      setTextoSujo(false);
      setAberto(r.data ?? { ...aberto, texto: html });
      toast.success("Texto salvo.");
      await carregar();
    } catch (err) {
      toast.error(err?.message || "Não foi possível salvar o texto.");
    } finally {
      setSalvandoTexto(false);
    }
  };

  /**
   * Fechar com edição pendente perde a redação sem avisar — e quem editou uma
   * carta jurídica por dez minutos não descobre isso na hora, descobre ao
   * imprimir.
   */
  const fecharDetalhe = async () => {
    if (textoSujo) {
      const ok = await confirmar({
        title: "Sair sem salvar o texto?",
        description: "As alterações na redação da carta serão perdidas.",
        confirmLabel: "Sair sem salvar",
        danger: true,
      });
      if (!ok) return;
    }
    setTextoSujo(false);
    setAberto(null);
  };

  const anexosDe = (r) => (anexos ?? []).filter(
    (x) => String(celula(x, "id_notificacao")) === String(celula(r, "id"))
  );

  /**
   * Anexa a carta assinada.
   *
   * ARQUIVO PRIMEIRO, linha depois — e se a linha falhar, o arquivo volta. Na
   * outra ordem, um erro no upload deixaria uma linha apontando para um arquivo
   * que não existe, e a tela mostraria um anexo que não abre. Assim o pior caso
   * é um arquivo órfão que este mesmo bloco já remove.
   */
  const anexar = async (registro, arquivo) => {
    if (!arquivo || enviandoAnexo) return;
    const checagem = validarAnexo(arquivo);
    if (!checagem.ok) return toast.error(checagem.motivo);

    const id = celula(registro, "id");
    setEnviandoAnexo(true);
    try {
      const envio = await enviarAnexo("notificacoes", id, arquivo);
      if (!envio.success) throw new Error(envio.message || "Não foi possível subir o arquivo.");

      const linha = await criar("NOTIFICACOES_ANEXOS", {
        id_notificacao: Number(id),
        nome_arquivo: envio.nome || arquivo.name,
        caminho_storage: envio.caminho,
        created_by: user?.nome || "Sistema",
      });
      if (!linha?.success) {
        await removerAnexo(envio.caminho);
        throw new Error(linha?.message || "Não foi possível registrar o anexo.");
      }
      toast.success("Comprovante anexado.");
      await carregar();
    } catch (err) {
      toast.error(err?.message || "Não foi possível anexar.");
    } finally {
      setEnviandoAnexo(false);
    }
  };

  const abrirAnexo = async (anexo) => {
    const url = await urlDoAnexo({ caminho_storage: celula(anexo, "caminho_storage") });
    if (!url) return toast.error("Não foi possível abrir o arquivo.");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const tirarAnexo = async (anexo) => {
    const ok = await confirmar({
      title: "Apagar este comprovante?",
      description: "É a prova de que a notificação foi entregue e assinada. Não dá para desfazer.",
      confirmLabel: "Apagar",
      danger: true,
    });
    if (!ok) return;

    // Arquivo antes da linha: apagada a linha, o caminho no bucket é
    // irrecuperável e o arquivo vira armazenamento pago que ninguém enxerga.
    // `removerAnexo` já sabe que o Storage responde sem erro quando a política
    // barra — ele confere a lista do que realmente saiu.
    const arquivo = await removerAnexo(celula(anexo, "caminho_storage"));
    if (!arquivo.success) return toast.error(arquivo.message || "O arquivo não saiu do bucket.");

    const linha = await remover("NOTIFICACOES_ANEXOS", celula(anexo, "id"));
    if (!linha?.success) return toast.error(linha?.message || "O arquivo saiu, mas a linha ficou.");
    toast.success("Comprovante apagado.");
    await carregar();
  };

  /** Os campos que alimentam a carta e o e-mail, a partir do registro salvo. */
  const dadosDo = (r) => ({
    destinatario: celula(r, "destinatario"),
    unidade: celula(r, "id_unidade"),
    assunto: celula(r, "assunto"),
    descricao: celula(r, "descricao"),
    // A data da carta é a da EMISSÃO, e emissão é o instante em que o registro
    // nasce. Fixa: reimprimir daqui a um ano tem que sair com a data original.
    emitidaEm: celula(r, "created_at"),
    ocorridoEm: celula(r, "ocorrido_em"),
    notificacoesAnteriores: notificacoesAntesDe(registros, r),
    valor: celula(r, "multa_valor"),
    base: celula(r, "multa_base"),
    vencimento: celula(r, "multa_vencimento"),
    formaCobranca: celula(r, "multa_forma_cobranca"),
  });

  /**
   * O e-mail sai do sistema (0077): primeiro a prévia, com a escolha de para
   * quem vai; depois a função `enviar-notificacao`, que manda com a carta em
   * PDF e os anexos.
   *
   * A notificação vai com o texto que está na tela, o mesmo que sai no papel.
   * Regenerar aqui mandaria uma carta diferente da que o morador recebeu.
   */
  const emailDoMoradorDe = (r) => {
    const morador = (moradores ?? []).find(
      (m) => String(celula(m, "id")) === String(celula(r, "id_morador"))
    );
    return String(celula(morador, "email") || "").trim();
  };

  const textoDoEmail = (r) => (celula(r, "tipo") === MULTA
    ? corpoDoEmail(MULTA, dadosDo(r))
    : htmlParaTexto(editor?.getHTML() || htmlDaNotificacao(r, dadosDo(r))));

  const anexosDoEmail = (r) => [
    ...(celula(r, "tipo") === NOTIFICACAO ? [nomeDaCarta(celula(r, "id_unidade"))] : []),
    ...anexosDe(r).map((a) => celula(a, "nome_arquivo") || "anexo"),
  ];

  const enviarEmail = (r) => {
    // A carta editada e não salva sairia no e-mail diferente do registro: o
    // que o morador recebe tem que ser o que fica gravado.
    if (celula(r, "tipo") === NOTIFICACAO && textoSujo) {
      toast.error("Salve o texto da carta antes de enviar.");
      return;
    }
    setEnvioAberto(r);
  };

  const confirmarEnvio = async (para) => {
    const r = envioAberto;
    if (!r || enviando) return;
    setEnviando(true);
    try {
      // Na demonstração nada sai da máquina: o envio só é registrado.
      if (MODO_DEMO) {
        await criar("NOTIFICACOES_ENVIOS", {
          id_notificacao: Number(celula(r, "id")),
          enviado_em: new Date().toISOString(),
          enviado_por: user?.nome || "Demonstração",
          remetente: celula(r, "tipo") === MULTA ? REMETENTE_MULTA : REMETENTE_NOTIFICACAO,
          destinatarios: para,
          anexos: anexosDoEmail(r),
        });
        toast.success("Modo demonstração: o envio foi registrado, mas nenhum e-mail saiu.");
      } else {
        const cartaPdf = celula(r, "tipo") === NOTIFICACAO ? await pdfDaFolha(folhaRef.current) : undefined;
        const resposta = await chamarEdgeFunction("enviar-notificacao", {
          id_notificacao: Number(celula(r, "id")),
          para,
          texto: textoDoEmail(r),
          carta_pdf: cartaPdf,
        });
        if (!resposta.ok) throw new Error(mensagemDaEdgeFunction(resposta, "Não foi possível enviar o e-mail."));
        toast.success(`E-mail enviado para ${para.length} destinatário(s).`);
      }
      setEnvioAberto(null);
      await carregar();
    } catch (err) {
      toast.error(err?.message || "Não foi possível enviar o e-mail.");
    } finally {
      setEnviando(false);
    }
  };

  const enviosDe = (r) => (envios ?? [])
    .filter((e) => String(celula(e, "id_notificacao")) === String(celula(r, "id")))
    .slice()
    .sort((a, b) => String(celula(b, "enviado_em")).localeCompare(String(celula(a, "enviado_em"))));

  // Os envios do registro aberto e a situação de cada um no Resend: a ficha
  // (linha "E-mail") e a lista de envios usam a mesma consulta.
  const enviosDoAberto = aberto ? enviosDe(aberto) : [];
  const situacoesDoAberto = useSituacoesDosEnvios(aberto ? celula(aberto, "id") : null, enviosDoAberto, celula);

  const tipoNaLinha = (r) => (celula(r, "tipo") === MULTA
    ? <Badge tone="danger">Multa</Badge>
    : <Badge tone="neutral">{`${ordemNoMotivo(registros, r) || 1}ª notificação`}</Badge>);

  // Quantos motivos de alguma unidade já pedem multa na próxima infração.
  const motivosNoLimite = useMemo(() => {
    const ids = [...new Set((registros ?? []).map((r) => String(celula(r, "id_unidade"))))];
    return ids.reduce((n, u) => n + motivosDaUnidade(registros, u).filter((m) => m.exigeMulta).length, 0);
  }, [registros]);

  const itens = lista.slice(0, limite);
  const podeCriar = can(user, "criarNotificacao");

  return (
    <div>
      <PageHeader
        title="Notificações e multas"
        meta={
          carregando
            ? "Carregando"
            : `${contagem[NOTIFICACAO]} notificações · ${contagem[MULTA]} multas`
              + (motivosNoLimite ? ` · ${motivosNoLimite} ${motivosNoLimite === 1 ? "motivo já pede" : "motivos já pedem"} multa` : "")
        }
        actions={
          podeCriar && (
            <>
              <Button iconLeft={<Gavel size={15} />} onClick={() => abrirNovo(MULTA)}>Nova multa</Button>
              <Button variant="primary" iconLeft={<Plus size={16} />} onClick={() => abrirNovo()}>
                Nova notificação
              </Button>
            </>
          )
        }
      />

      <Filtros
        busca={busca}
        onBusca={(t) => { setBusca(t); setLimite(LOTE); }}
        placeholder="Unidade, destinatário ou assunto"
        rotuloFiltro="Tipo"
        filtro={filtroTipo}
        onFiltro={(t) => { setFiltroTipo(t); setLimite(LOTE); }}
        filtros={[
          ["TODOS", "Todos", contagem.TODOS],
          [NOTIFICACAO, "Notificações", contagem[NOTIFICACAO]],
          [MULTA, "Multas", contagem[MULTA]],
        ]}
      />

      {!carregando && lista.length === 0 ? (
        <EmptyState
          icon={<FileWarning size={22} />}
          title={registros.length ? "Nenhum registro neste filtro" : "Nenhuma notificação ainda"}
          description={registros.length
            ? "Troque o tipo ou a busca."
            : `Notificações e multas cadastradas aparecem aqui, com o histórico de cada unidade. A cada ${LIMITE} notificações sobre o mesmo motivo, a próxima infração é multa.`}
          action={!registros.length && podeCriar
            ? <Button variant="primary" iconLeft={<Plus size={16} />} onClick={() => abrirNovo()}>Nova notificação</Button>
            : undefined}
        />
      ) : (
        <ListaQueAbre
          colunas={[
            { rotulo: "Unidade", largura: "100px", ordem: "id_unidade" },
            { rotulo: "Tipo", largura: "140px", ordem: "tipo" },
            { rotulo: "Destinatário", largura: "minmax(0, 1.2fr)", ordem: "destinatario" },
            { rotulo: "Assunto", largura: "minmax(0, 1.6fr)", ordem: "assunto" },
            { rotulo: "Ocorrida em", largura: "120px", ordem: "ocorrido_em" },
            { rotulo: "Emitida em", largura: "120px", ordem: "created_at" },
          ]}
          ordenacao={ordem}
          onOrdenar={ordenar}
          larguraAcoes="56px"
          itens={itens}
          carregando={carregando}
          chave={(r) => celula(r, "id")}
          onAbrir={setAberto}
          rotuloDaLinha={(r) => `Abrir a ${celula(r, "tipo") === MULTA ? "multa" : "notificação"} de ${unidadeCurta(celula(r, "id_unidade"))}`}
          celulas={(r) => [
            <b key="u" className="conf-dado__mono">{unidadeCurta(celula(r, "id_unidade"))}</b>,
            <span key="t">{tipoNaLinha(r)}</span>,
            <span key="d" className="mud-quem"><b>{nomeProprio(celula(r, "destinatario")) || "—"}</b></span>,
            <span key="a" className="mud-quem">
              <b>
                {celula(r, "assunto") || "—"}
                {celula(r, "justificativa") ? <MessageSquareText size={13} aria-label="Seguiu como notificação com justificativa" /> : null}
              </b>
            </span>,
            <span key="o">{dataPorExtenso(celula(r, "ocorrido_em")) || "—"}</span>,
            <span key="e">{dataPorExtenso(celula(r, "created_at"))}</span>,
          ]}
          acoes={(r) => (
            <Button variant="ghost" size="sm" aria-label={`Ver a ${celula(r, "tipo") === MULTA ? "multa" : "notificação"} de ${unidadeCurta(celula(r, "id_unidade"))}`}
              onClick={() => setAberto(r)}><Eye size={16} /></Button>
          )}
        />
      )}
      {lista.length > limite && (
        <div className="mud-mais">
          <Button variant="ghost" onClick={() => setLimite((n) => n + LOTE)}>
            Mostrar mais ({lista.length - limite} restantes)
          </Button>
        </div>
      )}

      {/* ------------------------------ CADASTRO ------------------------------ */}
      <Modal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        title={form.tipo === MULTA ? "Nova multa" : "Nova notificação"}
        size="lg"
        footer={
          <div className="app-modal__acoes">
            <span />
            <Button variant="ghost" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="form-notificacao" loading={salvando}>
              {form.tipo === MULTA ? "Registrar multa" : "Registrar notificação"}
            </Button>
          </div>
        }
      >
        <form id="form-notificacao" className="notif-form" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          {/* O tipo é escolha de quem cadastra. A regra das 2 notificações
              continua valendo (a trava abaixo empurra para a multa), mas há
              infração que a Convenção ou a lei pune com multa direta. */}
          <Field label="O que vai registrar?" required>
            <Opcoes
              rotulo="Tipo do registro"
              valor={form.tipo}
              onMudar={(v) => campo("tipo", v)}
              opcoes={[
                [NOTIFICACAO, "Notificação"],
                [MULTA, "Multa"],
              ]}
            />
          </Field>

          {form.tipo === MULTA && !cadeiaEscolhida && (
            <div className="notif-contagem">
              <Gavel size={18} />
              <span>
                <strong>Multa direta</strong>, sem notificações anteriores sobre o motivo. Use quando a
                Convenção, o Regulamento ou a lei preveem multa já na primeira infração. Se for
                reincidência, marque abaixo de qual notificação.
              </span>
            </div>
          )}

          <Field label="Unidade" required error={erros.id_unidade}>
            <BuscaUnidade
              unidades={unidades}
              valor={unidadePorId.get(String(form.id_unidade)) ?? null}
              onEscolher={(u) => campo("id_unidade", u ? String(celula(u, "id")) : "")}
              aria-invalid={Boolean(erros.id_unidade)}
            />
          </Field>

          {/* A REINCIDÊNCIA (0075). A multa só vem na 3ª infração sobre o MESMO
              motivo, e quem sabe se é o mesmo motivo é quem cadastra: o sistema
              não adivinha isso pela descrição. Por isso a pergunta é explícita,
              e a lista mostra os motivos que a unidade já tem. */}
          {form.id_unidade && (motivos.length ? (
            <div className="notif-reincidencia">
              <Chave
                ligada={form.reincidencia}
                onChange={(v) => campo("reincidencia", v)}
                titulo="É reincidência"
                sub="De uma notificação que esta unidade já recebeu, sobre o mesmo motivo"
              />
              {form.reincidencia && (
                <Field label="De qual notificação?" required error={erros.id_reincidencia_de}>
                  <div className="notif-motivos" role="radiogroup" aria-label="Notificação de origem">
                    {motivos.map((m) => {
                      const escolhido = String(form.id_reincidencia_de) === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          role="radio"
                          aria-checked={escolhido}
                          className={`notif-motivo${escolhido ? " notif-motivo--escolhido" : ""}`}
                          onClick={() => campo("id_reincidencia_de", m.id)}
                        >
                          <span className="notif-motivo__texto">
                            <strong>{resumoDoMotivo(m.raiz)}</strong>
                            <small>
                              1ª em {dataPorExtenso(celula(m.raiz, "created_at"))}
                              {" · "}{m.emAberto} notificação(ões) em aberto
                              {m.registros.length > 1 ? ` · última em ${dataPorExtenso(celula(m.ultima, "created_at"))}` : ""}
                            </small>
                          </span>
                          {m.exigeMulta && <Badge tone="danger">Próxima é multa</Badge>}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}
            </div>
          ) : (
            <div className="notif-contagem">
              <Gavel size={18} />
              <span>Esta unidade não tem notificações anteriores. Esta é a primeira.</span>
            </div>
          ))}

          {form.id_unidade && cadeiaEscolhida && (
            <div className={`notif-contagem${travado ? " notif-contagem--alerta" : ""}`}>
              {travado ? <AlertTriangle size={18} /> : <Gavel size={18} />}
              <span>
                <strong>Este motivo</strong>{" "}
                tem {emAberto.length} notificação(ões) em aberto
                {travado ? ". Esta infração exige multa." : `, de ${LIMITE}. Esta será a ${emAberto.length + 1}ª.`}
              </span>
            </div>
          )}

          {precisaJustificar && (
            <div className="notif-trava">
              <div className="notif-trava__titulo">
                <AlertTriangle size={18} />
                Este motivo já acumulou {LIMITE} notificações sem multa
              </div>
              <ol className="notif-trava__lista">
                {emAberto.map((n, i) => (
                  <li key={celula(n, "id") ?? i}>
                    {dataPorExtenso(celula(n, "created_at"))}: {resumoDoMotivo(n)}
                  </li>
                ))}
              </ol>
              <Button variant="primary" onClick={() => campo("tipo", MULTA)}>
                Cadastrar multa
              </Button>
              <div className="notif-trava__saida">
                <Field
                  label="Ou seguir como notificação, justificando"
                  error={erros.justificativa}
                  help="Fica gravado no registro, junto com quem cadastrou."
                >
                  <Textarea
                    rows={2}
                    value={form.justificativa}
                    onChange={(e) => campo("justificativa", e.target.value)}
                    placeholder="Por que esta infração não vira multa?"
                  />
                </Field>
              </div>
            </div>
          )}

          <Field
            label="Destinatário"
            required
            error={erros.destinatario}
            help={
              form.id_unidade && !moradoresDaUnidade.length
                ? "Nenhum morador cadastrado nesta unidade. Escreva o nome."
                : "Sugestões vêm dos moradores da unidade; dá para escrever outro nome."
            }
          >
            <Input
              list="notif-moradores"
              value={form.destinatario}
              onChange={(e) => {
                const escolhido = moradoresDaUnidade.find((m) => m.nome === e.target.value);
                setForm((f) => ({
                  ...f,
                  destinatario: e.target.value,
                  id_morador: escolhido?.id ?? "",
                }));
                setErros((x) => ({ ...x, destinatario: "" }));
              }}
              onBlur={(e) => { if (!form.id_morador) campo("destinatario", nomeProprio(e.target.value)); }}
              placeholder="Nome de quem recebe"
            />
          </Field>
          <datalist id="notif-moradores">
            {moradoresDaUnidade.map((m) => (
              <option key={m.nome} value={m.nome} label={m.doApp ? "Usa o app" : undefined} />
            ))}
          </datalist>

          <Field label="Assunto" required error={erros.assunto}>
            <Input value={form.assunto} onChange={(e) => campo("assunto", e.target.value)} />
          </Field>

          {/* A IA monta o parágrafo formal a partir do relato informal e, na
              mesma resposta, sugere o fundamento. O texto cai na Descrição,
              que continua editável. */}
          <RedacaoComIA
            key={`redacao-${modalAberto}`}
            tipo={form.tipo}
            onRedigido={({ descricao, itens, origem }) => {
              if (descricao) campo("descricao", descricao);
              setRedacao((r) => ({ versao: r.versao + 1, itens, origem }));
            }}
          />

          <Field
            label="Descrição da infração"
            required
            error={erros.descricao}
            help="É este texto que sai na carta, depois de “consistente em:”."
          >
            <Textarea
              rows={6}
              value={form.descricao}
              onChange={(e) => campo("descricao", e.target.value)}
              placeholder="O que aconteceu, quando e onde."
            />
          </Field>

          {/* O item da Convenção que fundamenta a infração, sugerido a partir
              da descrição. Na multa vira a Base; na notificação, o fundamento
              ao fim da descrição, que é o texto da carta. */}
          <SugestaoDaConvencao
            key={`${form.id_unidade}-${modalAberto}-${redacao.versao}`}
            descricao={form.descricao}
            tipo={form.tipo}
            onUsar={usarArtigo}
            prontas={redacao.versao ? redacao : null}
          />

          {/* DADOS DA MULTA (0076). O pedido à administradora sai com eles
              preenchidos, em vez de lacunas. Ficam gravados no registro: o
              e-mail é remontado a partir dele a cada envio. */}
          {form.tipo === MULTA && (
            <div className="notif-dados-multa">
              <div className="notif-dados-multa__titulo">
                <Gavel size={18} />
                Dados da multa
              </div>
              <div className="notif-dados-multa__grade">
                <Field label="Valor da multa (R$)" required error={erros.multa_valor}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={form.multa_valor}
                    onChange={(e) => campo("multa_valor", e.target.value)}
                    placeholder="Ex.: 150,00"
                  />
                </Field>
                <Field label="Vencimento" required error={erros.multa_vencimento}>
                  <Input
                    type="date"
                    value={form.multa_vencimento}
                    onChange={(e) => campo("multa_vencimento", e.target.value)}
                  />
                </Field>
              </div>
              <Field
                label="Base na Convenção / Regulamento"
                error={erros.multa_base}
                help="Opcional. Sem ela, a linha da base não aparece no e-mail."
              >
                <Input
                  value={form.multa_base}
                  onChange={(e) => campo("multa_base", e.target.value)}
                  placeholder="Ex.: Regulamento Interno, art. 12, parágrafo 2º"
                />
              </Field>
              <Field
                label="Forma de cobrança"
                required
                error={erros.multa_forma_cobranca}
                help="Escolha uma sugestão ou escreva outra."
              >
                <Input
                  list="notif-formas-cobranca"
                  value={form.multa_forma_cobranca}
                  onChange={(e) => campo("multa_forma_cobranca", e.target.value)}
                  placeholder="Como a multa será cobrada"
                />
              </Field>
              <datalist id="notif-formas-cobranca">
                {FORMAS_DE_COBRANCA.map((f) => <option key={f} value={f} />)}
              </datalist>
            </div>
          )}

          <Field label="Data da ocorrência" help="Quando o fato aconteceu. A carta leva a data de hoje, que é a da emissão.">
            <Input
              type="date"
              value={form.ocorrido_em}
              onChange={(e) => campo("ocorrido_em", e.target.value)}
            />
          </Field>
        </form>
      </Modal>

      {/* ------------------------------ DETALHE ------------------------------ */}
      <Modal
        open={Boolean(aberto)}
        onClose={fecharDetalhe}
        title={
          aberto
            ? `${celula(aberto, "tipo") === MULTA ? "Multa" : "Notificação"} · ${unidadeCurta(celula(aberto, "id_unidade"))}`
            : ""
        }
        size="lg"
        footer={
          aberto && (
            <div className="app-modal__acoes">
              {can(user, "excluirNotificacao")
                ? <Button variant="ghost" iconLeft={<Trash2 size={16} />} onClick={() => excluir(aberto)}>Excluir</Button>
                : <span />}
              {/* A multa não vira papel: ela é pedido à administradora, não
                  documento que se entrega ao morador. */}
              {celula(aberto, "tipo") === NOTIFICACAO && (
                <Button variant="secondary" className="res-contrato" iconLeft={<Printer size={16} />} onClick={() => window.print()}>
                  Imprimir / PDF
                </Button>
              )}
              <Button variant="primary" iconLeft={<Mail size={16} />} onClick={() => enviarEmail(aberto)}>
                Enviar por e-mail
              </Button>
            </div>
          )
        }
      >
        {aberto && (
          <div className="app-modal">
            <div className="app-modal__topo">
              <Iniciais nome={celula(aberto, "destinatario")} grande />
              <div className="app-modal__quem">
                <strong>{nomeProprio(celula(aberto, "destinatario")) || "—"}</strong>
                <small>{rotuloDaUnidade(celula(aberto, "id_unidade"))} · emitida em {dataPorExtenso(celula(aberto, "created_at"))}</small>
                <span className="app-modal__selos">{tipoNaLinha(aberto)}</span>
              </div>
            </div>

            {/* O desenho do detalhe de Encomendas: a carta (ou o e-mail da multa)
                à esquerda, no lugar da foto; os dados e as provas à direita. */}
            <div className="app-detalhe app-detalhe--largo">
              <div className="app-detalhe__visual">
                <p className="app-detalhe__legenda">
                  {celula(aberto, "tipo") === MULTA ? "E-mail para a administradora" : "Carta"}
                </p>
              {aberto && (celula(aberto, "tipo") === NOTIFICACAO ? (
                <>
                  {/* A barra fica FORA da folha: dentro dela, sairia impressa junto.
                      É por isso que a regra de impressão mira `.notif-folha`. */}
                  {editor && (
                    <div className="notif-barra" role="toolbar" aria-label="Formatação da carta">
                      <button type="button" title="Desfazer" aria-label="Desfazer" onClick={() => editor.chain().focus().undo().run()}>
                        <Undo size={15} />
                      </button>
                      <button type="button" title="Refazer" aria-label="Refazer" onClick={() => editor.chain().focus().redo().run()}>
                        <Redo size={15} />
                      </button>
                      <span className="notif-barra__risco" />
                      <button
                        type="button" title="Negrito" aria-label="Negrito" aria-pressed={editor.isActive("bold")}
                        className={editor.isActive("bold") ? "ativo" : ""}
                        onClick={() => editor.chain().focus().toggleBold().run()}
                      ><Bold size={15} /></button>
                      <button
                        type="button" title="Itálico" aria-label="Itálico" aria-pressed={editor.isActive("italic")}
                        className={editor.isActive("italic") ? "ativo" : ""}
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                      ><Italic size={15} /></button>
                      <span className="notif-barra__risco" />
                      <button type="button" title="À esquerda" aria-label="Alinhar à esquerda" onClick={() => editor.chain().focus().setTextAlign("left").run()}>
                        <AlignLeft size={15} />
                      </button>
                      <button type="button" title="Centralizado" aria-label="Centralizar" onClick={() => editor.chain().focus().setTextAlign("center").run()}>
                        <AlignCenter size={15} />
                      </button>
                      <button type="button" title="Justificado" aria-label="Justificar" onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
                        <AlignJustify size={15} />
                      </button>
                      <span className="notif-barra__estado">
                        {textoSujo ? "alterações não salvas" : "salvo"}
                      </span>
                      <Button size="sm" variant="secondary" loading={salvandoTexto} disabled={!textoSujo} onClick={salvarTexto}>
                        Salvar texto
                      </Button>
                    </div>
                  )}
                  <div className="notif-folha" ref={folhaRef}>
                    <div className="notif-folha__topo">
                      <img src="/favicon.png" alt="" />
                      <span>Condomínio Diduccio</span>
                    </div>
                    <EditorContent editor={editor} className="notif-folha__corpo" />
                  </div>
                </>
              ) : (
                <div className="notif-multa">
                  <p className="notif-nota">
                    Vai para {DESTINATARIOS_EMAIL.join(" e ")}.
                    {/* Multa de antes da 0076 não tem os dados: o que faltar sai entre
                        colchetes, e a tela diz por quê. */}
                    {corpoDoEmail(MULTA, dadosDo(aberto)).includes("[  ") &&
                      " Os dados entre colchetes não foram informados no cadastro desta multa."}
                  </p>
                  <div className="notif-email">{corpoDoEmail(MULTA, dadosDo(aberto))}</div>
                </div>
              ))}

              </div>

              <div className="app-detalhe__dados">
                <Ficha titulo="Registro" itens={[
                  ["Para", nomeProprio(celula(aberto, "destinatario")) || "—"],
                  ["Unidade", rotuloDaUnidade(celula(aberto, "id_unidade"))],
                  ["Infração em", dataPorExtenso(celula(aberto, "ocorrido_em")) || "Não informada"],
                  ["Emitida em", dataPorExtenso(celula(aberto, "created_at"))],
                  ["E-mail", <StatusDoEmail envios={enviosDoAberto} situacoes={situacoesDoAberto} celula={celula} />],
                  ["Leitura", <StatusDaLeitura id={celula(aberto, "id")} envios={enviosDoAberto} situacoes={situacoesDoAberto} celula={celula} />],
                ]} />
                {/* O COMPROVANTE ASSINADO.
                    É ele que prova que a notificação chegou ao morador. Sem ele, a
                    multa seguinte se apoia num registro que só o próprio condomínio
                    afirma — e o anexo é o que a assembleia vai querer ver.
                    Fica no detalhe, e não no cadastro, porque a ordem real é: registra,
                    imprime, entrega, colhe a assinatura, volta e anexa. */}
                {aberto && (
                  <div className="notif-anexos">
                    <div className="notif-anexos__topo">
                      <Paperclip size={16} />
                      <strong>Comprovante assinado</strong>
                      <span className="notif-anexos__conta">{anexosDe(aberto).length}</span>
                    </div>

                    {anexosDe(aberto).length ? (
                      <ul className="notif-anexos__lista">
                        {anexosDe(aberto).map((a) => {
                          const nome = celula(a, "nome_arquivo") || "arquivo";
                          const pdf = /\.pdf$/i.test(nome);
                          return (
                            <li key={celula(a, "id")} className="notif-anexos__item">
                              <button type="button" className="notif-anexos__abrir" onClick={() => abrirAnexo(a)}>
                                {pdf ? <FileText size={16} /> : <ImageIcon size={16} />}
                                <span>{nome}</span>
                                <small>{dataPorExtenso(celula(a, "created_at"))}</small>
                              </button>
                              {can(user, "excluirNotificacao") && (
                                <button
                                  type="button"
                                  className="notif-anexos__tirar"
                                  aria-label={`Apagar ${nome}`}
                                  onClick={() => tirarAnexo(a)}
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="notif-anexos__vazio">
                        Nada anexado ainda. Imprima, colha a assinatura do morador e anexe a foto
                        ou o PDF da carta assinada.
                      </p>
                    )}

                    {podeCriar && (
                      <label className={`notif-anexos__novo${enviandoAnexo ? " notif-anexos__novo--ocupado" : ""}`}>
                        <Paperclip size={16} />
                        {enviandoAnexo ? "Enviando…" : "Anexar foto ou PDF"}
                        {/* O campo cobre o próprio rótulo (ver notificacoes.css): clique
                            encaminhado a campo escondido é ignorado em parte dos
                            celulares. O `key` zera o campo depois de cada envio: sem
                            isso, escolher o MESMO arquivo de novo não dispara `onChange`. */}
                        <Input
                          key={`${celula(aberto, "id")}-${anexosDe(aberto).length}`}
                          className="notif-anexos__campo"
                          type="file"
                          accept="image/*,application/pdf"
                          aria-label="Anexar foto ou PDF da carta assinada"
                          disabled={enviandoAnexo}
                          onChange={(e) => anexar(aberto, e.target.files?.[0])}
                        />
                      </label>
                    )}
                  </div>
                )}

                {/* Os envios por e-mail (0077): a prova de que saiu, e para quem. */}
                {aberto && <EnviosDaNotificacao envios={enviosDoAberto} situacoes={situacoesDoAberto} celula={celula} />}

                {/* No app do morador (0099): desde quando, corrigida, quem abriu.
                    O e-mail e o comprovante anexado emitem a notificação: o
                    bloco recarrega com qualquer um dos dois. */}
                {aberto && <VistaNoApp id={celula(aberto, "id")} versao={`${enviosDe(aberto).length}-${anexosDe(aberto).length}`} />}

                {/* O motivo deste registro: a primeira notificação e as reincidências,
                    na ordem em que aconteceram. É o que sustenta (ou não) a multa. */}
                {aberto && registrosDaCadeia(registros, celula(aberto, "id_unidade"), cadeiaDe(aberto)).length > 1 && (
                  <div className="notif-historico">
                    <strong>Histórico deste motivo</strong>
                    <ol>
                      {registrosDaCadeia(registros, celula(aberto, "id_unidade"), cadeiaDe(aberto)).slice().reverse().map((r) => (
                        <li key={celula(r, "id")} className={String(celula(r, "id")) === String(celula(aberto, "id")) ? "notif-historico__este" : ""}>
                          {dataPorExtenso(celula(r, "created_at"))}{" · "}
                          {celula(r, "tipo") === MULTA ? "Multa" : `${ordemNoMotivo(registros, r)}ª notificação`}
                          {": "}{resumoDoMotivo(r, 70)}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {aberto && celula(aberto, "justificativa") && (
                  <p className="notif-justificativa">
                    <strong>Seguiu como notificação apesar da 3ª:</strong>{" "}
                    {celula(aberto, "justificativa")}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {envioAberto && (
        <EnvioPorEmail
          key={celula(envioAberto, "id")}
          aberto
          onClose={() => setEnvioAberto(null)}
          tipo={celula(envioAberto, "tipo")}
          assunto={assuntoDoEmail(celula(envioAberto, "tipo"), celula(envioAberto, "id_unidade"))}
          texto={textoDoEmail(envioAberto)}
          anexos={anexosDoEmail(envioAberto)}
          emailDoMorador={emailDoMoradorDe(envioAberto)}
          enviando={enviando}
          onEnviar={confirmarEnvio}
        />
      )}
    </div>
  );
}
