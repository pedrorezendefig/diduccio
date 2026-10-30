-- O porteiro só encosta na TAG quando ela está 'Disponivel'.
--
-- DEPENDE DO 0037 (que criou a `tags_editar` aberta ao porteiro) e do 0038
-- (que criou o gatilho do status). Rode os dois antes deste.
--
-- O caminho da TAG, agora inteiro, com a portaria em duas pontas e fora do
-- meio:
--
--   Solicitado  o porteiro PEDE (0038, no insert). Depois disso ele NÃO
--               encosta mais: o pedido está com a administração, e mexer nele
--               enquanto isso é mexer no que já foi pedido.
--   Disponivel  a administração diz que o adesivo chegou. É AQUI, e só aqui,
--               que a TAG volta para as mãos do porteiro.
--   Aplicado    ele colou e marcou. Acabou — nem ele desfaz.
--
-- Por que no `using` e não no gatilho: numa política de UPDATE o `using` é
-- avaliado contra a linha ANTIGA, que é exatamente a pergunta aqui — "em que
-- estado ela está AGORA?". O gatilho do 0038 responde a outra pergunta, sobre
-- a linha nova: "para onde o status está indo?". As duas juntas fecham o
-- caminho, e nenhuma delas faz o trabalho da outra:
--
--   using (0039)     de onde ele pode partir  → só de 'Disponivel'
--   gatilho (0038)   para onde ele pode ir    → só para 'Aplicado', ou parado
--
-- Sem o 0039, ele corrigiria o veículo de uma TAG ainda 'Solicitado'. Sem o
-- 0038, ele partiria de 'Disponivel' e chegaria em qualquer lugar.

drop policy if exists tags_editar on public.tags;
create policy tags_editar on public.tags
  for update to authenticated
  using (
    public.eh_administrativo()
    -- `status` aqui é o da linha COMO ELA ESTÁ no banco, antes da alteração.
    or (public.eh_porteiro() and coalesce(status, '') = 'Disponivel')
  );
