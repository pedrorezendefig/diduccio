// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * O que a TELA da portaria promete, e que a lib pura não alcança.
 *
 * Quatro coisas aqui não são estética. O tipo escolhido antes de tudo, porque é
 * ele que decide o resto do formulário. O aviso do veículo, que é a diferença
 * entre conferir e supor. O cadastro que aprende o veículo desta entrada. E o
 * relógio, sem o qual a contagem congela e a coluna passa a mentir devagar.
 *
 * Nenhuma delas quebra a tela quando some — todas mudam o que a portaria
 * consegue afirmar depois.
 */

const TELA = "src/pages/Entregas.jsx";
const fonte = () => readFileSync(TELA, "utf8");

describe("o modelo do veículo", () => {
  it("é um campo opcional, aberto em todo tipo", () => {
    const src = fonte();
    expect(src).toMatch(/<Field label="Modelo do veículo" help="Opcional/);
    // Opcional de verdade: nem `required` no campo, nem regra na validação.
    expect(src).not.toMatch(/<Field label="Modelo do veículo"[^>]*required/);
    expect(readFileSync("src/lib/portaria.js", "utf8")).not.toMatch(/e\.modelo =/);
  });

  it("vai para a entrada e para o cadastro, e o cadastro o sugere na próxima", () => {
    const src = fonte();
    expect((src.match(/modelo: modelo\.trim\(\) \|\| null,/g) ?? []).length).toBe(2);
    expect(src).toContain('setModelo(registro.modelo || "");');
  });

  it("o banco tem a coluna e deixa o porteiro atualizá-la no cadastro", () => {
    // Coluna nova nasce travada no gatilho do 0035. Sem abri-la, o UPDATE do
    // veículo inteiro seria recusado assim que a tela mandasse o modelo.
    const sql = readFileSync("supabase/migrations/0063_modelo_do_veiculo.sql", "utf8");
    expect(sql).toMatch(/alter table public\.entregadores\s+add column if not exists modelo text/);
    expect(sql).toMatch(/alter table public\.entregadores_chegadas\s+add column if not exists modelo text/);
    expect(sql).toMatch(/- 'placa' - 'modelo' -/);
    expect(sql).toMatch(/revoke all on function public\.porteiro_so_atualiza_o_veiculo\(\) from public, anon, authenticated/);
  });
});

describe("o tipo decide o formulário", () => {
  it("os cinco tipos vêm da lib, e não de uma lista escrita na tela", () => {
    // Duas listas divergem, e a que diverge é a que grava um tipo que o `check`
    // do banco recusa.
    const src = fonte();
    expect(src).toContain('from "../lib/portaria"');
    expect(src).toMatch(/TIPOS\.map\(\(t\) =>/);
    expect(src, "tipo escrito à mão na tela").not.toMatch(/const TIPOS = \[/);
  });

  it("a empresa só aparece para quem precisa dela", () => {
    expect(fonte()).toMatch(/\{pedeEmpresa\(tipo\) && \(/);
  });

  it("o prazo só aparece para quem tem prazo", () => {
    // Pedir minutos a quem vai passar o fim de semana produz um número que
    // ninguém olha.
    expect(fonte()).toMatch(/\{temPrazo\(tipo\) && \(/);
  });

  it("trocar de tipo redefine o prazo", () => {
    // Sem isto, escolher Temporada depois de Entregador deixaria os 15 minutos
    // pendurados num tipo que não tem prazo.
    const src = fonte();
    expect(src).toContain("const escolherTipo = (novo) => {");
    expect(src).toMatch(/setMinutos\(minutosIniciais\(novo\)/);
  });

  it("a lista de veículos vem do tipo, e não é fixa na tela", () => {
    // Caminhão só existe em serviço. Uma lista escrita na tela divergiria da
    // lib no dia em que alguém acrescentasse um veículo num dos dois lugares.
    const src = fonte();
    expect(src).toMatch(/\{veiculosDoTipo\(tipo\)\.map\(\(v\) =>/);
    expect(src, "lista de veículo escrita à mão na tela").not.toMatch(/const VEICULOS = \[/);
  });

  it("trocar de tipo tira o veículo que não existe mais na lista", () => {
    // Saindo de serviço com caminhão escolhido, o <select> ficaria com um valor
    // fora da lista: a tela mostraria "Moto" e a gravação mandaria "Caminhão".
    // Nada quebra — só o registro mente.
    expect(fonte()).toMatch(
      /if \(!veiculosDoTipo\(novo\)\.includes\(veiculo\)\) setVeiculo\(veiculosDoTipo\(novo\)\[0\]\);/
    );
  });

  it('depois de "não, é outro" o campo de placa não diz "não se aplica"', () => {
    // O defeito relatado. Vazio caía no mesmo ramo de "veio a pé": a placa
    // desabilitava com o texto errado, e o porteiro ficava sem onde digitar
    // justamente depois de dizer que o veículo era outro.
    const src = fonte();
    expect(src).toMatch(/const faltaVeiculo = semVeiculo\(veiculo\);/);
    expect(src).toMatch(/faltaVeiculo \? "escolha o veículo primeiro"/);
    expect(src, "o texto de 'a pé' voltou a servir para os dois estados")
      .not.toMatch(/placeholder=\{exigePlaca \? "ABC1D23" : "não se aplica"\}/);
  });

  it("o select tem opção vazia enquanto ninguém escolheu", () => {
    // Sem ela, um `value=""` deixa o <select> MOSTRANDO a primeira opção com o
    // estado vazio por trás: a tela diz "Moto" e a gravação manda nada.
    expect(fonte()).toMatch(/\{faltaVeiculo && <option value="">Escolha o veículo<\/option>\}/);
  });

  it("o veículo é campo obrigatório na tela", () => {
    expect(fonte()).toMatch(/<Field label="Veículo" required error=\{erro\.veiculo\}>/);
  });

  it("a regra da placa é a da lib, e não uma lista repetida aqui", () => {
    const src = fonte();
    expect(src).toMatch(/const exigePlaca = pedePlaca\(veiculo\);/);
    expect(src, "a tela voltou a listar quem tem placa")
      .not.toMatch(/veiculo === "Carro" \|\| veiculo === "Moto"/);
  });

  it("grava null quando não há prazo, e não zero", () => {
    // `null` é o que o banco entende por "sem limite"; zero seria quinze
    // segundos, e a lista mostraria "estourou" já na entrada.
    //
    // São dois caminhos até o `null`: o tipo que nunca teve prazo (temporada,
    // serviço) e a visita marcada como ilimitada. Os dois desembocam no mesmo
    // valor de propósito — a coluna do prazo só sabe ler um.
    expect(fonte()).toMatch(
      /minutos_permitidos:\s*\n?\s*temPrazo\(tipo\) && !semRelogio\(\{ tipo, ilimitado \}\) \? Number\(minutos\) : null/);
  });
});

describe("o mais e o menos", () => {
  it("andam de 5 em 5, pela regra da lib", () => {
    const src = fonte();
    expect(src).toMatch(/ajustarMinutos\(m, -PASSO_MINUTOS\)/);
    expect(src).toMatch(/ajustarMinutos\(m, \+PASSO_MINUTOS\)/);
    // Nada de somar na mão: a trava de mínimo e máximo mora em `ajustarMinutos`.
    expect(src, "somou minutos sem passar pela trava").not.toMatch(/setMinutos\((?:m|minutos) [+-] \d/);
  });

  it("os botões dizem o que fazem para quem não vê a tela", () => {
    const src = fonte();
    expect(src).toMatch(/aria-label=\{`Diminuir \$\{PASSO_MINUTOS\} minutos`\}/);
    expect(src).toMatch(/aria-label=\{`Aumentar \$\{PASSO_MINUTOS\} minutos`\}/);
  });
});

describe("reconhecer o CPF e conferir o veículo", () => {
  it("o índice guarda a linha inteira, não só o nome", () => {
    // É de onde saem veículo e placa para o preenchimento automático.
    expect(fonte()).toMatch(/entregadores\.forEach\(\(e\) => m\.set\(soDigitos\(e\.cpf\), e\)\)/);
  });

  it("preenche sozinho e PERGUNTA do veículo", () => {
    // Preencher a placa antiga em silêncio é pior que campo vazio: o porteiro
    // confere o que já está escrito e libera um carro que não é aquele.
    const src = fonte();
    expect(src).toMatch(/if \(temVeiculoGuardado\(registro\)\) \{/);
    expect(src).toContain("setConferirVeiculo(registro)");
  });

  it("só pergunta quando há veículo guardado", () => {
    // Sem veículo, a pergunta não tem sujeito e vira um aviso vazio para
    // fechar a cada entrada de quem chega a pé.
    const src = fonte();
    const i = src.indexOf("setConferirVeiculo(registro)");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i - 200, i)).toContain("temVeiculoGuardado(registro)");
  });

  it('"não, é outro" apaga só veículo e placa', () => {
    // CPF e nome são da pessoa e não mudaram — foi o pedido, e é o certo.
    const src = fonte();
    const bloco = src.slice(src.indexOf("const trocarVeiculo"), src.indexOf("const trocarVeiculo") + 260);
    expect(bloco).toContain('setVeiculo("")');
    expect(bloco).toContain('setPlaca("")');
    expect(bloco, "apagou o nome junto").not.toContain("setNome(");
    expect(bloco, "apagou o CPF junto").not.toContain("setCpf(");
  });

  it("o aviso tem as duas saídas, e nenhuma delas é fechar no vazio", () => {
    const src = fonte();
    expect(src).toContain("Não, é outro");
    expect(src).toContain("Sim, é esse");
  });
});

describe("o cadastro aprende", () => {
  it("quem é novo entra no cadastro com nome, veículo e placa", () => {
    // O pedido: "sempre no primeiro cadastro de entrada, já vai pré-registrar".
    const src = fonte();
    expect(src).toMatch(/const dadosDoVeiculo = \{[\s\S]*?veiculo:[\s\S]*?placa:[\s\S]*?\}/);
    expect(src).toMatch(/const dadosDoCadastro = \{ nome: nomeAtual, \.\.\.dadosDoVeiculo \}/);
    expect(src).toMatch(/criar\("ENTREGADORES", \{\s*cpf: cpfAtual, \.\.\.dadosDoCadastro/);
  });

  it("quem já existia tem o cadastro atualizado com o veículo desta entrada", () => {
    // Sem isto, quem trocou de moto seria perguntado sobre a antiga para
    // sempre — e a pergunta viraria ruído que se fecha no automático.
    expect(fonte()).toMatch(/editar\("ENTREGADORES", antigo\.id, dadosDoVeiculo\)/);
  });

  it("a atualização NÃO leva o nome junto", () => {
    // Desde o 0035 o porteiro pode alterar quatro colunas de `entregadores`, e
    // `nome` não é uma delas. Mandar o nome — ainda que igual ao que já está
    // gravado — faz o gatilho recusar o UPDATE inteiro, e o veículo volta a
    // nunca ser guardado. Foi o defeito que o 0035 conserta.
    const src = fonte();
    expect(src, "o UPDATE do cadastro voltou a mandar o nome")
      .not.toMatch(/editar\("ENTREGADORES", \w+\.id, dadosDoCadastro\)/);
    const bloco = src.slice(src.indexOf("const dadosDoVeiculo"), src.indexOf("const dadosDoCadastro"));
    expect(bloco, "`nome` entrou no pacote do veículo").not.toMatch(/\bnome\s*:/);
  });

  it("CPF que já existe no banco não barra a entrada", () => {
    // O índice único do 0034 recusa a segunda inserção do mesmo CPF. Sem este
    // desvio, um cadastro feito por outro porteiro depois desta tela abrir
    // deixaria o porteiro travado numa mensagem do Postgres sobre chave
    // duplicada — por um detalhe que não é dele resolver.
    const src = fonte();
    expect(src).toMatch(/duplicate key\|already exists\|23505/);
    expect(src).toMatch(/editar\("ENTREGADORES", achado\.id, dadosDoVeiculo\)/);
  });

  it("falha ao guardar o veículo não passa calada", () => {
    // Era exatamente assim antes: o resultado do `editar` era ignorado, o RLS
    // recusava, e o veículo simplesmente nunca era guardado.
    const src = fonte();
    expect(src).toMatch(/if \(!ra\.success\) \{/);
    expect(src).toContain("avisoDoCadastro");
  });
});

describe("a validação é uma só", () => {
  it("o envio usa `problemasDaEntrada`, e não regras próprias", () => {
    // Quando a validação do envio e a do botão são códigos diferentes, elas
    // discordam no dia em que alguém mexe numa delas.
    const src = fonte();
    expect(src).toContain("const e = problemasDaEntrada({");
    expect(src, "voltou a validar CPF na mão").not.toMatch(/if \(cpf\.length !== 11\) e\.cpf/);
  });
});

describe("a lista mostra o prazo", () => {
  it("tem um relógio próprio, senão a contagem congela", () => {
    // Sem ele, o valor fica o do carregamento e a coluna passa a mentir
    // devagar — o pior tipo de erro numa tela de portaria.
    const src = fonte();
    expect(src).toMatch(/setInterval\(\(\) => setAgora\(Date\.now\(\)\), \d+\)/);
    expect(src).toContain("return () => clearInterval(id);");
  });

  it("sem prazo não vira 0 min", () => {
    // "sem limite" e "acabou o tempo" são afirmações diferentes.
    expect(fonte()).toContain('"sem limite"');
  });

  it("estourado é sinalizado", () => {
    expect(fonte()).toContain("ent-prazo-estourado");
    expect(fonte()).toMatch(/restam < 0 \? `\$\{formatarDuracao\(-restam\)\} a mais`/);
  });
});

describe("o rótulo fala com quem usa a tela", () => {
  it("o nome não é mais 'do entregador'", () => {
    // A mesma tela recebe motorista de app, visitante, hóspede de temporada e
    // prestador. "Nome do entregador" fazia o porteiro hesitar antes de digitar
    // o nome de um visitante.
    const src = fonte();
    expect(src, "o rótulo antigo voltou").not.toContain('label="Nome do entregador"');
    expect(src).toContain('label="Nome e sobrenome"');
    expect(src).toContain('help="De quem está pedindo para entrar"');
  });
});

describe("serviço do próprio condomínio", () => {
  it("a caixa só aparece em prestador de serviço", () => {
    // Marcá-la em entregador produziria uma entrada sem destino e sem
    // explicação — e o `check` do 0035 recusaria a gravação.
    const src = fonte();
    expect(src).toMatch(/\{pedeEmpresa\(tipo\) && \(\s*<div className="ent-interno">/);
  });

  it("marcar apaga a unidade e assume o porteiro como quem liberou", () => {
    const src = fonte();
    const bloco = src.slice(src.indexOf("const marcarInterno"), src.indexOf("const registrar"));
    expect(bloco).toContain("setUnidadeSel(null)");
    expect(bloco).toContain("setLiberadoPor(nomeDoPorteiro)");
  });

  it("desmarcar tira o nome do porteiro de volta", () => {
    // Senão ele ficaria como "morador que autorizou" numa entrada que voltou a
    // ter destino de verdade.
    const src = fonte();
    expect(src).toMatch(/if \(liberadoPor === nomeDoPorteiro\) setLiberadoPor\(""\)/);
  });

  it("trocar de tipo desliga a marca", () => {
    expect(fonte()).toMatch(/if \(novo !== "SERVICO"\) setDoCondominio\(false\)/);
  });

  it("a unidade de destino some da tela, e grava nulo", () => {
    const src = fonte();
    expect(src).toMatch(/\{!interno && \(/);
    expect(src).toMatch(/bloco: unidadeAtual \? String\(unidadeAtual\.bloco\) : null/);
    expect(src).toMatch(/do_condominio: interno/);
  });

  it("o campo de quem liberou não trava sem ter nome para pôr", () => {
    // Travar vazio deixaria a entrada impossível de registrar, sem nenhuma
    // saída na tela.
    expect(fonte()).toMatch(/disabled=\{interno && Boolean\(nomeDoPorteiro\)\}/);
  });

  it("`interno` vem da lib, e não de uma condição escrita na tela", () => {
    const src = fonte();
    expect(src).toMatch(/const interno = ehServicoInterno\(\{ tipo, doCondominio \}\)/);
    expect(src, "regra duplicada na tela")
      .not.toMatch(/tipo === "SERVICO" && doCondominio/);
  });
});

describe("quem liberou e quem deu saída", () => {
  it("cada horário carrega o porteiro que o produziu", () => {
    const src = fonte();
    // Na lista o porteiro vem embaixo do horário, em letra menor.
    expect(src).toMatch(/\{c\.created_by \? <small>\{c\.created_by\}<\/small>/);
    expect(src).toMatch(/\{c\.saida_por \? <small>\{c\.saida_por\}<\/small>/);
  });

  it("a saída manda quem a registrou", () => {
    // O 0035 reescreve a coluna a partir do token; mandar daqui é o que faz a
    // coluna funcionar no modo demonstração e nas contas sem `usuario_id`.
    expect(fonte()).toMatch(/saida_por: nomeDoPorteiro/);
  });

  it("destino vazio é lido como serviço do condomínio, não como buraco", () => {
    expect(fonte()).toMatch(/c\.bloco \? `B\$\{c\.bloco\}-\$\{c\.apartamento\}` : "condomínio"/);
  });
});

describe("o filtro e o mapa", () => {
  it("as duas vistas existem, e abrem na que contém a outra", () => {
    // "Chegadas de hoje" mostra também quem está dentro, com o selo. O
    // contrário esconderia metade do dia atrás de um clique.
    const src = fonte();
    expect(src).toMatch(/useState\("hoje"\)/);
    expect(src).toContain('{ value: "hoje", label: "Chegadas de hoje", count: deHoje.length }');
    expect(src).toContain('{ value: "dentro", label: "Dentro agora", count: dentroAgora }');
  });

  it("o mapa só aparece em 'dentro agora'", () => {
    // Desenhar quem já foi embora numa planta de "quem está aqui" seria o mapa
    // afirmando o contrário do que ele existe para dizer.
    expect(fonte()).toMatch(/\{aba === "dentro" && !carregando && \(\s*<MapaDaPortaria/);
  });

  it("a tabela segue a aba", () => {
    const src = fonte();
    expect(src).toMatch(
      /const linhas = aba === "dentro" \? dentro : aba === "historico" \? doHistorico : deHoje/
    );
    expect(src).toMatch(/itens=\{linhas\.slice\(0, limite\)\}/);
  });

  it("'está dentro' tem uma definição só", () => {
    // Duas noções de "está dentro" — uma para a contagem de prazo, outra para o
    // filtro — acabariam discordando num caso de borda, e o mapa mostraria
    // gente que a tabela não mostra.
    const src = fonte();
    expect(src).toMatch(/chegadas\.filter\(estaDentro\)/);
    expect(src, "voltou a decidir na mão")
      .not.toMatch(/filter\(\(c\) => !soHora\(c\.horario_saida\)\)/);
  });

  it("o pino do mapa leva até a linha da pessoa", () => {
    // O mapa responde "tem alguém no bloco 3". A pergunta seguinte é sempre
    // "quem, e há quanto tempo" — e ela mora na lista, não no mapa.
    const src = fonte();
    expect(src).toMatch(/onEscolher=\{apontarNaLista\}/);
    expect(src).toMatch(/destacada=\{destacada\}/);
    expect(src).toMatch(/id: `chegada-\$\{c\.id\}`/);
    expect(src).toMatch(/"data-destacada": String\(c\.id\) === String\(destacada\)/);
  });

  it("a rolagem espera a marca ser pintada", () => {
    // Sem o quadro seguinte, o navegador rola para onde a linha estava antes de
    // a marca mudar a altura dela — e para no lugar errado.
    const bloco = fonte().slice(fonte().indexOf("const apontarNaLista"));
    expect(bloco).toContain("requestAnimationFrame");
    expect(bloco).toMatch(/scrollIntoView/);
  });

  it("quem pediu menos movimento não leva rolagem animada", () => {
    expect(fonte()).toMatch(/prefers-reduced-motion: reduce/);
    expect(fonte()).toMatch(/behavior: paradinho \? "auto" : "smooth"/);
  });

  it("clicar fora desmarca a pessoa", () => {
    // Sem isto a marca fica na tela para sempre, e meia hora depois ela aponta
    // alguém que ninguém apontou — pior que não marcar nada, porque parece
    // informação.
    const src = fonte();
    expect(src).toMatch(/document\.addEventListener\("pointerdown", fora\)/);
    expect(src).toMatch(/document\.removeEventListener\("pointerdown", fora\)/);
    expect(src).toMatch(/if \(destacada === null\) return undefined/);
  });

  it("o clique no próprio pino não se apaga sozinho", () => {
    // `pointerdown` e `click` disparam os dois no mesmo toque. Sem reconhecer o
    // pino, o primeiro apagaria o que o segundo acabou de escolher.
    expect(fonte()).toMatch(/if \(e\.target\.closest\?\.\("\.mapa__pino"\)\) return;/);
  });

  it("trocar de aba apaga a marca", () => {
    // Ela apontava para uma lista que saiu da tela; deixada ali, marcaria uma
    // linha que o porteiro nunca apontou.
    const src = fonte();
    expect(src).toMatch(/const trocarAba = \(nova\) => \{[\s\S]*?setDestacada\(null\)/);
    expect(src).toMatch(/onChange=\{trocarAba\}/);
  });

  it("a linha marcada tem regra, e o cartão do celular também", () => {
    // Destaque que para na borda de uma coluna deixa o resto da linha
    // parecendo outra pessoa.
    const ui = readFileSync("src/styles/ui.css", "utf8");
    // O VALOR, e não só a palavra `background`: a regra do celular põe
    // `background: transparent` na célula, e um teste que só procura
    // "background" passa com a regra de mesa apagada. Foi o que aconteceu.
    expect(ui, "a linha marcada perdeu o fundo na versão de mesa")
      .toMatch(/\n\.vit-table tbody tr\[data-destacada="sim"\] td \{[^}]*background: var\(--bg-active\)/);
    // A barra à esquerda faz o par com o fundo: fundo sozinho some para quem
    // não distingue bem a cor do papel.
    expect(ui).toMatch(/tr\[data-destacada="sim"\] td:first-child \{[^}]*inset 3px 0 0/);
    expect(ui).toMatch(/--responsiva .vit-table tbody tr\[data-destacada="sim"\] \{/);
  });

  it("o vazio de cada vista diz o que é o vazio dela", () => {
    const src = fonte();
    expect(src).toContain("Ninguém dentro agora");
    expect(src).toContain("Nenhuma chegada registrada hoje");
  });
});

describe("a lista de hoje atravessa a meia-noite", () => {
  it("pergunta ao banco duas coisas: as de hoje e as que estão abertas", () => {
    // "As de hoje" sozinho perderia quem entrou ontem e ainda está aqui — e
    // essa é a pessoa mais importante da tela, porque ninguém sabe que ela está
    // lá.
    const src = fonte();
    expect(src).toMatch(/listarChegadas\(\{ desde: inicioDeHoje\.toISOString\(\) \}\)/);
    expect(src).toMatch(/listarChegadas\(\{ abertas: true \}\)/);
    expect(src).toMatch(/setChegadas\(unirChegadas\(deHoje, abertas\)\)/);
  });

  it("não puxa mais a tabela inteira para peneirar na tela", () => {
    // Funcionava com três linhas. Acima de mil, o PostgREST devolve um pedaço
    // qualquer e a tela fica vazia sem erro nenhum.
    expect(fonte(), "voltou a ler a tabela inteira")
      .not.toMatch(/listar\("ENTREGADORES_CHEGADAS"\)/);
  });

  it("a contagem de hoje usa a janela, e não a lista crua", () => {
    const src = fonte();
    expect(src).toMatch(/const deHoje = useMemo\(\s*\(\) => daJanelaDeHoje\(chegadas, agora\)/);
    expect(src).toMatch(/count: deHoje\.length/);
    expect(src, "o cabeçalho voltou a contar a lista crua")
      .not.toMatch(/\$\{chegadas\.length\} chegadas hoje/);
  });
});

describe("o histórico", () => {
  it("a aba só existe para quem tem a permissão", () => {
    const src = fonte();
    expect(src).toMatch(/can\(user, "verHistoricoPortaria"\)/);
    expect(src).toMatch(/\.\.\.\(mostraHistorico \? \[\{ value: "historico"/);
  });

  it("porteiro, auxiliar, síndico e dev entram; conselheiro não", () => {
    const p = readFileSync("src/auth/permissions.js", "utf8");
    const regra = p.match(/verHistoricoPortaria: \[[^\]]*\]/)?.[0] ?? "";
    expect(regra).toContain("ROLES.PORTEIRO");
    expect(regra).toContain("ROLES.SINDICO");
    expect(regra).toContain("ROLES.AUX");
    expect(regra).toContain("ROLES.DEV");
    expect(regra, "conselheiro é só leitura de assembleia").not.toContain("ROLES.CONSELHEIRO");
  });

  it("o porteiro vê o histórico com o CPF coberto; a administração vê inteiro", () => {
    const p = readFileSync("src/auth/permissions.js", "utf8");
    const regra = p.match(/verCpfNoHistorico: \[[^\]]*\]/)?.[0] ?? "";
    expect(regra).toContain("ROLES.SINDICO");
    expect(regra).toContain("ROLES.AUX");
    expect(regra).toContain("ROLES.DEV");
    expect(regra, "o pedido foi o CPF camuflado para o porteiro").not.toContain("ROLES.PORTEIRO");

    const src = fonte();
    expect(src).toMatch(/const cpfMascarado = !can\(user, "verCpfNoHistorico"\);/);
    expect(src).toMatch(/aba === "historico" && cpfMascarado \? mascararCpf\(c\.cpf\) : formatarCpf\(c\.cpf\)/);
    // Só o meio fica: o suficiente para conferir com o documento na mão.
    expect(src).toContain("return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;");
  });

  it("só busca quando alguém abre a aba", () => {
    // São meses de linhas. Carregar isso em toda abertura da tela custaria caro
    // ao porteiro, que passa o turno inteiro nas outras duas abas.
    expect(fonte()).toMatch(/if \(aba !== "historico"\) return undefined;/);
  });

  it("o recorte de data vai para o banco, não para a tela", () => {
    const src = fonte();
    expect(src).toMatch(/desde: inicioDoDia\(filtros\.entradaDe\)/);
    expect(src).toMatch(/ate: fimDoDia\(filtros\.entradaAte\)/);
    // E o resto fica aqui: uma requisição por tecla digitada seria absurdo.
    expect(src).toMatch(/filtrarHistorico\(historico, filtros\)/);
  });

  it("resposta atrasada não sobrescreve a nova", () => {
    // Mudando as datas duas vezes seguidas, a resposta antiga pode chegar
    // depois — e a tela ficaria mostrando o filtro anterior.
    const src = fonte();
    expect(src).toMatch(/let cancelado = false;/);
    expect(src).toMatch(/return \(\) => \{ cancelado = true; \};/);
    expect(src).toMatch(/if \(!cancelado\) setHistorico\(dados\)/);
  });

  it("o teto do banco aparece na tela", () => {
    // Lista cortada em silêncio faz quem procura concluir que o registro não
    // existe — que é a pior resposta possível para um histórico.
    const src = fonte();
    expect(src).toMatch(/historico\.length >= LIMITE_HISTORICO/);
    expect(src).toMatch(/limite: LIMITE_HISTORICO/);
  });

  it("a entrada mostra dia e hora em toda aba", () => {
    // "Dentro agora" também mostra o hóspede que entrou anteontem, e "17:23"
    // sozinho o faria parecer de hoje. Com o dia na própria entrada, a coluna
    // "Dia" separada do histórico seria a mesma informação duas vezes.
    const src = fonte();
    expect(src).toContain("{`${soDia(c.horario_entrada)} ${soHora(c.horario_entrada)}`.trim()}");
    expect(src, "a coluna Dia separada voltou").not.toMatch(/\{ key: "dia"/);
  });

  it("apagar ou dar saída recarrega o histórico também", () => {
    // Ele é outra consulta: sem isto a linha apagada continuaria lá até alguém
    // trocar de aba.
    const src = fonte();
    expect((src.match(/setVersaoHistorico\(\(v\) => v \+ 1\)/g) ?? []).length)
      .toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/versaoHistorico\]/);
  });

  it("os filtros do histórico têm regra de estilo", () => {
    const css = readFileSync("src/styles/fila.css", "utf8");
    // A barra em si é a `app-filtros` do guia; daqui só a contagem do recorte.
    for (const classe of ["ent-filtros__rodape", "ent-filtros__conta", "ent-filtros__aviso"]) {
      expect(new RegExp(`\\.${classe}(?![\\w-])`).test(css), `${classe} sem regra`).toBe(true);
    }
  });
});

describe("os nomes da tela", () => {
  it("a página deixou de se chamar Entregas", () => {
    // Ela registra visitante, motorista de aplicativo, hóspede de temporada e
    // prestador. E "Entregas" ao lado de "Encomendas" no menu era a confusão
    // mais antiga do sistema.
    const src = fonte();
    expect(src).toContain('title="Entradas e Saídas"');
    expect(src, "o título antigo voltou").not.toMatch(/title="Entregas"/);

    const barra = (readFileSync("src/components/Sidebar.jsx", "utf8") + readFileSync("src/auth/menu.js", "utf8"));
    expect(barra).toMatch(/Entregas: "Entradas e Saídas"/);
  });

  it("a CHAVE de permissão continua `Entregas`", () => {
    // Ela governa o acesso e casa com a rota `/entregas`, que já está em
    // favorito de quem usa o sistema. Renomear a chave junto com o rótulo
    // tiraria a tela do menu de todo mundo sem nenhum erro aparecer.
    const barra = (readFileSync("src/components/Sidebar.jsx", "utf8") + readFileSync("src/auth/menu.js", "utf8"));
    expect(barra).toMatch(/^ {2}Entregas: \[ROLES\.PORTEIRO/m);
    expect(readFileSync("src/App.jsx", "utf8")).toContain('path="/entregas"');
  });

  it("o botão do cadastro chama quem ele lista", () => {
    // "Entregadores" ficou velho: o cadastro guarda visitante, hóspede e
    // prestador também.
    const src = fonte();
    expect(src).toMatch(/iconLeft=\{<Users size=\{15\} \/>\}>\s*Cadastrados/);
    expect(src).toContain('title="Pessoas cadastradas"');
    expect(src, "sobrou 'entregadores' num texto de tela")
      .not.toMatch(/entregadores cadastrados|Buscar entregador|Nenhum entregador/);
  });
});

describe("o alerta de tempo estourado no topo", () => {
  it("conta quem passou do tempo pelo mesmo cálculo do mapa e da coluna", () => {
    // Três lugares mostram a mesma coisa. Com contas diferentes, um dia eles
    // discordam — e aí nenhum dos três é confiável.
    expect(fonte()).toMatch(
      /const estourados = useMemo\(\s*\(\) => dentro\.filter\(\(c\) => \(minutosRestantes\(c, agora\) \?\? 0\) < 0\)\.length/
    );
  });

  it("aparece no indicador de 'Dentro agora', e só quando há alguém", () => {
    const src = fonte();
    expect(src).toMatch(/estourados > 0 \? \(\s*<span className="ent-stat-alerta">/);
    expect(src).toMatch(/tone=\{estourados > 0 \? "danger" : "brand"\}/);
  });

  it("o número acompanha o símbolo", () => {
    // Símbolo sozinho não diz quantos, e não é lido por quem usa leitor de
    // tela — o ícone é decorativo de propósito.
    const src = fonte();
    expect(src).toMatch(/\$\{estourados\} \$\{estourados === 1 \? "passou" : "passaram"\} do tempo/);
    expect(src).toMatch(/<AlertTriangle size=\{13\} aria-hidden="true" \/>/);
  });

  it("o alerta do topo não pisca", () => {
    // Quem pisca é o pino no mapa. Dois piscares na mesma tela deixam de
    // significar urgência.
    const css = readFileSync("src/styles/fila.css", "utf8");
    const regra = css.match(/\.ent-stat-alerta \{[^}]*\}/)?.[0] ?? "";
    expect(regra, "sem regra o alerta fica da cor do texto comum").not.toBe("");
    expect(regra).toMatch(/color: var\(--fg-danger\)/);
    expect(regra).not.toMatch(/animation/);
  });
});

describe("o estilo existe", () => {
  const css = () => readFileSync("src/styles/fila.css", "utf8");

  it("toda classe nova tem regra", () => {
    // Classe usada sem regra fica sem espaçamento nenhum, e nada avisa — foi o
    // que aconteceu na tela de trocar senha.
    const usadas = [
      "ent-tipos", "ent-tipo", "ent-tipo--ativo", "ent-prazo", "ent-prazo__botao",
      "ent-prazo__valor", "ent-tipo-selo", "ent-empresa", "ent-prazo-estourado",
      "ent-confere", "ent-confere__veiculo", "ent-confere__nota",
      "ent-interno", "ent-interno__nota", "ent-porteiro", "ent-secao-topo",
      "ent-stat-alerta",
    ];
    const folha = css();
    const semRegra = usadas.filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(folha));
    expect(semRegra).toEqual([]);
  });

  it("os botões do prazo têm alvo de toque no celular", () => {
    // Quem opera a portaria está de pé, com o celular na mão.
    expect(css()).toMatch(/@media \(max-width: 768px\) \{\s*\.ent-prazo__botao \{[^}]*44px/);
  });

  it("o número do prazo não dança de lado a cada clique", () => {
    const regra = css().match(/\.ent-prazo__valor \{[^}]*\}/)?.[0] ?? "";
    expect(regra).toContain("tabular-nums");
  });
});

describe("o nome padronizado chega na tela", () => {
  it("o que se digita já sobe de caixa", () => {
    // O porteiro vê o nome como ele vai ficar gravado. Sem isto, o campo mostra
    // uma coisa e a lista mostra outra.
    expect(fonte()).toMatch(/setNome\(emMaiusculo\(e\.target\.value\)\)/);
    expect(fonte()).toMatch(/setEditNome\(emMaiusculo\(ev\.target\.value\)\)/);
  });

  it("o que se grava passa pela forma definitiva", () => {
    // Nos três lugares que escrevem nome: a chegada, o cadastro que nasce com
    // ela, e a correção feita dentro de "Cadastrados".
    const src = fonte();
    expect(src).toMatch(/const nomeAtual = padronizarNome\(nome\);/);
    expect(src).toMatch(/const novo = padronizarNome\(editNome\);/);
    expect(src).toMatch(/setNome\(padronizarNome\(registro\.nome\)\)/);
    expect(src, "sobrou um trim cru gravando nome").not.toMatch(/const nomeAtual = nome\.trim\(\)/);
  });

  it("as linhas antigas aparecem em caixa alta sem serem reescritas", () => {
    // `entregadores_chegadas` é histórico. Arrumar aparência com UPDATE seria
    // reescrever registro de entrada, então quem uniformiza o que já está
    // gravado é o CSS.
    expect(fonte()).toMatch(/className="ent-nome"/);
    const css = readFileSync("src/styles/fila.css", "utf8");
    const regra = css.slice(css.indexOf(".ent-nome {"), css.indexOf("}", css.indexOf(".ent-nome {")));
    expect(regra, "a classe existe mas não deixa o nome em caixa alta")
      .toMatch(/text-transform:\s*uppercase/);
  });
});

describe("a caixa de Ilimitado", () => {
  it("aparece só onde o tipo deixa", () => {
    // Fora de uma guarda, ela apareceria no entregador — e o porteiro apressado
    // marcaria sem pensar, porque ela estaria ali.
    const src = fonte();
    const i = src.indexOf('label="Ilimitado"');
    expect(i, "a caixa de Ilimitado sumiu").toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, i - 400), i)).toContain("podeSerIlimitado(tipo)");
  });

  it("trocar de tipo apaga a marca", () => {
    // Sair do visitante com ela ligada deixaria o entregador seguinte sem
    // contagem, e sem nada na tela dizendo isso: a caixa nem aparece lá.
    expect(fonte()).toMatch(/if \(!podeSerIlimitado\(novo\)\) setIlimitado\(false\);/);
  });

  it("cada entrada começa desmarcada", () => {
    // Herdar a marca da pessoa anterior é liberar sem prazo por engano.
    const src = fonte();
    expect(src).toMatch(/useState\(false\);/);
    const limpar = src.slice(src.indexOf("const limparFormulario"), src.indexOf("const escolherTipo"));
    expect(limpar, "o formulário limpo mantém a marca").toContain("setIlimitado(false)");
  });

  it("o contador fica apagado, e não some", () => {
    // Sumindo, a linha encolhe e a caixa pula de lugar debaixo do dedo de quem
    // acabou de marcá-la.
    const src = fonte();
    expect(src).toMatch(/data-desligado=\{ilimitado \? "sim" : undefined\}/);
    expect(src).toMatch(/disabled=\{ilimitado\}/);
    expect(src).toMatch(/\{ilimitado \? "Sem Limite" : formatarDuracao\(minutos\)\}/);
    const css = readFileSync("src/styles/fila.css", "utf8");
    expect(css).toMatch(/\.ent-prazo\[data-desligado="sim"\]/);
    expect(css).toMatch(/^\.ent-prazo-linha \{/m);
  });

  it("o aviso de saída diz que não há limite", () => {
    // Sem isto o toast mostraria "· 15 min" para quem entrou sem relógio.
    const src = fonte();
    const i = src.indexOf('" · sem limite de tempo"');
    expect(i, "o toast perdeu o aviso de sem limite").toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, i - 120), i)).toContain("semRelogio({ tipo, ilimitado })");
  });
});

describe("o desenho da linha do prazo", () => {
  const css = () => readFileSync("src/styles/fila.css", "utf8");
  const regra = (seletor) => {
    const texto = css();
    const i = texto.indexOf(seletor + " {");
    expect(i, seletor + " sumiu do CSS").toBeGreaterThan(-1);
    return texto.slice(i, texto.indexOf("}", i));
  };

  it("o contador cresce em vez de encolher para o tamanho do texto", () => {
    // Espremido entre o menos e o mais, "15 min" ficava menor que os próprios
    // botões. Sem o `flex` de crescer, ele volta a caber só o texto.
    expect(regra(".ent-prazo")).toContain("flex: 1 1 240px");
  });

  it("o número tem largura de sobra, e não muda de tamanho a cada clique", () => {
    // "sem limite" e "1h30" ocupam bem mais que "15 min". Sem o mínimo, a caixa
    // dança de largura enquanto o porteiro clica.
    const r = regra(".ent-prazo__valor");
    expect(r).toContain("min-width");
    expect(r).toContain("padding: 0 var(--space-6)");
  });

  it("a caixa de Ilimitado tem cantos redondos de verdade", () => {
    // O quadrado nativo do navegador ignora `border-radius` enquanto a aparência
    // nativa estiver no caminho. Sem o `appearance: none`, a regra existe e não
    // desenha nada — o pior tipo de estilo, o que parece aplicado.
    const r = regra(".ent-ilimitado input");
    expect(r).toContain("appearance: none");
    expect(r).toContain("border-radius");

    // Tirada a aparência nativa, o check tem de ser desenhado por nós — senão a
    // caixa marcada fica visualmente igual à desmarcada.
    expect(css()).toContain(".ent-ilimitado input:checked::before");
    expect(css(), "a marca ficou sem cor de fundo").toMatch(/\.ent-ilimitado input:checked \{[^}]*background: var\(--brand-600\)/s);
    // E o foco por teclado não pode sumir junto com a aparência nativa.
    expect(css()).toContain(".ent-ilimitado input:focus-visible");
  });

  it("a tela pede essa caixa pelo nome", () => {
    expect(fonte()).toContain('className="ent-ilimitado"');
  });
});

describe("o histórico: a saída com dia e o filtro por unidade", () => {
  it("a coluna Saída mostra o dia, e não só a hora", () => {
    // A coluna "Dia" é o dia da ENTRADA. O hóspede de temporada sai dias
    // depois, e "18:30" sem dia, ao lado de um dia que é o da entrada, faz a
    // saída parecer do mesmo dia. Só no histórico: nas outras abas tudo é de
    // hoje, e a data seria repetida em toda linha.
    expect(fonte()).toMatch(/soDia\(c\.horario_saida\)/);
  });

  it("tem filtro por unidade, ligado ao estado dos filtros", () => {
    // A regra de casar "5206" com o B5-206 mora em lib/unidades e é medida
    // em portaria.test.js; aqui só se prende que a tela oferece o campo.
    const src = fonte();
    expect(src).toMatch(/mudarFiltro\("unidade"/);
    expect(src).toContain("value={filtros.unidade}");
  });

  it("limpar filtros zera a unidade também", () => {
    // Estado inicial e "Limpar filtros" são dois lugares. Um campo esquecido
    // no segundo continua filtrando depois de "limpar", e a lista parece
    // menor do que é sem nada na tela explicar por quê.
    expect((fonte().match(/unidade: ""/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
