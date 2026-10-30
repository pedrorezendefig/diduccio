-- Na portaria, o porteiro registra a visita do entregador — e só isso.
--
-- Regra pedida: nessa tela ele pode CRIAR registro, e não pode editar nem
-- apagar. O problema é que "dar saída" no entregador é um UPDATE na mesma linha
-- da chegada, e é trabalho dele: sem isso a portaria não fecha a visita.
--
-- Então a regra vira, exatamente:
--
--   entregadores            (o cadastro)  → cria. Não edita, não apaga.
--   entregadores_chegadas   (a visita)    → cria, e fecha a que abriu.
--                                           Nada além disso.
--
-- O 0015 dava UPDATE inteiro ao porteiro nas duas tabelas. Isso permitia
-- renomear um entregador já cadastrado e, na chegada, trocar unidade de
-- destino, veículo, placa, quem liberou e até o horário de entrada — depois do
-- fato, sem deixar rastro. Numa tabela que serve para saber quem entrou no
-- condomínio, e quando, isso é o registro contando outra história.
--
-- Apagar já era só do síndico desde o 0015, nas duas tabelas.

-- ---------------------------------------------------------------------------
-- 1. O cadastro de entregadores deixa de ser editável pelo porteiro
-- ---------------------------------------------------------------------------
drop policy if exists entregadores_editar on public.entregadores;
create policy entregadores_editar on public.entregadores
  for update to authenticated
  using (public.eh_administrativo());

-- ---------------------------------------------------------------------------
-- 2. Na chegada, o porteiro só consegue fechar a visita
-- ---------------------------------------------------------------------------
-- A política de UPDATE continua aceitando o porteiro — ela é quem permite o
-- "dar saída". Quem restringe o QUE ele altera é o gatilho abaixo.
--
-- Por que gatilho e não política: RLS decide por LINHA, nunca por coluna. Não
-- existe `for update (horario_saida)` numa policy. E GRANT de coluna não serve
-- aqui: privilégio de coluna é por papel do banco, e todos os cargos deste
-- sistema compartilham o mesmo `authenticated` — o cargo vive no JWT, não numa
-- role. Um gatilho é o único lugar onde dá para comparar o valor velho com o
-- novo e recusar a diferença.
create or replace function public.porteiro_so_fecha_a_visita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alterados text;
begin
  -- Administração passa direto: editar um registro errado é trabalho dela.
  if public.eh_administrativo() then
    return new;
  end if;

  if public.eh_porteiro() then
    -- Uma saída já registrada não volta atrás. Sem isto, o porteiro poderia
    -- regravar o horário de saída quantas vezes quisesse — e "às 19:06" viraria
    -- o que fosse conveniente na hora de conferir.
    if old.horario_saida is not null then
      raise exception 'Esta visita já foi encerrada. Só a administração altera uma saída registrada.'
        using errcode = 'check_violation';
    end if;

    if new.horario_saida is null then
      raise exception 'O porteiro só pode encerrar a visita, não reabri-la.'
        using errcode = 'check_violation';
    end if;

    -- Toda coluna que não seja `horario_saida` tem de sair igual como entrou.
    --
    -- Compara a LINHA INTEIRA em jsonb, em vez de listar coluna por coluna. A
    -- primeira versão desta função enumerava os campos à mão e esquecia três —
    -- `created_by`, `created_at` e `updated_at`. Lista escrita à mão protege o
    -- que existia no dia em que foi escrita: a coluna acrescentada no ano que
    -- vem nasceria aberta, sem ninguém notar. Aqui é o contrário — coluna nova
    -- já entra travada, e liberá-la exige mexer nesta linha de propósito.
    --
    -- `updated_at` fica de fora porque o gatilho `tocar_updated_at` já a
    -- carimbou antes deste rodar (os dois são BEFORE UPDATE, e a ordem é
    -- alfabética: trg_e... vem antes de trg_p...). Compará-la reprovaria toda
    -- saída legítima.
    select string_agg(chave, ', ' order by chave) into alterados
      from jsonb_each(to_jsonb(new) - 'horario_saida' - 'updated_at') as campo(chave, valor)
     where campo.valor is distinct from (to_jsonb(old) -> campo.chave);

    if alterados is not null then
      raise exception 'O porteiro só registra a saída. Não pode alterar: %', alterados
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  -- Nenhum outro cargo chega aqui: a política de UPDATE do 0015 só aceita
  -- administrativo e porteiro. Se algum dia aceitar mais alguém, este `raise`
  -- é o que impede a mudança de passar despercebida.
  raise exception 'Seu cargo não altera chegadas de entregador.'
    using errcode = 'check_violation';
end $$;

-- `security definer` com search_path fixo: a função consulta `eh_porteiro()` e
-- `eh_administrativo()`, que leem o cargo do JWT. Sem o search_path fixo, o
-- schema em que esses nomes são resolvidos viria de quem disparou o gatilho.
revoke execute on function public.porteiro_so_fecha_a_visita() from public;
revoke execute on function public.porteiro_so_fecha_a_visita() from anon;

drop trigger if exists trg_porteiro_so_fecha_a_visita on public.entregadores_chegadas;
create trigger trg_porteiro_so_fecha_a_visita
  before update on public.entregadores_chegadas
  for each row execute function public.porteiro_so_fecha_a_visita();
