-- O cadastro de quem parou de vir sai sozinho. O histórico dele fica.
--
-- DEPENDE DO 0034/0035 só por conveniência de leitura; o que ela usa é o
-- `entregadores` e o `entregadores_chegadas` do 0001.
--
-- A regra, na íntegra: passados 3 meses sem NENHUMA entrada registrada daquela
-- pessoa, a linha dela em `entregadores` é apagada. Nada é apagado de
-- `entregadores_chegadas`.
--
-- Isso só é possível porque a chegada não aponta para o cadastro: ela COPIA
-- nome, CPF, veículo, placa, bloco, apartamento e quem liberou para dentro da
-- própria linha, no momento da entrada. Não há chave estrangeira entre as duas
-- tabelas. Então o histórico não fica órfão nem perde uma letra — quem consulta
-- "quem entrou em março" continua vendo o nome de quem entrou em março, mesmo
-- que essa pessoa não seja mais um cadastro ativo.
--
-- O que se perde ao apagar o cadastro é a MEMÓRIA: o último veículo e a placa
-- que a portaria preenchia sozinha ao digitar um CPF conhecido. Se a pessoa
-- voltar depois de 3 meses, ela é cadastrada de novo na entrada seguinte, como
-- se fosse a primeira vez. É o preço da regra, e é ele que faz o cadastro ser
-- uma lista de quem circula por aqui em vez de um arquivo morto que só cresce.

-- ---------------------------------------------------------------------------
-- A limpeza
-- ---------------------------------------------------------------------------
-- Os dois parâmetros existem para o teste conseguir provar a regra sem esperar
-- 90 dias e sem esvaziar a tabela de chegadas de verdade. Os valores de
-- produção são os padrões, e quem agenda não passa nada.
--
-- `janela_viva => interval '0 seconds'` é o jeito de provar o freio: a condição
-- vira "houve chegada no futuro", que é sempre falsa.
create or replace function public.limpar_cadastros_parados(
  meses int default 3,
  janela_viva interval default interval '1 month'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  corte timestamptz := now() - make_interval(months => meses);
  vivo  boolean;
  saem  int;
begin
  -- FREIO. Se não há NENHUMA chegada registrada no último mês, o que está
  -- errado não é o movimento do condomínio — é a tabela de chegadas. Um
  -- truncate, uma migração pela metade, uma política que passou a recusar o
  -- insert: em qualquer um desses casos a regra abaixo leria "ninguém entrou"
  -- e apagaria o cadastro inteiro numa noite, sem ninguém para ver.
  --
  -- Um condomínio de 270 unidades não passa um mês sem uma única entrada. Então
  -- silêncio total aqui é defeito, e diante de defeito a limpeza não roda.
  select exists (
    select 1 from public.entregadores_chegadas
     where horario_entrada > now() - janela_viva
  ) into vivo;

  if not vivo then
    insert into public.auditoria (tabela, acao, new_status, usuario)
    values ('entregadores', 'limpeza automatica',
            'nao rodou: nenhuma chegada em ' || janela_viva, 'Sistema');
    return 0;
  end if;

  with apagados as (
    delete from public.entregadores e
    where
      -- Sem CPF não dá para ligar o cadastro a chegada nenhuma, e o que não se
      -- consegue identificar não se apaga: seria deletar por não saber.
      regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') <> ''

      -- Cadastro novo fica. Ele nasce junto com a primeira chegada, mas se essa
      -- chegada falhar no meio do caminho sobra um cadastro sem histórico — e
      -- sem esta linha ele seria apagado na madrugada seguinte, antes mesmo de
      -- a pessoa voltar.
      and e.created_at < corte

      and not exists (
        select 1
          from public.entregadores_chegadas c
         where regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g')
             = regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g')
           and (
             -- entrou dentro da janela
             c.horario_entrada > corte
             -- ou está DENTRO agora. Uma entrada antiga sem saída registrada
             -- pode ser gente ainda no condomínio ou uma saída que ninguém
             -- fechou; nos dois casos apagar o cadastro é a pior hora.
             or c.horario_saida is null
           )
      )
    returning 1
  )
  select count(*) into saem from apagados;

  -- Fica registrado que a máquina mexeu, e quanto. Sem nome e sem CPF: a
  -- auditoria é lida por gente que não precisa do dado pessoal para entender
  -- o que aconteceu, e o dado já está no histórico de quem entrou.
  if saem > 0 then
    insert into public.auditoria (tabela, acao, new_status, usuario)
    values ('entregadores', 'limpeza automatica',
            saem || ' cadastro(s) sem entrada ha ' || meses || ' meses', 'Sistema');
  end if;

  return saem;
end;
$$;

-- O PUBLIC do Postgres inclui o anon. Revogar só do anon deixaria a porta
-- aberta pelo grant implícito — já erramos isso neste projeto.
revoke execute on function public.limpar_cadastros_parados(int, interval) from public;
revoke execute on function public.limpar_cadastros_parados(int, interval) from anon;
revoke execute on function public.limpar_cadastros_parados(int, interval) from authenticated;

comment on function public.limpar_cadastros_parados(int, interval) is
  'Apaga cadastros de entregadores sem entrada ha N meses. Nao toca no historico. Roda pelo pg_cron; ninguem no app pode chamar.';

-- ---------------------------------------------------------------------------
-- Quem chama, e quando
-- ---------------------------------------------------------------------------
-- Todo dia às 4h da manhã (03:00 UTC = meia-noite em Brasília; 07:00 UTC = 4h).
-- Fora do turno, e num horário em que ninguém está registrando entrada.
--
-- Dentro de um bloco que não derruba a migração: se o pg_cron não estiver
-- disponível no projeto, a função continua criada e correta, e o aviso diz o
-- que falta fazer. Uma migração que falha inteira por causa do agendador
-- deixaria o banco sem nem a função.
do $$
begin
  create extension if not exists pg_cron;

  perform cron.unschedule('limpar-cadastros-parados')
    where exists (select 1 from cron.job where jobname = 'limpar-cadastros-parados');

  perform cron.schedule(
    'limpar-cadastros-parados',
    '0 7 * * *',
    $limpeza$ select public.limpar_cadastros_parados(); $limpeza$
  );

  raise notice 'limpeza agendada: todo dia as 07:00 UTC (4h de Brasilia)';
exception when others then
  raise warning 'pg_cron indisponivel (%). A funcao public.limpar_cadastros_parados() foi criada, mas NAO esta agendada: habilite pg_cron em Database > Extensions e rode o bloco de agendamento de novo.', sqlerrm;
end;
$$;
