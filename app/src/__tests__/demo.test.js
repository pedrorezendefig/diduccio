// O modo demo é o que roda nas apresentações e no repositório público. Se ele
// quebrar, a demo abre vazia — então vale o mesmo cuidado do resto do sistema.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { atender } from "../demo/servidor";
import { TABELAS, SENHA_DEMO } from "../demo/dados";

const get = (query) =>
  atender({ url: `https://demo.vit.local/exec?${query}`, metodo: "GET" });

const post = (corpo) =>
  atender({ url: "https://demo.vit.local/exec", metodo: "POST", corpo: JSON.stringify(corpo) });

describe("modo demo: leitura das abas", () => {
  it("devolve as unidades com o formato que as telas esperam", async () => {
    const linhas = await get("token=demo&sheet=UNIDADES");
    expect(Array.isArray(linhas)).toBe(true);
    expect(linhas.length).toBeGreaterThan(20);
    expect(linhas[0]).toMatchObject({
      id: expect.any(String),
      bloco: expect.any(String),
      unidade: expect.any(String),
    });
  });

  it("todo morador aponta para uma unidade existente", async () => {
    const [unidades, moradores] = await Promise.all([
      get("sheet=UNIDADES"),
      get("sheet=MORADORES"),
    ]);
    const ids = new Set(unidades.map((u) => u.id));
    const orfaos = moradores.filter((m) => !ids.has(m.id_unidade));
    expect(orfaos).toEqual([]);
  });

  it("não vaza senha na listagem de usuários, como o backend real", async () => {
    const usuarios = await get("sheet=usuarios");
    expect(usuarios.length).toBeGreaterThan(0);
    for (const u of usuarios) {
      expect(u).not.toHaveProperty("senha");
      expect(u).not.toHaveProperty("password");
    }
  });

  it("aba desconhecida devolve lista vazia em vez de estourar", async () => {
    expect(await get("sheet=NAO_EXISTE")).toEqual([]);
  });

  it("cobre todas as abas que as páginas consultam", async () => {
    // Levantadas do código: qualquer `sheet=` ou `sheet:` usado nas telas.
    const usadas = [
      "UNIDADES", "MORADORES", "VAGAS", "TAGS", "usuarios", "AGENDAMENTOS",
      "ASSEMBLEIAS", "FESTAS", "CHURRASQUEIRA", "MUDANCAS", "PISCINA",
      "COMPRAS", "COMPRAS_PRODUTOS", "ENTREGAS", "ENTREGADORES", "CONFIRMACAO",
      "UPLOADS_FESTAS", "UPLOADS_CHURRASQUEIRA", "UPLOADS_PISCINA",
      "UPLOADS_COMPRAS", "ENTREGAS_FOTO", "ENTREGAS_NF", "ENTREGAS_RECEBIMENTO",
      "TAREFAS",
    ];
    const faltando = usadas.filter((aba) => !(aba in TABELAS));
    expect(faltando).toEqual([]);
  });

  it("não tem a perfis_publicos, que o 0016 derrubou no banco", () => {
    // Com ela aqui, a tela que a lesse funcionaria na demo e nos testes e
    // quebraria só em produção — foi exatamente o que aconteceu com Tarefas.
    expect(Object.keys(TABELAS).map((k) => k.toLowerCase())).not.toContain("perfis_publicos");
  });
});

describe("modo demo: login", () => {
  it("recusa a senha errada e explica qual é a da demo", async () => {
    const res = await post({ action: "login", email: "sindico@exemplo.com.br", senha: "errada" });
    expect(res.success).toBe(false);
    expect(res.message).toContain(SENHA_DEMO);
  });

  it("aceita a senha da demo e devolve sessão", async () => {
    const res = await post({ action: "login", email: "sindico@exemplo.com.br", senha: SENHA_DEMO });
    expect(res.success).toBe(true);
    expect(res.data.cargo).toBe("Sindico");
    expect(res.session).toBeTruthy();
  });

  it("recusa e-mail inexistente", async () => {
    const res = await post({ action: "login", email: "ninguem@exemplo.com.br", senha: SENHA_DEMO });
    expect(res.success).toBe(false);
  });
});

describe("modo demo: escrita em memória", () => {
  it("cria, edita e apaga um morador", async () => {
    const criado = await post({
      action: "add", sheet: "MORADORES",
      nome: "Fulano de Teste", id_unidade: "101", cpf: "", status: "Ativo",
    });
    expect(criado.success).toBe(true);
    const id = criado.data.id;

    const lista = await get("sheet=MORADORES");
    expect(lista.some((m) => m.id === id)).toBe(true);

    const editado = await post({ action: "edit", sheet: "MORADORES", id, nome: "Fulano Editado" });
    expect(editado.data.nome).toBe("Fulano Editado");

    expect((await post({ action: "delete", sheet: "MORADORES", id })).success).toBe(true);
    expect((await get("sheet=MORADORES")).some((m) => m.id === id)).toBe(false);
  });

  it("delete sem `sheet` cai em UNIDADES, como no backend real", async () => {
    const antes = await get("sheet=UNIDADES");
    const alvo = antes[antes.length - 1].id;
    expect((await post({ action: "delete", id: alvo })).success).toBe(true);
    expect((await get("sheet=UNIDADES")).some((u) => u.id === alvo)).toBe(false);
  });

  it("editar registro inexistente falha em vez de criar do nada", async () => {
    const res = await post({ action: "edit", sheet: "MORADORES", id: "999999", nome: "X" });
    expect(res.success).toBe(false);
  });
});

describe("modo demo: portaria e atas", () => {
  it("registra chegada, lista e dá saída", async () => {
    const reg = await post({
      action: "registrarEntrega",
      cpf: "12345678909", nome: "Entregador Teste", veiculo: "Moto",
      placa: "ABC1D23", bloco: "1", apartamento: "101",
      liberado_por: "Morador", registrado_por: "Portaria",
    });
    expect(reg.success).toBe(true);

    const lista = await post({ action: "listarChegadas" });
    expect(lista.chegadas.some((c) => c.id === reg.data.id)).toBe(true);

    const saida = await post({ action: "registrarSaida", id: reg.data.id });
    expect(saida.data.saida).toBeTruthy();
  });

  it("gera comunicado no formato [TITULO]/[CORPO] que a tela sabe fatiar", async () => {
    const res = await post({ action: "gerarIA", prompt: "manutenção do elevador", tom: "formal" });
    expect(res.success).toBe(true);
    expect(res.texto).toContain("[TITULO]");
    expect(res.texto).toContain("[CORPO]");
  });

  it("resumo de ata devolve decisões e assinantes", async () => {
    const res = await post({ action: "resumirAtaTexto", texto: "..." });
    expect(res.success).toBe(true);
    expect(Array.isArray(res.decisoes)).toBe(true);
    expect(res.decisoes.length).toBeGreaterThan(0);
  });

  it("ação desconhecida falha com mensagem, sem derrubar a tela", async () => {
    const res = await post({ action: "acaoQueNaoExiste" });
    expect(res.success).toBe(false);
    expect(res.message).toBeTruthy();
  });
});

// A parte mais frágil do arranjo: as páginas continuam chamando `fetch` normal,
// e é o interceptador que precisa desviar só o que vai para o backend.
describe("modo demo: interceptação do fetch", () => {
  const fetchReal = globalThis.fetch;

  beforeEach(() => vi.resetModules());
  afterEach(() => {
    globalThis.fetch = fetchReal;
    window.fetch = fetchReal;
    vi.unstubAllEnvs();
  });

  async function montarEmDemo() {
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("VITE_DEMO", "true");
    const config = await import("../api/config");
    const { instalarModoDemo } = await import("../demo/index");
    instalarModoDemo();
    return config;
  }

  it("sem Supabase configurado o app entra em modo demo sozinho", async () => {
    // Clone recém-baixado, sem .env.local: sobe em demo em vez de estourar na
    // importação de supabase.js, que é o que o repositório público precisa.
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_DEMO", "");
    const { MODO_DEMO } = await import("../api/config");
    expect(MODO_DEMO).toBe(true);
  });

  it("com Supabase configurado o modo demo fica desligado", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("VITE_DEMO", "");
    const { MODO_DEMO } = await import("../api/config");
    expect(MODO_DEMO).toBe(false);
  });

  /**
   * O caso que derrubou a produção em 17/08/2026: a Vercel não tinha
   * `VITE_API_URL` — variável do Apps Script, que já tinha saído do sistema —
   * e o app subiu com dados FICTÍCIOS para o condomínio inteiro. O Supabase
   * estava configurado e funcionando o tempo todo.
   */
  it("faltar VITE_API_URL NÃO liga o modo demo quando há Supabase", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("VITE_DEMO", "");
    const { MODO_DEMO } = await import("../api/config");
    expect(MODO_DEMO).toBe(false);
  });

  it("VITE_DEMO=true continua mandando, mesmo com Supabase configurado", async () => {
    // É como as apresentações rodam (`npm run dev:demo` / `.env.demo`).
    vi.stubEnv("VITE_SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("VITE_DEMO", "true");
    const { MODO_DEMO } = await import("../api/config");
    expect(MODO_DEMO).toBe(true);
  });

  it("um GET às unidades é respondido sem sair da máquina", async () => {
    const { URL_DEMO } = await montarEmDemo();
    const r = await fetch(`${URL_DEMO}?sheet=UNIDADES`);
    const linhas = await r.json();
    expect(r.ok).toBe(true);
    expect(Array.isArray(linhas)).toBe(true);
    expect(linhas.length).toBeGreaterThan(0);
  });

  it("um POST de login passa pelo interceptador", async () => {
    const { URL_DEMO } = await montarEmDemo();
    const r = await fetch(URL_DEMO, {
      method: "POST",
      body: JSON.stringify({ action: "login", email: "portaria@exemplo.com.br", senha: SENHA_DEMO }),
    });
    const res = await r.json();
    expect(res.success).toBe(true);
    expect(res.data.cargo).toBe("Porteiro");
  });

  it("não intercepta requisições que não são do backend", async () => {
    await montarEmDemo();
    const espiao = vi.fn().mockResolvedValue(new Response("{}"));
    const anterior = window.fetch;
    // Reinstala por cima de um fetch espião para observar o repasse.
    vi.resetModules();
    window.fetch = espiao;
    const { instalarModoDemo } = await import("../demo/index");
    instalarModoDemo();
    await window.fetch("https://outro-servidor.test/dados.json");
    expect(espiao).toHaveBeenCalledWith("https://outro-servidor.test/dados.json", expect.anything());
    window.fetch = anterior;
  });
});

describe("modo demo: a tabela TAREFAS imita o gatilho do 0042", () => {
  it("criar carimba created_at e deixa concluida_em vazio", async () => {
    const r = await post({ action: "add", sheet: "TAREFAS", titulo: "Teste", situacao: "A_FAZER" });
    expect(r.data.created_at).toBeTruthy();
    expect(r.data.concluida_em).toBeNull();
    expect(r.data.movida_em).toBeNull();
  });

  it("mover para CONCLUIDA carimba concluida_em e movida_em; sair dela limpa concluida_em", async () => {
    const { data } = await post({ action: "add", sheet: "TAREFAS", titulo: "Teste", situacao: "A_FAZER" });
    const feita = await post({ action: "edit", sheet: "TAREFAS", id: data.id, situacao: "CONCLUIDA" });
    expect(feita.data.concluida_em).toBeTruthy();
    expect(feita.data.movida_em).toBeTruthy();
    // A demo não sabe quem mexeu: melhor vazio do que um nome velho.
    expect(feita.data.movida_por).toBeNull();
    const reaberta = await post({ action: "edit", sheet: "TAREFAS", id: data.id, situacao: "EM_ANDAMENTO" });
    expect(reaberta.data.concluida_em).toBeNull();
  });

  it("editar sem mudar a situação não mexe nos carimbos", async () => {
    const { data } = await post({ action: "add", sheet: "TAREFAS", titulo: "Teste", situacao: "A_FAZER" });
    const r = await post({ action: "edit", sheet: "TAREFAS", id: data.id, titulo: "Outro" });
    expect(r.data.movida_em).toBeNull();
  });
});
