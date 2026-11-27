import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/config", () => ({ MODO_DEMO: false, API_URL: "x", TOKEN: "t" }));

const mockSignOut = vi.fn();
const mockRpc = vi.fn();
const mockGetSession = vi.fn();
const mockSetSession = vi.fn();
vi.mock("../api/supabase", () => ({
  supabase: {
    auth: {
      signOut: (...a) => mockSignOut(...a),
      getSession: (...a) => mockGetSession(...a),
      setSession: (...a) => mockSetSession(...a),
    },
    rpc: (...a) => mockRpc(...a),
  },
}));

// O login inteiro virou uma chamada à Edge Function `entrar`: o navegador não
// resolve mais o CPF nem chama `signInWithPassword`. Por isso `signInWithPassword`
// sumiu dos mocks — se algum caminho voltar a usá-lo, o teste quebra com
// "não é função", que é o aviso que se quer.
const mockEdge = vi.fn();
vi.mock("../api/edge", () => ({
  chamarEdgeFunction: (...a) => mockEdge(...a),
  mensagemDaEdgeFunction: (r, padrao) => r?.corpo?.message || padrao,
}));

const { entrar, precisaTrocarSenha } = await import("../api/auth");

/** Resposta de um login que deu certo. */
function loginOk({ cargo = "Sindico", nome = "Ana Prado", email = "ana@x.com", deveTrocar = false } = {}) {
  mockEdge.mockResolvedValue({
    status: 200, ok: true,
    corpo: {
      success: true,
      access_token: "tok-acesso", refresh_token: "tok-renovacao",
      usuario: { id: 3, email, cargo, nome },
      deveTrocarSenha: deveTrocar,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mockSetSession.mockResolvedValue({ data: {}, error: null });
});

describe("entrar", () => {
  it("devolve o usuário e instala a sessão devolvida pelo servidor", async () => {
    loginOk({ cargo: "Sindico" });

    const r = await entrar("ana@x.com", "senha");

    expect(r.success).toBe(true);
    expect(r.usuario.cargo).toBe("Sindico");
    expect(r.deveTrocarSenha).toBe(false);
    // Os dois tokens precisam ser instalados: sem isso o supabase-js não sabe
    // que há sessão, e a próxima consulta sai como anônima.
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: "tok-acesso", refresh_token: "tok-renovacao",
    });
  });

  it("manda identificador e senha para a função, SEM exigir sessão", async () => {
    loginOk();

    await entrar("111.222.333-44", "senha");

    // `exigeSessao: false` é o detalhe que faz o login funcionar: quem está
    // entrando ainda não tem token, e o helper recusaria a chamada sem isso.
    expect(mockEdge).toHaveBeenCalledWith(
      "entrar",
      { identificador: "111.222.333-44", senha: "senha" },
      { exigeSessao: false },
    );
  });

  it("o navegador não resolve mais o CPF nem consulta o banco", async () => {
    loginOk();

    await entrar("111.222.333-44", "senha");

    // `email_de_login` respondia ao anônimo: com a chave publicável dava para
    // perguntar "existe conta com este CPF?" e receber o e-mail. A conversão
    // passou para dentro da Edge Function, e a função foi fechada no 0023.
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("pede troca quando a senha ainda é a provisória", async () => {
    loginOk({ deveTrocar: true });
    expect((await entrar("jo@x.com", "provisoria")).deveTrocarSenha).toBe(true);
  });

  it("falha com a mensagem que o servidor mandou", async () => {
    mockEdge.mockResolvedValue({
      status: 401, ok: false, corpo: { success: false, message: "Usuário ou senha incorretos." },
    });

    const r = await entrar("ana@x.com", "errada");

    expect(r.success).toBe(false);
    expect(r.message).toBe("Usuário ou senha incorretos.");
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("repassa o aviso de excesso de tentativas com o tempo de espera", async () => {
    // Esta frase precisa chegar inteira à tela: sem o tempo, a pessoa fica
    // tentando de novo e só estende o próprio bloqueio.
    mockEdge.mockResolvedValue({
      status: 429, ok: false,
      corpo: { success: false, message: "Muitas tentativas. Espere 12 minutos e tente de novo." },
    });

    const r = await entrar("ana@x.com", "errada");

    expect(r.success).toBe(false);
    expect(r.message).toMatch(/12 minutos/);
  });

  it("queda de rede não vira sessão", async () => {
    mockEdge.mockResolvedValue({ falhaConexao: true });

    const r = await entrar("ana@x.com", "senha");

    expect(r.success).toBe(false);
    expect(r.message).toMatch(/conexão/i);
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("falha ao instalar a sessão não devolve sucesso", async () => {
    // Sucesso com sessão não instalada seria o pior caso: o app entra, e toda
    // consulta seguinte sai como anônima, voltando vazia sem erro nenhum.
    loginOk();
    mockSetSession.mockResolvedValue({ data: null, error: { message: "token inválido" } });

    const r = await entrar("ana@x.com", "senha");
    expect(r.success).toBe(false);
  });
});

describe("nome de quem entrou", () => {
  it("vem do servidor, junto com a sessão", async () => {
    // Sem o nome o Dashboard não carrega: ele só busca dados quando há nome.
    // Antes eram duas idas ao banco depois do login (`senha_ja_trocada` e
    // `meu_perfil`); agora vem tudo na mesma resposta.
    loginOk({ nome: "Ana Prado" });
    expect((await entrar("ana@x.com", "senha")).usuario.nome).toBe("Ana Prado");
  });
});

/**
 * A exigência de trocar a senha precisa valer a cada carregamento de página, e
 * não só no instante do login.
 *
 * Foi assim que uma senha resetada continuou valendo na prática: a sessão
 * estava no sessionStorage, o app restaurou o usuário sem passar pelo
 * formulário, e a pergunta ao banco nunca aconteceu.
 */
describe("precisaTrocarSenha", () => {
  it("exige a troca quando a marca no banco é falsa", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
    mockRpc.mockResolvedValue({ data: false, error: null });
    expect(await precisaTrocarSenha()).toBe(true);
  });

  it("libera quando a senha já foi trocada", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
    mockRpc.mockResolvedValue({ data: true, error: null });
    expect(await precisaTrocarSenha()).toBe(false);
  });

  it("erro do banco exige a troca — fechado, não aberto", async () => {
    // Uma falha de rede não pode virar passe livre para uma senha que passou
    // por um arquivo em texto puro no disco.
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
    mockRpc.mockResolvedValue({ data: null, error: { message: "falhou" } });
    expect(await precisaTrocarSenha()).toBe(true);
  });

  it("sem sessão não exige nada, e nem pergunta ao banco", async () => {
    // `senha_ja_trocada()` tira o id do JWT: sem sessão não teria de quem falar.
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await precisaTrocarSenha()).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
