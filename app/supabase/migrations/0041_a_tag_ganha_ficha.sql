-- A TAG deixa de ser "carro ou moto" e passa a ter ficha.
--
-- DEPENDE DO 0038 (gatilho do status) e do 0040 (a política de UPDATE). O
-- gatilho é REESCRITO aqui por inteiro — leia a nota antes do `create or
-- replace` mais abaixo.
--
-- O que a TAG passa a guardar, e de onde vem cada coisa:
--
--   unidade          já tinha.
--   veículo          já tinha (Carro ou Moto).
--   placa/modelo/cor NÃO ficam aqui. São da VAGA, e é lá que se corrigem —
--                    duplicar aqui criaria duas verdades sobre o mesmo carro,
--                    e a que ninguém atualiza é a que a portaria lê no portão.
--                    A tela puxa da vaga pelo `id_vagas`, que já existia.
--   solicitante      nome e tipo (Proprietário ou Inquilino).
--   custo total      quanto o adesivo custou.
--   data de entrega  quando ele foi (ou será) entregue.
--   observações      o resto.
--
-- A COR não existia em lugar nenhum: `vagas` tinha placa e modelo, e mais nada.
-- Entra ali, e não aqui, pelo mesmo motivo de cima.

-- ---------------------------------------------------------------------------
-- A cor do veículo, na vaga
-- ---------------------------------------------------------------------------
-- Uma por veículo, como placa e modelo já são. A vaga guarda carro e moto na
-- mesma linha desde o 0001, e mudar isso agora seria outra migração inteira.
alter table public.vagas
  add column if not exists cor_carro text,
  add column if not exists cor_moto  text;

-- ---------------------------------------------------------------------------
-- A ficha, na TAG
-- ---------------------------------------------------------------------------
alter table public.tags
  add column if not exists nome_solicitante text,
  add column if not exists tipo_solicitante text,
  -- `numeric`, nunca `float`: dinheiro em ponto flutuante soma errado, e o
  -- erro aparece no fechamento do mês, não na tela.
  add column if not exists custo_total      numeric(10, 2),
  add column if not exists data_entrega     date,
  add column if not exists observacoes      text;

-- `not valid` porque a tabela já tem linhas, e nenhuma delas tem tipo: validar
-- agora derrubaria a migração por causa de dado que existia antes da regra.
-- Linhas NOVAS já entram checadas.
alter table public.tags
  drop constraint if exists tags_tipo_solicitante_valido;
alter table public.tags
  add constraint tags_tipo_solicitante_valido
  check (tipo_solicitante is null or tipo_solicitante in ('Proprietario', 'Inquilino'))
  not valid;

alter table public.tags
  drop constraint if exists tags_custo_nao_negativo;
alter table public.tags
  add constraint tags_custo_nao_negativo
  check (custo_total is null or custo_total >= 0)
  not valid;

-- ---------------------------------------------------------------------------
-- Criar: o porteiro pede, e não precifica
-- ---------------------------------------------------------------------------
-- Custo e data de entrega são da administração. Travar isso só na tela não vale
-- nada: com o próprio token, a pessoa chama a API pelo DevTools.
--
-- No INSERT dá para dizer isso na política, porque o `with check` enxerga a
-- linha nova inteira — é o UPDATE que não enxerga a antiga.
drop policy if exists tags_criar on public.tags;
create policy tags_criar on public.tags
  for insert to authenticated
  with check (
    public.eh_administrativo()
    or (
      public.eh_porteiro()
      and coalesce(status, '') = 'Solicitado'
      and custo_total is null
      and data_entrega is null
    )
  );

-- ---------------------------------------------------------------------------
-- Editar: o status anda para 'Aplicado', e o dinheiro não se mexe
-- ---------------------------------------------------------------------------
-- ATENÇÃO ao `create or replace`: ele é SUBSTITUIÇÃO TOTAL, não acréscimo. O
-- corpo abaixo carrega a regra do status vinda do 0038 DE PROPÓSITO — apagá-la
-- aqui não daria erro nenhum, e o porteiro voltaria a mover o status para onde
-- quisesse, sem nada avisando. Já derrubou produção neste projeto uma vez.
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

  -- Do 0038, e continua valendo: deixar como está é sempre permitido — é o caso
  -- de quem só veio corrigir o veículo. `is distinct from` e não `<>` porque
  -- `status` é nulável, e com `<>` uma troca a partir de nulo daria NULL, o
  -- `if` não entraria, e a troca passaria em silêncio.
  if new.status is distinct from old.status
     and coalesce(new.status, '') <> 'Aplicado' then
    raise exception 'O porteiro so pode marcar a TAG como Aplicado; os outros status sao da administracao.'
      using errcode = '42501';
  end if;

  -- Novo no 0041: o dinheiro e a data de entrega não são dele. Nem para
  -- preencher, nem para apagar.
  if new.custo_total is distinct from old.custo_total
     or new.data_entrega is distinct from old.data_entrega then
    raise exception 'Custo total e data de entrega da TAG sao da administracao.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.porteiro_so_marca_a_tag_aplicada() from public;
revoke execute on function public.porteiro_so_marca_a_tag_aplicada() from anon;

-- O gatilho do 0038 já aponta para esta função e não precisa ser recriado; o
-- `create or replace` acima trocou o corpo por baixo dele. Fica aqui só para o
-- caso de o 0038 não ter rodado.
drop trigger if exists trg_tags_status_so_da_administracao on public.tags;
create trigger trg_tags_status_so_da_administracao
  before update on public.tags
  for each row execute function public.porteiro_so_marca_a_tag_aplicada();
