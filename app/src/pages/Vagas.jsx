import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Car, Bike, Search, Plus, Pencil, Trash2, Eye, Tag as TagIcon, FileText, Download,
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
import { dataBR, formatCurrency, nomeProprio } from "../lib/format";
import {
  Button, Badge, Tabs, Modal, Field, Input, Select, Textarea, Checkbox,
  PageHeader, EmptyState, useToast, useConfirm,
} from "../ui";
import ListaQueAbre from "../components/confirmacoes/ListaQueAbre";
import { Chave, Ficha, Filtros, MaisFiltros, Opcoes, PainelDeFiltros, Placa } from "../components/app/pecas";

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

/** Quantas linhas a lista mostra de cada vez; "Mostrar mais" soma outras tantas. */
const LOTE = 30;

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
  const [tagVendo, setTagVendo] = useState(null);
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

  const [maisFiltros, setMaisFiltros] = useState(false);
  const [limite, setLimite] = useState(LOTE);
  const [ordemVagas, setOrdemVagas] = useState({ chave: "unidade", direcao: "asc" });
  const [ordemTags, setOrdemTags] = useState({ chave: "unidade", direcao: "asc" });

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

  /** Posição da unidade na ordem do prédio: bloco, depois apartamento. */
  const ordemDaUnidade = useCallback((id) => {
    const u = unidadePorId.get(String(id));
    return u ? (Number(u.bloco) || 0) * 100000 + (Number(u.unidade) || 0) : Number(id) || 0;
  }, [unidadePorId]);

  const ordenarPor = (lista, ordem, valor) => {
    const sinal = ordem.direcao === "asc" ? 1 : -1;
    return [...lista].sort((a, b) => {
      const va = valor(a), vb = valor(b);
      return va < vb ? -sinal : va > vb ? sinal : 0;
    });
  };
  const alternarOrdem = (setOrdem) => (chave) =>
    setOrdem((o) => ({ chave, direcao: o.chave === chave && o.direcao === "asc" ? "desc" : "asc" }));
  const ordenarVagas = alternarOrdem(setOrdemVagas);
  const ordenarTags = alternarOrdem(setOrdemTags);

  // As pílulas contam com a busca e o painel aplicados, sem o próprio filtro
  // de TAG: cada número diz quantas aparecem ao clicar nela.
  const vagasSemFiltroDeTag = useMemo(() => {
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

      const casaVeiculo =
        fVeiculo === "Todos" ||
        (fVeiculo === "Carro" && v.possui_carro === "Sim") ||
        (fVeiculo === "Moto" && v.possui_moto === "Sim") ||
        (fVeiculo === "Nenhum" && v.possui_carro !== "Sim" && v.possui_moto !== "Sim");

      return casaBusca && casaBloco && casaVeiculo;
    });
  }, [vagas, busca, fBloco, fVeiculo, unidadePorId]);

  const statusDaTag = useCallback((v) => tagDaUnidade(v.id_unidade)?.status ?? "Sem Tag", [tagDaUnidade]);

  const contagemTag = useMemo(() => {
    const c = { Todos: vagasSemFiltroDeTag.length, "Sem Tag": 0 };
    STATUS_TAG.forEach((s) => { c[s.value] = 0; });
    vagasSemFiltroDeTag.forEach((v) => { c[statusDaTag(v)] = (c[statusDaTag(v)] ?? 0) + 1; });
    return c;
  }, [vagasSemFiltroDeTag, statusDaTag]);

  const linhasVagas = useMemo(() => {
    const filtradas = vagasSemFiltroDeTag.filter((v) => fTag === "Todos" || statusDaTag(v) === fTag);
    return ordenarPor(filtradas, ordemVagas, (v) =>
      ordemVagas.chave === "tag" ? statusDaTag(v) : ordemDaUnidade(v.id_unidade));
  }, [vagasSemFiltroDeTag, fTag, statusDaTag, ordemVagas, ordemDaUnidade]);

  const linhasTags = useMemo(() => {
    const termo = buscaTag.trim().toLowerCase();
    const filtradas = tags.filter((t) => {
      const casaBusca = termo === "" ||
        rotuloUnidade(t.id_unidade).toLowerCase().includes(termo) ||
        String(t.nome_solicitante || "").toLowerCase().includes(termo);
      const casaStatus = fStatusTag === "Todos" || t.status === fStatusTag;
      return casaBusca && casaStatus;
    });
    return ordenarPor(filtradas, ordemTags, (t) => {
      if (ordemTags.chave === "unidade") return ordemDaUnidade(t.id_unidade);
      if (ordemTags.chave === "custo_total") return t.custo_total == null ? -1 : Number(t.custo_total);
      return String(t[ordemTags.chave] ?? "").toLowerCase();
    });
  }, [tags, buscaTag, fStatusTag, rotuloUnidade, ordemTags, ordemDaUnidade]);

  const filtrosDoPainel = (fBloco !== "Todos" ? 1 : 0) + (fVeiculo !== "Todos" ? 1 : 0);
  const temFiltroVaga = busca || fBloco !== "Todos" || fTag !== "Todos" || fVeiculo !== "Todos";
  const temFiltroTag = buscaTag || fStatusTag !== "Todos";

  const limparPainel = () => { setFBloco("Todos"); setFVeiculo("Todos"); setLimite(LOTE); };
  const limparVagas = () => { setBusca(""); setFTag("Todos"); limparPainel(); };
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
    setTagVendo(null);
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

  /* ---------------- lista ---------------- */

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

  const contarVeiculos = (x) => {
    const partes = [x.possui_carro === "Sim" ? "1 carro" : null, x.possui_moto === "Sim" ? "1 moto" : null].filter(Boolean);
    return partes.length ? partes.join(" · ") : "Sem veículo";
  };

  const vagaDaTagNaLista = (t) => vagas.find((v) => String(v.id) === String(t.id_vagas));

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

  // O que abre no modal de ver. Nomes curtos de propósito: as guardas de
  // permissão (vagas-permissao.test) procuram `excluirVaga(v)` e `excluirTag(t)`.
  const v = detalhe;
  const t = tagVendo;
  const tagDoDetalhe = v ? tagDaUnidade(v.id_unidade) : null;
  const vagaDoDetalheDaTag = t ? vagaDaTagNaLista(t) : null;
  const veiculoDoDetalheDaTag = t ? veiculoDaVaga(vagaDoDetalheDaTag, t.veiculo) : null;

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
          <Filtros
            busca={busca}
            onBusca={(x) => { setBusca(x); setLimite(LOTE); }}
            placeholder="Unidade, modelo ou placa"
            rotuloFiltro="TAG"
            filtro={fTag}
            onFiltro={(x) => { setFTag(x); setLimite(LOTE); }}
            filtros={[
              ["Todos", "Todas", contagemTag.Todos],
              ["Sem Tag", "Sem TAG", contagemTag["Sem Tag"]],
              ...STATUS_TAG.map((s) => [s.value, s.label, contagemTag[s.value]]),
            ]}
            painel={
              <PainelDeFiltros aberto={maisFiltros}>
                <Field label="Bloco">
                  <Opcoes rotulo="Bloco" valor={fBloco} onMudar={(x) => { setFBloco(x); setLimite(LOTE); }}
                    opcoes={blocos.map((b) => [b, b === "Todos" ? "Todos" : `Bloco ${b}`])} />
                </Field>
                <Field label="Veículo">
                  <Opcoes rotulo="Veículo" valor={fVeiculo} onMudar={(x) => { setFVeiculo(x); setLimite(LOTE); }}
                    opcoes={[["Todos", "Todos"], ["Carro", "Com carro"], ["Moto", "Com moto"], ["Nenhum", "Sem veículo"]]} />
                </Field>
              </PainelDeFiltros>
            }
          >
            <MaisFiltros aberto={maisFiltros} onAlternar={() => setMaisFiltros((a) => !a)}
              ativos={filtrosDoPainel} onLimpar={limparPainel} />
          </Filtros>

          {!carregando && linhasVagas.length === 0 ? (
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
          ) : (
            <ListaQueAbre
              colunas={[
                { rotulo: "Unidade", largura: "100px", ordem: "unidade" },
                { rotulo: "Veículos", largura: "minmax(0, 0.9fr)" },
                { rotulo: "Modelo e placa", largura: "minmax(0, 1.6fr)" },
                { rotulo: "TAG", largura: "minmax(0, 1fr)", ordem: "tag" },
              ]}
              ordenacao={ordemVagas}
              onOrdenar={ordenarVagas}
              larguraAcoes="136px"
              itens={linhasVagas.slice(0, limite)}
              carregando={carregando}
              chave={(x) => x.id ?? x.id_unidade}
              onAbrir={setDetalhe}
              rotuloDaLinha={(x) => `Abrir a vaga da unidade ${rotuloUnidade(x.id_unidade)}`}
              celulas={(x) => [
                <b key="u" className="conf-dado__mono">{rotuloUnidade(x.id_unidade)}</b>,
                <span key="v" className="vag-veiculos">
                  {x.possui_carro === "Sim" && <span><Car size={14} aria-hidden="true" /> Carro</span>}
                  {x.possui_moto === "Sim" && <span><Bike size={14} aria-hidden="true" /> Moto</span>}
                  {veiculosDe(x).length === 0 && <span className="vag-nada">Nenhum</span>}
                </span>,
                <span key="p" className="vag-placas">
                  {placasDe(x).map((linha) => <span key={linha} className="vag-placa">{linha}</span>)}
                  {placasDe(x).length === 0 && <span className="vag-nada">—</span>}
                </span>,
                <span key="t">{badgeTag(tagDaUnidade(x.id_unidade)?.status)}</span>,
              ]}
              acoes={(x) => (
                <>
                  <Button size="sm" variant="ghost" aria-label={`Ver vaga da unidade ${rotuloUnidade(x.id_unidade)}`}
                          onClick={() => setDetalhe(x)}><Eye size={16} /></Button>
                  {podeCriarTag && (
                    <Button size="sm" variant="ghost" aria-label={`Registrar TAG para a unidade ${rotuloUnidade(x.id_unidade)}`}
                            onClick={() => abrirNovaTag(x.id_unidade)}><TagIcon size={16} /></Button>
                  )}
                  {podeEditarVaga && (
                    <Button size="sm" variant="ghost" aria-label={`Editar vaga da unidade ${rotuloUnidade(x.id_unidade)}`}
                            onClick={() => abrirEdicaoVaga(x)}><Pencil size={16} /></Button>
                  )}
                </>
              )}
            />
          )}
          {linhasVagas.length > limite && (
            <div className="mud-mais">
              <Button variant="ghost" onClick={() => setLimite((n) => n + LOTE)}>
                Mostrar mais ({linhasVagas.length - limite} restantes)
              </Button>
            </div>
          )}
        </>
      )}

      {/* ===================== TAGS ===================== */}
      {aba === "tags" && (
        <>
          <Filtros
            busca={buscaTag}
            onBusca={setBuscaTag}
            placeholder="Unidade ou solicitante"
            filtro={fStatusTag}
            onFiltro={setFStatusTag}
            filtros={[
              ["Todos", "Todas", tags.length],
              ...STATUS_TAG.map((s) => [s.value, s.label, tags.filter((x) => x.status === s.value).length]),
            ]}
          />

          {!carregando && linhasTags.length === 0 ? (
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
          ) : (
            <ListaQueAbre
              colunas={[
                { rotulo: "Unidade", largura: "100px", ordem: "unidade" },
                // O tipo embaixo do nome, e nao numa coluna propria: sao a mesma
                // informacao, e separados ocupam o dobro da largura.
                { rotulo: "Solicitante", largura: "minmax(0, 1.3fr)", ordem: "nome_solicitante" },
                { rotulo: "Veículo", largura: "minmax(0, 1.5fr)", ordem: "veiculo" },
                { rotulo: "Custo", largura: "110px", ordem: "custo_total" },
                { rotulo: "Entrega", largura: "110px", ordem: "data_entrega" },
                { rotulo: "Status", largura: "120px", ordem: "status" },
              ]}
              ordenacao={ordemTags}
              onOrdenar={ordenarTags}
              larguraAcoes="96px"
              itens={linhasTags}
              carregando={carregando}
              chave={(x) => x.id}
              onAbrir={setTagVendo}
              rotuloDaLinha={(x) => `Abrir a TAG da unidade ${rotuloUnidade(x.id_unidade)}`}
              celulas={(x) => {
                // Placa, modelo e cor saem da VAGA, e nao de copia guardada na
                // TAG: corrigir a placa na vaga tem de mudar o que se le aqui.
                const dados = veiculoDaVaga(vagaDaTagNaLista(x), x.veiculo);
                return [
                  <b key="u" className="conf-dado__mono">{rotuloUnidade(x.id_unidade)}</b>,
                  <span key="s" className="mud-quem">
                    <b>{x.nome_solicitante ? nomeProprio(x.nome_solicitante) : "—"}</b>
                    {x.tipo_solicitante && <small>{rotuloTipoSolicitante(x.tipo_solicitante)}</small>}
                  </span>,
                  <span key="v" className="mud-quem">
                    <b>{x.veiculo === "Moto" ? <Bike size={14} aria-hidden="true" /> : <Car size={14} aria-hidden="true" />}{x.veiculo}</b>
                    {descreverVeiculo(dados) && <small>{descreverVeiculo(dados)}</small>}
                  </span>,
                  <span key="c" className="conf-dado__mono">{x.custo_total == null ? "—" : formatCurrency(x.custo_total)}</span>,
                  <span key="d">{dataBR(x.data_entrega) || "—"}</span>,
                  <span key="st">{badgeTag(x.status)}</span>,
                ];
              }}
              acoes={(x) => (
                <>
                  <Button size="sm" variant="ghost" aria-label={`Ver TAG da unidade ${rotuloUnidade(x.id_unidade)}`}
                          onClick={() => setTagVendo(x)}><Eye size={16} /></Button>
                  {/* O porteiro só alcança a TAG que está "Disponível": antes disso o
                      pedido está com a administração, e depois de aplicada acabou.
                      Sem esta condição o botão aparece em toda linha e o 0039
                      recusa a gravação depois de ele já ter preenchido. */}
                  {podeEditarTag && podeMexerNaTag({ livre: podeDefinirStatus, status: x.status }) && (
                    <Button size="sm" variant="ghost" aria-label={`Editar TAG da unidade ${rotuloUnidade(x.id_unidade)}`}
                            onClick={() => abrirEdicaoTag(x)}><Pencil size={16} /></Button>
                  )}
                </>
              )}
            />
          )}
        </>
      )}

      {/* ---- Ver a vaga: o desenho do detalhe de Encomendas ---- */}
      <Modal
        open={Boolean(v)}
        onClose={() => setDetalhe(null)}
        title="Detalhes da vaga"
        size="lg"
        footer={v && (
          <div className="app-modal__acoes">
            {podeExcluir ? (
              <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => excluirVaga(v)}>Excluir</Button>
            ) : <span />}
            {podeCriarTag && !tagDoDetalhe && (
              <Button variant="secondary" className="res-contrato" iconLeft={<TagIcon size={15} />}
                      onClick={() => { setDetalhe(null); abrirNovaTag(v.id_unidade); }}>
                Registrar TAG
              </Button>
            )}
            {/* O porteiro CHEGA aqui: este modal abre pelo olho, que é dele.
                Sem esta guarda, a única porta para editar vaga que sobrava
                aberta para ele era esta — e é a menos óbvia de todas. */}
            {podeEditarVaga && (
              <Button variant="primary" iconLeft={<Pencil size={15} />}
                      onClick={() => { setDetalhe(null); abrirEdicaoVaga(v); }}>
                Editar
              </Button>
            )}
          </div>
        )}
      >
        {v && (
          <div className="app-modal">
            <div className="app-modal__topo">
              <span className="app-veiculo__ic" aria-hidden="true"><Car size={22} /></span>
              <div className="app-modal__quem">
                <strong>Unidade {rotuloUnidade(v.id_unidade)}</strong>
                <small>{contarVeiculos(v)}</small>
                <span className="app-modal__selos">{badgeTag(tagDoDetalhe?.status, tagDoDetalhe?.veiculo)}</span>
              </div>
            </div>

            <div className="app-detalhe">
              <div className="app-detalhe__visual">
                <p className="app-detalhe__legenda">Veículos da unidade</p>
                {veiculosDe(v).length === 0 ? (
                  <p className="app-modal__aviso">Nenhum carro ou moto cadastrado nesta unidade.</p>
                ) : (
                  <div className="vag-cartoes">
                    {v.possui_carro === "Sim" && (
                      <CartaoDoVeiculo tipo="Carro" placa={v.placa_carro} modelo={v.modelo_carro} cor={v.cor_carro} situacao={v.status_carro} />
                    )}
                    {v.possui_moto === "Sim" && (
                      <CartaoDoVeiculo tipo="Moto" placa={v.placa_moto} modelo={v.modelo_moto} cor={v.cor_moto} situacao={v.status_moto} />
                    )}
                  </div>
                )}
              </div>

              <div className="app-detalhe__dados">
                <Ficha titulo="TAG" itens={tagDoDetalhe ? [
                  ["Status", badgeTag(tagDoDetalhe.status)],
                  ["Veículo", tagDoDetalhe.veiculo || "—"],
                  ["Solicitante", tagDoDetalhe.nome_solicitante ? nomeProprio(tagDoDetalhe.nome_solicitante) : "Não informado"],
                  ["Entrega", dataBR(tagDoDetalhe.data_entrega) || "Não informada"],
                ] : [["Status", badgeTag(null)]]} />
                {v.observacoes?.trim() && (
                  <section className="app-ficha">
                    <h3 className="app-ficha__titulo">Observações</h3>
                    <p className="mud-obs">{v.observacoes}</p>
                  </section>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Ver a TAG: o desenho do detalhe de Encomendas ---- */}
      <Modal
        open={Boolean(t)}
        onClose={() => setTagVendo(null)}
        title="Detalhes da TAG"
        size="lg"
        footer={t && (
          <div className="app-modal__acoes">
            {podeExcluir ? (
              <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => excluirTag(t)}>Excluir</Button>
            ) : <span />}
            {podeEditarTag && podeMexerNaTag({ livre: podeDefinirStatus, status: t.status }) && (
              <Button variant="primary" iconLeft={<Pencil size={15} />}
                      onClick={() => { setTagVendo(null); abrirEdicaoTag(t); }}>
                Editar
              </Button>
            )}
          </div>
        )}
      >
        {t && (
          <div className="app-modal">
            <div className="app-modal__topo">
              <span className="app-veiculo__ic" aria-hidden="true"><TagIcon size={22} /></span>
              <div className="app-modal__quem">
                <strong>TAG da unidade {rotuloUnidade(t.id_unidade)}</strong>
                <small>{t.veiculo || "Veículo"}{t.nome_solicitante ? ` · pedida por ${nomeProprio(t.nome_solicitante)}` : ""}</small>
                <span className="app-modal__selos">{badgeTag(t.status)}</span>
              </div>
            </div>

            <div className="app-detalhe">
              <div className="app-detalhe__visual">
                <p className="app-detalhe__legenda">Veículo da TAG</p>
                {veiculoDoDetalheDaTag ? (
                  <CartaoDoVeiculo tipo={t.veiculo} placa={veiculoDoDetalheDaTag.placa}
                    modelo={veiculoDoDetalheDaTag.modelo} cor={veiculoDoDetalheDaTag.cor} />
                ) : (
                  <p className="app-modal__aviso">O {String(t.veiculo || "veículo").toLowerCase()} desta TAG não está mais cadastrado na vaga.</p>
                )}
              </div>

              <div className="app-detalhe__dados">
                <Ficha titulo="Pedido" itens={[
                  ["Solicitante", t.nome_solicitante ? nomeProprio(t.nome_solicitante) : "Não informado"],
                  ["Tipo", t.tipo_solicitante ? rotuloTipoSolicitante(t.tipo_solicitante) : "Não informado"],
                  ["Custo", t.custo_total == null ? "Não informado" : formatCurrency(t.custo_total), true],
                  ["Entrega", dataBR(t.data_entrega) || "Não informada"],
                ]} />
                {t.observacoes?.trim() && (
                  <section className="app-ficha">
                    <h3 className="app-ficha__titulo">Observações</h3>
                    <p className="mud-obs">{t.observacoes}</p>
                  </section>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Cadastro e edição de vaga ---- */}
      <Modal
        open={modalVaga}
        onClose={() => setModalVaga(false)}
        title={modo === "add" ? "Nova vaga" : `Editar vaga ${rotuloUnidade(form.id_unidade)}`}
        size="md"
        footer={
          <div className="app-modal__acoes">
            <span />
            <Button variant="ghost" onClick={() => setModalVaga(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="form-vaga" loading={salvando}>
              {modo === "add" ? "Cadastrar" : "Salvar"}
            </Button>
          </div>
        }
      >
        <form id="form-vaga" className="mud-form" noValidate onSubmit={(e) => { e.preventDefault(); salvarVaga(); }}>
          <Field label="Unidade" required error={erroForm.id_unidade}>
            <BuscaUnidade
              unidades={unidadesOrdenadas}
              valor={unidadePorId.get(String(form.id_unidade)) ?? null}
              disabled={modo === "edit"}
              onEscolher={(u) => setForm({ ...form, id_unidade: u?.id ?? "" })}
            />
          </Field>

          <fieldset className="vag-bloco">
            <legend className="vag-bloco__titulo"><Car size={15} aria-hidden="true" /> Carro</legend>
            <div className="mud-form">
              <Chave
                ligada={form.possui_carro === "Sim"}
                onChange={(liga) => setForm({ ...form, possui_carro: liga ? "Sim" : "Não" })}
                titulo="Possui carro"
                sub="Ligue para cadastrar placa, modelo e cor"
              />
              {form.possui_carro === "Sim" && (
                <>
                  <div className="mud-form__par">
                    <Field label="Placa" required error={erroForm.placa_carro}>
                      <Input value={form.placa_carro} placeholder="ABC1D23"
                             onChange={(e) => setForm({ ...form, placa_carro: placaMaiuscula(e.target.value) })} />
                    </Field>
                    <Field label="Modelo">
                      <Input value={form.modelo_carro}
                             onChange={(e) => setForm({ ...form, modelo_carro: e.target.value })} />
                    </Field>
                  </div>
                  <div className="mud-form__par">
                    <Field label="Cor">
                      {/* Entrou no 0041, junto com a ficha da TAG: a TAG mostra placa,
                          modelo E cor. Fica aqui, e nao na TAG, porque e do veiculo. */}
                      <Input value={form.cor_carro} placeholder="Prata"
                             onChange={(e) => setForm({ ...form, cor_carro: e.target.value })} />
                    </Field>
                    <Field label="Situação">
                      <Opcoes rotulo="Situação do carro" valor={form.status_carro || "Ativo"}
                              onMudar={(s) => setForm({ ...form, status_carro: s })} opcoes={["Ativo", "Inativo"]} />
                    </Field>
                  </div>
                </>
              )}
            </div>
          </fieldset>

          <fieldset className="vag-bloco">
            <legend className="vag-bloco__titulo"><Bike size={15} aria-hidden="true" /> Moto</legend>
            <div className="mud-form">
              <Chave
                ligada={form.possui_moto === "Sim"}
                onChange={(liga) => setForm({ ...form, possui_moto: liga ? "Sim" : "Não" })}
                titulo="Possui moto"
                sub="Ligue para cadastrar placa, modelo e cor"
              />
              {form.possui_moto === "Sim" && (
                <>
                  <div className="mud-form__par">
                    <Field label="Placa" required error={erroForm.placa_moto}>
                      <Input value={form.placa_moto} placeholder="ABC1D23"
                             onChange={(e) => setForm({ ...form, placa_moto: placaMaiuscula(e.target.value) })} />
                    </Field>
                    <Field label="Modelo">
                      <Input value={form.modelo_moto}
                             onChange={(e) => setForm({ ...form, modelo_moto: e.target.value })} />
                    </Field>
                  </div>
                  <div className="mud-form__par">
                    <Field label="Cor">
                      <Input value={form.cor_moto} placeholder="Prata"
                             onChange={(e) => setForm({ ...form, cor_moto: e.target.value })} />
                    </Field>
                    <Field label="Situação">
                      <Opcoes rotulo="Situação da moto" valor={form.status_moto || "Ativo"}
                              onMudar={(s) => setForm({ ...form, status_moto: s })} opcoes={["Ativo", "Inativo"]} />
                    </Field>
                  </div>
                </>
              )}
            </div>
          </fieldset>

          <Field label="Observações">
            <Textarea value={form.observacoes}
                      onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </Field>
        </form>
      </Modal>

      {/* ---- TAG ---- */}
      <Modal
        open={modalTag}
        onClose={() => setModalTag(false)}
        title={formTag.id ? "Editar TAG" : "Nova TAG"}
        size="md"
        footer={
          <div className="app-modal__acoes">
            <span />
            <Button variant="ghost" onClick={() => setModalTag(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="form-tag" loading={salvando}>
              {formTag.id ? "Salvar" : "Registrar"}
            </Button>
          </div>
        }
      >
        <form id="form-tag" className="mud-form" noValidate onSubmit={(e) => { e.preventDefault(); salvarTag(); }}>
          {/* A busca varre TODAS as unidades, e nao so as que ja tem vaga:
              esconder produz o pior tipo de falha aqui — a pessoa digita 5206,
              nao aparece nada, e conclui que a unidade nao existe. Aparecendo,
              a validacao do salvar diz a verdade: "cadastre a vaga primeiro". */}
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
              onBlur={(e) => setFormTag({ ...formTag, nome_solicitante: nomeProprio(e.target.value) })}
            />
          </Field>

          <Field label="Tipo de solicitante" required error={erroTag.tipo_solicitante}>
            <Opcoes
              rotulo="Tipo de solicitante"
              valor={formTag.tipo_solicitante}
              onMudar={(x) => setFormTag({ ...formTag, tipo_solicitante: x })}
              opcoes={TIPOS_SOLICITANTE.map((x) => [x.value, x.label])}
            />
          </Field>

          <Field
            label="Veículo"
            required
            error={erroTag.veiculo}
            help="Placa, modelo e cor vêm do cadastro da vaga."
          >
            <Opcoes
              rotulo="Veículo"
              valor={formTag.veiculo}
              onMudar={(x) => setFormTag({ ...formTag, veiculo: x })}
              opcoes={["Carro", "Moto"]}
            />
          </Field>

          {/* O veículo, tirado da vaga e só de leitura. Corrigir se faz na vaga
              — guardada uma cópia aqui, a que ninguém atualiza é a que a
              portaria lê no portão. */}
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
              dos dois. Para ele os campos nem aparecem. */}
          {podeDefinirStatus && (
            <div className="mud-form__par">
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
            </div>
          )}

          <Field label="Status" help={ajudaDoStatus}>
            <Select
              value={formTag.status}
              disabled={escolhaTravada(statusAberto)}
              onChange={(e) => setFormTag({ ...formTag, status: e.target.value })}
            >
              {statusAberto.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </Field>

          <Field label="Observações">
            <Textarea
              rows={3}
              value={formTag.observacoes}
              onChange={(e) => setFormTag({ ...formTag, observacoes: e.target.value })}
            />
          </Field>
        </form>
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
        <p className="vit-modal__desc app-export__texto">
          {linhasVagas.length === vagas.length
            ? `Serão exportados os ${linhasVagas.length} registros.`
            : `Serão exportados os ${linhasVagas.length} registros que passam nos filtros atuais, de ${vagas.length} no total.`}
        </p>
        <p className="vit-field__label app-export__titulo">Colunas do PDF</p>
        <div className="app-export__colunas">
          {colunasExport.map((c) => (
            <Checkbox key={c.id} label={c.label} checked={c.selected}
                      onChange={() => alternarColuna(c.id)} />
          ))}
        </div>
      </Modal>
    </div>
  );
}

/**
 * Um veículo da unidade: ícone, modelo e cor, a situação e a placa grande à
 * direita. O mesmo desenho do cadastro de veículos nas Confirmações.
 */
function CartaoDoVeiculo({ tipo, placa, modelo, cor, situacao }) {
  return (
    <div className="app-veiculo">
      <span className="app-veiculo__ic" aria-hidden="true">{tipo === "Moto" ? <Bike size={22} /> : <Car size={22} />}</span>
      <div className="app-modal__quem">
        <strong>{modelo || tipo}</strong>
        <small>{tipo}{cor ? ` · ${cor}` : ""}</small>
        {situacao && (
          <span className="app-modal__selos">
            <Badge tone={situacao === "Ativo" ? "positive" : "neutral"}>{situacao}</Badge>
          </span>
        )}
      </div>
      <Placa placa={placa || "-------"} />
    </div>
  );
}
