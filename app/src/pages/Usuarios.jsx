import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Edit2, Trash2, KeyRound, LogOut, Eye, EyeOff, Copy, Check, UsersRound,
} from "lucide-react";
import { clearSessionToken } from "../auth/session";
import { listar } from "../api/db";
import { supabase } from "../api/supabase";
import { chamarEdgeFunction } from "../api/edge";
import { problemaDaSenha } from "../lib/senha";
import {
  Button, Badge, Table, Modal, Field, Input, Select,
  PageHeader, EmptyState, useToast, useConfirm,
} from "../ui";

// Mesmas cinco strings que a Edge Function `criar-usuario` aceita. Qualquer
// outro valor ela recusa com 400 — o select só existe para nem deixar
// escolher errado.
const CARGOS = ["Desenvolvedor", "Sindico", "Conselheiro", "Auxiliar Administrativo", "Porteiro"];
const FORM_VAZIO = { id: "", nome: "", email: "", cpf: "", cargo: "Porteiro", senha: "" };

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

// Mesma máscara de Moradores.jsx e da antiga CadastroUsuario.jsx, duplicada
// aqui de propósito: não vale extrair um módulo compartilhado para quatro
// linhas de regex.
const mascaraCPF = (v) =>
  soDigitos(v)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

export default function Usuarios({ user, onLogout }) {
  const toast = useToast();
  const confirm = useConfirm();

  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [modo, setModo] = useState("add");
  const [form, setForm] = useState(FORM_VAZIO);
  const [erroForm, setErroForm] = useState({});
  const [senhaVisivel, setSenhaVisivel] = useState(false);

  // Senha temporária: exibição única, então vive em modal próprio. Serve
  // tanto para a senha gerada no cadastro quanto para o reset avulso.
  const [senhaTemp, setSenhaTemp] = useState(null);
  const [copiado, setCopiado] = useState(false);

  // Leitura via Supabase: a tabela `usuarios` só é legível por síndico e
  // desenvolvedor por RLS (policy usuarios_ler), e esta tela já é restrita
  // ao Desenvolvedor no Sidebar. `listar` lança em erro; o catch abaixo cobre.
  const buscarUsuarios = useCallback(async () => {
    try {
      setCarregando(true);
      const dados = await listar("usuarios");
      setUsuarios(dados);
    } catch {
      toast.error("Não foi possível carregar os usuários.");
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    buscarUsuarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------
  // Toda escrita que mexe em conta de autenticação (e-mail, senha, cargo,
  // exclusão) precisa da secret key do Supabase, que nunca pode chegar ao
  // navegador — por isso passa por Edge Function, nunca por `supabase.from`
  // direto daqui. `criar-usuario` cobre o cadastro; `gerir-usuario` cobre
  // editar, resetar senha e excluir. As duas são chamadas do mesmo jeito:
  // POST autenticado pelo token da sessão atual, então o fetch fica num
  // helper só.
  // ---------------------------------------------------------------------
  // Traduz o que a Edge Function `criar-usuario` devolve para algo que um
  // humano entende. O código HTTP nunca aparece na tela.
  const mensagemDeErroCadastro = (status, corpo) => {
    if (status === 403) return "Só síndico ou desenvolvedor podem cadastrar usuários.";
    if (status === 401) return "Sua sessão expirou. Saia e entre de novo para cadastrar.";
    if (corpo?.message) return corpo.message;
    return "Não foi possível cadastrar. Tente novamente.";
  };

  // Cadastro de usuário: chama a Edge Function `criar-usuario` (roda no
  // servidor, com a secret key). Devolve o corpo da resposta em caso de
  // sucesso, ou null quando falhou — o toast de erro já foi disparado aqui.
  const cadastrarViaSupabase = async ({ nome, email, cpf, cargo, senha }) => {
    setSalvando(true);
    try {
      // `senha` só vai no corpo quando preenchida: mandar string vazia faria
      // a função tentar validar o mínimo de caracteres em "". Omitir a chave
      // é o sinal para ela mesma gerar a senha.
      const r = await chamarEdgeFunction("criar-usuario", {
        nome, email, cpf, cargo, senha: senha || undefined,
      });
      if (r.falhaSessao) {
        toast.error("Sua sessão expirou. Saia e entre de novo para cadastrar.");
        return null;
      }
      if (r.falhaConexao) {
        toast.error("Falha de conexão. Confira a internet e tente de novo.");
        return null;
      }
      if (!r.ok) {
        toast.error(mensagemDeErroCadastro(r.status, r.corpo));
        return null;
      }
      return r.corpo;
    } finally {
      setSalvando(false);
    }
  };

  // Traduz o que a Edge Function `gerir-usuario` devolve (editar, resetar
  // senha, excluir) para português. O código HTTP nunca aparece na tela.
  const mensagemDeErroGerir = (status, corpo) => {
    if (status === 403) return "Só síndico ou desenvolvedor podem gerenciar usuários.";
    if (status === 401) return "Sua sessão expirou. Saia e entre de novo.";
    if (corpo?.message) return corpo.message;
    return "Não foi possível concluir a operação. Tente novamente.";
  };

  // Editar, resetar senha e excluir: as três ações da Edge Function
  // `gerir-usuario`, identificadas pelo campo `acao` do corpo. Devolve o
  // corpo da resposta em sucesso, ou null quando falhou — o toast já foi
  // disparado aqui, então quem chama só precisa checar o retorno.
  const gerirUsuario = async (acao, dados) => {
    setSalvando(true);
    try {
      const r = await chamarEdgeFunction("gerir-usuario", { acao, ...dados });
      if (r.falhaSessao) {
        toast.error("Sua sessão expirou. Saia e entre de novo.");
        return null;
      }
      if (r.falhaConexao) {
        toast.error("Falha de conexão. Confira a internet e tente de novo.");
        return null;
      }
      if (!r.ok) {
        toast.error(mensagemDeErroGerir(r.status, r.corpo));
        return null;
      }
      return r.corpo;
    } finally {
      setSalvando(false);
    }
  };

  // Gera a senha temporária no cliente: a Edge Function `gerir-usuario` só
  // TROCA a senha que recebe, não gera uma sozinha (diferente de
  // `criar-usuario`, que gera quando ninguém informa). Mesmo formato: bytes
  // aleatórios em base64, sem os caracteres que atrapalham num texto solto.
  const senhaTemporariaAleatoria = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 16);
  };

  /* ---------------- formulário ---------------- */

  const abrirNovo = () => {
    setModo("add");
    setForm(FORM_VAZIO);
    setErroForm({});
    setSenhaVisivel(false);
    setModalAberto(true);
  };

  const abrirEdicao = (u) => {
    setModo("edit");
    setForm({
      id: u.id,
      nome: u.nome || "",
      email: u.email || "",
      cpf: "",
      cargo: u.cargo || "Porteiro",
      senha: "",
    });
    setErroForm({});
    setSenhaVisivel(false);
    setModalAberto(true);
  };

  const validar = () => {
    const e = {};
    if (!form.nome.trim()) e.nome = "Informe o nome.";
    if (!form.cargo) e.cargo = "Escolha o cargo.";

    if (modo === "add") {
      if (!form.email.trim()) {
        e.email = "Informe o email.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        e.email = "Email inválido.";
      } else if (usuarios.some((u) => u.email?.toLowerCase() === form.email.trim().toLowerCase())) {
        e.email = "Já existe um usuário com esse email.";
      }

      const cpfDigitos = soDigitos(form.cpf);
      if (cpfDigitos.length > 0 && cpfDigitos.length !== 11) {
        e.cpf = "O CPF precisa ter 11 dígitos, ou deixe em branco.";
      }

      // Senha inicial é opcional: em branco, a Edge Function gera uma e
      // devolve em `senhaProvisoria`. Preenchida, precisa do mesmo mínimo
      // que o servidor valida.
      // A regra INTEIRA, e não só o tamanho: o servidor exige maiúscula,
      // minúscula e número. Uma senha inicial que passe aqui e seja recusada lá
      // volta como erro em inglês no meio do cadastro.
      const problema = problemaDaSenha(form.senha);
      if (problema) e.senha = `${problema} Ou deixe em branco para gerar uma senha.`;
    } else if (form.senha.trim()) {
      // Preenchido na edição, este campo chama a ação "resetar-senha" da Edge
      // Function `gerir-usuario` — mesma política de senha do servidor.
      const problema = problemaDaSenha(form.senha.trim());
      if (problema) e.senha = problema;
    }

    setErroForm(e);
    return Object.keys(e).length === 0;
  };

  const salvar = async () => {
    if (!validar()) return;

    if (modo === "add") {
      const nomeCriado = form.nome.trim();
      const corpo = await cadastrarViaSupabase({
        nome: nomeCriado,
        email: form.email.trim(),
        cpf: soDigitos(form.cpf),
        cargo: form.cargo,
        senha: form.senha.trim(),
      });
      if (!corpo) return;

      setModalAberto(false);
      await buscarUsuarios();

      if (corpo.senhaProvisoria) {
        // Só existe agora: é a única vez que a Edge Function devolve essa
        // senha. Se sumir sem ser lida, não tem como recuperar depois.
        setCopiado(false);
        setSenhaTemp({ nome: nomeCriado, senha: corpo.senhaProvisoria });
      } else {
        toast.success(`${nomeCriado} cadastrado como ${form.cargo}`);
      }
      return;
    }

    // ---- edição: Edge Function `gerir-usuario` ----
    // `cpf` vai vazio de propósito: o campo não aparece no formulário de
    // edição (só no de cadastro), e a Edge Function trata string vazia como
    // "não mudou o CPF", preservando o que já está gravado.
    const editado = await gerirUsuario("editar", {
      id: form.id,
      nome: form.nome.trim(),
      cargo: form.cargo,
      email: form.email.trim(),
      cpf: soDigitos(form.cpf),
    });
    if (!editado) return;

    if (form.senha.trim()) {
      const senhaOk = await gerirUsuario("resetar-senha", {
        id: form.id,
        senha: form.senha.trim(),
      });
      if (!senhaOk) return;
    }

    setModalAberto(false);
    await buscarUsuarios();
    toast.success(
      form.senha.trim() ? `${form.nome} atualizado e senha alterada` : `${form.nome} atualizado`
    );
  };

  /* ---------------- senha temporária (reset avulso) ---------------- */

  const gerarSenhaTemporaria = async (u) => {
    const ok = await confirm({
      title: `Gerar nova senha para ${u.nome}?`,
      description: "A senha atual deixa de funcionar imediatamente. A nova aparece uma única vez.",
      confirmLabel: "Gerar senha",
    });
    if (!ok) return;

    const senha = senhaTemporariaAleatoria();
    const res = await gerirUsuario("resetar-senha", { id: u.id, senha });
    if (!res) return;

    setCopiado(false);
    setSenhaTemp({ nome: u.nome, senha });
  };

  const copiarSenha = async () => {
    try {
      await navigator.clipboard.writeText(senhaTemp.senha);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Anote a senha manualmente.");
    }
  };

  /* ---------------- exclusão ---------------- */

  const excluir = async (u) => {
    // Guarda contra travar o próprio acesso: sem Desenvolvedor não há como
    // recriar usuário pela interface.
    const ehVoce =
      (u.id && user?.id && u.id === user.id) ||
      (u.email && user?.email && u.email.toLowerCase() === user.email.toLowerCase());

    if (ehVoce) {
      toast.error("Você não pode excluir a própria conta enquanto está usando o sistema.");
      return;
    }

    const ok = await confirm({
      title: `Excluir o usuário ${u.nome}?`,
      description: `${u.email} perde o acesso ao sistema imediatamente. Não dá para desfazer.`,
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;

    const feito = await gerirUsuario("excluir", { id: u.id });
    if (!feito) return;
    await buscarUsuarios();
    toast.success(`${u.nome} foi removido`);
  };

  /* ---------------- tabela ---------------- */

  const TOM_CARGO = {
    Desenvolvedor: "brand",
    Sindico: "positive",
    "Auxiliar Administrativo": "neutral",
    Conselheiro: "neutral",
    Porteiro: "neutral",
  };

  const colunas = [
    {
      key: "nome", label: "Nome", sortable: false,
      render: (u) => <span style={{ fontWeight: 600 }}>{u.nome}</span>,
    },
    { key: "email", label: "Email" },
    {
      key: "cargo", label: "Cargo",
      render: (u) => <Badge tone={TOM_CARGO[u.cargo] ?? "neutral"}>{u.cargo}</Badge>,
    },
  ];

  // Hook sempre chamado, nunca dentro de condicional.
  const resumoCargos = useMetaCargos(usuarios);
  const meta = carregando ? "Carregando usuários" : resumoCargos;

  return (
    <div>
      <PageHeader
        title="Usuários"
        meta={meta}
        actions={
          <>
            <Button
              variant="danger"
              onClick={() => { clearSessionToken(); onLogout?.(); }}
              iconLeft={<LogOut size={15} />}
            >
              Sair
            </Button>
            <Button variant="primary" onClick={abrirNovo} iconLeft={<Plus size={16} />}>
              Novo usuário
            </Button>
          </>
        }
      />

      <Table
        columns={colunas}
        rows={usuarios}
        loading={carregando}
        getRowKey={(u) => u.id ?? u.email}
        rowActions={(u) => (
          <>
            <Button size="sm" variant="ghost" aria-label={`Editar ${u.nome}`}
                    onClick={() => abrirEdicao(u)} iconLeft={<Edit2 size={14} />} />
            <Button size="sm" variant="ghost" aria-label={`Gerar senha temporária para ${u.nome}`}
                    onClick={() => gerarSenhaTemporaria(u)} iconLeft={<KeyRound size={14} />} />
            <Button size="sm" variant="ghost" aria-label={`Excluir ${u.nome}`}
                    onClick={() => excluir(u)} iconLeft={<Trash2 size={14} />} />
          </>
        )}
        empty={
          <EmptyState
            icon={<UsersRound size={20} />}
            title="Nenhum usuário cadastrado"
            description="Cadastre o primeiro acesso ao sistema."
            action={
              <Button variant="primary" onClick={abrirNovo} iconLeft={<Plus size={16} />}>
                Novo usuário
              </Button>
            }
          />
        }
      />

      {/* ---- Cadastro e edição ---- */}
      <Modal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        title={modo === "add" ? "Novo usuário" : `Editar ${form.nome}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button variant="primary" onClick={salvar} loading={salvando}>
              {modo === "add" ? "Cadastrar" : "Salvar"}
            </Button>
          </>
        }
      >
        <div className="cad-form">
          <Field label="Nome" required error={erroForm.nome} className="cad-form__largo">
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Field>

          <Field
            label="Email"
            required={modo === "add"}
            error={erroForm.email}
            className={modo === "edit" ? "cad-form__largo" : undefined}
            help={modo === "edit" ? "O email não pode ser alterado: é o identificador do acesso." : undefined}
          >
            <Input
              type="email"
              value={form.email}
              readOnly={modo === "edit"}
              disabled={modo === "edit"}
              placeholder="nome@exemplo.com"
              autoComplete="off"
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>

          {modo === "add" && (
            <Field label="CPF" error={erroForm.cpf} help="Opcional. Só números, com ou sem pontuação.">
              <Input
                value={form.cpf}
                inputMode="numeric"
                onChange={(e) => setForm({ ...form, cpf: mascaraCPF(e.target.value) })}
              />
            </Field>
          )}

          <Field label="Cargo" required error={erroForm.cargo} className="cad-form__largo">
            <Select value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })}>
              {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>

          <Field
            label={modo === "add" ? "Senha inicial" : "Nova senha"}
            error={erroForm.senha}
            className="cad-form__largo"
            help={
              modo === "add"
                ? "Opcional: deixe em branco para o sistema gerar uma senha temporária."
                : "Deixe em branco para manter a senha atual."
            }
          >
            <span className="cad-senha">
              <Input
                type={senhaVisivel ? "text" : "password"}
                value={form.senha}
                autoComplete="new-password"
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
              />
              <button
                type="button"
                className="cad-senha__olho"
                onClick={() => setSenhaVisivel((v) => !v)}
                aria-label={senhaVisivel ? "Ocultar senha" : "Mostrar senha"}
              >
                {senhaVisivel ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </Field>
        </div>
      </Modal>

      {/* ---- Senha temporária: exibição única ---- */}
      <Modal
        open={Boolean(senhaTemp)}
        onClose={() => setSenhaTemp(null)}
        title="Senha temporária gerada"
        size="sm"
        footer={
          <Button variant="primary" onClick={() => setSenhaTemp(null)}>
            Já anotei
          </Button>
        }
      >
        <p className="vit-modal__desc">
          Repasse esta senha para <strong>{senhaTemp?.nome}</strong> agora.
          Ela não será exibida de novo, e a senha anterior já não funciona.
        </p>

        <div className="cad-segredo">
          <code className="cad-segredo__valor">{senhaTemp?.senha}</code>
          <Button
            size="sm"
            onClick={copiarSenha}
            iconLeft={copiado ? <Check size={14} /> : <Copy size={14} />}
          >
            {copiado ? "Copiado" : "Copiar"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/** Resumo por cargo para a linha de contexto do cabeçalho. */
function useMetaCargos(usuarios) {
  return useMemo(() => {
    if (usuarios.length === 0) return "Nenhum usuário cadastrado";
    const porCargo = usuarios.reduce((acc, u) => {
      const c = u.cargo || "Sem cargo";
      acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {});
    const partes = Object.entries(porCargo)
      .sort((a, b) => b[1] - a[1])
      .map(([cargo, n]) => `${n} ${cargo.toLowerCase()}${n > 1 ? "s" : ""}`);
    return [`${usuarios.length} acessos`, ...partes].join(" · ");
  }, [usuarios]);
}
