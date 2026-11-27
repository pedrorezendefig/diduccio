import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Table, Textarea, useConfirm, useToast } from "../ui";
import {
  encerrarCota, errosDaCota, lerValor, listarAssembleias, listarCotas, mesDeHoje, mesPorExtenso,
  parcelasPorExtenso, reais, salvarCota, situacaoDaCota, somarMeses,
} from "../api/cotas";
import "../styles/cotas.css";

const VAZIO = { titulo: "", descricao: "", valor: "", parcelas: "", primeiroMes: "", assembleiaId: "" };

const daCota = (c) => ({
  titulo: c.titulo,
  descricao: c.descricao ?? "",
  valor: Number(c.valor_parcela).toFixed(2).replace(".", ","),
  parcelas: String(c.parcelas),
  primeiroMes: c.primeiro_mes.slice(0, 7),
  assembleiaId: c.assembleia_id ?? "",
});

const dataBr = (d) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");
const TOM = { ativa: "positive", terminou: "muted", encerrada: "neutral" };

/**
 * Cotas extras (0101). O que entra aqui aparece na tela Cotas extras do app
 * do morador enquanto tiver parcela no mês atual ou depois. Ninguém apaga:
 * encerrar tira do app antes da última parcela e deixa guardada aqui.
 */
export default function CotasExtras() {
  const toast = useToast();
  const confirmar = useConfirm();
  const hoje = mesDeHoje();
  const [cotas, setCotas] = useState([]);
  const [assembleias, setAssembleias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null); // { id, encerrada, dados }
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await listarCotas();
    if (!r.success) toast.error("Não foi possível carregar as cotas extras.");
    setCotas(r.data);
    setCarregando(false);
  }, [toast]);

  useEffect(() => {
    let vivo = true;
    Promise.all([listarCotas(), listarAssembleias()]).then(([r, a]) => {
      if (!vivo) return;
      if (!r.success) toast.error("Não foi possível carregar as cotas extras.");
      setCotas(r.data);
      setAssembleias(a);
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [toast]);

  const porId = useMemo(() => new Map(assembleias.map((a) => [a.id, a])), [assembleias]);

  const novo = () => { setErros({}); setForm({ id: null, encerrada: false, dados: { ...VAZIO, primeiroMes: hoje } }); };
  const abrir = (c) => { setErros({}); setForm({ id: c.id, encerrada: situacaoDaCota(c, hoje).chave !== "ativa", dados: daCota(c), titulo: c.titulo, situacao: situacaoDaCota(c, hoje) }); };
  const mudar = (campo, valor) => setForm((x) => ({ ...x, dados: { ...x.dados, [campo]: valor } }));

  const salvar = async () => {
    const e = errosDaCota(form.dados);
    setErros(e);
    if (Object.keys(e).length) return;
    setSalvando(true);
    const r = await salvarCota(form.dados, form.id);
    setSalvando(false);
    if (!r.success) { toast.error("Não foi possível salvar a cota."); return; }
    toast.success(form.id ? "Cota corrigida. No app aparece \"atualizada em\"." : "Cota publicada e moradores avisados.");
    setForm(null);
    carregar();
  };

  const encerrar = async () => {
    const ok = await confirmar({
      title: `Encerrar "${form.titulo}"?`,
      description: "Some do app na hora e os moradores recebem o aviso de que a cota foi encerrada. Fica guardada aqui e não muda mais.",
      confirmLabel: "Encerrar cota",
      danger: true,
    });
    if (!ok) return;
    const r = await encerrarCota(form.id);
    if (!r.success) { toast.error("Não foi possível encerrar a cota."); return; }
    toast.success("Cota encerrada.");
    setForm(null);
    carregar();
  };

  const colunas = [
    {
      key: "titulo", label: "Cota",
      render: (c) => <button type="button" className="cx-abrir" onClick={() => abrir(c)}>{c.titulo}</button>,
    },
    { key: "valor_parcela", label: "Por parcela", tipo: "num", render: (c) => reais(c.valor_parcela) },
    { key: "parcelas", label: "Parcelas", render: (c) => parcelasPorExtenso(c, hoje) },
    { key: "assembleia", label: "Assembleia", render: (c) => (c.assembleia_id ? dataBr(porId.get(c.assembleia_id)?.data_assembleia) || "Ligada" : "Sem ata") },
    {
      key: "situacao", label: "Situação",
      render: (c) => { const s = situacaoDaCota(c, hoje); return <Badge tone={TOM[s.chave]}>{s.nome}</Badge>; },
    },
  ];

  const f = form?.dados;
  const valor = f ? lerValor(f.valor) : NaN;
  const n = f ? Number(f.parcelas) : 0;
  const resumo = f && valor > 0 && Number.isInteger(n) && n >= 1 && n <= 120 && /^\d{4}-\d{2}$/.test(f.primeiroMes)
    ? n === 1
      ? <>Parcela única de <b>{reais(valor)}</b> por apartamento, em {mesPorExtenso(f.primeiroMes)}.</>
      : <>Total por apartamento: <b>{reais(Math.round(valor * 100 * n) / 100)}</b>, de {mesPorExtenso(f.primeiroMes)} a {mesPorExtenso(somarMeses(f.primeiroMes, n - 1))}.</>
    : null;

  return (
    <div className="cx">
      <PageHeader
        title="Cotas extras"
        meta="As ativas aparecem no app do morador. Encerrar tira do app antes da última parcela."
        actions={<Button variant="primary" iconLeft={<Plus size={16} />} onClick={novo}>Nova cota</Button>}
      />

      <Table
        columns={colunas}
        rows={cotas}
        loading={carregando}
        getRowKey={(c) => c.id}
        empty={<EmptyState title="Nenhuma cota extra cadastrada." description="Quando a assembleia aprovar uma cota extra, cadastre aqui: ela aparece no app de quem tem cadastro aprovado." action={<Button variant="primary" iconLeft={<Plus size={16} />} onClick={novo}>Nova cota</Button>} />}
      />

      {form && (
        <Modal
          open
          onClose={() => !salvando && setForm(null)}
          title={form.encerrada ? form.titulo : form.id ? "Corrigir cota extra" : "Nova cota extra"}
          size="md"
          footer={form.encerrada ? (
            <Button variant="ghost" onClick={() => setForm(null)}>Fechar</Button>
          ) : (
            <>
              {form.id && <Button variant="ghost" className="cx-encerrar" onClick={encerrar} disabled={salvando}>Encerrar cota</Button>}
              <Button variant="ghost" onClick={() => setForm(null)} disabled={salvando}>Fechar</Button>
              <Button variant="primary" onClick={salvar} loading={salvando}>{form.id ? "Salvar correção" : "Publicar cota"}</Button>
            </>
          )}
        >
          <fieldset className="cx-form" disabled={form.encerrada}>
            {form.encerrada && (
              <p className="cx-aviso">
                {form.situacao?.chave === "encerrada"
                  ? "Esta cota foi encerrada e não aparece no app. Fica guardada aqui."
                  : "As parcelas desta cota já terminaram e ela não aparece mais no app."}
              </p>
            )}
            {form.id && !form.encerrada && (
              <p className="cx-aviso">Corrigir não avisa os moradores: no app a cota mostra "atualizada em".</p>
            )}
            <Field label="Título" error={erros.titulo}>
              <Input value={f.titulo} maxLength={120} onChange={(e) => mudar("titulo", e.target.value)} placeholder="Ex.: Pintura da fachada" />
            </Field>
            <Field label="Descrição (opcional)" help="O que a cota paga, como foi decidido">
              <Textarea rows={3} maxLength={2000} value={f.descricao} onChange={(e) => mudar("descricao", e.target.value)} />
            </Field>
            <div className="cx-3">
              <Field label="Valor por parcela" help="Por apartamento" error={erros.valor}>
                <Input inputMode="decimal" value={f.valor} onChange={(e) => mudar("valor", e.target.value)} placeholder="150,00" />
              </Field>
              <Field label="Parcelas" error={erros.parcelas}>
                <Input type="number" min={1} max={120} value={f.parcelas} onChange={(e) => mudar("parcelas", e.target.value)} />
              </Field>
              <Field label="1ª parcela em" error={erros.primeiroMes}>
                <Input type="month" value={f.primeiroMes} onChange={(e) => mudar("primeiroMes", e.target.value)} />
              </Field>
            </div>
            {resumo && <p className="cx-calc" aria-live="polite">{resumo}</p>}
            <EscolhaDaAssembleia assembleias={assembleias} valor={f.assembleiaId} onMudar={(v) => mudar("assembleiaId", v)} />
            {!form.id && <p className="cx-nota">Publicar avisa no sino e no celular de quem tem cadastro aprovado. O vencimento e o pagamento ficam com o boleto da administradora.</p>}
          </fieldset>
        </Modal>
      )}
    </div>
  );
}

/**
 * A assembleia que aprovou, escolhida da lista das assembleias cadastradas
 * (tela Assembleia), com busca. Lista própria, e não <select>: a escolha
 * numa lista do ViT não usa o controle do sistema operacional.
 */
/** As decisões da ata vêm como texto JSON (lista), como a tela Assembleia grava. */
function decisoesDaAta(v, profundidade = 0) {
  if (Array.isArray(v)) return v.map((d) => String(d ?? "").trim()).filter(Boolean);
  if (typeof v !== "string" || !v.trim()) return [];
  try {
    const p = JSON.parse(v);
    // Texto JSON gravado dentro de texto: lê mais uma vez.
    if (typeof p === "string" && profundidade < 2) return decisoesDaAta(p, profundidade + 1);
    return Array.isArray(p) ? decisoesDaAta(p) : [];
  } catch {
    // Não é JSON: cada linha é uma decisão.
    return v.split(/\r?\n/).map((d) => d.replace(/^\s*(\d+[.)-]|[-•])\s*/, "").trim()).filter(Boolean);
  }
}

/** Quadro abaixo do campo com as decisões da ata escolhida, para conferir se é ela mesmo. */
function DecisoesDaAta({ assembleia, onFechar }) {
  const decisoes = decisoesDaAta(assembleia.decisoes);
  const titulo = `${assembleia.titulo || "Assembleia"}${assembleia.data_assembleia ? `, ${dataBr(assembleia.data_assembleia)}` : ""}`;
  return (
    <section className="cx-ata" aria-label={`Decisões da ata: ${titulo}`}>
      <header className="cx-ata-topo">
        <div>
          <span className="cx-ata-rotulo">Decisões da ata</span>
          <strong>{titulo}</strong>
        </div>
        <button type="button" className="cx-ata-fechar" onClick={onFechar} aria-label="Fechar as decisões da ata">
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      {decisoes.length ? (
        <ol className="cx-ata-lista">{decisoes.map((d, i) => <li key={i}>{d}</li>)}</ol>
      ) : assembleia.resumo_geral ? (
        <p className="cx-ata-resumo">{assembleia.resumo_geral}</p>
      ) : (
        <p className="cx-ata-vazia">Esta ata não tem decisões cadastradas. Confira pelo título e pela data.</p>
      )}
    </section>
  );
}

function EscolhaDaAssembleia({ assembleias, valor, onMudar }) {
  const id = useId();
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const [verDecisoes, setVerDecisoes] = useState(false);
  const caixa = useRef(null);
  const escolhida = assembleias.find((a) => a.id === valor);
  const nome = (a) => `${a.titulo || "Assembleia"}${a.data_assembleia ? `, ${dataBr(a.data_assembleia)}` : ""}`;
  const termo = busca.trim().toLowerCase();
  const lista = termo ? assembleias.filter((a) => nome(a).toLowerCase().includes(termo)) : assembleias;

  useEffect(() => {
    if (!aberta) return undefined;
    const fora = (e) => { if (caixa.current && !caixa.current.contains(e.target)) setAberta(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberta]);

  const escolher = (v) => { onMudar(v); setAberta(false); setBusca(""); setVerDecisoes(Boolean(v)); };

  return (
    <div className="cx-campo" ref={caixa}>
      <span className="cx-rotulo" id={`${id}-rotulo`}>Assembleia que aprovou (opcional)</span>
      <button
        type="button"
        className={aberta ? "cx-escolha on" : "cx-escolha"}
        aria-haspopup="listbox"
        aria-expanded={aberta}
        aria-labelledby={`${id}-rotulo ${id}-valor`}
        onClick={() => setAberta((x) => !x)}
        onKeyDown={(e) => e.key === "Escape" && aberta && (e.stopPropagation(), setAberta(false))}
      >
        <span id={`${id}-valor`} className={escolhida ? undefined : "cx-sem"}>{escolhida ? nome(escolhida) : "Sem assembleia ligada"}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {aberta && (
        <div className="cx-lista" onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setAberta(false))}>
          <label className="cx-busca">
            <Search size={15} aria-hidden="true" />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar assembleia" aria-label="Buscar assembleia" />
          </label>
          <ul role="listbox" aria-labelledby={`${id}-rotulo`}>
            {!termo && (
              <li role="option" aria-selected={!valor} tabIndex={0} className={!valor ? "on cx-nenhuma" : "cx-nenhuma"}
                onClick={() => escolher("")} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), escolher(""))}>
                <span className="cx-ok" aria-hidden="true">{!valor && <Check size={15} />}</span>
                <b>Sem assembleia ligada</b>
              </li>
            )}
            {lista.map((a) => (
              <li key={a.id} role="option" aria-selected={a.id === valor} tabIndex={0} className={a.id === valor ? "on" : undefined}
                onClick={() => escolher(a.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), escolher(a.id))}>
                <span className="cx-ok" aria-hidden="true">{a.id === valor && <Check size={15} />}</span>
                <b>{a.titulo || "Assembleia"}</b>
                <time>{dataBr(a.data_assembleia)}</time>
              </li>
            ))}
            {!lista.length && <li className="cx-nada" role="presentation">Nenhuma assembleia com "{busca}".</li>}
          </ul>
          <p className="cx-dica">As assembleias cadastradas no sistema. A ata ligada abre no app pelo botão "Ver a ata".</p>
        </div>
      )}
      {!aberta && verDecisoes && escolhida && <DecisoesDaAta assembleia={escolhida} onFechar={() => setVerDecisoes(false)} />}
    </div>
  );
}
