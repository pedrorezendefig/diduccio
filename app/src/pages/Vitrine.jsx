import React, { useMemo, useState } from "react";
import {
  Plus, Download, Trash2, Pencil, Search, Building2, AlertCircle,
} from "lucide-react";
import {
  Button, Card, Badge, Stat, PageHeader, Skeleton, EmptyState,
  Field, Input, Select, Textarea, Checkbox,
  Table, Tabs, Modal, Ocupado,
  useToast, useConfirm,
} from "../ui";
import { MARCA, CLARO, ESCURO } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import Logo from "../brand/Logo";

/**
 * Vitrine dos primitivos do ViT.
 *
 * Rota /vitrine, só para o cargo Desenvolvedor. Serve para revisar o design
 * system inteiro numa tela, nos dois temas, antes de aplicar nas 21 páginas.
 * Vale manter depois da migração como guia vivo: se um primitivo quebrar,
 * quebra aqui primeiro.
 */

const UNIDADES = [
  { id: "B5-304",  morador: "Renata Vasconcelos",  situacao: "Em dia",        taxa: "742,10",   atraso: null },
  { id: "B5-117",  morador: "Aurélio Bittencourt", situacao: "Inadimplente",  taxa: "2.226,30", atraso: "42d" },
  { id: "B5-902",  morador: "Ivone Tagliaferro",   situacao: "Em dia",        taxa: "742,10",   atraso: null },
  { id: "B5-1102", morador: "",                     situacao: "Desocupada",    taxa: null,       atraso: null },
  { id: "B5-708",  morador: "Nivaldo Speranza",     situacao: "Inadimplente",  taxa: "1.484,20", atraso: "8d" },
];

const TOM_SITUACAO = {
  "Em dia": "positive",
  "Inadimplente": "danger",
  "Desocupada": "neutral",
};

export default function Vitrine() {
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const confirm = useConfirm();

  const [aba, setAba] = useState("componentes");
  const [sort, setSort] = useState({ key: "id", dir: "asc" });
  const [estadoTabela, setEstadoTabela] = useState("cheia");
  const [modalAberto, setModalAberto] = useState(false);
  const [cpf, setCpf] = useState("");
  const [erroCpf, setErroCpf] = useState("");
  const [ultimoConfirm, setUltimoConfirm] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const linhas = useMemo(() => {
    const copia = [...UNIDADES];
    copia.sort((a, b) => {
      const x = String(a[sort.key] ?? "");
      const y = String(b[sort.key] ?? "");
      return sort.dir === "asc" ? x.localeCompare(y) : y.localeCompare(x);
    });
    return copia;
  }, [sort]);

  const colunas = [
    { key: "id", label: "Unidade", tipo: "id", sortable: true },
    { key: "morador", label: "Morador", sortable: true },
    {
      key: "situacao", label: "Situação",
      render: (l) => <Badge tone={TOM_SITUACAO[l.situacao]}>{l.situacao}</Badge>,
    },
    { key: "taxa", label: "Taxa", tipo: "num", sortable: true },
    {
      key: "atraso", label: "Atraso", tipo: "num",
      render: (l) => l.atraso
        ? <span style={{ color: "var(--fg-danger)", fontWeight: 600 }}>{l.atraso}</span>
        : null,
    },
  ];

  const pedirExclusao = async (linha) => {
    const ok = await confirm({
      title: `Excluir a unidade ${linha.id}?`,
      description: linha.morador
        ? `${linha.morador} está vinculado a ela. Não dá para desfazer.`
        : "Não dá para desfazer.",
      confirmLabel: "Excluir",
      danger: true,
    });
    setUltimoConfirm(ok ? `confirmou a exclusão de ${linha.id}` : "cancelou");
    if (ok) toast.success(`Unidade ${linha.id} excluída`);
  };

  return (
    <div>
      <PageHeader
        title="Vitrine do design system"
        meta="ViT · 18 primitivos · revise nos dois temas"
        actions={
          <>
            <Button onClick={toggleTheme}>
              {theme.isDark ? "Modo claro" : "Modo escuro"}
            </Button>
            <Button variant="primary" iconLeft={<Plus size={16} />}>
              Ação principal
            </Button>
          </>
        }
      />

      <Tabs
        items={[
          { value: "componentes", label: "Componentes" },
          { value: "dados", label: "Tabela e estados", count: 5 },
          { value: "tokens", label: "Tokens" },
        ]}
        value={aba}
        onChange={setAba}
      />

      {/* ===================== COMPONENTES ===================== */}
      {aba === "componentes" && (
        <div style={{ display: "grid", gap: 24 }}>

          <Secao titulo="Marca" nota="Quatro lockups. O swoosh só aparece no principal.">
            <div style={{ display: "flex", gap: 40, flexWrap: "wrap", alignItems: "center" }}>
              <Coluna rotulo="principal"><Logo variant="full" size={78} /></Coluna>
              <Coluna rotulo="horizontal"><Logo variant="horizontal" cliente="Diduccio" /></Coluna>
              <Coluna rotulo="fundo escuro">
                <div style={{ background: "var(--brand-700)", padding: 14, borderRadius: "var(--radius-lg)" }}>
                  <Logo variant="inverse" cliente="Diduccio" />
                </div>
              </Coluna>
              <Coluna rotulo="símbolo 32 / 24 / 16">
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <Logo variant="mark" size={32} />
                  <Logo variant="mark" size={24} />
                  <Logo variant="mark" size={16} />
                </div>
              </Coluna>
            </div>
          </Secao>

          <Secao titulo="Botões" nota="Passe o mouse, clique e navegue por Tab. Hover, active e foco são CSS real.">
            <Linha>
              <Button variant="primary">Primário</Button>
              <Button variant="secondary">Secundário</Button>
              <Button variant="ghost">Terciário</Button>
              <Button variant="danger">Destrutivo</Button>
            </Linha>
            <Linha>
              <Button variant="primary" size="sm">Primário sm</Button>
              <Button variant="secondary" size="sm" iconLeft={<Download size={14} />}>Exportar</Button>
              <Button variant="ghost" size="sm" iconLeft={<Pencil size={14} />}>Editar</Button>
              <Button variant="danger" size="sm" iconLeft={<Trash2 size={14} />}>Excluir</Button>
            </Linha>
            <Linha>
              <Button variant="primary" loading>Salvando</Button>
              <Button variant="primary" disabled>Desabilitado</Button>
              <Button variant="secondary" disabled>Desabilitado</Button>
            </Linha>
          </Secao>

          <Secao titulo="Indicadores" nota="Sem card em volta. Uma barra vertical basta. Número em mono tabular, então a faixa não muda de largura ao atualizar.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
              <Stat label="Unidades ocupadas" value="117" hint="de 128" tone="brand" />
              <Stat label="Inadimplentes" value="9" tone="danger" hint="7,0% do total" />
              <Stat label="Reservas ativas" value="14" tone="neutral" />
              <Stat label="Recebido 2026" value="R$ 27.480" tone="brand" hint="festas + churrasqueira" />
            </div>
          </Secao>

          <Secao titulo="Rótulos de estado" nota="Terracota é o único segundo acento, e só para estado negativo real.">
            <Linha>
              <Badge tone="positive">Em dia</Badge>
              <Badge tone="danger">Inadimplente</Badge>
              <Badge tone="neutral">Desocupada</Badge>
              <Badge tone="brand">Aprovado</Badge>
              <Badge tone="muted">Sem status</Badge>
            </Linha>
          </Secao>

          <Secao titulo="Formulário" nota="Rótulo sempre acima. Erro sempre abaixo. Placeholder nunca faz papel de rótulo.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
              <Field label="Buscar" help="Unidade, morador ou CPF">
                <Input placeholder="B5-304" />
              </Field>
              <Field
                label="CPF"
                required
                error={erroCpf}
                help="Só números"
              >
                <Input
                  value={cpf}
                  inputMode="numeric"
                  onChange={(e) => {
                    setCpf(e.target.value);
                    setErroCpf(
                      e.target.value && e.target.value.replace(/\D/g, "").length !== 11
                        ? "O CPF precisa ter 11 dígitos."
                        : ""
                    );
                  }}
                  placeholder="00000000000"
                />
              </Field>
              <Field label="Bloco">
                <Select defaultValue="5">
                  <option value="5">Bloco 5</option>
                  <option value="6">Bloco 6</option>
                </Select>
              </Field>
              <Field label="Campo desabilitado">
                <Input disabled value="não editável" />
              </Field>
            </div>
            <div style={{ marginTop: 16 }}>
              <Field label="Observação">
                <Textarea placeholder="Anotação interna sobre a unidade" />
              </Field>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 24, flexWrap: "wrap" }}>
              <Checkbox label="Morador já cadastrado" />
              <Checkbox label="Taxa isenta" defaultChecked />
              <Checkbox label="Opção indisponível" disabled />
            </div>
          </Secao>

          <Secao titulo="Aviso, confirmação e modal" nota="Substituem os 112 alert() e confirm() do sistema.">
            <Linha>
              <Button onClick={() => toast.success("Unidade B5-304 salva")}>Aviso de sucesso</Button>
              <Button onClick={() => toast.error("Não foi possível salvar. A planilha não respondeu.")}>Aviso de erro</Button>
              <Button onClick={() => toast.info("14 encomendas aguardando retirada")}>Aviso neutro</Button>
            </Linha>
            <Linha>
              <Button variant="secondary" onClick={() => setModalAberto(true)}>Abrir modal</Button>
            <Button
              variant="secondary"
              onClick={() => { setOcupado(true); setTimeout(() => setOcupado(false), 1800); }}
            >
              Véu de gravação
            </Button>
              <Button
                variant="danger"
                onClick={() => pedirExclusao(UNIDADES[1])}
              >
                Confirmação destrutiva
              </Button>
            </Linha>
            {ultimoConfirm && (
              <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginTop: 8 }}>
                Última resposta: {ultimoConfirm}
              </p>
            )}
            <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginTop: 8 }}>
              No modal aberto, teste Esc para fechar e Tab para ver o foco preso dentro dele.
            </p>
          </Secao>

          <Secao titulo="Superfícies" nota="Card não tem sombra, só borda. Sombra passa a significar elevação real.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
              <Card padding="sm"><b>Card sm</b><br /><span style={{ color: "var(--fg-secondary)" }}>padding 12px</span></Card>
              <Card padding="md"><b>Card md</b><br /><span style={{ color: "var(--fg-secondary)" }}>padding 20px</span></Card>
              <Card padding="lg"><b>Card lg</b><br /><span style={{ color: "var(--fg-secondary)" }}>padding 24px</span></Card>
            </div>
          </Secao>

        </div>
      )}

      {/* ===================== TABELA E ESTADOS ===================== */}
      {aba === "dados" && (
        <div style={{ display: "grid", gap: 24 }}>

          <Secao
            titulo="Tabela"
            nota="Clique nos cabeçalhos para ordenar. Passe o mouse numa linha para ver as ações. Estreite a janela abaixo de 768px: vira lista de cards, não scroll horizontal."
          >
            <Linha>
              <Button size="sm" variant={estadoTabela === "cheia" ? "primary" : "secondary"} onClick={() => setEstadoTabela("cheia")}>Com dados</Button>
              <Button size="sm" variant={estadoTabela === "carregando" ? "primary" : "secondary"} onClick={() => setEstadoTabela("carregando")}>Carregando</Button>
              <Button size="sm" variant={estadoTabela === "vazia" ? "primary" : "secondary"} onClick={() => setEstadoTabela("vazia")}>Vazia</Button>
            </Linha>

            <div style={{ marginTop: 16 }}>
              <Table
                columns={colunas}
                rows={estadoTabela === "cheia" ? linhas : []}
                loading={estadoTabela === "carregando"}
                sort={sort}
                onSort={setSort}
                getRowKey={(l) => l.id}
                rowActions={(l) => (
                  <>
                    <Button size="sm" variant="ghost" iconLeft={<Pencil size={14} />} aria-label={`Editar ${l.id}`} />
                    <Button size="sm" variant="ghost" iconLeft={<Trash2 size={14} />} aria-label={`Excluir ${l.id}`} onClick={() => pedirExclusao(l)} />
                  </>
                )}
                empty={
                  <EmptyState
                    icon={<Building2 size={20} />}
                    title="Nenhuma unidade cadastrada"
                    description="Cadastre a primeira unidade ou importe a planilha do bloco."
                    action={<Button variant="primary" iconLeft={<Plus size={16} />}>Nova unidade</Button>}
                  />
                }
              />
            </div>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginTop: 10 }}>
              Note a linha B5-1102: morador vazio e taxa nula viram <code>-</code>, nunca célula em branco.
            </p>
          </Secao>

          <Secao titulo="Estado vazio" nota="Vazio sempre diz o que fazer a seguir. Nunca só 'nenhum registro'.">
            <Card padding="none">
              <EmptyState
                icon={<Search size={20} />}
                title="Nenhum resultado para 'B7'"
                description="Não existe unidade com esse código. Confira o bloco ou limpe a busca."
                action={<Button>Limpar busca</Button>}
              />
            </Card>
          </Secao>

          <Secao titulo="Estado de erro" nota="Inline, em voz ativa, com o texto do usuário preservado. Nunca em alert().">
            <div style={{
              background: "var(--alert-50)", border: "1px solid var(--alert-200)",
              borderRadius: "var(--radius-lg)", padding: 16, maxWidth: 460,
            }}>
              <div style={{ display: "flex", gap: 10 }}>
                <AlertCircle size={18} style={{ color: "var(--fg-danger)", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontWeight: 600, color: "var(--alert-700)" }}>
                    Não foi possível salvar a unidade
                  </div>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--alert-700)", opacity: .85, margin: "4px 0 0" }}>
                    A planilha não respondeu. Sua edição continua aqui.
                  </p>
                  <div style={{ marginTop: 12 }}>
                    <Button size="sm" variant="secondary">Tentar de novo</Button>
                  </div>
                </div>
              </div>
            </div>
          </Secao>

          <Secao titulo="Esqueleto de carregamento" nota="Imita a forma do conteúdo final. Nunca spinner centralizado.">
            <Card>
              <Skeleton w={140} h={16} />
              <div style={{ height: 10 }} />
              <Skeleton count={3} />
            </Card>
          </Secao>

        </div>
      )}

      {/* ===================== TOKENS ===================== */}
      {aba === "tokens" && (
        <div style={{ display: "grid", gap: 24 }}>

          <Secao titulo="Escala tipográfica" nota="Oito degraus, substituindo os tamanhos avulsos de antes.">
            <div style={{ display: "grid", gap: 10 }}>
              {[
                ["3xl", 31, "Entrar no ViT", "var(--font-display)", 800],
                ["2xl", 25, "Título de página", "var(--font-display)", 700],
                ["xl", 20, "Título de seção", "var(--font-display)", 700],
                ["lg", 16, "Subtítulo de bloco", "var(--font-ui)", 600],
                ["md", 14, "Corpo padrão da interface", "var(--font-ui)", 400],
                ["base", 13, "Linha de tabela e formulário denso", "var(--font-ui)", 400],
                ["sm", 12, "Meta, legenda, texto auxiliar", "var(--font-ui)", 400],
              ].map(([nome, px, texto, fonte, peso]) => (
                <div key={nome} style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)", width: 74, flexShrink: 0 }}>
                    {nome} {px}px
                  </code>
                  <span style={{ fontFamily: fonte, fontSize: px, fontWeight: peso, letterSpacing: px >= 20 ? "var(--track-tighter)" : 0 }}>
                    {texto}
                  </span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)", width: 74, flexShrink: 0 }}>
                  xs 11px
                </code>
                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "var(--track-label)", fontWeight: 600, color: "var(--fg-muted)" }}>
                  Rótulo maiúsculo de coluna
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 6 }}>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)", width: 74, flexShrink: 0 }}>
                  mono
                </code>
                <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: 14 }}>
                  R$ 1.117,00 · R$ 742,10 · B5-304 · 22:14
                </span>
              </div>
            </div>
          </Secao>

          <Secao titulo="Cor" nota="Um acento na página inteira. Verde para tudo, terracota só para negativo.">
            <Rampa titulo="Marca" itens={Object.entries(MARCA).filter(([k]) => k.startsWith("brand"))} />
            <div style={{ height: 14 }} />
            <Rampa titulo="Alerta" itens={Object.entries(MARCA).filter(([k]) => k.startsWith("alert"))} />
            <div style={{ height: 14 }} />
            <Rampa titulo={theme.isDark ? "Neutros (escuro, ativo)" : "Neutros (claro, ativo)"} itens={Object.entries(theme.isDark ? ESCURO : CLARO)} />
          </Secao>

          <Secao titulo="Raio e sombra" nota="Quatro raios por função, no lugar dos 15 anteriores. Sombra tingida de verde, nunca preto puro.">
            <Linha>
              {[["sm", 4, "badge"], ["md", 8, "botão"], ["lg", 12, "card"], ["xl", 16, "modal"]].map(([n, px, uso]) => (
                <div key={n} style={{ textAlign: "center" }}>
                  <div style={{
                    width: 62, height: 44, background: "var(--brand-100)",
                    border: "1px solid var(--brand-500)", borderRadius: px,
                  }} />
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-muted)" }}>
                    {n} {px}px
                  </code>
                  <div style={{ fontSize: 10, color: "var(--fg-muted)" }}>{uso}</div>
                </div>
              ))}
            </Linha>
            <div style={{ height: 16 }} />
            <Linha>
              {[["sm", "repouso"], ["md", "dropdown"], ["lg", "modal"]].map(([n, uso]) => (
                <div key={n} style={{
                  background: "var(--bg-surface)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)", padding: "12px 16px",
                  boxShadow: `var(--shadow-${n})`, fontSize: "var(--text-sm)",
                }}>
                  <b>shadow-{n}</b><br />
                  <span style={{ color: "var(--fg-muted)" }}>{uso}</span>
                </div>
              ))}
            </Linha>
          </Secao>

        </div>
      )}

      <Ocupado open={ocupado} mensagem="Salvando a reserva..." />

      <Modal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        title="Editar unidade B5-304"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => { setModalAberto(false); toast.success("Unidade B5-304 salva"); }}
            >
              Salvar
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 16 }}>
          <Field label="Morador" required>
            <Input defaultValue="Renata Vasconcelos" />
          </Field>
          <Field label="Situação">
            <Select defaultValue="dia">
              <option value="dia">Em dia</option>
              <option value="inad">Inadimplente</option>
            </Select>
          </Field>
          <Field label="Observação" help="Visível só para a administração">
            <Textarea />
          </Field>
          <Checkbox label="Notificar o morador por WhatsApp" />
        </div>
      </Modal>
    </div>
  );
}

/* ===================== AUXILIARES DA VITRINE ===================== */

function Secao({ titulo, nota, children }) {
  return (
    <section>
      <h2 style={{
        fontFamily: "var(--font-display)", fontSize: "var(--text-xl)",
        fontWeight: 700, letterSpacing: "var(--track-tight)",
        color: "var(--fg-heading)", margin: "0 0 4px",
      }}>
        {titulo}
      </h2>
      {nota && (
        <p style={{
          fontSize: "var(--text-sm)", color: "var(--fg-muted)",
          margin: "0 0 14px", maxWidth: "72ch",
        }}>
          {nota}
        </p>
      )}
      {children}
    </section>
  );
}

function Linha({ children }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Coluna({ rotulo, children }) {
  return (
    <div>
      <div style={{
        fontSize: "var(--text-xs)", textTransform: "uppercase",
        letterSpacing: "var(--track-label)", fontWeight: 600,
        color: "var(--fg-muted)", marginBottom: 10,
      }}>
        {rotulo}
      </div>
      {children}
    </div>
  );
}

function Rampa({ titulo, itens }) {
  return (
    <div>
      <div style={{
        fontSize: "var(--text-xs)", textTransform: "uppercase",
        letterSpacing: "var(--track-label)", fontWeight: 600,
        color: "var(--fg-muted)", marginBottom: 8,
      }}>
        {titulo}
      </div>
      <div style={{
        display: "flex", borderRadius: "var(--radius-md)",
        overflow: "hidden", border: "1px solid var(--border)", flexWrap: "wrap",
      }}>
        {itens.map(([nome, hex]) => (
          <div key={nome} style={{ flex: "1 1 88px", minWidth: 88 }}>
            <div style={{ background: hex, height: 46 }} />
            <div style={{ padding: "5px 6px", background: "var(--bg-surface)" }}>
              <code style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--fg-secondary)" }}>
                {nome}
              </code>
              <code style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--fg-muted)" }}>
                {hex}
              </code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
