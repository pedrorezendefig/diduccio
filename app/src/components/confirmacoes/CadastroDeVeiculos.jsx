import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Bike, Car, Eye, Pencil, Tag, Trash2 } from "lucide-react";
import { supabase } from "../../api/supabase";
import { Badge, Button, EmptyState, Field, Input, Modal, useConfirm, useToast } from "../../ui";
import { dataHoraBR } from "../../lib/format";
import { apto, erroLegivel } from "../../lib/confirmacoes";
import ListaQueAbre from "./ListaQueAbre";
import { Ficha, Filtros, Placa } from "../app/pecas";

const COLUNAS = [
  { rotulo: "Placa", largura: "minmax(0, .8fr)" },
  { rotulo: "Veículo", largura: "minmax(0, 1.4fr)" },
  { rotulo: "Apto", largura: "minmax(0, .7fr)" },
  { rotulo: "TAG", largura: "minmax(0, 1.1fr)" },
];
const SITUACAO_TAG = { pedida: "Pedida", portaria: "Na portaria", colada: "Colada" };
const TOM_TAG = { pedida: "muted", portaria: "brand", colada: "positive" };
// As etapas da TAG, na ordem em que acontecem (os botões do formulário).
const ETAPAS_TAG = [["", "Sem TAG"], ["pedida", "Pedida"], ["portaria", "Na portaria"], ["colada", "Colada"]];
// O dia em Brasília (o timestamptz em UTC viraria o dia seguinte depois das 21h).
const diaBR = (v) => (v ? dataHoraBR(v, { comSegundos: false }).slice(0, 10) : "");
/** "o carro", "a moto": o artigo muda com o tipo. */
const oVeiculo = (v) => (v.veiculo === "Moto" ? "a moto" : "o carro");
/** Por que o veículo foi para o histórico. */
const MOTIVO = {
  morador: "excluído a pedido do morador",
  troca: "trocado por outro veículo",
  inquilino: "saiu com a chegada do inquilino",
  adm: "arquivado pela administração",
  saida: "saiu com o morador (saída registrada)",
};

/** O selo da TAG na lista e nos modais. */
function SeloTag({ v }) {
  if (v.veiculo === "Moto") return <Badge tone="neutral">Moto não usa TAG</Badge>;
  if (v.tag) return <Badge tone={TOM_TAG[v.tag]}>TAG {SITUACAO_TAG[v.tag].toLowerCase()}</Badge>;
  return <Badge tone="muted">{v.tag_arquivada_em ? "TAG arquivada" : "Sem TAG"}</Badge>;
}

/** Os avisos do histórico e da TAG arquivada, iguais na visualização e na edição. */
function AvisosDoVeiculo({ v }) {
  if (v.arquivado_em) {
    return (
      <p className="conf-alerta conf-alerta--neutro">
        <Archive size={16} aria-hidden="true" />
        No histórico desde {diaBR(v.arquivado_em)}: {MOTIVO[v.arquivado_por] ?? "arquivado"}.
        {v.tag_numero ? ` Desative a TAG nº ${v.tag_numero} no portão, se ainda não fez.` : ""}
      </p>
    );
  }
  if (v.tag_arquivada_em && !v.tag) {
    return (
      <p className="conf-alerta conf-alerta--neutro">
        <Archive size={16} aria-hidden="true" />
        O morador arquivou a TAG em {diaBR(v.tag_arquivada_em)}.{v.tag_numero ? ` Desative a TAG nº ${v.tag_numero} no portão.` : ""}
      </p>
    );
  }
  return null;
}

/** O topo dos dois modais: a placa grande e o resumo do veículo. */
function TopoDoVeiculo({ v, placa = v.placa, modelo = v.modelo, cor = v.cor }) {
  return (
    <div className="app-veiculo">
      <span className="app-veiculo__ic" aria-hidden="true">{v.veiculo === "Moto" ? <Bike size={22} /> : <Car size={22} />}</span>
      <div className="app-modal__quem">
        <strong>{modelo || v.veiculo}</strong>
        <small>{v.veiculo}{cor ? ` · ${cor}` : ""} · {apto(v.bloco, v.unidade)}</small>
        <span className="app-modal__selos">
          <SeloTag v={v} />
          {v.arquivado_em && <Badge tone="muted">No histórico</Badge>}
        </span>
      </div>
      <Placa placa={placa || "-------"} />
    </div>
  );
}

/**
 * O cadastro interno dos veículos do app (0070), só da administração, em
 * lista. A linha (e o olho) abre o veículo para ver; o lápis abre a edição:
 * placa, modelo, cor, a etapa da TAG e o nº da TAG (que o morador nunca vê),
 * mandar para o histórico, trazer de volta e excluir de vez.
 * `arquivados` mostra o histórico: os veículos que já passaram pelo
 * apartamento (excluídos a pedido do morador, trocados, saídos com a chegada
 * de inquilino), que o morador não vê mais.
 * `soComTag` mostra só os carros ativos com TAG (em qualquer etapa, ou só com
 * o nº guardado), para a aba TAGs da tela APP.
 * `podeEditar` (síndico, auxiliar e dev) mostra o lápis; o banco confere o
 * cargo de novo (`eh_administrativo`).
 */
export default function CadastroDeVeiculos({ arquivados, soComTag = false, podeEditar = false, onMudou }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [vendo, setVendo] = useState(null);
  const [editando, setEditando] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const aplicar = useCallback(({ data, error }) => {
    if (error) toast.error(erroLegivel(error));
    setLista(Array.isArray(data) ? data : []);
    setCarregando(false);
  }, [toast]);
  const buscar = useCallback(
    () => supabase.rpc("veiculos_do_condominio", { p_arquivados: arquivados }).then(aplicar),
    [arquivados, aplicar]
  );
  useEffect(() => { supabase.rpc("veiculos_do_condominio", { p_arquivados: arquivados }).then(aplicar); }, [arquivados, aplicar]);

  // A base da aba (todos, ou só os com TAG) e os filtros em pílula sobre ela:
  // carro/moto nos veículos, a etapa da TAG na aba de TAGs.
  const base = useMemo(
    () => (soComTag ? lista.filter((v) => v.veiculo === "Carro" && (v.tag || v.tag_numero)) : lista),
    [lista, soComTag]
  );
  const conta = (f) => base.filter(f).length;
  const filtros = soComTag
    ? [["todos", "Todas", base.length], ["colada", "Coladas", conta((v) => v.tag === "colada")],
       ["andamento", "Em andamento", conta((v) => v.tag === "pedida" || v.tag === "portaria")]]
    : [["todos", "Todos", base.length], ["Carro", "Carros", conta((v) => v.veiculo === "Carro")], ["Moto", "Motos", conta((v) => v.veiculo === "Moto")]];

  const filtrados = useMemo(() => {
    const passa = (v) => filtro === "todos"
      || (filtro === "colada" && v.tag === "colada")
      || (filtro === "andamento" && (v.tag === "pedida" || v.tag === "portaria"))
      || v.veiculo === filtro;
    const t = busca.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    return base.filter(passa).filter((v) => !t ||
      [v.placa, v.modelo, v.tag_numero, `${v.bloco}${v.unidade}`].some((x) => String(x ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").includes(t)));
  }, [base, busca, filtro]);

  const chamar = async (nome, args, ok) => {
    setSalvando(true);
    const { error } = await supabase.rpc(nome, args);
    setSalvando(false);
    if (error) { toast.error(erroLegivel(error)); return false; }
    toast.success(ok);
    setEditando(null);
    buscar();
    onMudou?.();
    return true;
  };

  const excluir = async (v) => {
    const ok = await confirmar({
      title: `Excluir ${oVeiculo(v)} ${v.placa}?`,
      description: "Some de vez, até do histórico, inclusive o nº da TAG. Para só tirar do apartamento, use Mandar para o histórico.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (ok) await chamar("excluir_veiculo", { p_id: v.id }, "Veículo excluído");
  };

  const vazio = soComTag
    ? ["Nenhuma TAG cadastrada", "Os carros com TAG pedida, na portaria ou colada aparecem aqui. Use o lápis para anotar o nº da TAG."]
    : arquivados
      ? ["Histórico vazio", "Os veículos que saem de um apartamento (excluídos, trocados ou com a chegada de inquilino) ficam aqui, com o nº da TAG."]
      : ["Nenhum veículo cadastrado pelo app", "Os veículos entram aqui quando a administração aprova o cadastro pedido no app."];

  return (
    <div className="app-aba">
      <Filtros
        busca={busca} onBusca={setBusca} placeholder="Buscar por placa, modelo, apto ou nº da TAG"
        filtros={carregando ? null : filtros} filtro={filtro} onFiltro={setFiltro}
      />
      {!carregando && filtrados.length === 0 ? (
        <EmptyState
          icon={soComTag ? <Tag size={20} /> : <Car size={20} />}
          title={busca || filtro !== "todos" ? "Nenhum veículo com esse filtro" : vazio[0]}
          description={vazio[1]}
        />
      ) : (
        <ListaQueAbre
          colunas={arquivados ? [...COLUNAS, { rotulo: "No histórico desde", largura: "minmax(0, .9fr)" }] : COLUNAS}
          larguraAcoes="96px"
          itens={filtrados}
          carregando={carregando}
          chave={(v) => v.id}
          onAbrir={setVendo}
          rotuloDaLinha={(v) => `${v.veiculo} ${v.placa}, ${apto(v.bloco, v.unidade)}: ver detalhes`}
          celulas={(v) => [
            <span key="p" className="conf-dado__mono">{v.placa}</span>,
            <span key="v" className="conf-duas">{v.modelo || v.veiculo}<small>{v.veiculo}{v.cor ? `, ${v.cor}` : ""}</small></span>,
            apto(v.bloco, v.unidade),
            <span key="t" className="conf-duas"><SeloTag v={v} />{v.tag_numero && <small>Nº {v.tag_numero}</small>}</span>,
            ...(arquivados ? [<span key="h" className="conf-duas">{diaBR(v.arquivado_em)}<small>{MOTIVO[v.arquivado_por] ?? ""}</small></span>] : []),
          ]}
          acoes={(v) => (
            <>
              <Button size="sm" variant="ghost" aria-label={`Ver ${oVeiculo(v)} ${v.placa}`} title="Ver detalhes"
                onClick={() => setVendo(v)} iconLeft={<Eye size={16} />} />
              {podeEditar && (
                <Button size="sm" variant="ghost" aria-label={`Editar ${oVeiculo(v)} ${v.placa}`} title="Editar"
                  onClick={() => setEditando(v)} iconLeft={<Pencil size={16} />} />
              )}
            </>
          )}
        />
      )}

      {vendo && (
        <VerVeiculo
          key={vendo.id}
          veiculo={vendo}
          onFechar={() => setVendo(null)}
          onEditar={podeEditar ? () => { setEditando(vendo); setVendo(null); } : null}
        />
      )}
      {editando && (
        <EditarVeiculo
          key={editando.id}
          veiculo={editando}
          salvando={salvando}
          onFechar={() => setEditando(null)}
          onSalvar={(campos) => chamar("editar_veiculo", { p_id: editando.id, ...campos }, "Veículo salvo")}
          onArquivar={() => chamar("arquivar_veiculo", { p_id: editando.id, p_arquivar: !editando.arquivado_em }, editando.arquivado_em ? "Veículo desarquivado" : "Veículo arquivado")}
          onExcluir={() => excluir(editando)}
        />
      )}
    </div>
  );
}

/** Só para ver: o veículo, a TAG e o apartamento. */
function VerVeiculo({ veiculo: v, onFechar, onEditar }) {
  const moto = v.veiculo === "Moto";
  return (
    <Modal
      open
      onClose={onFechar}
      title="Detalhes do veículo"
      size="lg"
      footer={onEditar && (
        <div className="app-modal__acoes">
          <span />
          <Button variant="primary" onClick={onEditar} iconLeft={<Pencil size={16} />}>Editar</Button>
        </div>
      )}
    >
      {/* O desenho do detalhe de Encomendas: o veículo, com a placa grande, à
          esquerda; o veículo, a TAG e o apartamento em fichas à direita. */}
      <div className="app-detalhe">
        <div className="app-detalhe__visual">
          <p className="app-detalhe__legenda">Veículo</p>
          <TopoDoVeiculo v={v} />
          <AvisosDoVeiculo v={v} />
        </div>
        <div className="app-detalhe__dados">
          <Ficha titulo="Veículo" itens={[
            ["Tipo", v.veiculo],
            ["Modelo", v.modelo],
            ["Cor", v.cor],
            ["Placa", v.placa, true],
          ]} />
          <Ficha titulo={moto ? "TAG (moto não usa)" : "TAG"} itens={moto ? [["Situação", "Moto não usa TAG"]] : [
            ["Situação", v.tag ? SITUACAO_TAG[v.tag] : v.tag_arquivada_em ? "Arquivada pelo morador" : "Sem TAG"],
            ["Nº da TAG", v.tag_numero || "Não anotado", Boolean(v.tag_numero)],
            v.tag_desde && v.tag ? ["Nessa etapa desde", diaBR(v.tag_desde)] : null,
            v.tag_de ? ["TAG de", v.tag_de] : null,
          ]} />
          <Ficha titulo="Apartamento" itens={[
            ["Apto", apto(v.bloco, v.unidade)],
            v.arquivado_em ? ["No histórico desde", diaBR(v.arquivado_em)] : null,
          ]} />
        </div>
      </div>
    </Modal>
  );
}

/** A edição: a placa muda ao vivo no topo, e a etapa da TAG é escolhida em botões. */
function EditarVeiculo({ veiculo, salvando, onFechar, onSalvar, onArquivar, onExcluir }) {
  const [placa, setPlaca] = useState(veiculo.placa ?? "");
  const [modelo, setModelo] = useState(veiculo.modelo ?? "");
  const [cor, setCor] = useState(veiculo.cor ?? "");
  const [tag, setTag] = useState(veiculo.tag ?? "");
  const [numero, setNumero] = useState(veiculo.tag_numero ?? "");
  const moto = veiculo.veiculo === "Moto";

  const salvar = (e) => {
    e.preventDefault();
    onSalvar({ p_placa: placa, p_modelo: modelo, p_cor: cor, p_tag: moto ? null : tag || null, p_tag_numero: moto ? null : numero || null });
  };

  return (
    <Modal
      open
      onClose={onFechar}
      title={`Editar ${veiculo.veiculo.toLowerCase()}`}
      size="md"
      footer={
        <div className="app-modal__acoes">
          <Button variant="ghost" className="conf-recusar" disabled={salvando} onClick={onExcluir} iconLeft={<Trash2 size={15} />}>Excluir</Button>
          <Button disabled={salvando} onClick={onArquivar}
            iconLeft={veiculo.arquivado_em ? <ArchiveRestore size={15} /> : <Archive size={15} />}>
            {veiculo.arquivado_em ? "Voltar para ativos" : "Mandar para o histórico"}
          </Button>
          <Button variant="primary" type="submit" form="editar-veiculo-app" loading={salvando}>Salvar</Button>
        </div>
      }
    >
      <form id="editar-veiculo-app" className="app-modal" onSubmit={salvar}>
        <TopoDoVeiculo v={veiculo} placa={placa} modelo={modelo} cor={cor} />
        <AvisosDoVeiculo v={veiculo} />

        <section className="app-ficha">
          <h3 className="app-ficha__titulo">Veículo</h3>
          <div className="app-ficha__dados app-ficha__dados--3">
            <Field label="Placa"><Input value={placa} maxLength={8} onChange={(e) => setPlaca(e.target.value.toUpperCase())} /></Field>
            <Field label="Modelo"><Input value={modelo} maxLength={60} onChange={(e) => setModelo(e.target.value)} /></Field>
            <Field label="Cor"><Input value={cor} maxLength={30} onChange={(e) => setCor(e.target.value)} /></Field>
          </div>
        </section>

        <section className="app-ficha">
          <h3 className="app-ficha__titulo">TAG</h3>
          {moto ? (
            <p className="app-modal__aviso">Moto não usa TAG.</p>
          ) : (
            <>
              <div className="app-etapas" role="radiogroup" aria-label="Situação da TAG">
                {ETAPAS_TAG.map(([valor, rotulo]) => (
                  <button key={valor || "sem"} type="button" role="radio" aria-checked={tag === valor}
                    className={tag === valor ? "app-etapas__op app-etapas__op--on" : "app-etapas__op"}
                    onClick={() => setTag(valor)}>
                    {rotulo}
                  </button>
                ))}
              </div>
              <Field label="Nº da TAG" help="Só a administração vê este número.">
                <Input value={numero} maxLength={40} inputMode="numeric" placeholder="Ex.: 004512" onChange={(e) => setNumero(e.target.value)} />
              </Field>
            </>
          )}
        </section>
      </form>
    </Modal>
  );
}
