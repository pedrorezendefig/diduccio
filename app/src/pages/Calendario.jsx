import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button, Field, Input, Modal, PageHeader, Textarea, useConfirm, useToast } from "../ui";
import { Chave, Opcoes } from "../components/app/pecas";
import { NOME_DO_TIPO, TIPOS, cancelarEvento, errosDoEvento, listarBlocos, listarEventos, listarFeriados, salvarEvento } from "../api/agenda";
import "../styles/agenda.css";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** "AAAA-MM-DD" de hoje em Brasília. */
const hojeEmBrasilia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const utc = (d) => new Date(`${d}T12:00:00Z`);
const somarDias = (d, n) => { const x = utc(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const ultimoDia = (ano, mes) => somarDias(mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`, -1);
const hora = (t) => (t ? `${Number(t.slice(0, 2))}h${t.slice(3, 5) !== "00" ? t.slice(3, 5) : ""}` : "");

const VAZIO = { tipo: "assembleia", titulo: "", texto: "", inicio: "", fim: "", diaInteiro: false, horaInicio: "", horaFim: "", local: "", todos: true, blocos: [], avisar: false };

const doEvento = (e) => ({
  tipo: e.tipo, titulo: e.titulo, texto: e.texto ?? "", inicio: e.inicio, fim: e.fim ?? "",
  diaInteiro: !e.hora_inicio, horaInicio: e.hora_inicio?.slice(0, 5) ?? "", horaFim: e.hora_fim?.slice(0, 5) ?? "",
  local: e.local ?? "", todos: !e.blocos?.length, blocos: e.blocos ?? [], avisar: Boolean(e.avisar),
});

/**
 * Agenda do condomínio (0100). Esta tela era só um aviso de "módulo não
 * implementado"; agora é o mês com os eventos e os feriados, e o que entra
 * aqui aparece no Calendário do app do morador. Ninguém apaga: cancelar tira
 * do app e deixa guardado (riscado aqui).
 */
export default function Calendario() {
  const toast = useToast();
  const confirmar = useConfirm();
  const hoje = hojeEmBrasilia();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [eventos, setEventos] = useState([]);
  const [feriados, setFeriados] = useState([]);
  const [blocos, setBlocos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null); // { id, cancelado, dados }
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);

  const ano = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  const de = `${mes}-01`;
  const ate = ultimoDia(ano, m);

  const carregar = useCallback(async () => {
    const [ev, fe] = await Promise.all([listarEventos(de, ate), listarFeriados(de, ate)]);
    if (!ev.success) toast.error("Não foi possível carregar a agenda.");
    setEventos(ev.data);
    setFeriados(fe);
    setCarregando(false);
  }, [de, ate, toast]);

  useEffect(() => {
    let vivo = true;
    Promise.all([listarEventos(de, ate), listarFeriados(de, ate)]).then(([ev, fe]) => {
      if (!vivo) return;
      if (!ev.success) toast.error("Não foi possível carregar a agenda.");
      setEventos(ev.data);
      setFeriados(fe);
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [de, ate, toast]);
  useEffect(() => {
    let vivo = true;
    listarBlocos().then((b) => vivo && setBlocos(b));
    return () => { vivo = false; };
  }, []);

  const semanas = useMemo(() => {
    let d = somarDias(de, -utc(de).getUTCDay());
    const lista = [];
    do {
      const s = [];
      for (let i = 0; i < 7; i++) { s.push(d); d = somarDias(d, 1); }
      lista.push(s);
    } while (d.slice(0, 7) === mes);
    return lista;
  }, [de, mes]);

  const doDia = (d) => eventos.filter((e) => e.inicio <= d && (e.fim ?? e.inicio) >= d);
  const feriadoDe = (d) => feriados.find((x) => x.data === d)?.nome;

  const irPara = (passo) => {
    const n = m + passo;
    setMes(n < 1 ? `${ano - 1}-12` : n > 12 ? `${ano + 1}-01` : `${ano}-${String(n).padStart(2, "0")}`);
  };

  const novo = (dia = hoje) => { setErros({}); setForm({ id: null, cancelado: false, dados: { ...VAZIO, inicio: dia } }); };
  const abrir = (e) => { setErros({}); setForm({ id: e.id, cancelado: Boolean(e.cancelado_em), dados: doEvento(e) }); };
  const mudar = (campo, valor) => setForm((x) => ({ ...x, dados: { ...x.dados, [campo]: valor } }));

  const salvar = async () => {
    const e = errosDoEvento(form.dados);
    setErros(e);
    if (Object.keys(e).length) return;
    setSalvando(true);
    const r = await salvarEvento(form.dados, form.id);
    setSalvando(false);
    if (!r.success) { toast.error("Não foi possível salvar o evento."); return; }
    toast.success(form.id ? "Evento atualizado." : form.dados.avisar ? "Evento criado e moradores avisados." : "Evento criado.");
    setForm(null);
    carregar();
  };

  const cancelar = async () => {
    const ok = await confirmar({
      title: `Cancelar "${form.dados.titulo}"?`,
      description: form.dados.avisar
        ? "Some do app na hora, e os moradores avisados recebem o cancelamento. Fica guardado aqui."
        : "Some do app na hora. Fica guardado aqui.",
      confirmLabel: "Cancelar evento",
      danger: true,
    });
    if (!ok) return;
    const r = await cancelarEvento(form.id);
    if (!r.success) { toast.error("Não foi possível cancelar o evento."); return; }
    toast.success("Evento cancelado.");
    setForm(null);
    carregar();
  };

  const f = form?.dados;
  return (
    <div className="ag">
      <PageHeader
        title="Agenda do condomínio"
        meta="O que entra aqui aparece no Calendário do app do morador."
        actions={<Button variant="primary" iconLeft={<Plus size={16} />} onClick={() => novo()}>Novo evento</Button>}
      />

      <div className="ag-mes-cab">
        <button type="button" className="ag-seta" aria-label="Mês anterior" onClick={() => irPara(-1)}><ChevronLeft size={18} /></button>
        <h2 aria-live="polite">{MESES[m - 1].replace(/^./, (c) => c.toUpperCase())} de {ano}</h2>
        <button type="button" className="ag-seta" aria-label="Próximo mês" onClick={() => irPara(1)}><ChevronRight size={18} /></button>
      </div>

      <div className="ag-grade" aria-busy={carregando}>
        {SEMANA.map((s) => <div key={s} className="ag-sem">{s}</div>)}
        {semanas.flat().map((d) => {
          const fora = d.slice(0, 7) !== mes;
          const feriado = feriadoDe(d);
          return (
            <div key={d} className={["ag-dia", fora && "fora", d === hoje && "hoje"].filter(Boolean).join(" ")}>
              <button type="button" className="ag-num" aria-label={`Novo evento em ${d.split("-").reverse().join("/")}`} onClick={() => novo(d)}>
                {Number(d.slice(8, 10))}
              </button>
              {feriado && <span className="ag-ev ag-t-feriado" title={feriado}>{feriado}</span>}
              {doDia(d).map((e) => (
                <button key={e.id} type="button" className={`ag-ev ag-t-${e.tipo}${e.cancelado_em ? " cancelado" : ""}`} onClick={() => abrir(e)}
                  title={`${NOME_DO_TIPO[e.tipo]}: ${e.titulo}${e.cancelado_em ? " (cancelado)" : ""}`}>
                  {e.avisar && !e.cancelado_em && <BellRing size={11} aria-label="Com aviso" />}
                  {e.hora_inicio ? `${hora(e.hora_inicio)} ` : ""}{e.titulo}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {form && (
        <Modal
          open
          onClose={() => !salvando && setForm(null)}
          title={form.cancelado ? "Evento cancelado" : form.id ? "Editar evento" : "Novo evento"}
          size="md"
          footer={form.cancelado ? (
            <Button variant="ghost" onClick={() => setForm(null)}>Fechar</Button>
          ) : (
            <>
              {form.id && <Button variant="ghost" className="ag-cancelar" onClick={cancelar} disabled={salvando}>Cancelar evento</Button>}
              <Button variant="ghost" onClick={() => setForm(null)} disabled={salvando}>Fechar</Button>
              <Button variant="primary" onClick={salvar} loading={salvando}>Salvar evento</Button>
            </>
          )}
        >
          <fieldset className="ag-form" disabled={form.cancelado}>
            {form.cancelado && <p className="ag-aviso">Este evento foi cancelado e não aparece no app. Fica guardado aqui.</p>}
            <div className="ag-campo">
              <span className="ag-rotulo" id="ag-tipo">Tipo</span>
              <div className="ag-chips" role="radiogroup" aria-labelledby="ag-tipo">
                {TIPOS.map(([v, r]) => (
                  <button key={v} type="button" role="radio" aria-checked={f.tipo === v} className={f.tipo === v ? "ag-chip on" : "ag-chip"} onClick={() => mudar("tipo", v)}>{r}</button>
                ))}
              </div>
            </div>
            <Field label="Título" error={erros.titulo}>
              <Input value={f.titulo} maxLength={120} onChange={(e) => mudar("titulo", e.target.value)} placeholder="Ex.: Limpeza das caixas d'água" />
            </Field>
            <div className="ag-2">
              <Field label="Começa em" error={erros.inicio}><Input type="date" value={f.inicio} onChange={(e) => mudar("inicio", e.target.value)} /></Field>
              <Field label="Termina em (opcional)" help="Para eventos de mais de um dia" error={erros.fim}><Input type="date" value={f.fim} min={f.inicio} onChange={(e) => mudar("fim", e.target.value)} /></Field>
            </div>
            <Chave ligada={f.diaInteiro} onChange={(v) => mudar("diaInteiro", v)} titulo="Dia inteiro" sub={f.diaInteiro ? "Sem horário" : "Desligado: informe o horário"} />
            {!f.diaInteiro && (
              <div className="ag-2">
                <Field label="Das" error={erros.horaInicio}><Input type="time" value={f.horaInicio} onChange={(e) => mudar("horaInicio", e.target.value)} /></Field>
                <Field label="Às (opcional)" error={erros.horaFim}><Input type="time" value={f.horaFim} onChange={(e) => mudar("horaFim", e.target.value)} /></Field>
              </div>
            )}
            <Field label="Local (opcional)"><Input value={f.local} maxLength={80} onChange={(e) => mudar("local", e.target.value)} placeholder="Ex.: Salão de festas" /></Field>
            <div className="ag-campo">
              <span className="ag-rotulo">Para quem</span>
              <Opcoes rotulo="Para quem" valor={f.todos ? "todos" : "blocos"} opcoes={[["todos", "Todo o condomínio"], ["blocos", "Blocos escolhidos"]]} onMudar={(v) => mudar("todos", v === "todos")} />
              {!f.todos && (
                <div className="ag-chips" role="group" aria-label="Blocos">
                  {blocos.map((b) => {
                    const on = f.blocos.includes(b);
                    return (
                      <button key={b} type="button" aria-pressed={on} className={on ? "ag-chip on" : "ag-chip"}
                        onClick={() => mudar("blocos", on ? f.blocos.filter((x) => x !== b) : [...f.blocos, b])}>Bloco {b}</button>
                    );
                  })}
                </div>
              )}
              {erros.blocos && <span className="ag-erro" role="alert">{erros.blocos}</span>}
            </div>
            <Field label="Texto (opcional)"><Textarea rows={3} maxLength={2000} value={f.texto} onChange={(e) => mudar("texto", e.target.value)} /></Field>
            <Chave
              ligada={f.avisar}
              onChange={(v) => mudar("avisar", v)}
              icone={<BellRing size={17} />}
              titulo="Avisar os moradores"
              sub="Aviso no sino e no celular agora, e lembrete na véspera às 18h. Mudar o dia, o horário ou cancelar avisa de novo."
            />
          </fieldset>
        </Modal>
      )}
    </div>
  );
}
