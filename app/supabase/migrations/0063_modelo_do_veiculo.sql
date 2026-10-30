-- O modelo do veículo: como ele é, em texto livre.
--
-- "Moto" e a placa não bastam para o porteiro reconhecer quem está estacionado
-- lá dentro. "Honda CG vermelha, baú do iFood" basta. Vale para todo tipo de
-- entrada — entregador, motorista, visitante, temporada e serviço — e não é
-- obrigatório.
--
-- Mora nos dois lugares, como veículo e placa (0034): na ENTRADA, que é o
-- registro do que aconteceu, e no CADASTRO, que guarda o da última vez para a
-- tela sugerir na próxima e perguntar se continua sendo o mesmo.
--
-- RODE ANTES DO DEPLOY DO APP: a tela nova manda `modelo` em toda gravação, e
-- sem a coluna o PostgREST recusa a entrada inteira.

alter table public.entregadores
  add column if not exists modelo text;
alter table public.entregadores_chegadas
  add column if not exists modelo text;

-- Texto livre, mas não um livro: o campo da tela corta em 120.
alter table public.entregadores
  drop constraint if exists entregadores_modelo_tamanho;
alter table public.entregadores
  add constraint entregadores_modelo_tamanho check (char_length(modelo) <= 120);
alter table public.entregadores_chegadas
  drop constraint if exists chegadas_modelo_tamanho;
alter table public.entregadores_chegadas
  add constraint chegadas_modelo_tamanho check (char_length(modelo) <= 120);

-- ---------------------------------------------------------------------------
-- O porteiro passa a poder atualizar o modelo no cadastro
-- ---------------------------------------------------------------------------
-- O gatilho do 0035 libera uma lista curta de colunas, e coluna nova nasce
-- travada — foi feito assim de propósito. Sem incluir `modelo` aqui, a tela
-- mandaria o modelo junto com o veículo e o UPDATE inteiro seria recusado.
--
-- Na entrada não há o que abrir: o porteiro só INSERE a chegada, e o gatilho
-- de UPDATE dela (0026/0035) só deixa fechar a visita.
create or replace function public.porteiro_so_atualiza_o_veiculo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alterados text;
begin
  if public.eh_administrativo() then
    return new;
  end if;

  if public.eh_porteiro() then
    -- Mesma técnica do gatilho da chegada: compara a linha inteira e libera
    -- uma lista curta. Coluna nova nasce travada, e abri-la exige mexer aqui.
    select string_agg(chave, ', ' order by chave) into alterados
      from jsonb_each(
             to_jsonb(new) - 'veiculo' - 'placa' - 'modelo' - 'tipo' - 'empresa' - 'updated_at'
           ) as campo(chave, valor)
     where campo.valor is distinct from (to_jsonb(old) -> campo.chave);

    if alterados is not null then
      raise exception 'O porteiro só atualiza o veículo do cadastro. Não pode alterar: %', alterados
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  raise exception 'Seu cargo não altera o cadastro de quem entra.'
    using errcode = 'check_violation';
end $$;

-- Função de gatilho não se chama de fora: fechada como o 0061 deixou.
revoke all on function public.porteiro_so_atualiza_o_veiculo() from public, anon, authenticated;
