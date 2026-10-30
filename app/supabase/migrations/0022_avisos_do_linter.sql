-- Respostas aos avisos do linter do Supabase.
--
-- Nem todo aviso é defeito. Três dos seis são o desenho funcionando, e mexer
-- neles quebraria o que eles protegem. Este arquivo corrige o que é corrigível
-- e deixa registrado, no lugar onde alguém vai procurar, por que o resto fica.

-- ---------------------------------------------------------------------------
-- CORRIGE: `tocar_updated_at` sem search_path fixo
-- ---------------------------------------------------------------------------
-- É o gatilho que carimba `updated_at` em 20 e poucas tabelas, e nasceu no 0001
-- sem `set search_path`. Sem isso, o schema em que os nomes são resolvidos vem
-- do `search_path` de quem disparou o gatilho — que é o de quem fez o INSERT.
--
-- Aqui o corpo só usa `new` e `now()`, então não há o que sequestrar hoje. Mas
-- "hoje não dá" é uma garantia que dura até a próxima linha adicionada ao corpo
-- desta função, e ela roda em toda escrita do sistema. Fixar custa uma linha.
create or replace function public.tocar_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- REVOGADO PELO 0025: a view foi apagada e a receita virou a Edge Function
-- `receita`. O texto abaixo fica como registro do que se pensou aqui — a
-- análise estava certa sobre o risco de HOJE, e errada sobre o custo de manter
-- o desenho seguro amanhã. O 0025 explica o que mudou de ideia.
--
-- FICA COMO ESTÁ: a view `receitas_reservas` é SECURITY DEFINER de propósito
-- ---------------------------------------------------------------------------
-- O linter marca isto como erro, e a regra geral dele está certa: view com
-- `security_invoker = off` roda com as permissões de quem a criou, ignorando o
-- RLS de quem consulta. É exatamente o que se quer evitar — em geral.
--
-- Este caso é a exceção, e ela é o motivo de a view existir. O gráfico de
-- receita do Dashboard soma `valor_taxa` de festas e churrasqueira. Essas duas
-- tabelas são `so_administrativo` no 0015 porque cada linha carrega cpf, rg,
-- telefone e nome de quem reservou. O conselheiro precisa ver os VALORES e não
-- pode ver as PESSOAS.
--
-- Com `security_invoker = on`, o conselheiro receberia zero linhas e o gráfico
-- ficaria vazio — a view perderia a razão de ser. Dar a ele acesso às tabelas
-- resolveria o gráfico e entregaria os dados pessoais junto.
--
-- O que torna a exceção segura são duas coisas, e as duas precisam continuar
-- verdadeiras:
--
--   1. A view projeta só data, valor, pago e origem. Nenhuma coluna pessoal
--      atravessa. Acrescentar `morador` aqui seria vazar por engano.
--   2. O `where` de CADA lado do union repete a autorização, usando as mesmas
--      funções que as políticas usam. Sem ele, `security_invoker = off` faria
--      qualquer autenticado — inclusive o porteiro — ler tudo.
--
-- Isso é medido por `scripts/verificar-rls.mjs`, com sessão real de cada cargo.
-- Se alguém tirar o `where` ou acrescentar coluna pessoal, o verificador acusa.

-- ---------------------------------------------------------------------------
-- FICA COMO ESTÁ: meu_perfil, senha_ja_trocada, marcar_senha_trocada
-- ---------------------------------------------------------------------------
-- O linter avisa que são SECURITY DEFINER chamáveis por quem está autenticado.
-- São mesmo, e precisam ser: as três leem ou escrevem em `usuarios`, que é
-- fechada a todo mundo menos o dev, e o usuário comum precisa saber o próprio
-- nome, o próprio cargo e se já trocou a própria senha.
--
-- O que as torna seguras é o filtro, não o privilégio: as três operam sobre
-- `where id = (auth.jwt() -> 'app_metadata' ->> 'usuario_id')` — a linha de
-- quem chamou, e só ela. Não aceitam parâmetro de identificação, então não há
-- como pedir o perfil de outra pessoa. Já estão com `set search_path = public`
-- e já são negadas ao anônimo.

-- ---------------------------------------------------------------------------
-- FICA COMO ESTÁ, COM RESSALVA: email_de_login é chamável pelo anônimo
-- ---------------------------------------------------------------------------
-- Precisa ser: o login aceita CPF, e converter CPF em e-mail acontece ANTES de
-- existir sessão. Fechá-la para o anônimo tranca todo mundo do lado de fora.
--
-- A ressalva é honesta e continua de pé: quem tem a chave publicável — que está
-- no bundle — pode perguntar "existe conta com este CPF?" e receber o e-mail de
-- volta. Não expõe senha nem dá acesso a nada, mas permite ligar um CPF a um
-- e-mail. A tabela `usuarios` guarda os funcionários, não os 317 moradores,
-- então o alcance é pequeno; pequeno não é zero.
--
-- Fechar isso de verdade exige tirar o login do navegador: uma Edge Function
-- que recebe identificador e senha, resolve o e-mail do lado de dentro e
-- devolve a sessão. Aí `email_de_login` deixa de ser alcançável pelo anônimo e
-- ainda cabe limite de tentativas, que hoje não existe. É uma mudança no
-- caminho de autenticação, e por isso é decisão do Lucas — não algo para eu
-- trocar no meio da validação das telas.
