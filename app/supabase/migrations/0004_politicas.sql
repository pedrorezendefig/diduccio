-- SUPERSEDIDO PELO 0015. Não rode este arquivo.
--
-- O modelo de cargos mudou: o auxiliar passou a escrever em tudo (menos
-- usuários), o porteiro deixou de ler o sistema inteiro, e `usuarios` virou
-- exclusiva do dev. O 0015 apaga todas as políticas antes de criar as suas, de
-- modo que rodar este arquivo depois dele reabriria o acesso antigo.
--
-- Mantido no histórico porque já foi aplicado ao banco uma vez.
--
-- Políticas de RLS por cargo.
--
-- O RLS já está ligado em todas as 29 tabelas desde o 0001. Sem política,
-- tabela nega tudo — que é o padrão seguro. Este arquivo abre o mínimo.

-- ---------------------------------------------------------------------------
-- Identidade
-- ---------------------------------------------------------------------------

-- Lê o cargo do app_metadata do JWT. Usar app_metadata e NÃO user_metadata é
-- essencial: o primeiro só é escrito pela secret key, o segundo o próprio
-- usuário consegue editar. Um usuário capaz de se promover a síndico anularia
-- todas as políticas abaixo.
create or replace function public.cargo_atual()
returns text language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'cargo', '');
$$;

-- Compara sem acento de propósito. O cargo gravado na planilha é "Sindico",
-- sem acento, mas o app escreve "Síndico" com acento em outros lugares
-- (SelecaoUsuario.jsx:44). Um ilike '%síndico%' não casaria com "Sindico" e o
-- síndico entraria no sistema sem conseguir escrever nada — falha silenciosa e
-- difícil de diagnosticar, porque o login funcionaria normalmente.
create or replace function public.eh_sindico()
returns boolean language sql stable as $$
  select public.cargo_atual() = 'Desenvolvedor'
      or translate(lower(public.cargo_atual()),
                   'áàâãéèêíìîóòôõúùûç',
                   'aaaaeeeiiioooouuuc') like '%sindico%';
$$;

-- ---------------------------------------------------------------------------
-- usuarios: caso à parte, tratado antes de tudo
-- ---------------------------------------------------------------------------

-- Esta tabela guarda senha_hash. Liberar leitura para "qualquer autenticado"
-- entregaria os hashes dos 5 usuários a qualquer conta logada — inclusive à do
-- porteiro. Só síndico lê a tabela crua; todo o resto do sistema usa a view
-- perfis_publicos, que expõe apenas nome e cargo.
-- Os `drop ... if exists` existem porque `usuarios` é a única tabela que o
-- reset-dev.sql NÃO derruba: ela está amarrada às contas de autenticação. As
-- demais perdem suas políticas junto com a tabela e são recriadas do zero, mas
-- as de usuarios sobrevivem — e um `create policy` puro falharia com "policy
-- already exists" logo na primeira reaplicação, abortando o arquivo inteiro.
drop policy if exists usuarios_ler    on public.usuarios;
drop policy if exists usuarios_criar  on public.usuarios;
drop policy if exists usuarios_editar on public.usuarios;
drop policy if exists usuarios_apagar on public.usuarios;

create policy usuarios_ler    on public.usuarios for select to authenticated using (public.eh_sindico());
create policy usuarios_criar  on public.usuarios for insert to authenticated with check (public.eh_sindico());
create policy usuarios_editar on public.usuarios for update to authenticated using (public.eh_sindico());
create policy usuarios_apagar on public.usuarios for delete to authenticated using (public.eh_sindico());

-- ---------------------------------------------------------------------------
-- Cadastros: todos leem, só síndico escreve
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['unidades','moradores','vagas','tags'] loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_ler', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.eh_sindico())', t||'_criar', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.eh_sindico())', t||'_editar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.eh_sindico())', t||'_apagar', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Operacionais: qualquer autenticado cria e edita, só síndico apaga
-- ---------------------------------------------------------------------------

-- É o dia a dia da portaria e da administração: registrar reserva, dar baixa
-- em encomenda, lançar compra. Apagar é que fica restrito, porque apagar
-- reserva paga ou registro de entrega é o que causa prejuízo.
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
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_ler', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', t||'_criar', t);
    execute format('create policy %I on public.%I for update to authenticated using (true)', t||'_editar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.eh_sindico())', t||'_apagar', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Auditoria: append-only
-- ---------------------------------------------------------------------------

-- Sem policy de update nem de delete, de propósito: registro de auditoria que
-- pode ser editado não serve como auditoria. Nem o síndico altera.
create policy log_ler   on public.log for select to authenticated using (true);
create policy log_criar on public.log for insert to authenticated with check (true);

create policy auditoria_ler   on public.auditoria for select to authenticated using (public.eh_sindico());
create policy auditoria_criar on public.auditoria for insert to authenticated with check (true);
