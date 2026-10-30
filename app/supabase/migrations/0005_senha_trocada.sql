-- Marca de que o usuário já substituiu a senha provisória da migração.
--
-- As 5 senhas iniciais foram geradas por script e passaram por um arquivo em
-- texto puro no disco. Enquanto não forem trocadas, não valem como senha
-- definitiva — a tela de login força a troca no primeiro acesso.
alter table public.usuarios
  add column senha_trocada boolean not null default false;

-- O usuário marca a PRÓPRIA linha, identificada pelo usuario_id que a secret
-- key gravou no app_metadata ao criar a conta. Não alcança a linha de outra
-- pessoa, e usuarios_editar (só síndico) continua valendo para todo o resto.
--
-- A marca não pode viver no user_metadata do Auth: aquele campo o próprio
-- usuário escreve, e ele se marcaria como já-trocada sem trocar nada.
create policy usuarios_marcar_propria_senha on public.usuarios
  for update to authenticated
  using      (id = (auth.jwt() -> 'app_metadata' ->> 'usuario_id')::bigint)
  with check (id = (auth.jwt() -> 'app_metadata' ->> 'usuario_id')::bigint);
