-- O bloco de notas das Tarefas: um rascunho por pessoa.
--
-- Na reunião a pessoa anota no celular, uma ideia por linha; depois, no
-- computador, passa cada linha para o quadro (0042). O bloco mora no banco e
-- não no navegador justamente por isso: anota num aparelho, lê no outro.
--
-- Diferente do quadro, que é compartilhado, o bloco é PESSOAL. Ninguém mais
-- lê — nem o síndico lê o do auxiliar. Rascunho de reunião tem de tudo, e quem
-- sabe que o chefe lê escreve outra coisa. Por isso a condição de dono está
-- nas quatro políticas, e não só na de leitura: sem ela no UPDATE, um upsert
-- com o `usuario_id` do outro reescreveria o bloco alheio.
--
-- E só a administração: é a única que tem a tela de Tarefas. Um porteiro com
-- linha própria em `usuarios` não ganha um lugar para guardar texto no banco
-- só porque sabe montar a chamada no DevTools.
--
-- O dono vem do token (`app_metadata.usuario_id`, que só a secret key
-- escreve), comparado como TEXTO: `usuario_id::text = ...`, e não o texto do
-- JWT convertido para bigint. Um `usuario_id` estragado no token vira "não é
-- dono" em vez de erro de cast. É a convenção do `nome_atual()` do 0035.
--
-- DEPENDE DO 0015 (eh_administrativo) e do 0035 (convenção de comparar
-- usuario_id como texto); o tocar_updated_at() já existe desde as primeiras
-- migrações.

create table if not exists public.notas_tarefas (
  -- Uma linha por pessoa: a chave é o próprio usuário, e o upsert da tela
  -- (`onConflict: usuario_id`) depende disso. Apagar o usuário apaga o bloco —
  -- rascunho pessoal não tem para quem ficar.
  usuario_id bigint primary key references public.usuarios(id) on delete cascade,
  -- Teto folgado para uma lista de reunião e curto o bastante para a tabela
  -- não virar depósito de arquivo. A tela também limita o campo.
  texto      text not null default '' check (length(texto) <= 20000),
  updated_at timestamptz not null default now()
);

alter table public.notas_tarefas enable row level security;

drop trigger if exists trg_notas_tarefas_updated_at on public.notas_tarefas;
create trigger trg_notas_tarefas_updated_at before update on public.notas_tarefas
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: uma política por comando, todas com a MESMA condição de dono.
-- ---------------------------------------------------------------------------
drop policy if exists notas_tarefas_ler    on public.notas_tarefas;
drop policy if exists notas_tarefas_criar  on public.notas_tarefas;
drop policy if exists notas_tarefas_editar on public.notas_tarefas;
drop policy if exists notas_tarefas_apagar on public.notas_tarefas;

create policy notas_tarefas_ler on public.notas_tarefas
  for select to authenticated
  using (usuario_id::text = (auth.jwt() -> 'app_metadata' ->> 'usuario_id') and public.eh_administrativo());

create policy notas_tarefas_criar on public.notas_tarefas
  for insert to authenticated
  with check (usuario_id::text = (auth.jwt() -> 'app_metadata' ->> 'usuario_id') and public.eh_administrativo());

-- As duas pontas por extenso: numa política de UPDATE, `using` sozinho vale
-- também como `with check` (a lição do 0039/0040). Aqui o `with check` é o que
-- impede trocar o `usuario_id` da própria linha para o de outra pessoa.
create policy notas_tarefas_editar on public.notas_tarefas
  for update to authenticated
  using (usuario_id::text = (auth.jwt() -> 'app_metadata' ->> 'usuario_id') and public.eh_administrativo())
  with check (usuario_id::text = (auth.jwt() -> 'app_metadata' ->> 'usuario_id') and public.eh_administrativo());

create policy notas_tarefas_apagar on public.notas_tarefas
  for delete to authenticated
  using (usuario_id::text = (auth.jwt() -> 'app_metadata' ->> 'usuario_id') and public.eh_administrativo());

revoke all on public.notas_tarefas from anon;
