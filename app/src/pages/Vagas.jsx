import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Car, Bike, Search, Plus, Edit2, Trash2, Eye, Tag as TagIcon,
  FileText, Download, RotateCcw, ChevronLeft, ChevronRight,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { sanitizarCelula } from "../lib/drive";
import { listar, criar, editar, remover } from "../api/db";
import { can } from "../auth/permissions";
import BuscaUnidade from "../components/BuscaUnidade";
import {
  TIPOS_SOLICITANTE, descreverVeiculo, escolhaTravada, podeMexerNaTag,
  statusQuePodeEscolher, veiculoDaVaga,
} from "../lib/tags";
import { dataBR, formatCurrency } from "../lib/format";
import {
  Button, Badge, Table, Tabs, Modal, Field, Input, Select, Textarea, Checkbox,
  PageHeader, EmptyState, useToast, useConfirm,
} from "../ui";

// Verde da marca em RGB, para o jsPDF, que não aceita hex.
const VERDE_PDF = [227, 90, 58];
const TINTA_PDF = [26, 28, 25];

// `vagas` e `tags` são cadastro de VEÍCULO. Desde o 0037 a portaria também lê,
// cria e edita — apagar continua só do síndico. Quem esbarrar numa dessas
// bordas recebe do Postgres uma mensagem sobre row-level security, que não diz
// nada a quem está na tela.
const mensagemErro = (msg) => {
  if (!msg) return "Não foi possível salvar. Tente novamente.";
  if (/row-level security|permission denied|PGRST116|coerce the result/i.test(msg)) {
    return "Você não tem permissão para alterar vagas e TAGs.";
  }
  return msg;
};

// "Disponivel" sem acento é o valor gravado na planilha. O rótulo exibido
// leva acento, mas o value enviado precisa continuar idêntico.
const STATUS_TAG = [
  { value: "Solicitado", label: "Solicitado" },
  { value: "Disponivel", label: "Disponível" },
  { value: "Aplicado", label: "Aplicado" },
];

const TOM_TAG = {
  Aplicado: "positive",
  Disponivel: "brand",
  Solicitado: "neutral",
};

const FORM_VAGA = {
  id: "", id_unidade: "",
  possui_carro: "Não", placa_carro: "", modelo_carro: "", cor_carro: "", status_carro: "Ativo",
  possui_moto: "Não", placa_moto: "", modelo_moto: "", cor_moto: "", status_moto: "Ativo",
  observacoes: "",
};

const FORM_TAG = {
  id: "", id_vagas: "", id_unidade: "", veiculo: "Carro", status: "Solicitado",
  // A ficha que entrou no 0041. Placa, modelo e cor NAO estao aqui: sao da
  // vaga, e a tela puxa de la pelo `id_vagas`.
  nome_solicitante: "", tipo_solicitante: "", custo_total: "", data_entrega: "",
  observacoes: "",
};

const COLUNAS_EXPORT = [
  { id: "unidade", label: "Unidade" },
  { id: "veiculos", label: "Tipos de veículo" },
  { id: "placas", label: "Modelos e placas" },
  { id: "tag", label: "Status da TAG" },
  { id: "obs", label: "Observações" },
];

const placaMaiuscula = (v) => String(v ?? "").toUpperCase().slice(0, 8);

export default function Vagas({ user }) {
  // Só o que o banco deixa. Esconder botão não protege nada sozinho — quem
  // recusa é o RLS do 0015 e do 0037 —, mas oferecer um botão que sempre falha
  // é pior do que não ter botão.
  //
  // O porteiro cai aqui com as três primeiras falsas: ele vê a vaga e corrige
  // a TAG, e é só isso.
  const podeEditarVaga = can(user, "editarVaga");
  const podeCriarTag = can(user, "criarTag");
  // O porteiro anda com a TAG só para a frente: ele PEDE (Solicitado, na
  // criação) e MARCA que colou (Aplicado, na edição). "Disponivel" é a
  // administração dizendo que comprou o adesivo, e voltar atrás também é dela.
  // O <select> limitado é só o aviso — a recusa mesmo vem do 0038.
  const podeDefinirStatus = can(user, "definirStatusTag");
  const podeEditarTag = can(user, "editarTag");
  const podeExcluir = can(user, "excluirVaga");
  const toast = useToast();
  const confirm = useConfirm();

  const [vagas, setVagas] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [tags, setTags] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [aba, setAba] = useState("vagas");

  const [modalVaga, setModalVaga] = useState(false);
  const [modalTag, setModalTag] = useState(false);
  const [modalExport, setModalExport] = useState(false);
  const [detalhe, setDetalhe] = useState(null);
  const [modo, setModo] = useState("add");
  const [form, setForm] = useState(FORM_VAGA);
  const [formTag, setFormTag] = useState(FORM_TAG);
  const [erroForm, setErroForm] = useState({});
  const [erroTag, setErroTag] = useState({});

  const [busca, setBusca] = useState("");
  const [fBloco, setFBloco] = useState("Todos");
  const [fTag, setFTag] = useState("Todos");
  const [fVeiculo, setFVeiculo] = useState("Todos");

  const [buscaTag, setBuscaTag] = useState("");
  const [fStatusTag, setFStatusTag] = useState("Todos");

  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(50);

  const [colunasExport, setColunasExport] = useState(
    COLUNAS_EXPORT.map((c) => ({ ...c, selected: c.id !== "obs" }))
  );

  const nomeUsuario = user?.nome || "Sistema";

  const buscarDados = useCallback(async () => {
    try {
      setCarregando(true);
      // `listar` lança em erro de rede ou de banco; o catch abaixo cobre. As
      // três leituras são independentes, então seguem em paralelo.
      const [rV, rU, rT] = await Promise.all([
        listar("VAGAS"),
        listar("UNIDADES"),
        listar("TAGS"),
      ]);
      setVagas(Array.isArray(rV) ? rV : []);
      setUnidades(Array.isArray(rU) ? rU : []);
      setTags(Array.isArray(rT) ? rT : []);
    } catch {
      toast.error("Não foi possível carregar as vagas. Verifique a conexão.");
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    buscarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- derivados ---------------- */

  const unidadePorId = useMemo(() => {
    const m = new Map();
    unidades.forEach((u) => m.set(String(u.id), u));
    return m;
  }, [unidades]);

  const rotuloUnidade = useCallback(
    (id) => {
      const u = unidadePorId.get(String(id));
      return u ? `B${u.bloco}-${u.unidade}` : String(id || "");
    },
    [unidadePorId]
  );

  const tagDaUnidade = useCallback(
    (idUnidade) => tags.find((t) => String(t.id_unidade) === String(idUnidade)),
    [tags]
  );

  const unidadesOrdenadas = useMemo(
    () =>
      [...unidades].sort((a, b) => {
        const bloco = String(a.bloco).localeCompare(String(b.bloco), "pt-BR", { numeric: true });
        return bloco !== 0
          ? bloco
          : String(a.unidade).localeCompare(String(b.unidade), "pt-BR", { numeric: true });
      }),
    [unidades]
  );

  const blocos = useMemo(
    () => ["Todos", ...new Set(unidades.map((u) => String(u.bloco)).filter(Boolean))].sort(),
    [unidades]
  );

  // A lista de "unidades que já têm vaga" saiu junto com o <select> da TAG, que
  // era quem a usava. A regra não sumiu: ela virou a validação do salvar, que
  // além de barrar diz o que fazer — e é a diferença entre a pessoa não achar a
  // unidade e ela saber que precisa cadastrar a vaga primeiro.

  const linhasVagas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return vagas.filter((v) => {
      const u = unidadePorId.get(String(v.id_unidade));
      const rotulo = u ? `B${u.bloco}-${u.unidade}` : String(v.id_unidade || "");
      const casaBusca =
        termo === "" ||
        rotulo.toLowerCase().includes(termo) ||
        String(v.placa_carro || "").toLowerCase().includes(termo) ||
        String(v.placa_moto || "").toLowerCase().includes(termo) ||
        String(v.modelo_carro || "").toLowerCase().includes(termo) ||
        String(v.modelo_moto || "").toLowerCase().includes(termo);

      const casaBloco = fBloco === "Todos" || String(u?.bloco) === fBloco;

      const statusTag = tagDaUnidade(v.id_unidade)?.status ?? "Sem Tag";
      const casaTag = fTag === "Todos" || statusTag === fTag;

      const casaVeiculo =
        fVeiculo === "Todos" ||
        (fVeiculo === "Carro" && v.possui_carro === "Sim") ||
        (fVeiculo === "Moto" && v.possui_moto === "Sim") ||
        (fVeiculo === "Nenhum" && v.possui_carro !== "Sim" && v.possui_moto !== "Sim");

      return casaBusca && casaBloco && casaTag && casaVeiculo;
    });
  }, [vagas, busca, fBloco, fTag, fVeiculo, unidadePorId, tagDaUnidade]);

  const linhasTags = useMemo(() => {
    const termo = buscaTag.trim().toLowerCase();
    return tags.filter((t) => {
      const casaBusca = termo === "" || rotuloUnidade(t.id_unidade).toLowerCase().includes(termo);
      const casaStatus = fStatusTag === "Todos" || t.status === fStatusTag;
      return casaBusca && casaStatus;
    });
  }, [tags, buscaTag, fStatusTag, rotuloUnidade]);

  const totalPaginas = porPagina === "Todos" ? 1 : Math.max(1, Math.ceil(linhasVagas.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const vagasExibidas = porPagina === "Todos"
    ? linhasVagas
    : linhasVagas.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  useEffect(() => { setPagina(1); }, [busca, fBloco, fTag, fVeiculo, porPagina]);

  const temFiltroVaga = busca || fBloco !== "Todos" || fTag !== "Todos" || fVeiculo !== "Todos";
  const temFiltroTag = buscaTag || fStatusTag !== "Todos";

  const limparVagas = () => { setBusca(""); setFBloco("Todos"); setFTag("Todos"); setFVeiculo("Todos"); };
  const limparTags = () => { setBuscaTag(""); setFStatusTag("Todos"); };

  /* ---------------- vaga ---------------- */

  const abrirNovaVaga = () => {
    setModo("add");
    setForm(FORM_VAGA);
    setErroForm({});
    setModalVaga(true);
  };

  const abrirEdicaoVaga = (v) => {
    setModo("edit");
    setForm({ ...FORM_VAGA, ...v });
    setErroForm({});
    setModalVaga(true);
  };

  const validarVaga = () => {
    const e = {};
    if (!form.id_unidade) {
      e.id_unidade = "Escolha a unidade.";
    } else if (modo === "add" && vagas.some((v) => String(v.id_unidade) === String(form.id_unidade))) {
      e.id_unidade = `A unidade ${rotuloUnidade(form.id_unidade)} já tem registro de vaga.`;
    }
    if (form.possui_carro === "Sim" && !String(form.placa_carro).trim()) {
      e.placa_carro = "Informe a placa do carro.";
    }
    if (form.possui_moto === "Sim" && !String(form.placa_moto).trim()) {
      e.placa_moto = "Informe a placa da moto.";
    }
    setErroForm(e);
    return Object.keys(e).length === 0;
  };

  const salvarVaga = async () => {
    if (!validarVaga()) return;

    // Payload explícito em vez de espalhar `form` inteiro:
    // - `id_unidade` sai do <select> como string e a coluna é bigint com FK.
    // - Sem `id` no cadastro: o banco gera o bigint sozinho. O Apps Script
    //   usava `Date.now()` como id, o que aqui estouraria a sequência.
    // - `created_at` não vai: o DEFAULT now() da coluna resolve, e mandar do
    //   cliente deixaria a data à mercê do relógio da máquina de quem cadastra.
    const dados = {
      id_unidade: Number(form.id_unidade),
      possui_carro: form.possui_carro,
      vaga_carro: form.vaga_carro || null,
      placa_carro: form.placa_carro || null,
      modelo_carro: form.modelo_carro || null,
      cor_carro: form.cor_carro || null,
      status_carro: form.status_carro || null,
      possui_moto: form.possui_moto,
      vaga_moto: form.vaga_moto || null,
      placa_moto: form.placa_moto || null,
      modelo_moto: form.modelo_moto || null,
      cor_moto: form.cor_moto || null,
      status_moto: form.status_moto || null,
      observacoes: form.observacoes || null,
      created_by: nomeUsuario,
    };

    setSalvando(true);
    try {
      const r = modo === "add"
        ? await criar("VAGAS", dados)
        : await editar("VAGAS", form.id, dados);

      if (!r.success) {
        toast.error(mensagemErro(r.message));
        return;
      }

      setModalVaga(false);
      await buscarDados();
      toast.success(
        modo === "add"
          ? `Vaga da unidade ${rotuloUnidade(form.id_unidade)} cadastrada`
          : `Vaga da unidade ${rotuloUnidade(form.id_unidade)} atualizada`
      );
    } catch {
      toast.error("Não foi possível salvar. Sua edição continua aqui.");
    } finally {
      setSalvando(false);
    }
  };

  /* ---------------- TAG ---------------- */

  const abrirNovaTag = (idUnidade = "") => {
    setFormTag({ ...FORM_TAG, id_unidade: idUnidade });
    setErroTag({});
    setModalTag(true);
  };

  const abrirEdicaoTag = (t) => {
    setFormTag({
      id: t.id,
      id_vagas: t.id_vagas ?? "",
      id_unidade: t.id_unidade ?? "",
      veiculo: t.veiculo || "Carro",
      status: t.status || "Solicitado",
      nome_solicitante: t.nome_solicitante ?? "",
      tipo_solicitante: t.tipo_solicitante ?? "",
      // `?? ""` e nao `|| ""`: um custo de zero e um valor, e `||` o trocaria
      // por vazio -- a TAG de cortesia viraria "sem custo informado".
      custo_total: t.custo_total ?? "",
      data_entrega: t.data_entrega ? String(t.data_entrega).slice(0, 10) : "",
      observacoes: t.observacoes ?? "",
    });
    setErroTag({});
    setModalTag(true);
  };

  // A vaga desta unidade, e o veiculo escolhido dentro dela. E daqui que saem
  // placa, modelo e cor -- a TAG nao guarda copia.
  const vagaDaTag = useMemo(
    () => vagas.find((v) => String(v.id_unidade) === String(formTag.id_unidade)) ?? null,
    [vagas, formTag.id_unidade]
  );
  const veiculoDaTag = useMemo(
    () => veiculoDaVaga(vagaDaTag, formTag.veiculo),
    [vagaDaTag, formTag.veiculo]
  );

  // Quais status este cargo pode escolher AGORA — muda entre criar e editar,
  // e depende do que a TAG já é.
  const statusAberto = statusQuePodeEscolher(STATUS_TAG, {
    livre: podeDefinirStatus,
    editando: Boolean(formTag.id),
    atual: formTag.status,
  });
  const ajudaDoStatus = podeDefinirStatus ? undefined
    : formTag.id
      ? "A portaria marca a TAG como Aplicada depois de colar. Os outros status são da administração."
      : "Toda TAG pedida pela portaria entra como Solicitado. Quem libera é a administração.";

  const salvarTag = async () => {
    const e = {};
    if (!formTag.id_unidade) e.id_unidade = "Escolha a unidade.";

    // A TAG precisa estar amarrada a um registro de vaga existente: é o
    // id_vagas que vai para a planilha.
    const vagaRelacionada = vagaDaTag;
    if (formTag.id_unidade && !vagaRelacionada) {
      e.id_unidade = "Esta unidade ainda não tem registro de vaga. Cadastre a vaga primeiro.";
    }

    // O veículo tem de estar cadastrado na vaga. Sem isso sairia um adesivo
    // para uma placa que ninguém sabe qual é — e a TAG existe justamente para
    // amarrar o adesivo a um carro.
    if (vagaRelacionada && !veiculoDaTag) {
      e.veiculo = `A unidade ${rotuloUnidade(formTag.id_unidade)} não tem ${String(formTag.veiculo).toLowerCase()} cadastrado. Registre na vaga primeiro.`;
    }

    if (!String(formTag.nome_solicitante).trim()) {
      e.nome_solicitante = "Informe quem está pedindo a TAG.";
    }
    if (!formTag.tipo_solicitante) e.tipo_solicitante = "Escolha o tipo de solicitante.";

    // Só a administração preenche custo e data, então só ela pode errar neles.
    if (podeDefinirStatus && String(formTag.custo_total).trim() !== "") {
      const valor = Number(formTag.custo_total);
      if (!Number.isFinite(valor) || valor < 0) e.custo_total = "Informe um valor válido.";
    }

    setErroTag(e);
    if (Object.keys(e).length > 0) return;

    const editando = Boolean(formTag.id);

    // `tags` não tem coluna de autor na planilha, então não há onde gravar
    // `nomeUsuario` — quem pediu a TAG fica registrado só no log.
    const dados = {
      id_vagas: Number(vagaRelacionada.id),
      id_unidade: Number(formTag.id_unidade),
      veiculo: formTag.veiculo,
      status: formTag.status,
      nome_solicitante: String(formTag.nome_solicitante).trim(),
      tipo_solicitante: formTag.tipo_solicitante,
      observacoes: String(formTag.observacoes).trim() || null,
    };

    // Custo e data de entrega só vão no envio de quem pode defini-los. Mandar
    // `null` a partir da portaria APAGARIA o que a administração preencheu — e
    // o 0041 recusaria a gravação inteira, derrubando junto a correção legítima
    // que o porteiro estava fazendo.
    if (podeDefinirStatus) {
      dados.custo_total =
        String(formTag.custo_total).trim() === "" ? null : Number(formTag.custo_total);
      dados.data_entrega = formTag.data_entrega || null;
    }

    setSalvando(true);
    try {
      const r = editando
        ? await editar("TAGS", formTag.id, dados)
        : await criar("TAGS", dados);

      if (!r.success) {
        toast.error(mensagemErro(r.message));
        return;
      }

      setModalTag(false);
      await buscarDados();
      toast.success(
        editando
          ? `TAG da unidade ${rotuloUnidade(formTag.id_unidade)} atualizada`
          : `TAG registrada para a unidade ${rotuloUnidade(formTag.id_unidade)}`
      );
    } catch {
      toast.error("Não foi possível processar a TAG.");
    } finally {
      setSalvando(false);
    }
  };

  /* ---------------- exclusão ---------------- */

  const excluir = async (id, planilha, descricao) => {
    setSalvando(true);
    try {
      const r = await remover(planilha, id);
      if (!r.success) {
        toast.error(mensagemErro(r.message));
        return;
      }
      // A espera de 1200ms que existia aqui era para o Apps Script, que
      // respondia por redirect antes de a escrita chegar à planilha. O Postgres
      // já respondeu com a linha apagada — reler na hora traz o estado certo.
      await buscarDados();
      toast.success(`${descricao} excluída`);
    } catch {
      toast.error("Não foi possível excluir. Verifique a conexão.");
    } finally {
      setSalvando(false);
    }
  };

  const excluirVaga = async (v) => {
    const tag = tagDaUnidade(v.id_unidade);
    const ok = await confirm({
      title: `Excluir a vaga da unidade ${rotuloUnidade(v.id_unidade)}?`,
      description: [
        tag ? `Existe uma TAG "${tag.status}" nesta unidade, e ela NÃO é excluída junto.` : null,
        "Não dá para desfazer.",
      ].filter(Boolean).join(" "),
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    setDetalhe(null);
    await excluir(v.id, "VAGAS", `Vaga da unidade ${rotuloUnidade(v.id_unidade)}`);
  };

  const excluirTag = async (t) => {
    const ok = await confirm({
      title: `Excluir a TAG da unidade ${rotuloUnidade(t.id_unidade)}?`,
      description: `Status atual: ${t.status}. A vaga continua cadastrada. Não dá para desfazer.`,
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    await excluir(t.id, "TAGS", `TAG da unidade ${rotuloUnidade(t.id_unidade)}`);
  };

  /* ---------------- exportação ---------------- */

  const alternarColuna = (id) =>
    setColunasExport((prev) => prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)));

  const veiculosDe = (v) => {
    const t = [];
    if (v.possui_carro === "Sim") t.push("Carro");
    if (v.possui_moto === "Sim") t.push("Moto");
    return t;
  };

  const placasDe = (v) => {
    const d = [];
    if (v.possui_carro === "Sim") d.push(`${v.modelo_carro || "Carro"} (${v.placa_carro || "sem placa"})`);
    if (v.possui_moto === "Sim") d.push(`${v.modelo_moto || "Moto"} (${v.placa_moto || "sem placa"})`);
    return d;
  };

  const exportarExcel = () => {
    const dados = linhasVagas.map((v) => ({
      Unidade: sanitizarCelula(rotuloUnidade(v.id_unidade)),
      Carro: sanitizarCelula(v.possui_carro === "Sim" ? `${v.modelo_carro} (${v.placa_carro})` : "Não possui"),
      Moto: sanitizarCelula(v.possui_moto === "Sim" ? `${v.modelo_moto} (${v.placa_moto})` : "Não possui"),
      TAG: tagDaUnidade(v.id_unidade)?.status ?? "Sem TAG",
      Observações: sanitizarCelula(v.observacoes || ""),
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vagas");
    XLSX.writeFile(wb, "Relatorio_Vagas.xlsx");
    toast.success(`Planilha gerada com ${linhasVagas.length} registro(s)`);
  };

  const exportarPDF = () => {
    const ativas = colunasExport.filter((c) => c.selected);
    if (ativas.length === 0) {
      toast.error("Selecione ao menos uma coluna para exportar.");
      return;
    }

    // Paisagem: modelo e placa de dois veículos não cabem em retrato.
    const doc = new jsPDF("l", "mm", "a4");
    const img = new Image();
    img.src = "/logo.png";

    const head = [ativas.map((c) => c.label)];
    const body = linhasVagas.map((v) =>
      ativas.map((c) => {
        if (c.id === "unidade") return sanitizarCelula(rotuloUnidade(v.id_unidade));
        if (c.id === "veiculos") return veiculosDe(v).join(" / ") || "Nenhum";
        if (c.id === "placas") return sanitizarCelula(placasDe(v).join("\n") || "-");
        if (c.id === "tag") return tagDaUnidade(v.id_unidade)?.status ?? "Sem TAG";
        return sanitizarCelula(v.observacoes || "-");
      })
    );

    const gerar = (comLogo) => {
      doc.setDrawColor(...VERDE_PDF);
      doc.setLineWidth(1.5);
      doc.rect(5, 5, 287, 200);
      if (comLogo) doc.addImage(img, "PNG", 113, 12, 70, 25);
      doc.setFontSize(18);
      doc.setTextColor(...TINTA_PDF);
      doc.text("Relatório de Vagas", 148, comLogo ? 45 : 25, { align: "center" });

      autoTable(doc, {
        head,
        body,
        startY: comLogo ? 55 : 35,
        theme: "grid",
        headStyles: { fillColor: VERDE_PDF, halign: "center", textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 3 },
        margin: { left: 10, right: 10 },
      });

      doc.save("Relatorio_Vagas.pdf");
      setModalExport(false);
      toast.success(`PDF gerado com ${linhasVagas.length} registro(s)`);
    };

    img.onload = () => gerar(true);
    img.onerror = () => gerar(false);
  };

  /* ---------------- colunas ---------------- */

  /** "Proprietario" -> "Proprietário". O banco guarda sem acento, por causa
   *  do `check` do 0041; o acento e assunto de quem le. */
  const rotuloTipoSolicitante = (valor) =>
    TIPOS_SOLICITANTE.find((t) => t.value === valor)?.label ?? String(valor ?? "");

  const badgeTag = (status, veiculo) => {
    if (!status) return <Badge tone="muted">Sem TAG</Badge>;
    const rotulo = STATUS_TAG.find((s) => s.value === status)?.label ?? status;
    return (
      <Badge tone={TOM_TAG[status] ?? "neutral"}>
        {veiculo ? `${rotulo} · ${veiculo}` : rotulo}
      </Badge>
    );
  };

  const colunasVagas = [
    { key: "id_unidade", label: "Unidade", tipo: "id", width: 108,
      render: (v) => rotuloUnidade(v.id_unidade) },
    { key: "veiculos", label: "Veículos",
      render: (v) => {
        if (veiculosDe(v).length === 0) return null;
        return (
          <span style={{ display: "inline-flex", gap: "var(--space-5)", alignItems: "center" }}>
            {v.possui_carro === "Sim" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Car size={14} aria-hidden="true" /> Carro
              </span>
            )}
            {v.possui_moto === "Sim" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Bike size={14} aria-hidden="true" /> Moto
              </span>
            )}
          </span>
        );
      } },
    { key: "placas", label: "Modelo e placa",
      render: (v) => {
        const d = placasDe(v);
        if (d.length === 0) return null;
        return (
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {d.map((linha) => <span key={linha} className="vag-placa">{linha}</span>)}
          </span>
        );
      } },
    { key: "tag", label: "TAG",
      render: (v) => badgeTag(tagDaUnidade(v.id_unidade)?.status) },
  ];

  const colunasTags = [
    { key: "id_unidade", label: "Unidade", tipo: "id", width: 108,
      render: (t) => rotuloUnidade(t.id_unidade) },
    { key: "nome_solicitante", label: "Solicitante",
      // O tipo embaixo do nome, e nao numa coluna propria: sao a mesma
      // informacao, e separados ocupam o dobro da largura numa tabela que ja
      // rola de lado no celular.
      render: (t) => (
        <span>
          <span style={{ display: "block", fontWeight: 600 }}>{t.nome_solicitante || "—"}</span>
          {t.tipo_solicitante && (
            <span className="ent-cpf">{rotuloTipoSolicitante(t.tipo_solicitante)}</span>
          )}
        </span>
      ) },
    { key: "veiculo", label: "Veículo",
      // Placa, modelo e cor saem da VAGA, e nao de copia guardada na TAG:
      // corrigir a placa na vaga tem de mudar o que se le aqui.
      render: (t) => {
        const dados = veiculoDaVaga(vagas.find((v) => String(v.id) === String(t.id_vagas)), t.veiculo);
        return (
          <span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 600 }}>
              {t.veiculo === "Moto" ? <Bike size={14} aria-hidden="true" /> : <Car size={14} aria-hidden="true" />}
              {t.veiculo}
            </span>
            {descreverVeiculo(dados) && (
              <span className="ent-cpf">{descreverVeiculo(dados)}</span>
            )}
          </span>
        );
      } },
    { key: "custo_total", label: "Custo", tipo: "id", width: 110,
      render: (t) => (t.custo_total == null ? "—" : formatCurrency(t.custo_total)) },
    { key: "data_entrega", label: "Entrega", tipo: "id", width: 118,
      render: (t) => dataBR(t.data_entrega) || "—" },
    { key: "status", label: "Status", render: (t) => badgeTag(t.status) },
  ];

  /* ---------------- resumo ---------------- */

  const resumo = useMemo(() => ({
    comCarro: vagas.filter((v) => v.possui_carro === "Sim").length,
    comMoto: vagas.filter((v) => v.possui_moto === "Sim").length,
    solicitadas: tags.filter((t) => t.status === "Solicitado").length,
  }), [vagas, tags]);

  const meta = carregando
    ? "Carregando vagas"
    : [
        `${vagas.length} unidades com registro`,
        `${resumo.comCarro} carros`,
        `${resumo.comMoto} motos`,
        resumo.solicitadas ? `${resumo.solicitadas} TAGs solicitadas` : null,
      ].filter(Boolean).join(" · ");

  return (
    <div>
      <PageHeader
        title="Vagas"
        meta={meta}
        actions={
          aba === "vagas" ? (
            <>
              {/* Exportar fica para todos: é a lista que a pessoa já pode ler,
                  levada para uma planilha. */}
              <Button onClick={() => setModalExport(true)} iconLeft={<FileText size={15} />}>
                Exportar
              </Button>
              {podeEditarVaga && (
                <Button variant="primary" onClick={abrirNovaVaga} iconLeft={<Plus size={16} />}>
                  Nova vaga
                </Button>
              )}
            </>
          ) : (
            podeCriarTag && (
              <Button variant="primary" onClick={() => abrirNovaTag()} iconLeft={<Plus size={16} />}>
                Nova TAG
              </Button>
            )
          )
        }
      />

      {/* Abas no lugar do modal de TAGs: são duas listas do mesmo domínio, e
          no celular um modal com tabela dentro é péssimo de navegar. */}
      <Tabs
        items={[
          { value: "vagas", label: "Vagas", count: vagas.length },
          { value: "tags", label: "TAGs", count: tags.length },
        ]}
        value={aba}
        onChange={setAba}
      />

      {/* ===================== VAGAS ===================== */}
      {aba === "vagas" && (
        <>
          <div className="cad-filtros">
            <div className="cad-filtros__busca">
              <Search size={16} className="cad-filtros__lupa" aria-hidden="true" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por unidade, modelo ou placa"
                aria-label="Buscar por unidade, modelo ou placa"
              />
            </div>
            <Select value={fBloco} onChange={(e) => setFBloco(e.target.value)} aria-label="Filtrar por bloco">
              {blocos.map((b) => (
                <option key={b} value={b}>{b === "Todos" ? "Todos os blocos" : `Bloco ${b}`}</option>
              ))}
            </Select>
            <Select value={fVeiculo} onChange={(e) => setFVeiculo(e.target.value)} aria-label="Filtrar por veículo">
              <option value="Todos">Qualquer veículo</option>
              <option value="Carro">Com carro</option>
              <option value="Moto">Com moto</option>
              <option value="Nenhum">Sem veículo</option>
            </Select>
            <Select value={fTag} onChange={(e) => setFTag(e.target.value)} aria-label="Filtrar por status da TAG">
              <option value="Todos">Qualquer TAG</option>
              {STATUS_TAG.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              <option value="Sem Tag">Sem TAG</option>
            </Select>
            {temFiltroVaga && (
              <Button variant="ghost" onClick={limparVagas} iconLeft={<RotateCcw size={14} />}>
                Limpar
              </Button>
            )}
          </div>

          <Table
            columns={colunasVagas}
            rows={vagasExibidas}
            loading={carregando}
            getRowKey={(v) => v.id ?? v.id_unidade}
            rowActions={(v) => (
              <>
                <Button size="sm" variant="ghost" aria-label={`Ver vaga da unidade ${rotuloUnidade(v.id_unidade)}`}
                        onClick={() => setDetalhe(v)} iconLeft={<Eye size={14} />} />
                {podeCriarTag && (
                  <Button size="sm" variant="ghost" aria-label={`Registrar TAG para a unidade ${rotuloUnidade(v.id_unidade)}`}
                          onClick={() => abrirNovaTag(v.id_unidade)} iconLeft={<TagIcon size={14} />} />
                )}
                {podeEditarVaga && (
                  <Button size="sm" variant="ghost" aria-label={`Editar vaga da unidade ${rotuloUnidade(v.id_unidade)}`}
                          onClick={() => abrirEdicaoVaga(v)} iconLeft={<Edit2 size={14} />} />
                )}
                {podeExcluir && (
                  <Button size="sm" variant="ghost" aria-label={`Excluir vaga da unidade ${rotuloUnidade(v.id_unidade)}`}
                          onClick={() => excluirVaga(v)} iconLeft={<Trash2 size={14} />} />
                )}
              </>
            )}
            empty={
              temFiltroVaga ? (
                <EmptyState
                  icon={<Search size={20} />}
                  title="Nenhuma vaga com esses filtros"
                  description="Ajuste a busca ou limpe os filtros para ver todos os registros."
                  action={<Button onClick={limparVagas}>Limpar filtros</Button>}
                />
              ) : (
                <EmptyState
                  icon={<Car size={20} />}
                  title="Nenhuma vaga cadastrada"
                  description="Cadastre o primeiro registro para vincular veículos a uma unidade."
                  action={podeEditarVaga && (
                    <Button variant="primary" onClick={abrirNovaVaga} iconLeft={<Plus size={16} />}>
                      Nova vaga
                    </Button>
                  )}
                />
              )
            }
          />

          {!carregando && linhasVagas.length > 0 && (
            <div className="cad-paginacao">
              <span className="cad-paginacao__info">
                {porPagina === "Todos"
                  ? `${linhasVagas.length} registro(s)`
                  : `${(paginaSegura - 1) * porPagina + 1} a ${Math.min(paginaSegura * porPagina, linhasVagas.length)} de ${linhasVagas.length}`}
              </span>
              <div className="cad-paginacao__controles">
                <Select
                  value={porPagina}
                  onChange={(e) => setPorPagina(e.target.value === "Todos" ? "Todos" : Number(e.target.value))}
                  aria-label="Registros por página"
                  className="cad-paginacao__tamanho"
                >
                  <option value={25}>25 por página</option>
                  <option value={50}>50 por página</option>
                  <option value={100}>100 por página</option>
                  <option value="Todos">Mostrar todos</option>
                </Select>
                {totalPaginas > 1 && (
                  <>
                    <Button size="sm" aria-label="Página anterior" disabled={paginaSegura <= 1}
                            onClick={() => setPagina((p) => Math.max(1, p - 1))}
                            iconLeft={<ChevronLeft size={15} />} />
                    <span className="cad-paginacao__pagina">{paginaSegura} de {totalPaginas}</span>
                    <Button size="sm" aria-label="Próxima página" disabled={paginaSegura >= totalPaginas}
                            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                            iconLeft={<ChevronRight size={15} />} />
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ===================== TAGS ===================== */}
      {aba === "tags" && (
        <>
          <div className="cad-filtros">
            <div className="cad-filtros__busca">
              <Search size={16} className="cad-filtros__lupa" aria-hidden="true" />
              <Input
                value={buscaTag}
                onChange={(e) => setBuscaTag(e.target.value)}
                placeholder="Buscar por unidade"
                aria-label="Buscar TAG por unidade"
              />
            </div>
            <Select value={fStatusTag} onChange={(e) => setFStatusTag(e.target.value)} aria-label="Filtrar por status">
              <option value="Todos">Qualquer status</option>
              {STATUS_TAG.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
            {temFiltroTag && (
              <Button variant="ghost" onClick={limparTags} iconLeft={<RotateCcw size={14} />}>
                Limpar
              </Button>
            )}
          </div>

          <Table
            columns={colunasTags}
            rows={linhasTags}
            loading={carregando}
            getRowKey={(t) => t.id}
            rowActions={(t) => (
              <>
                {/* O porteiro só alcança a TAG que está "Disponível": antes disso o
                    pedido está com a administração, e depois de aplicada acabou.
                    Sem esta condição o botão aparece em toda linha e o 0039
                    recusa a gravação depois de ele já ter preenchido. */}
                {podeEditarTag && podeMexerNaTag({ livre: podeDefinirStatus, status: t.status }) && (
                  <Button size="sm" variant="ghost" aria-label={`Editar TAG da unidade ${rotuloUnidade(t.id_unidade)}`}
                          onClick={() => abrirEdicaoTag(t)} iconLeft={<Edit2 size={14} />} />
                )}
                {podeExcluir && (
                  <Button size="sm" variant="ghost" aria-label={`Excluir TAG da unidade ${rotuloUnidade(t.id_unidade)}`}
                          onClick={() => excluirTag(t)} iconLeft={<Trash2 size={14} />} />
                )}
              </>
            )}
            empty={
              temFiltroTag ? (
                <EmptyState
                  icon={<Search size={20} />}
                  title="Nenhuma TAG com esses filtros"
                  description="Ajuste a busca ou limpe os filtros."
                  action={<Button onClick={limparTags}>Limpar filtros</Button>}
                />
              ) : (
                <EmptyState
                  icon={<TagIcon size={20} />}
                  title="Nenhuma TAG registrada"
                  description="A TAG é sempre vinculada a uma unidade que já tenha registro de vaga."
                  action={podeCriarTag && (
                    <Button variant="primary" onClick={() => abrirNovaTag()} iconLeft={<Plus size={16} />}>
                      Nova TAG
                    </Button>
                  )}
                />
              )
            }
          />
        </>
      )}

      {/* ---- Cadastro e edição de vaga ---- */}
      <Modal
        open={modalVaga}
        onClose={() => setModalVaga(false)}
        title={modo === "add" ? "Nova vaga" : `Editar vaga ${rotuloUnidade(form.id_unidade)}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalVaga(false)}>Cancelar</Button>
            <Button variant="primary" onClick={salvarVaga} loading={salvando}>
              {modo === "add" ? "Cadastrar" : "Salvar"}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <Field label="Unidade" required error={erroForm.id_unidade}>
            <Select
              value={form.id_unidade}
              disabled={modo === "edit"}
              onChange={(e) => setForm({ ...form, id_unidade: e.target.value })}
            >
              <option value="">Selecione a unidade</option>
              {unidadesOrdenadas.map((u) => (
                <option key={u.id} value={u.id}>Bloco {u.bloco} · Unidade {u.unidade}</option>
              ))}
            </Select>
          </Field>

          <fieldset className="vag-bloco">
            <legend className="vag-bloco__titulo"><Car size={15} aria-hidden="true" /> Carro</legend>
            <div className="cad-form">
              <Field label="Possui carro">
                <Select value={form.possui_carro} onChange={(e) => setForm({ ...form, possui_carro: e.target.value })}>
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status_carro} disabled={form.possui_carro !== "Sim"}
                        onChange={(e) => setForm({ ...form, status_carro: e.target.value })}>
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                </Select>
              </Field>
              <Field label="Modelo">
                <Input value={form.modelo_carro} disabled={form.possui_carro !== "Sim"}
                       onChange={(e) => setForm({ ...form, modelo_carro: e.target.value })} />
              </Field>
              <Field label="Cor">
                {/* Entrou no 0041, junto com a ficha da TAG: a TAG mostra placa,
                    modelo E cor, e a cor nao existia em lugar nenhum. Fica aqui,
                    e nao na TAG, porque e do veiculo -- guardada nos dois lugares,
                    a que ninguem atualiza e a que a portaria le no portao. */}
                <Input value={form.cor_carro} disabled={form.possui_carro !== "Sim"} placeholder="Prata"
                       onChange={(e) => setForm({ ...form, cor_carro: e.target.value })} />
              </Field>
              <Field label="Placa" error={erroForm.placa_carro}>
                <Input value={form.placa_carro} disabled={form.possui_carro !== "Sim"} placeholder="ABC1D23"
                       onChange={(e) => setForm({ ...form, placa_carro: placaMaiuscula(e.target.value) })} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="vag-bloco">
            <legend className="vag-bloco__titulo"><Bike size={15} aria-hidden="true" /> Moto</legend>
            <div className="cad-form">
              <Field label="Possui moto">
                <Select value={form.possui_moto} onChange={(e) => setForm({ ...form, possui_moto: e.target.value })}>
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status_moto} disabled={form.possui_moto !== "Sim"}
                        onChange={(e) => setForm({ ...form, status_moto: e.target.value })}>
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                </Select>
              </Field>
              <Field label="Modelo">
                <Input value={form.modelo_moto} disabled={form.possui_moto !== "Sim"}
                       onChange={(e) => setForm({ ...form, modelo_moto: e.target.value })} />
              </Field>
              <Field label="Cor">
                {/* Entrou no 0041, junto com a ficha da TAG: a TAG mostra placa,
                    modelo E cor, e a cor nao existia em lugar nenhum. Fica aqui,
                    e nao na TAG, porque e do veiculo -- guardada nos dois lugares,
                    a que ninguem atualiza e a que a portaria le no portao. */}
                <Input value={form.cor_moto} disabled={form.possui_moto !== "Sim"} placeholder="Prata"
                       onChange={(e) => setForm({ ...form, cor_moto: e.target.value })} />
              </Field>
              <Field label="Placa" error={erroForm.placa_moto}>
                <Input value={form.placa_moto} disabled={form.possui_moto !== "Sim"} placeholder="ABC1D23"
                       onChange={(e) => setForm({ ...form, placa_moto: placaMaiuscula(e.target.value) })} />
              </Field>
            </div>
          </fieldset>

          <Field label="Observações">
            <Textarea value={form.observacoes}
                      onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* ---- TAG ---- */}
      <Modal
        open={modalTag}
        onClose={() => setModalTag(false)}
        title={formTag.id ? "Editar TAG" : "Nova TAG"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalTag(false)}>Cancelar</Button>
            <Button variant="primary" onClick={salvarTag} loading={salvando}>
              {formTag.id ? "Salvar" : "Registrar"}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          {/* Digitação em vez de <select>, como nas outras telas: quem usa o
              sistema decorou a forma concatenada ("5206" e bloco 5, apto 206) e
              digita assim. Rolar 128 opcoes era o caminho longo para a mesma
              coisa.

              A busca varre TODAS as unidades, e nao so as que ja tem vaga. O
              <select> escondia as sem vaga, e esconder produz o pior tipo de
              falha aqui: a pessoa digita 5206, nao aparece nada, e conclui que
              a unidade nao existe. Aparecendo, a validacao do salvar diz a
              verdade -- "cadastre a vaga primeiro" -- que e o que ela precisa
              fazer. */}
          <Field
            label="Unidade"
            required
            error={erroTag.id_unidade}
            help="A unidade precisa ter registro de vaga antes de receber TAG."
          >
            <BuscaUnidade
              unidades={unidadesOrdenadas}
              valor={unidadePorId.get(String(formTag.id_unidade)) ?? null}
              disabled={Boolean(formTag.id)}
              onEscolher={(u) => setFormTag({ ...formTag, id_unidade: u?.id ?? "" })}
            />
          </Field>

          <Field label="Nome do solicitante" required error={erroTag.nome_solicitante}>
            <Input
              value={formTag.nome_solicitante}
              placeholder="Quem está pedindo a TAG"
              onChange={(e) => setFormTag({ ...formTag, nome_solicitante: e.target.value })}
            />
          </Field>

          <Field label="Tipo de solicitante" required error={erroTag.tipo_solicitante}>
            <Select
              value={formTag.tipo_solicitante}
              onChange={(e) => setFormTag({ ...formTag, tipo_solicitante: e.target.value })}
            >
              <option value="">Selecione</option>
              {TIPOS_SOLICITANTE.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>

          <Field
            label="Veículo"
            required
            error={erroTag.veiculo}
            help="Placa, modelo e cor vêm do cadastro da vaga."
          >
            <Select value={formTag.veiculo} onChange={(e) => setFormTag({ ...formTag, veiculo: e.target.value })}>
              <option value="Carro">Carro</option>
              <option value="Moto">Moto</option>
            </Select>
          </Field>

          {/* O veículo, tirado da vaga e só de leitura. Não é campo: é o que a
              unidade já tem cadastrado, mostrado aqui para quem pede a TAG
              conferir antes de mandar. Corrigir se faz na vaga — guardada uma
              cópia aqui, a que ninguém atualiza é a que a portaria lê no
              portão. */}
          {formTag.id_unidade && (
            <div className="tag-veiculo" data-vazio={veiculoDaTag ? undefined : "sim"}>
              {veiculoDaTag ? (
                <>
                  <span className="tag-veiculo__rotulo">
                    {formTag.veiculo} cadastrado nesta unidade
                  </span>
                  <strong className="tag-veiculo__valor">
                    {descreverVeiculo(veiculoDaTag) || "cadastrado sem placa, modelo ou cor"}
                  </strong>
                </>
              ) : (
                <span className="tag-veiculo__rotulo">
                  Esta unidade não tem {String(formTag.veiculo).toLowerCase()} cadastrado.
                  Registre na vaga antes de pedir a TAG.
                </span>
              )}
            </div>
          )}

          {/* Custo e data de entrega são da administração — e não só aqui: o
              0041 recusa no banco o insert do porteiro que traga qualquer um
              dos dois, e o gatilho recusa a alteração deles. Para ele os campos
              nem aparecem, em vez de aparecerem travados: ele não tem nada a
              fazer com eles nem depois. */}
          {podeDefinirStatus && (
            <>
              <Field label="Custo total" error={erroTag.custo_total}>
                <Input
                  type="number" min="0" step="0.01" placeholder="0,00"
                  value={formTag.custo_total}
                  onChange={(e) => setFormTag({ ...formTag, custo_total: e.target.value })}
                />
              </Field>

              <Field label="Data de entrega">
                <Input
                  type="date"
                  value={formTag.data_entrega}
                  onChange={(e) => setFormTag({ ...formTag, data_entrega: e.target.value })}
                />
              </Field>
            </>
          )}

          <Field label="Observações">
            <Textarea
              rows={3}
              value={formTag.observacoes}
              onChange={(e) => setFormTag({ ...formTag, observacoes: e.target.value })}
            />
          </Field>

          <Field label="Status" help={ajudaDoStatus}>
            <Select
              value={formTag.status}
              disabled={escolhaTravada(statusAberto)}
              onChange={(e) => setFormTag({ ...formTag, status: e.target.value })}
            >
              {statusAberto.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* ---- Detalhe da vaga ---- */}
      <Modal
        open={Boolean(detalhe)}
        onClose={() => setDetalhe(null)}
        title={detalhe ? `Unidade ${rotuloUnidade(detalhe.id_unidade)}` : ""}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDetalhe(null)}>Fechar</Button>
            {/* O porteiro CHEGA aqui: este modal abre pelo olho, que é dele.
                Sem esta guarda, a única porta para editar vaga que sobrava
                aberta para ele era esta — e é a menos óbvia de todas. */}
            {podeEditarVaga && (
              <Button variant="primary" iconLeft={<Edit2 size={15} />}
                      onClick={() => { const v = detalhe; setDetalhe(null); abrirEdicaoVaga(v); }}>
                Editar
              </Button>
            )}
          </>
        }
      >
        {detalhe && (
          <dl className="cad-detalhe">
            <LinhaDet
              rotulo="Carro"
              mono
              valor={detalhe.possui_carro === "Sim"
                ? `${detalhe.modelo_carro || "Sem modelo"} · ${detalhe.placa_carro || "sem placa"}`
                : null}
            />
            {detalhe.possui_carro === "Sim" && (
              <LinhaDet rotulo="Status do carro" valor={
                <Badge tone={detalhe.status_carro === "Ativo" ? "positive" : "neutral"}>
                  {detalhe.status_carro}
                </Badge>
              } />
            )}
            <LinhaDet
              rotulo="Moto"
              mono
              valor={detalhe.possui_moto === "Sim"
                ? `${detalhe.modelo_moto || "Sem modelo"} · ${detalhe.placa_moto || "sem placa"}`
                : null}
            />
            {detalhe.possui_moto === "Sim" && (
              <LinhaDet rotulo="Status da moto" valor={
                <Badge tone={detalhe.status_moto === "Ativo" ? "positive" : "neutral"}>
                  {detalhe.status_moto}
                </Badge>
              } />
            )}
            <LinhaDet
              rotulo="TAG"
              valor={badgeTag(
                tagDaUnidade(detalhe.id_unidade)?.status,
                tagDaUnidade(detalhe.id_unidade)?.veiculo
              )}
            />
            <LinhaDet rotulo="Observações" valor={detalhe.observacoes} />
          </dl>
        )}
      </Modal>

      {/* ---- Exportação ---- */}
      <Modal
        open={modalExport}
        onClose={() => setModalExport(false)}
        title="Exportar vagas"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalExport(false)}>Cancelar</Button>
            <Button onClick={exportarExcel} iconLeft={<Download size={15} />}>Excel</Button>
            <Button variant="primary" onClick={exportarPDF} iconLeft={<FileText size={15} />}>PDF</Button>
          </>
        }
      >
        <p className="vit-modal__desc" style={{ marginBottom: "var(--space-6)" }}>
          {linhasVagas.length === vagas.length
            ? `Serão exportados os ${linhasVagas.length} registros.`
            : `Serão exportados os ${linhasVagas.length} registros que passam nos filtros atuais, de ${vagas.length} no total.`}
        </p>
        <p className="vit-field__label" style={{ marginBottom: "var(--space-4)" }}>Colunas do PDF</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {colunasExport.map((c) => (
            <Checkbox key={c.id} label={c.label} checked={c.selected}
                      onChange={() => alternarColuna(c.id)} />
          ))}
        </div>
      </Modal>
    </div>
  );
}

function LinhaDet({ rotulo, valor, mono }) {
  return (
    <div className="cad-detalhe__linha">
      <dt className="cad-detalhe__rotulo">{rotulo}</dt>
      <dd className={`cad-detalhe__valor${mono ? " cad-detalhe__valor--mono" : ""}`}>
        {valor || <span className="vit-table__vazio">-</span>}
      </dd>
    </div>
  );
}
