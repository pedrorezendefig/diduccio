-- Rodar com o app fechado (ver 0028: `add column` conflita com leitura do
-- PostgREST e vira deadlock).
set lock_timeout = '10s';

-- A retirada passa a saber QUAL item saiu, não só quantos.
--
-- O 0028 gravava uma contagem: "saiu 1 volume de 2". Isso basta para dizer que
-- a encomenda não fechou, e não basta para mais nada. Numa segunda retirada, a
-- portaria não tinha como esconder o volume já entregue — mostrava os dois e
-- deixava o porteiro decidir de memória. E o comprovante não sabia dizer a que
-- nota fiscal se referia: "entregue por Fulano às 14h" flutuava sobre a
-- encomenda inteira, valendo igualmente para a caixa que saiu e para a que
-- ficou na prateleira.
--
-- Quem identifica o pacote na prateleira é o número fiscal, impresso na
-- etiqueta. Então é ele a unidade: cada item da retirada aponta para a sua
-- nota, e cada foto aponta para o item que ela retrata.

alter table public.retirada_itens
  add column if not exists id_nota bigint references public.entregas_nf(id);

-- Nula é permitido: encomenda antiga pode não ter nota cadastrada, e nesse caso
-- a linha ainda conta um volume. O que não se pode é entregar a MESMA nota
-- duas vezes — daí o índice parcial, que ignora as nulas.
create unique index if not exists uniq_retirada_itens_nota
  on public.retirada_itens (id_nota) where id_nota is not null;

alter table public.entregas_foto
  add column if not exists id_nota bigint references public.entregas_nf(id);

create index if not exists idx_entregas_foto_id_nota on public.entregas_foto (id_nota);

-- ---------------------------------------------------------------------------
-- A gravação passa a receber itens, e não contagens
-- ---------------------------------------------------------------------------
-- `p_parciais` sai de cena: quais encomendas ficam parciais deixa de ser
-- informação enviada e passa a ser DEDUZIDA — é toda encomenda que teve item
-- saindo e não está na lista das que fecham. Dado que dá para deduzir e mesmo
-- assim é enviado é dado que uma hora chega errado.
--
-- `volumes_retirados` também passa a ser contado a partir de `retirada_itens`,
-- em vez de somado a cada retirada: soma acumulada e lista de itens são duas
-- fontes para o mesmo fato, e elas divergem no primeiro erro.
drop function if exists public.registrar_retirada(bigint,text,text,bigint,text,text,text,bigint[],text,jsonb);

create or replace function public.registrar_retirada(
  p_id_unidade         bigint,
  p_retirado_por_nome  text,
  p_retirado_por_cpf   text,
  p_id_morador         bigint,
  p_via                text,
  p_assinatura_caminho text,
  p_observacao         text,
  -- As encomendas que FECHAM nesta retirada.
  p_entregas           bigint[],
  p_entregue_por       text,
  -- Todo item que saiu: [{"id_entrega": 9, "id_nota": 4}]. `id_nota` pode ser
  -- nulo em encomenda sem nota cadastrada.
  p_itens              jsonb default '[]'::jsonb
) returns bigint
language plpgsql
security invoker
set search_path = public as $$
declare
  nova_id     bigint;
  atualizadas int;
  quantas     int := coalesce(array_length(p_entregas, 1), 0);
  itens       jsonb := coalesce(p_itens, '[]'::jsonb);
  quantos_it  int := jsonb_array_length(itens);
  abertas     bigint[];
begin
  if coalesce(btrim(p_assinatura_caminho), '') = '' then
    raise exception 'A retirada exige assinatura.' using errcode = 'check_violation';
  end if;

  -- Assinatura sem nada ligado e sem explicação é um comprovante que não prova
  -- nada — e é pior que não existir, porque parece registro.
  if quantas = 0 and quantos_it = 0 and coalesce(btrim(p_observacao), '') = '' then
    raise exception 'Sem encomenda marcada, a observação é obrigatória.'
      using errcode = 'check_violation';
  end if;

  insert into public.retiradas (
    id_unidade, retirado_por_nome, retirado_por_cpf, id_morador,
    via, assinatura_caminho, observacao, entregue_por
  ) values (
    p_id_unidade,
    btrim(p_retirado_por_nome),
    regexp_replace(coalesce(p_retirado_por_cpf, ''), '\D', '', 'g'),
    p_id_morador,
    p_via,
    p_assinatura_caminho,
    nullif(btrim(coalesce(p_observacao, '')), ''),
    p_entregue_por
  ) returning id into nova_id;

  -- Os itens primeiro: é o índice único em `id_nota` que recusa entregar a
  -- mesma nota duas vezes, e ele precisa disparar antes de qualquer mudança de
  -- status. Como tudo roda numa transação, a recusa desfaz até a retirada.
  if quantos_it > 0 then
    insert into public.retirada_itens (id_retirada, id_entrega, id_nota, volumes)
    select nova_id, (e->>'id_entrega')::bigint, nullif(e->>'id_nota', '')::bigint, 1
      from jsonb_array_elements(itens) as e;
  end if;

  if quantas > 0 then
    -- `id_retirada is null` no where: impede roubar encomenda que já saiu por
    -- outra retirada. Duas telas dando baixa no mesmo pacote ao mesmo tempo é
    -- exatamente o caso em que o registro passaria a mentir — e a contagem
    -- abaixo transforma isso em erro, e não em baixa silenciosa pela metade.
    update public.entregas
       set id_retirada  = nova_id,
           status       = 'Entregue',
           data_saida   = now(),
           entregue_por = p_entregue_por,
           nome_morador = btrim(p_retirado_por_nome),
           cpf_morador  = regexp_replace(coalesce(p_retirado_por_cpf, ''), '\D', '', 'g'),
           volumes_retirados = (
             select count(*) from public.retirada_itens ri where ri.id_entrega = entregas.id
           )
     where id = any(p_entregas)
       and id_retirada is null;

    get diagnostics atualizadas = row_count;
    if atualizadas <> quantas then
      raise exception 'Alguma encomenda já foi retirada ou não existe (% de % atualizadas).',
        atualizadas, quantas using errcode = 'check_violation';
    end if;
  end if;

  -- As que tiveram item saindo e NÃO fecham: continuam abertas na portaria.
  select coalesce(array_agg(distinct (e->>'id_entrega')::bigint), '{}')
    into abertas
    from jsonb_array_elements(itens) as e
   where not ((e->>'id_entrega')::bigint = any(coalesce(p_entregas, '{}')));

  if array_length(abertas, 1) > 0 then
    update public.entregas
       set status = 'Parcialmente entregue',
           volumes_retirados = (
             select count(*) from public.retirada_itens ri where ri.id_entrega = entregas.id
           )
     where id = any(abertas)
       and id_retirada is null;

    get diagnostics atualizadas = row_count;
    if atualizadas <> array_length(abertas, 1) then
      raise exception 'Alguma encomenda parcial já foi retirada ou não existe (% de %).',
        atualizadas, array_length(abertas, 1) using errcode = 'check_violation';
    end if;
  end if;

  return nova_id;
end $$;

-- EXECUTE nasce aberto a PUBLIC, e PUBLIC inclui anon. Já foi esquecido duas
-- vezes neste projeto — e `revoke from anon` sozinho não resolve, porque o
-- privilégio vem de PUBLIC.
revoke execute on function public.registrar_retirada(bigint,text,text,bigint,text,text,text,bigint[],text,jsonb) from public;
revoke execute on function public.registrar_retirada(bigint,text,text,bigint,text,text,text,bigint[],text,jsonb) from anon;
grant  execute on function public.registrar_retirada(bigint,text,text,bigint,text,text,text,bigint[],text,jsonb) to authenticated;
