-- Bucket de anexos e suas permissões.
--
-- Só para arquivo NOVO. Os ~402 que já existem continuam no Google Drive, e as
-- colunas `url_drive` / `file_id` continuam valendo — decisão do Lucas. Toda
-- tela com anexo vai conviver com os dois caminhos: renderiza o Drive quando
-- há `url_drive`, e o Storage quando há `caminho_storage`.
--
-- Bucket PRIVADO, e isso não é preferência. Aqui entram atestados médicos dos
-- 204 cadastros da piscina — dado de saúde —, notas fiscais e assinaturas.
-- Bucket público entrega qualquer um desses a quem souber (ou adivinhar) a URL,
-- sem autenticação nenhuma. O acesso é por URL assinada, de vida curta.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anexos', 'anexos', false,
  10485760,  -- 10 MB: foto de celular e PDF de nota cabem; vídeo não entra por acidente
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Quem alcança o quê
-- ---------------------------------------------------------------------------

-- O caminho de todo arquivo é `<modulo>/<id-do-registro>/<arquivo>`, e é a
-- PRIMEIRA pasta que decide a permissão — do mesmo jeito que a tabela decide
-- nas políticas do 0015. `storage.foldername(name)` devolve o caminho em
-- pedaços: para 'piscina/1509/atestado.pdf' dá {piscina,1509}.
--
-- Sem isto, qualquer autenticado leria qualquer anexo: o RLS de `storage.objects`
-- não sabe nada sobre cargos, e um bucket sem política é um bucket que nega
-- tudo — ou, se alguém liberar geral por pressa, entrega tudo.

create or replace function public.modulo_do_anexo(nome text)
returns text language sql immutable
set search_path = public as $$
  select coalesce((storage.foldername(nome))[1], '');
$$;

revoke execute on function public.modulo_do_anexo(text) from public;
grant  execute on function public.modulo_do_anexo(text) to authenticated;

-- O porteiro só enxerga encomendas; o conselheiro, só ata de assembleia. O
-- resto é da administração — inclusive piscina, onde está o atestado médico.
create or replace function public.pode_ler_anexo(nome text)
returns boolean language sql stable
set search_path = public as $$
  select case public.modulo_do_anexo(nome)
    when 'encomendas'  then public.eh_administrativo() or public.eh_porteiro()
    when 'assembleias' then public.eh_administrativo() or public.eh_conselheiro()
    else public.eh_administrativo()
  end;
$$;

-- Escrever é mais restrito que ler em um ponto: o conselheiro lê ata e não
-- anexa nada, porque não age em lugar nenhum do sistema.
create or replace function public.pode_escrever_anexo(nome text)
returns boolean language sql stable
set search_path = public as $$
  select case public.modulo_do_anexo(nome)
    when 'encomendas' then public.eh_administrativo() or public.eh_porteiro()
    else public.eh_administrativo()
  end;
$$;

do $$
declare f text;
begin
  foreach f in array array['pode_ler_anexo', 'pode_escrever_anexo'] loop
    execute format('revoke execute on function public.%I(text) from public', f);
    execute format('grant  execute on function public.%I(text) to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Políticas do bucket
-- ---------------------------------------------------------------------------

drop policy if exists anexos_ler    on storage.objects;
drop policy if exists anexos_criar  on storage.objects;
drop policy if exists anexos_editar on storage.objects;
drop policy if exists anexos_apagar on storage.objects;

create policy anexos_ler on storage.objects
  for select to authenticated
  using (bucket_id = 'anexos' and public.pode_ler_anexo(name));

create policy anexos_criar on storage.objects
  for insert to authenticated
  with check (bucket_id = 'anexos' and public.pode_escrever_anexo(name));

create policy anexos_editar on storage.objects
  for update to authenticated
  using (bucket_id = 'anexos' and public.pode_escrever_anexo(name));

-- Apagar arquivo é irreversível e é onde mora o estrago — mesma regra das
-- tabelas: o auxiliar cria e edita, só o síndico apaga.
create policy anexos_apagar on storage.objects
  for delete to authenticated
  using (bucket_id = 'anexos' and public.eh_sindico());

-- ---------------------------------------------------------------------------
-- Onde o registro guarda o caminho do arquivo novo
-- ---------------------------------------------------------------------------

-- `url_drive` e `file_id` continuam intactos e continuam sendo a verdade para
-- os arquivos antigos. `caminho_storage` nasce nulo em todas as linhas
-- existentes, e é isso que faz `urlDoAnexo` (src/api/anexos.js) saber de qual
-- lado buscar cada um — sem data de corte, sem migração de dado.
do $$
declare t text;
begin
  foreach t in array array[
    'uploads_compras', 'uploads_festas', 'uploads_churrasqueira',
    'uploads_piscina', 'entregas_foto', 'entregas_recebimento',
    'notas', 'assinatura'
  ] loop
    execute format('alter table public.%I add column if not exists caminho_storage text', t);
  end loop;
end $$;

-- Piscina guarda os dois arquivos na própria linha, e não numa tabela de
-- uploads: a foto do morador e o atestado médico.
alter table public.piscina
  add column if not exists caminho_foto      text,
  add column if not exists caminho_atestado  text;

-- A ata em PDF também fica na própria linha da assembleia.
alter table public.assembleias
  add column if not exists caminho_pdf text;
