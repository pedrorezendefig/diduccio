-- Limite de tentativas de login, e o fechamento de `email_de_login`.
--
-- Hoje não existe limite nenhum: dá para tentar senha à vontade, na velocidade
-- que a rede aguentar, contra qualquer conta. E `email_de_login` responde ao
-- visitante anônimo, então dá para descobrir o e-mail de alguém a partir do
-- CPF antes mesmo de começar a tentar.
--
-- As duas coisas saem juntas porque a solução é a mesma: o login deixa de
-- acontecer no navegador e passa por uma Edge Function, que resolve o e-mail do
-- lado de dentro e conta as tentativas antes de deixar tentar.

-- ---------------------------------------------------------------------------
-- Onde a contagem mora
-- ---------------------------------------------------------------------------
-- Precisa ser no banco, e não na memória da função: Edge Function roda em
-- várias instâncias e dorme entre chamadas. Um contador em memória zera sozinho
-- e vira um limite que não limita.
create table if not exists public.tentativas_login (
  -- Nunca o identificador em si. A função manda o SHA-256 dele, então esta
  -- tabela não guarda CPF nem e-mail de ninguém: se alguém a ler, não descobre
  -- quem tentou entrar. Só serve para comparar com o próximo palpite.
  chave text primary key,
  tentativas int not null default 0,
  -- Quando a janela atual termina. Passou disso, a contagem recomeça.
  ate timestamptz not null
);

alter table public.tentativas_login enable row level security;

-- Sem política nenhuma, de propósito: com RLS ligada e zero políticas, nem o
-- anônimo nem o autenticado alcançam a tabela. Quem escreve nela é a Edge
-- Function, com a service role, que ignora RLS por desenho.
revoke all on table public.tentativas_login from anon, authenticated;

-- Índice para a limpeza: sem ele, apagar as janelas vencidas varre a tabela.
create index if not exists idx_tentativas_login_ate on public.tentativas_login (ate);

-- ---------------------------------------------------------------------------
-- Registrar uma tentativa
-- ---------------------------------------------------------------------------
-- Devolve se está bloqueado e quanto falta. É uma função só, e atômica, porque
-- "ler o contador, decidir, gravar" em três passos tem corrida: dez tentativas
-- simultâneas leriam o mesmo valor e passariam todas.
create or replace function public.registrar_tentativa_login(
  p_chave text,
  p_limite int,
  p_janela_segundos int
)
returns table (bloqueado boolean, tentativas int, espera_segundos int)
language plpgsql
security definer
set search_path = public
as $$
declare
  linha public.tentativas_login;
  agora timestamptz := now();
begin
  -- `on conflict do update` resolve tudo numa instrução: insere se é a primeira
  -- vez, e reinicia a contagem se a janela anterior já venceu.
  insert into public.tentativas_login as t (chave, tentativas, ate)
  values (p_chave, 1, agora + make_interval(secs => p_janela_segundos))
  on conflict (chave) do update
    set tentativas = case when t.ate < agora then 1 else t.tentativas + 1 end,
        ate        = case when t.ate < agora
                          then agora + make_interval(secs => p_janela_segundos)
                          else t.ate end
  returning * into linha;

  return query select
    linha.tentativas > p_limite,
    linha.tentativas,
    greatest(0, ceil(extract(epoch from (linha.ate - agora)))::int);
end $$;

-- ---------------------------------------------------------------------------
-- Zerar depois de um login que deu certo
-- ---------------------------------------------------------------------------
create or replace function public.limpar_tentativas_login(p_chave text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.tentativas_login where chave = p_chave;
$$;

-- ---------------------------------------------------------------------------
-- Faxina das janelas vencidas
-- ---------------------------------------------------------------------------
-- Sem isto a tabela só cresce. Chamada pela própria função de login, de vez em
-- quando, para não precisar de agendador.
create or replace function public.limpar_tentativas_vencidas()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.tentativas_login where ate < now() - interval '1 hour';
$$;

-- Ninguém além da service role executa nada disso. Revogar de PUBLIC não basta:
-- o Supabase concede a `anon` e a `authenticated` diretamente, por default
-- privileges — foi o que o 0021 descobriu medindo.
revoke execute on function public.registrar_tentativa_login(text, int, int) from public, anon, authenticated;
revoke execute on function public.limpar_tentativas_login(text)             from public, anon, authenticated;
revoke execute on function public.limpar_tentativas_vencidas()              from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- E `email_de_login` fecha para o anônimo
-- ---------------------------------------------------------------------------
-- Era a última coisa que o visitante não autenticado alcançava. Existia porque
-- o login precisava converter CPF em e-mail antes de haver sessão — e isso
-- agora acontece dentro da Edge Function, com a service role.
--
-- O que se fecha com isso: qualquer um com a chave publicável podia perguntar
-- "existe conta com este CPF?" e receber o e-mail de volta.
--
-- Fecha para `authenticated` também. Cheguei a escrever aqui que a tela de
-- Usuários precisava dela — e não precisa: o único ponto do sistema que a
-- chamava era o `entrar()` do auth.js, que é justamente quem está saindo de
-- cena. Deixar aberta a quem está logado transformaria a função num consultor
-- de "que e-mail tem o CPF fulano" para qualquer funcionário, inclusive o
-- porteiro, que não enxerga a tabela `usuarios` em lugar nenhum do sistema.
--
-- A Edge Function não depende de grant: ela usa a service role, que passa por
-- cima de privilégio e de RLS.
revoke execute on function public.email_de_login(text) from public, anon, authenticated;
