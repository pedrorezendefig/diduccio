-- Conserta o 0039: o porteiro voltava a não conseguir marcar a TAG como
-- aplicada, que é metade do motivo de ele ter acesso a ela.
--
-- O DEFEITO, e ele é uma pegadinha do Postgres:
--
--   Numa política de UPDATE, quando só o `using` é escrito, ele é usado
--   TAMBÉM como `with check`. Não existe "sem `with check`" — existe "`with
--   check` igual ao `using`".
--
-- O 0039 dizia `using (... status = 'Disponivel')` querendo dizer "ele só pode
-- MEXER numa TAG que está Disponivel". Só que a mesma frase passou a valer
-- para a linha NOVA: ao marcar 'Aplicado', a linha resultante deixa de ser
-- 'Disponivel' e a própria política a recusa. O porteiro conseguia corrigir o
-- veículo e não conseguia dizer que colou o adesivo.
--
-- Descoberto pelo scripts/verificar-vagas-e-tags.mjs, com sessão real de
-- porteiro. Nenhum teste de arquivo pegaria: o SQL estava escrito exatamente
-- como eu pretendia — o que estava errado era o que eu achava que ele fazia.
--
-- O CONSERTO: dizer as duas coisas separadamente, que é o que elas sempre
-- foram.
--
--   using       DE ONDE ele pode partir     → só de 'Disponivel'
--   with check  ONDE ele pode chegar        → 'Disponivel' (ficou onde estava,
--                                             veio só corrigir o veículo) ou
--                                             'Aplicado' (colou e marcou)
--   gatilho     e o 0038 fecha o resto: o status ou fica parado, ou vai para
--               'Aplicado'. Nunca para trás.
--
-- 'Solicitado' fica fora das duas pontas: ele não parte de lá (o pedido está
-- com a administração) nem volta para lá (TAG aplicada não desaplica).

drop policy if exists tags_editar on public.tags;
create policy tags_editar on public.tags
  for update to authenticated
  -- A linha COMO ELA ESTÁ no banco.
  using (
    public.eh_administrativo()
    or (public.eh_porteiro() and coalesce(status, '') = 'Disponivel')
  )
  -- A linha COMO ELA FICA depois da alteração.
  with check (
    public.eh_administrativo()
    or (public.eh_porteiro() and coalesce(status, '') in ('Disponivel', 'Aplicado'))
  );
