import React, { useId, useState } from "react";
import { Button, Field, Gaveta, Input, Select, Textarea, useConfirm } from "../ui";
import BuscaUnidade from "./BuscaUnidade";
import {
  SITUACOES, iniciais, mensagemErro, metaDaTarefa, paraGravar, rotuloDoCargo, validarTarefa,
} from "../lib/tarefas";

/**
 * Criar e editar uma tarefa. Monte-a só quando for abrir, com uma `key` nova a
 * cada abertura: o formulário nasce do `tarefa` recebido e não se sincroniza
 * depois, e é isso que faz "abrir outra tarefa" não herdar o que se digitou
 * na anterior.
 *
 * `onSalvar(campos)` e `onExcluir(tarefa)` devolvem `{ success, message }`.
 * Em sucesso, quem fecha é a página; em falha, a gaveta fica aberta com a frase.
 *
 * `tituloInicial` é a linha do bloco de notas que está virando tarefa. Só vale
 * para tarefa nova: numa existente, o título é o dela.
 */
export default function GavetaDeTarefa({
  tarefa = null,
  situacaoInicial = "A_FAZER",
  tituloInicial = "",
  pessoas,
  unidades,
  user,
  podeExcluir,
  onFechar,
  onSalvar,
  onExcluir,
}) {
  const confirmar = useConfirm();
  const [form, setForm] = useState(() => ({
    titulo: tarefa ? (tarefa.titulo ?? "") : (tituloInicial ?? ""),
    descricao: tarefa?.descricao ?? "",
    // Só a tarefa nova nasce com quem criou; uma existente sem responsável
    // continua sem, para salvar não a entregar a quem só abriu a gaveta.
    responsavel_id: String(tarefa ? (tarefa.responsavel_id ?? "") : (user?.id ?? "")),
    // `date` chega "2026-10-02"; o <input type=date> exige exatamente isso.
    prazo: String(tarefa?.prazo ?? "").slice(0, 10),
    id_unidade: tarefa?.id_unidade ?? null,
    situacao: tarefa?.situacao ?? situacaoInicial,
  }));
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const ocupado = salvando || excluindo;
  const idSituacao = useId();

  const campo = (nome, valor) => setForm((f) => ({ ...f, [nome]: valor }));
  const responsavel = pessoas.find((p) => String(p.id) === form.responsavel_id);
  // A tarefa pode estar com alguém que a lista pública não traz (o Desenvolvedor
  // fica fora da view, ou a pessoa foi apagada). Sem esta opção o select cairia
  // em "Escolha" e salvar apagaria o responsável sem o usuário ter mexido em nada.
  const responsavelForaDaLista = form.responsavel_id !== "" && !responsavel;
  const unidade = unidades.find((u) => String(u.id) === String(form.id_unidade ?? "")) ?? null;

  // Setas movem a seleção e o foco, dando a volta (padrão WAI-ARIA de radiogroup).
  const aoTeclarSituacao = (e, i) => {
    const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!passo) return;
    e.preventDefault();
    const prox = SITUACOES[(i + passo + SITUACOES.length) % SITUACOES.length];
    campo("situacao", prox.id);
    e.currentTarget.parentElement.querySelector(`[data-situacao="${prox.id}"]`)?.focus();
  };

  const salvar = async () => {
    const e = validarTarefa(form);
    setErros(e);
    if (Object.keys(e).length) return;
    setSalvando(true);
    setErroGeral("");
    try {
      const r = await onSalvar(paraGravar(form));
      if (!r?.success) setErroGeral(mensagemErro(r?.message));
    } catch (err) {
      setErroGeral(mensagemErro(err?.message));
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    const ok = await confirmar({
      title: `Excluir "${tarefa.titulo}"?`,
      description: "A tarefa some do quadro para todos. Não dá para desfazer.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    setExcluindo(true);
    setErroGeral("");
    try {
      const r = await onExcluir(tarefa);
      if (!r?.success) setErroGeral(mensagemErro(r?.message));
    } catch (err) {
      setErroGeral(mensagemErro(err?.message));
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <Gaveta
      open
      // Fechar no meio de uma gravação perderia a mensagem de falha.
      onClose={ocupado ? undefined : onFechar}
      sigla={responsavel ? iniciais(responsavel.nome) : "?"}
      titulo={tarefa ? tarefa.titulo : "Nova tarefa"}
      meta={tarefa ? [`Tarefa #${tarefa.id}.`, metaDaTarefa(tarefa)].filter(Boolean).join(" ") : undefined}
      footer={
        <>
          {tarefa && podeExcluir && (
            <Button variant="ghost" className="tar-excluir" onClick={excluir} disabled={ocupado}>
              Excluir
            </Button>
          )}
          <span className="tar-gaveta__espaco" />
          <Button variant="secondary" onClick={onFechar} disabled={ocupado}>Cancelar</Button>
          <Button variant="primary" onClick={salvar} loading={salvando} disabled={ocupado}>Salvar</Button>
        </>
      }
    >
      <div className="tar-gaveta">
        {erroGeral && <p className="vit-form__erro" role="alert">{erroGeral}</p>}

        <Field label="Título" required error={erros.titulo}>
          <Input value={form.titulo} onChange={(e) => campo("titulo", e.target.value)} />
        </Field>

        <Field label="Descrição">
          <Textarea rows={3} value={form.descricao} onChange={(e) => campo("descricao", e.target.value)} />
        </Field>

        <div className="tar-gaveta__par">
          <Field label="Responsável" required error={erros.responsavel_id}>
            <Select value={form.responsavel_id} onChange={(e) => campo("responsavel_id", e.target.value)}>
              <option value="">Escolha</option>
              {responsavelForaDaLista && (
                <option value={form.responsavel_id}>Responsável atual (fora da lista)</option>
              )}
              {pessoas.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.nome} ({rotuloDoCargo(p.cargo)})</option>
              ))}
            </Select>
          </Field>
          <Field label="Prazo">
            <Input type="date" value={form.prazo} onChange={(e) => campo("prazo", e.target.value)} />
          </Field>
        </div>

        <Field label="Unidade" help="Opcional. Para tarefa ligada a um apartamento.">
          <BuscaUnidade
            unidades={unidades}
            valor={unidade}
            onEscolher={(u) => campo("id_unidade", u?.id ?? null)}
          />
        </Field>

        <div className="vit-field">
          <span className="vit-field__label" id={idSituacao}>Situação</span>
          <div className="tar-situacoes" role="radiogroup" aria-labelledby={idSituacao}>
            {SITUACOES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={form.situacao === s.id}
                tabIndex={form.situacao === s.id ? 0 : -1}
                data-situacao={s.id}
                onKeyDown={(e) => aoTeclarSituacao(e, i)}
                className="tar-situacao"
                onClick={() => campo("situacao", s.id)}
              >
                {s.rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Gaveta>
  );
}
