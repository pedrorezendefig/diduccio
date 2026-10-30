-- Quem liberou a entrada, quem registrou a saída, e o serviço do próprio prédio.
--
-- DEPENDE DO 0034: usa a coluna `tipo` de `entregadores_chegadas` e as colunas
-- de veículo de `entregadores`. Rode o 0034 primeiro.
--
-- Três coisas, e uma delas conserta um defeito que estava calado:
--
--  1. A tela precisa mostrar o NOME DO PORTEIRO que liberou e o do que deu
--     saída. O primeiro já era gravado em `created_by` — pelo cliente, o que
--     quer dizer que a coluna diz o que o navegador quis dizer. O segundo não
--     existia. Agora os dois são carimbados AQUI, a partir do token.
--
--  2. Prestador de serviço do próprio condomínio não tem unidade de destino
--     nem morador que autorize. Ganha uma marca própria em vez de um bloco em
--     branco, que seria indistinguível de "esqueceram de preencher".
--
--  3. O DEFEITO: desde o 0026 o porteiro não edita `entregadores`. Só que é
--     ele quem registra a chegada — então "o cadastro guarda o último veículo
--     desta pessoa" nunca funcionou para o único cargo que usa a tela. O
--     UPDATE era recusado pela política e o resultado, ignorado pelo cliente.
--     Aqui ele volta a poder, restrito às colunas do veículo: nome e CPF
--     continuam fora do alcance dele, que era o ponto do 0026.

-- ---------------------------------------------------------------------------
-- Quem está com o token na mão
-- ---------------------------------------------------------------------------
-- Mesma fonte do `meu_perfil()` do 0016: o `usuario_id` do app_metadata, que só
-- a secret key escreve. Compara `id::text` em vez de converter o texto do JWT
-- para bigint — um `usuario_id` estragado viraria erro de cast dentro de um
-- gatilho, derrubando a gravação inteira por um campo que é só rótulo.
create or replace function public.nome_atual()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select u.nome
      from public.usuarios u
     where u.id::text = (auth.jwt() -> 'app_metadata' ->> 'usuario_id')
  ), '');
$$;

-- O Postgres concede EXECUTE a PUBLIC por default, e PUBLIC inclui `anon`.
-- Revogar de `anon` sem revogar de PUBLIC não revoga nada.
revoke execute on function public.nome_atual() from public;
grant  execute on function public.nome_atual() to authenticated;

-- ---------------------------------------------------------------------------
-- As colunas novas
-- ---------------------------------------------------------------------------
alter table public.entregadores_chegadas
  add column if not exists saida_por     text,
  -- Serviço do próprio condomínio: manutenção do elevador, jardinagem, obra da
  -- administração. Não há apartamento de destino nem morador que libere.
  add column if not exists do_condominio boolean not null default false;

-- A marca só faz sentido em prestador de serviço. Sem esta trava, uma tela
-- futura poderia gravar "entregador do condomínio", e a linha ficaria sem
-- destino sem que nada explicasse por quê.
alter table public.entregadores_chegadas
  drop constraint if exists chegadas_interno_e_servico;
alter table public.entregadores_chegadas
  add constraint chegadas_interno_e_servico
  check (not do_condominio or tipo = 'SERVICO');

-- ---------------------------------------------------------------------------
-- O carimbo da entrada
-- ---------------------------------------------------------------------------
-- `created_by` vinha do cliente. Para uma coluna que a tela agora EXIBE como
-- "quem liberou", isso é fraco demais: qualquer um com o próprio token monta a
-- requisição no DevTools e assina a entrada com o nome de outro porteiro.
--
-- O `coalesce` preserva o valor do cliente quando o token não traz
-- `usuario_id` — é o caso das contas de teste dos scripts de verificação, e
-- perder o rastro por causa disso seria pior do que aceitá-lo.
create or replace function public.carimbar_quem_registrou()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := coalesce(nullif(public.nome_atual(), ''), new.created_by);
  return new;
end $$;

revoke execute on function public.carimbar_quem_registrou() from public;
revoke execute on function public.carimbar_quem_registrou() from anon;

drop trigger if exists trg_carimbar_quem_registrou on public.entregadores_chegadas;
create trigger trg_carimbar_quem_registrou
  before insert on public.entregadores_chegadas
  for each row execute function public.carimbar_quem_registrou();

-- ---------------------------------------------------------------------------
-- O carimbo da saída
-- ---------------------------------------------------------------------------
-- SUBSTITUI a função do 0026 POR INTEIRO. `create or replace function` não
-- acrescenta: troca o corpo todo. Copiar um corpo antigo e esquecer um ramo já
-- derrubou a assinatura do porteiro neste projeto — por isso o que está abaixo
-- é o corpo do 0026 na íntegra, mais o carimbo da saída.
create or replace function public.porteiro_so_fecha_a_visita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alterados text;
begin
  -- Antes de qualquer permissão: quem fecha a visita fica gravado, e quem
  -- grava é o banco. Só na transição de aberta para fechada — reabrir e fechar
  -- de novo é coisa da administração, e o nome de quem fechou de verdade não
  -- deve ser sobrescrito por uma correção posterior.
  if new.horario_saida is not null and old.horario_saida is null then
    new.saida_por := coalesce(nullif(public.nome_atual(), ''), new.saida_por);
  end if;

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
    --
    -- `saida_por` fica de fora porque o bloco no topo desta função acabou de
    -- escrevê-la — e escreveu do token, não do que veio na requisição. Abrir a
    -- coluna aqui não abre nada: o valor do cliente já foi descartado.
    select string_agg(chave, ', ' order by chave) into alterados
      from jsonb_each(to_jsonb(new) - 'horario_saida' - 'saida_por' - 'updated_at') as campo(chave, valor)
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

revoke execute on function public.porteiro_so_fecha_a_visita() from public;
revoke execute on function public.porteiro_so_fecha_a_visita() from anon;

-- O gatilho do 0026 continua valendo; recriado aqui só para o caso de esta
-- migração rodar num banco onde o 0026 não chegou a criar o gatilho.
drop trigger if exists trg_porteiro_so_fecha_a_visita on public.entregadores_chegadas;
create trigger trg_porteiro_so_fecha_a_visita
  before update on public.entregadores_chegadas
  for each row execute function public.porteiro_so_fecha_a_visita();

-- ---------------------------------------------------------------------------
-- O cadastro guarda o último veículo — inclusive quando quem registra é o
-- porteiro
-- ---------------------------------------------------------------------------
-- O 0026 fechou o UPDATE de `entregadores` para o porteiro, e a razão era boa:
-- ele podia RENOMEAR alguém já cadastrado. Mas a mesma trava impede o que a
-- tela precisa fazer toda vez — guardar o veículo desta entrada, para reconhecer
-- a moto na próxima e perguntar se continua sendo ela.
--
-- Então a política reabre, e o gatilho abaixo é quem diz o quanto: só as quatro
-- colunas do veículo. `nome` e `cpf` seguem fora do alcance do porteiro, que
-- era exatamente o ponto do 0026.
drop policy if exists entregadores_editar on public.entregadores;
create policy entregadores_editar on public.entregadores
  for update to authenticated
  using (public.eh_administrativo() or public.eh_porteiro());

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
             to_jsonb(new) - 'veiculo' - 'placa' - 'tipo' - 'empresa' - 'updated_at'
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

revoke execute on function public.porteiro_so_atualiza_o_veiculo() from public;
revoke execute on function public.porteiro_so_atualiza_o_veiculo() from anon;

drop trigger if exists trg_porteiro_so_atualiza_o_veiculo on public.entregadores;
create trigger trg_porteiro_so_atualiza_o_veiculo
  before update on public.entregadores
  for each row execute function public.porteiro_so_atualiza_o_veiculo();

-- A tela busca "quem está dentro" e agrupa por bloco para o mapa.
create index if not exists idx_chegadas_bloco on public.entregadores_chegadas (bloco);
