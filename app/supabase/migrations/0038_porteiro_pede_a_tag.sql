-- O porteiro passa a PEDIR a TAG. Quem decide o status continua sendo a
-- administração.
--
-- DEPENDE DO 0037, que lhe deu SELECT e UPDATE em `tags`.
--
-- O caminho da TAG, e onde a portaria entra em cada ponta:
--
--   Solicitado  o porteiro PEDE. É o único status com que ele consegue criar.
--   Disponivel  a administração diz que a TAG física chegou. Não é dele.
--   Aplicado    o porteiro COLA a TAG no carro e marca. É dele, e faz sentido
--               que seja: ele é quem está no portão com o adesivo na mão.
--
-- Então a regra do UPDATE não é "não mexe no status" — é "só anda para
-- Aplicado". Ele não volta uma TAG aplicada para Solicitado e não se dá
-- Disponivel, que é a administração dizendo que comprou o adesivo.
--
-- Isso NÃO cabe numa política. RLS decide por LINHA, e uma política de UPDATE
-- não enxerga o valor ANTIGO da coluna — o `with check` só vê a linha nova, e
-- sem o valor antigo não dá para saber se o status ANDOU ou já estava ali.
-- Comparar o velho com o novo é trabalho de gatilho. É o mesmo desenho do
-- `porteiro_so_atualiza_o_veiculo()` do 0035, e pelo mesmo motivo.

-- ---------------------------------------------------------------------------
-- Criar: sim, e nascendo 'Solicitado'
-- ---------------------------------------------------------------------------
drop policy if exists tags_criar on public.tags;
create policy tags_criar on public.tags
  for insert to authenticated
  with check (
    public.eh_administrativo()
    -- `coalesce` porque `status` é nulável: sem ele, uma TAG com status nulo
    -- passaria pelo `and` com resultado NULL, que o RLS trata como falso — mas
    -- por acidente, e não por regra escrita. Assim está dito.
    or (public.eh_porteiro() and coalesce(status, '') = 'Solicitado')
  );

-- ---------------------------------------------------------------------------
-- Editar: sim, e o status só anda para 'Aplicado'
-- ---------------------------------------------------------------------------
create or replace function public.porteiro_so_marca_a_tag_aplicada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A administração passa direto. Quem chega aqui sem ser administrativo só
  -- pode ser porteiro: são os únicos dois grupos com UPDATE nesta tabela.
  if public.eh_administrativo() then
    return new;
  end if;

  -- Deixar como está é sempre permitido: é o caso de quem só veio corrigir o
  -- veículo. `is distinct from` e não `<>` porque `status` é nulável — com
  -- `<>`, trocar um status nulo por outro daria NULL, o `if` não entraria, e a
  -- troca passaria em silêncio.
  if new.status is distinct from old.status
     and coalesce(new.status, '') <> 'Aplicado' then
    raise exception 'O porteiro so pode marcar a TAG como Aplicado; os outros status sao da administracao.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.porteiro_so_marca_a_tag_aplicada() from public;
revoke execute on function public.porteiro_so_marca_a_tag_aplicada() from anon;

drop trigger if exists trg_tags_status_so_da_administracao on public.tags;
create trigger trg_tags_status_so_da_administracao
  before update on public.tags
  for each row execute function public.porteiro_so_marca_a_tag_aplicada();
