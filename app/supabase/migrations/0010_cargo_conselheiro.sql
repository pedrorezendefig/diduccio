-- SUPERSEDIDO PELO 0015. Não rode este arquivo.
--
-- Tudo que está aqui — a função `eh_conselheiro()`, as políticas e a view
-- `receitas_reservas` — foi absorvido pelo 0015, que trata os cinco cargos num
-- lugar só. A view ganhou lá um WHERE que este arquivo não tem, e sem ele o
-- porteiro leria a receita do condomínio pela API.
--
-- Mantido no histórico porque já foi aplicado ao banco uma vez.
--
-- Cargo Conselheiro: só leitura, e só de assembleias e dos números do gráfico.
--
-- As políticas do 0004 liberam SELECT para "qualquer autenticado" (`using
-- (true)`), então um conselheiro leria tudo — inclusive CPF de morador — sem
-- que ninguém tivesse decidido isso. Aqui elas são refeitas excluindo o cargo.
--
-- Esconder os cards na tela NÃO seria suficiente: com o próprio token, o
-- conselheiro consultaria a API direto pelo DevTools. Quem nega é o banco; a
-- tela só reflete o que já está negado.

create or replace function public.eh_conselheiro()
returns boolean language sql stable as $$
  select translate(lower(public.cargo_atual()),
                   'áàâãéèêíìîóòôõúùûç',
                   'aaaaeeeiiioooouuuc') like '%conselheiro%';
$$;

-- ---------------------------------------------------------------------------
-- Refaz as políticas de leitura excluindo o conselheiro
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'unidades','moradores','vagas','tags',
    'churrasqueira','festas','piscina','agendamentos','mudancas','compras',
    'compras_produtos','confirmacao','entregas','entregadores',
    'entregadores_chegadas','entregas_foto','entregas_nf',
    'entregas_recebimento','uploads_festas','uploads_compras',
    'uploads_churrasqueira','uploads_piscina','notas','assinatura','multas','log'
  ] loop
    execute format('drop policy if exists %I on public.%I', t||'_ler', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (not public.eh_conselheiro())',
      t||'_ler', t);
  end loop;
end $$;

-- Assembleias é a exceção: o conselheiro precisa ler. Segue liberada para todo
-- autenticado, exatamente como estava.
-- (nenhuma alteração necessária em assembleias_ler)

-- O conselheiro também não escreve em lugar nenhum. As políticas de insert e
-- update do 0004 dizem `with check (true)` para autenticado — refeitas aqui.
do $$
declare t text;
begin
  foreach t in array array[
    'churrasqueira','festas','piscina','agendamentos','mudancas','compras',
    'compras_produtos','confirmacao','entregas','entregadores',
    'entregadores_chegadas','entregas_foto','entregas_nf',
    'entregas_recebimento','assembleias','uploads_festas','uploads_compras',
    'uploads_churrasqueira','uploads_piscina','notas','assinatura','multas'
  ] loop
    execute format('drop policy if exists %I on public.%I', t||'_criar', t);
    execute format('drop policy if exists %I on public.%I', t||'_editar', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (not public.eh_conselheiro())',
      t||'_criar', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (not public.eh_conselheiro())',
      t||'_editar', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Os números do Dashboard, sem dado pessoal
-- ---------------------------------------------------------------------------

-- O gráfico de receita soma `valor_taxa` das reservas pagas
-- (Dashboard.jsx:124), e essas linhas carregam cpf, rg, contato e nome de
-- morador. Esta view expõe só o que o gráfico precisa — assim o conselheiro vê
-- os valores sem enxergar quem reservou.
create or replace view public.receitas_reservas
with (security_invoker = off) as
  select data_reserva, valor_taxa, pago, 'churrasqueira'::text as origem
    from public.churrasqueira
  union all
  select data_reserva, valor_taxa, pago, 'festas'::text
    from public.festas;

grant select on public.receitas_reservas to authenticated;
