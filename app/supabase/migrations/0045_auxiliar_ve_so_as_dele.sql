-- O auxiliar cuida só das tarefas dele; o síndico e o dev, de todas.
--
-- DEPENDE DO 0015 (eh_sindico, eh_auxiliar) e do 0042 (a tabela e as
-- políticas que esta migração substitui).
--
-- No 0042 o quadro era um só, compartilhado pela administração inteira. O
-- pedido mudou: o síndico continua vendo tudo, inclusive o que é do auxiliar;
-- o auxiliar vê só o que é dele; e passa a poder apagar o que é dele.
--
-- "Dele" é o RESPONSÁVEL, e não quem criou. É o que faz o síndico conseguir
-- entregar trabalho: ele cria a tarefa com o auxiliar como responsável, e ela
-- aparece no quadro do auxiliar. Quem criou nem dá para usar aqui: `created_by`
-- é um nome, não um id.
--
-- O dev entra pelo `eh_sindico()`, que já o inclui desde o 0015.
--
-- O `usuario_id` do token é comparado como TEXTO, como no `nome_atual()` do
-- 0035: um valor estragado no token vira "não é dono", nunca um erro de cast
-- que derrubaria a consulta inteira.
--
-- A EDIÇÃO repete a regra no `with check` de propósito. Assim a linha nova
-- também precisa ser do auxiliar: passar a tarefa para o síndico é recusado,
-- em vez de a tarefa sumir da tela de quem acabou de mudá-la. (No UPDATE,
-- `using` sozinho valeria também como `with check` — a lição do 0039/0040 é
-- escrever as duas pontas.)
--
-- Tarefa sem responsável (o usuário foi apagado, `on delete set null`) fica só
-- para o síndico e o dev, que são quem pode redistribuí-la.

drop policy if exists tarefas_ler on public.tarefas;
drop policy if exists tarefas_criar on public.tarefas;
drop policy if exists tarefas_editar on public.tarefas;
drop policy if exists tarefas_apagar on public.tarefas;

create policy tarefas_ler on public.tarefas
  for select to authenticated
  using (public.eh_sindico() or (public.eh_auxiliar() and responsavel_id::text = (auth.jwt() -> 'app_metadata' ->> 'usuario_id')));

create policy tarefas_criar on public.tarefas
  for insert to authenticated
  with check (public.eh_sindico() or (public.eh_auxiliar() and responsavel_id::text = (auth.jwt() -> 'app_metadata' ->> 'usuario_id')));

create policy tarefas_editar on public.tarefas
  for update to authenticated
  using (public.eh_sindico() or (public.eh_auxiliar() and responsavel_id::text = (auth.jwt() -> 'app_metadata' ->> 'usuario_id')))
  with check (public.eh_sindico() or (public.eh_auxiliar() and responsavel_id::text = (auth.jwt() -> 'app_metadata' ->> 'usuario_id')));

create policy tarefas_apagar on public.tarefas
  for delete to authenticated
  using (public.eh_sindico() or (public.eh_auxiliar() and responsavel_id::text = (auth.jwt() -> 'app_metadata' ->> 'usuario_id')));
