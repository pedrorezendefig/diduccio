import React, { useState } from "react";
import {
  AlertTriangle, Eye, FileText, MessageSquareText, Paperclip, PartyPopper,
  Pencil, Plus, Trash2, UploadCloud, X,
} from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea } from "../../ui";
import ListaQueAbre from "../confirmacoes/ListaQueAbre";
import BuscaUnidade from "../BuscaUnidade";
import { DriveImage, MiniaturaAnexo, abrirArquivoDrive } from "../DriveImage";
import { Chave, Ficha, Filtros, Iniciais, MaisFiltros, Opcoes, PainelDeFiltros } from "../app/pecas";
import {
  dataBR, formatCurrency, maskCPF, maskCPFPrivacy, maskPhone, maskRG, maskRGPrivacy, nomeProprio,
} from "../../lib/format";

/**
 * A tela das reservas de espaço (Salão de festas e Churrasqueira), no padrão
 * do guia de marca: lista em linhas com olho e lápis, busca + pílulas de
 * situação, "Mais filtros", modal de VER (só leitura, com o contrato) e modal
 * de EDITAR (com os comprovantes).
 *
 * Só o desenho mora aqui. As regras (salvar, conflito de data, anexos no
 * bucket, contrato, "Falta Pagamento", exportação) continuam em cada página,
 * que é quem conhece a sua tabela; ela entrega dados e ações por props.
 *
 * `espaco`: o campo a mais da churrasqueira ({ campo, rotulo, opcoes }), que
 * vira coluna, filtro, opção no formulário e linha no detalhe. Festas não tem.
 */

const SITUACOES = ["Pendente", "Agendado", "Realizado", "Cancelado"];
const LOTE = 30;
const pagoSim = (v) => String(v ?? "").trim().toLowerCase().startsWith("s");
const temDivergencia = (r) => r.divergencia_local === true || r.divergencia_local === "Sim";

export default function TelaDeReservas({
  titulo, espaco, falta,
  reservas, lista, unidades, moradores, uploads, carregando, salvando,
  filtros, ordenacao, onOrdenar,
  statusNaTela, temComprovante,
  ver, form, acoes, children,
  // Só leitura (porteiro na Churrasqueira, 0120): sem criar, editar, excluir,
  // contrato e exportar; sem CPF, RG, telefone, valor e comprovantes.
  somenteLeitura = false,
}) {
  const [limite, setLimite] = useState(LOTE);
  const [maisFiltros, setMaisFiltros] = useState(false);
  // O contrato pede um documento: RG ou CPF, escolhido na hora (enquanto o
  // app do morador não manda esse dado). Guarda a reserva e a escolha.
  const [contrato, setContrato] = useState(null);
  // Com comprovante, pergunta o documento; sem, a página avisa o que falta.
  const pedirContrato = (r) => (temComprovante(r.id)
    ? setContrato({ reserva: r, documento: r.rg ? "rg" : "cpf" })
    : acoes.gerarContrato(r));

  const unidadePorId = new Map(unidades.map((u) => [String(u.id), u]));
  const rotuloUnidade = (id) => {
    const u = unidadePorId.get(String(id));
    return u ? `B${u.bloco}-${u.unidade}` : String(id ?? "—");
  };
  const anexosDe = (id) => uploads.filter((up) => String(up.id_festa ?? up.ID_FESTA ?? "") === String(id));
  const tom = (r) => {
    const st = statusNaTela(r);
    if (st === falta || st === "Cancelado") return "danger";
    return { Pendente: "neutral", Agendado: "brand", Realizado: "positive" }[st] ?? "neutral";
  };

  const situacoes = ["Pendente", falta, "Agendado", "Realizado", "Cancelado"];
  const contagem = (st) => reservas.filter((r) => statusNaTela(r) === st).length;
  // Os blocos que existem, em ordem, para o filtro do "Mais filtros".
  const blocos = [...new Set(unidades.map((u) => String(u.bloco)))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const noPainel = [
    filtros.bloco !== "Todos", filtros.pago !== "Todos", filtros.divergencia !== "Todos",
    espaco && filtros.espaco !== "Todos", Boolean(filtros.periodo.inicio || filtros.periodo.fim),
  ].filter(Boolean).length;
  const limparPainel = () => {
    filtros.setBloco("Todos");
    filtros.setPago("Todos");
    filtros.setDivergencia("Todos");
    if (espaco) filtros.setEspaco("Todos");
    filtros.setPeriodo({ inicio: "", fim: "" });
  };

  const colunas = [
    { rotulo: "Unidade", largura: "100px", ordem: "unidade_id" },
    { rotulo: "Morador", largura: "minmax(0, 1.6fr)", ordem: "morador" },
    ...(espaco ? [{ rotulo: espaco.rotulo, largura: "110px", ordem: espaco.campo }] : []),
    { rotulo: "Data", largura: "110px", ordem: "data_reserva" },
    ...(somenteLeitura ? [] : [{ rotulo: "Valor", largura: "100px", ordem: "valor_taxa" }]),
    { rotulo: "Pago", largura: "80px", ordem: "pago" },
    { rotulo: "Situação", largura: "140px", ordem: "status" },
  ];

  const v = ver.reserva;
  const d = form.dados;
  const mudar = (campo) => (valor) => form.setDados((f) => ({ ...f, [campo]: valor }));
  const moradoresDaUnidade = moradores.filter((m) => String(m.id_unidade) === String(d.unidade_id));
  const visiveis = lista.slice(0, limite);

  return (
    <div>
      <PageHeader
        title={titulo}
        meta={carregando ? "Carregando reservas" : `${reservas.length} reservas · ${contagem(falta)} sem comprovante`}
        actions={somenteLeitura ? <Badge tone="muted">Só leitura</Badge> : (
          <>
            <Button onClick={acoes.contratoVazio} iconLeft={<FileText size={15} />}>Contrato em branco</Button>
            <Button onClick={acoes.exportar} iconLeft={<FileText size={15} />}>Exportar</Button>
            <Button variant="primary" onClick={acoes.nova} iconLeft={<Plus size={16} />}>Nova reserva</Button>
          </>
        )}
      />

      <Filtros
        busca={filtros.busca}
        onBusca={(t) => { filtros.setBusca(t); setLimite(LOTE); }}
        placeholder="Morador ou unidade"
        filtro={filtros.status}
        onFiltro={(st) => { filtros.setStatus(st); setLimite(LOTE); }}
        filtros={[["Todos", "Todas", reservas.length], ...situacoes.map((st) => [st, st, contagem(st)])]}
        painel={
          <PainelDeFiltros aberto={maisFiltros}>
            {blocos.length > 1 && (
              <Field label="Bloco">
                <Opcoes rotulo="Bloco" valor={filtros.bloco} onMudar={(b) => { filtros.setBloco(b); setLimite(LOTE); }}
                  opcoes={[["Todos", "Todos"], ...blocos.map((b) => [b, `B${b}`])]} />
              </Field>
            )}
            <Field label="Pagamento">
              <Opcoes rotulo="Pagamento" valor={filtros.pago} onMudar={filtros.setPago}
                opcoes={[["Todos", "Todos"], ["Sim", "Pago"], ["Não", "Não pago"]]} />
            </Field>
            {espaco && (
              <Field label={espaco.rotulo}>
                <Opcoes rotulo={espaco.rotulo} valor={filtros.espaco} onMudar={filtros.setEspaco}
                  opcoes={[["Todos", "Todas"], ...espaco.opcoes]} />
              </Field>
            )}
            <Field label="Divergência">
              <Opcoes rotulo="Divergência" valor={filtros.divergencia} onMudar={filtros.setDivergencia}
                opcoes={[["Todos", "Todas"], ["Sim", "Com"], ["Não", "Sem"]]} />
            </Field>
            <Field label="Data de">
              <Input type="date" value={filtros.periodo.inicio}
                onChange={(e) => filtros.setPeriodo({ ...filtros.periodo, inicio: e.target.value })} />
            </Field>
            <Field label="até">
              <Input type="date" value={filtros.periodo.fim}
                onChange={(e) => filtros.setPeriodo({ ...filtros.periodo, fim: e.target.value })} />
            </Field>
          </PainelDeFiltros>
        }
      >
        <MaisFiltros aberto={maisFiltros} onAlternar={() => setMaisFiltros((a) => !a)} ativos={noPainel} onLimpar={limparPainel} />
      </Filtros>

      {!carregando && lista.length === 0 ? (
        <EmptyState
          icon={<PartyPopper size={22} />}
          title={reservas.length ? "Nenhuma reserva neste filtro" : "Nenhuma reserva cadastrada"}
          description={reservas.length ? "Troque a situação, a busca ou os filtros." : somenteLeitura ? "As reservas aparecem aqui quando a administração cadastrar." : "Cadastre a primeira em Nova reserva."}
        />
      ) : (
        <ListaQueAbre
          colunas={colunas}
          larguraAcoes={somenteLeitura ? "56px" : "132px"}
          itens={visiveis}
          carregando={carregando}
          chave={(r) => r.id}
          onAbrir={ver.abrir}
          ordenacao={ordenacao}
          onOrdenar={onOrdenar}
          rotuloDaLinha={(r) => `Abrir a reserva de ${nomeProprio(r.morador) || "sem responsável"} (${rotuloUnidade(r.unidade_id)})`}
          celulas={(r) => [
            <b key="u" className="conf-dado__mono">{rotuloUnidade(r.unidade_id)}</b>,
            <span key="m" className="mud-quem">
              <b>
                {nomeProprio(r.morador)}
                {temDivergencia(r) ? <AlertTriangle size={13} className="res-alerta" aria-label="Tem divergência" /> : null}
                {r.obs?.trim() ? <MessageSquareText size={13} aria-label="Tem observação" /> : null}
              </b>
              {r.cpf ? <small>{maskCPFPrivacy(r.cpf)}</small> : null}
            </span>,
            ...(espaco ? [<span key="e" className="conf-dado__mono">{r[espaco.campo] || "—"}</span>] : []),
            <b key="d">{dataBR(r.data_reserva) || "—"}</b>,
            ...(somenteLeitura ? [] : [<span key="v" className="conf-dado__mono">{formatCurrency(r.valor_taxa)}</span>]),
            <Badge key="p" tone={pagoSim(r.pago) ? "positive" : "neutral"}>{pagoSim(r.pago) ? "Sim" : "Não"}</Badge>,
            <Badge key="s" tone={tom(r)}>{statusNaTela(r)}</Badge>,
          ]}
          acoes={(r) => (
            <>
              <Button variant="ghost" size="sm" aria-label={`Ver reserva de ${nomeProprio(r.morador) || "sem responsável"}`} onClick={() => ver.abrir(r)}><Eye size={16} /></Button>
              {!somenteLeitura && <>
              <Button variant="ghost" size="sm" aria-label={`Editar reserva de ${nomeProprio(r.morador) || "sem responsável"}`} onClick={() => acoes.editar(r)}><Pencil size={16} /></Button>
              <Button variant="ghost" size="sm"
                className={temComprovante(r.id) ? undefined : "res-contrato--travado"}
                aria-disabled={!temComprovante(r.id)}
                aria-label={`Gerar contrato de ${nomeProprio(r.morador) || "sem responsável"}${temComprovante(r.id) ? "" : " (anexe o comprovante)"}`}
                title={temComprovante(r.id) ? "Gerar contrato" : "Anexe o comprovante de pagamento para liberar"}
                onClick={() => pedirContrato(r)}><FileText size={16} /></Button>
              </>}
            </>
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

      {/* ---- Ver: o desenho do detalhe de Encomendas. O contrato sai daqui,
          travado sem comprovante. ---- */}
      <Modal
        open={ver.aberto && Boolean(v)}
        onClose={ver.fechar}
        title="Detalhes da reserva"
        size="lg"
        footer={v && (somenteLeitura ? (
          <div className="app-modal__acoes">
            <Button variant="ghost" onClick={ver.fechar}>Fechar</Button>
          </div>
        ) : (
          <div className="app-modal__acoes">
            <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => acoes.excluir(v.id)}>Excluir</Button>
            <Button variant="ghost" iconLeft={<Pencil size={15} />} onClick={() => acoes.editar(v)}>Editar</Button>
            <Button
              variant="primary"
              className={temComprovante(v.id) ? "res-contrato" : "res-contrato res-contrato--travado"}
              aria-disabled={!temComprovante(v.id)}
              title={temComprovante(v.id) ? undefined : "Anexe o comprovante de pagamento para liberar"}
              iconLeft={<FileText size={15} />}
              onClick={() => pedirContrato(v)}
            >
              Gerar contrato{!temComprovante(v.id) && <span className="res-contrato__dica"> · anexe o comprovante</span>}
            </Button>
          </div>
        ))}
      >
        {v && (
          <div className="app-modal">
            <div className="app-modal__topo">
              <Iniciais nome={v.morador} grande />
              <div className="app-modal__quem">
                <strong>{nomeProprio(v.morador) || "Reserva"}</strong>
                <small>{v.data_reserva ? `Reserva para ${dataBR(v.data_reserva)}` : "Sem data"} · {rotuloUnidade(v.unidade_id)}</small>
                <span className="app-modal__selos">
                  <Badge tone={tom(v)}>{statusNaTela(v) || "Sem status"}</Badge>
                  <Badge tone={pagoSim(v.pago) ? "positive" : "neutral"}>{pagoSim(v.pago) ? "Pago" : "Não pago"}</Badge>
                  {espaco && v[espaco.campo] ? <Badge tone="brand">{v[espaco.campo]}</Badge> : null}
                  {temDivergencia(v) ? <Badge tone="danger">Divergência</Badge> : null}
                </span>
              </div>
            </div>

            <div className="app-detalhe">
              {/* À esquerda o dia e o comprovante: é o que se confere antes do contrato. */}
              <div className="app-detalhe__visual">
                <p className="app-detalhe__legenda">Reserva</p>
                <div className="app-cartao">
                  <p className="app-cartao__rotulo">{rotuloUnidade(v.unidade_id)}{espaco && v[espaco.campo] ? ` · ${v[espaco.campo]}` : ""}</p>
                  <p className="app-cartao__grande">{dataBR(v.data_reserva) || "Sem data"}</p>
                  <p className="app-cartao__sub">{v.convidados ? `${v.convidados} convidados` : "Convidados não informados"}{somenteLeitura ? "" : ` · ${formatCurrency(v.valor_taxa)}`}</p>
                </div>
                <p className="app-detalhe__legenda">Comprovantes</p>
                {somenteLeitura ? (
                  <p className="app-modal__aviso"><Paperclip size={14} aria-hidden="true" /> {temComprovante(v.id) ? "Comprovante anexado pela administração." : "Nenhum comprovante anexado."}</p>
                ) : anexosDe(v.id).length ? (
                  <div className="res-anexos res-anexos--grande">
                    {anexosDe(v.id).map((a, i) => (
                      <button key={a.id ?? i} type="button" className="res-anexo" onClick={() => abrirArquivoDrive(a.url_drive || a.url || "")}
                        aria-label={`Abrir ${a.nome_arquivo || "o comprovante"}`}>
                        <span className="res-anexo__fundo" aria-hidden="true"><FileText size={22} />Ver arquivo</span>
                        <DriveImage source={a.url_drive || a.url || ""} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="app-modal__aviso"><Paperclip size={14} aria-hidden="true" /> Nenhum comprovante anexado.</p>
                )}
              </div>

              <div className="app-detalhe__dados">
                <Ficha titulo="Reserva" itens={[
                  ["Data", dataBR(v.data_reserva) || "—"],
                  espaco && [espaco.rotulo, v[espaco.campo] || "Não escolhida"],
                  ["Convidados", v.convidados ?? "—"],
                  !somenteLeitura && ["Valor da taxa", formatCurrency(v.valor_taxa), true],
                ]} />
                {!somenteLeitura && (
                  <Ficha titulo="Responsável" itens={[
                    ["CPF", v.cpf ? maskCPFPrivacy(v.cpf) : "Não informado", true],
                    ["RG", v.rg ? maskRGPrivacy(v.rg) : "Não informado", true],
                    ["Telefone", v.contato ? maskPhone(String(v.contato)) : "Não informado"],
                  ]} />
                )}
                {v.obs?.trim() && (
                  <section className="app-ficha">
                    <h3 className="app-ficha__titulo">Observações</h3>
                    <p className="mud-obs">{v.obs}</p>
                  </section>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Criar e editar ---- */}
      <Modal
        open={form.aberto}
        onClose={form.fechar}
        title={form.modo === "add" ? "Nova reserva" : "Editar reserva"}
        size="md"
        footer={
          <div className="app-modal__acoes">
            {form.modo === "edit"
              ? <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => { form.fechar(); acoes.excluir(d.id); }}>Excluir</Button>
              : <span />}
            <Button variant="ghost" onClick={form.fechar}>Cancelar</Button>
            <Button variant="primary" type="submit" form="form-reserva" loading={salvando}>Salvar</Button>
          </div>
        }
      >
        <form id="form-reserva" className="mud-form" onSubmit={(e) => { e.preventDefault(); acoes.salvar(); }}>
          <Field label="Unidade" required>
            <BuscaUnidade
              unidades={unidades}
              valor={unidadePorId.get(String(d.unidade_id)) ?? null}
              onEscolher={(u) => form.setDados((f) => ({ ...f, unidade_id: u?.id ?? "" }))}
            />
          </Field>

          <Chave
            ligada={form.moradorCadastrado}
            onChange={acoes.alternarMoradorCadastrado}
            titulo="É morador cadastrado"
            sub="Puxa nome, CPF, RG e telefone do cadastro da unidade"
          />
          {form.moradorCadastrado && (
            <Field label="Morador" help={d.unidade_id ? undefined : "Escolha a unidade primeiro"}>
              <Select value={moradores.find((m) => m.nome === d.morador)?.id ?? ""}
                onChange={(e) => acoes.escolherMorador(e.target.value)} disabled={!d.unidade_id}>
                <option value="">Escolha…</option>
                {moradoresDaUnidade.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </Select>
            </Field>
          )}

          <Field label="Nome do responsável" required>
            <Input value={d.morador || ""} readOnly={form.moradorCadastrado}
              onChange={(e) => mudar("morador")(e.target.value)}
              onBlur={(e) => mudar("morador")(nomeProprio(e.target.value))} />
          </Field>
          <div className="mud-form__par">
            <Field label="CPF" required>
              <Input value={d.cpf || ""} readOnly={form.moradorCadastrado} inputMode="numeric" placeholder="000.000.000-00"
                onChange={(e) => mudar("cpf")(maskCPF(e.target.value))} />
            </Field>
            <Field label="RG" required={Boolean(espaco)}>
              <Input value={d.rg || ""} readOnly={form.moradorCadastrado} placeholder="00.000.000-0"
                onChange={(e) => mudar("rg")(maskRG(e.target.value))} />
            </Field>
          </div>
          <div className="mud-form__par">
            <Field label="Telefone" required>
              <Input value={d.contato || ""} inputMode="tel" placeholder="(00) 00000-0000"
                onChange={(e) => mudar("contato")(maskPhone(e.target.value))} />
            </Field>
            <Field label="Data" required>
              {/* O <input type=date> só aceita AAAA-MM-DD: aqui fica o ISO, e não o dataBR. */}
              <Input type="date" value={d.data_reserva ? d.data_reserva.split('T')[0] : ""}
                onChange={(e) => mudar("data_reserva")(e.target.value)} />
            </Field>
          </div>
          {espaco && (
            <Field label={espaco.rotulo} required>
              <Opcoes rotulo={espaco.rotulo} valor={d[espaco.campo] || ""} onMudar={mudar(espaco.campo)} opcoes={espaco.opcoes} />
            </Field>
          )}
          <div className="mud-form__par">
            <Field label="Taxa (R$)" required>
              <Input type="number" inputMode="decimal" value={d.valor_taxa ?? ""} onChange={(e) => mudar("valor_taxa")(e.target.value)} />
            </Field>
            <Field label="Convidados">
              <Input type="number" inputMode="numeric" value={d.convidados ?? ""} onChange={(e) => mudar("convidados")(e.target.value)} />
            </Field>
          </div>
          <div className="mud-form__par">
            <Field label="Pagamento">
              <Opcoes rotulo="Pagamento" valor={pagoSim(d.pago) ? "Sim" : "Não"} onMudar={mudar("pago")} opcoes={[["Não", "Não pago"], ["Sim", "Pago"]]} />
            </Field>
            <Field label="Situação">
              <Opcoes rotulo="Situação" valor={d.status || "Pendente"} onMudar={mudar("status")} opcoes={SITUACOES} />
            </Field>
          </div>

          <Field label="Comprovantes" help="Imagem ou PDF. O contrato só sai com o comprovante de pagamento anexado.">
            <div className="res-anexos">
              {d.id && anexosDe(d.id).map((a, i) => (
                <span key={`salvo-${a.id ?? i}`} className="res-anexo res-anexo--salvo">
                  <MiniaturaAnexo source={a.url_drive || a.url} nome={a.nome_arquivo} alt="Comprovante"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <span className="res-anexo__selo">Salvo</span>
                  <button type="button" className="res-anexo__tirar" aria-label={`Remover ${a.nome_arquivo || "o anexo"}`}
                    onClick={() => acoes.excluirAnexo(a.id || a.ID)}><X size={12} /></button>
                </span>
              ))}
              {(d.fotosNovas || []).map((base64, i) => (
                <span key={`novo-${i}`} className="res-anexo res-anexo--novo">
                  <MiniaturaAnexo localSrc={base64} alt="Anexo a enviar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button type="button" className="res-anexo__tirar" aria-label="Tirar este anexo"
                    onClick={() => form.setDados((f) => ({ ...f, fotosNovas: f.fotosNovas.filter((_, j) => j !== i) }))}><X size={12} /></button>
                </span>
              ))}
              <label className="res-anexo res-anexo--novo-botao">
                <UploadCloud size={20} aria-hidden="true" />
                <span>Adicionar</span>
                <input type="file" multiple accept="image/*,application/pdf" onChange={acoes.escolherArquivos} className="res-anexo__entrada" />
              </label>
            </div>
          </Field>

          {form.modo === "edit" && (
            <>
              <Chave
                ligada={temDivergencia(d)}
                onChange={(ligada) => mudar("divergencia_local")(ligada)}
                icone={<AlertTriangle size={18} />}
                titulo="Divergência no local"
                sub="Algo não bateu na vistoria ou no uso do espaço"
              />
              <Field label="Observações">
                <Textarea rows={3} value={d.obs || ""} placeholder="Algo importante sobre a reserva"
                  onChange={(e) => mudar("obs")(e.target.value)} />
              </Field>
            </>
          )}
        </form>
      </Modal>

      {/* ---- O documento do contrato ---- */}
      <Modal
        open={Boolean(contrato)}
        onClose={() => setContrato(null)}
        title="Gerar contrato"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setContrato(null)}>Cancelar</Button>
            <Button variant="primary" iconLeft={<FileText size={15} />}
              onClick={() => { acoes.gerarContrato(contrato.reserva, contrato.documento); setContrato(null); }}>
              Gerar
            </Button>
          </>
        }
      >
        {contrato && (
          <div className="mud-form">
            <Field label="Documento no contrato"
              help={(contrato.documento === "cpf" ? contrato.reserva.cpf : contrato.reserva.rg)
                ? "Sai escrito no contrato, depois do nome."
                : "Este documento não está no cadastro da reserva: o contrato sai com o campo em branco."}>
              <Opcoes rotulo="Documento no contrato" valor={contrato.documento}
                onMudar={(documento) => setContrato((c) => ({ ...c, documento }))}
                opcoes={[["rg", "RG"], ["cpf", "CPF"]]} />
            </Field>
          </div>
        )}
      </Modal>

      {children}
    </div>
  );
}
