// @vitest-environment node
//
// RLS do bucket `anexos`, rodando as migrations de verdade num Postgres em
// memória (PGlite). O que o Supabase dá pronto e o teste não tem (schema
// `storage`, papéis, cargo de quem está logado) entra como esboço mínimo; as
// funções `pode_*_anexo` e as políticas vêm dos arquivos de migration.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

const PASTA = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../supabase/migrations',
)

// A 0017 cria o bucket e as políticas; a 0032 junta as permissões num lugar
// só. Depois dela, entra toda migration que mexe no bucket.
function migrationsDoBucket() {
  const depois = readdirSync(PASTA)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) > 32)
    .filter((f) =>
      /storage\.objects|_anexo\(/.test(readFileSync(join(PASTA, f), 'utf8')),
    )
    .sort()
  return [
    '0017_storage.sql',
    '0032_permissoes_do_bucket_em_um_lugar_so.sql',
    ...depois,
  ]
}

const ESBOCO_SUPABASE = `
  create role anon nologin;
  create role authenticated nologin;

  create schema storage;
  grant usage on schema storage to authenticated;

  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id serial primary key, bucket_id text, name text, metadata jsonb
  );
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to authenticated;

  -- A mesma do Supabase: as pastas do caminho, sem o arquivo.
  create function storage.foldername(name text) returns text[]
  language plpgsql as $$
  declare _parts text[];
  begin
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts, 1) - 1];
  end $$;

  -- O cargo de quem está logado vem de uma variável da sessão do teste.
  create function public.cargo_do_teste() returns text language sql stable
    as $$ select coalesce(current_setting('teste.cargo', true), '') $$;
  create function public.eh_sindico() returns boolean language sql stable
    as $$ select public.cargo_do_teste() = 'sindico' $$;
  create function public.eh_administrativo() returns boolean language sql stable
    as $$ select public.cargo_do_teste() in ('sindico', 'auxiliar') $$;
  create function public.eh_porteiro() returns boolean language sql stable
    as $$ select public.cargo_do_teste() = 'porteiro' $$;
  create function public.eh_conselheiro() returns boolean language sql stable
    as $$ select public.cargo_do_teste() = 'conselheiro' $$;

  -- Tabelas que a 0017 só ganha coluna.
  create table public.uploads_compras (id int);
  create table public.uploads_festas (id int);
  create table public.uploads_churrasqueira (id int);
  create table public.uploads_piscina (id int);
  create table public.entregas_foto (id int);
  create table public.entregas_recebimento (id int);
  create table public.notas (id int);
  create table public.assinatura (id int);
  create table public.piscina (id int);
  create table public.assembleias (id int);
`

const ASSINATURA = 'retiradas/7f3a/assinatura.png'
const CARTA = 'notificacoes/12/carta.pdf'
const ETIQUETA = 'encomendas/88/etiqueta.jpg'

let db

beforeEach(async () => {
  db = new PGlite()
  await db.exec(ESBOCO_SUPABASE)
  for (const f of migrationsDoBucket()) {
    await db.exec(readFileSync(join(PASTA, f), 'utf8'))
  }
  for (const nome of [ASSINATURA, CARTA, ETIQUETA]) {
    await db.query(
      `insert into storage.objects (bucket_id, name, metadata)
       values ('anexos', $1, '{"versao": "original"}')`,
      [nome],
    )
  }
})

// Troca o conteúdo do arquivo como o cargo dado, sob RLS.
async function sobrescreverComo(cargo, nome) {
  await db.exec(`set role authenticated; set teste.cargo = '${cargo}';`)
  const r = await db.query(
    `update storage.objects set metadata = '{"versao": "trocada"}'
     where bucket_id = 'anexos' and name = $1`,
    [nome],
  )
  await db.exec('reset role; reset teste.cargo;')
  return r.affectedRows
}

async function versao(nome) {
  const r = await db.query(
    `select metadata->>'versao' as v from storage.objects where name = $1`,
    [nome],
  )
  return r.rows[0].v
}

describe('RLS do bucket anexos: sobrescrever arquivo', () => {
  it('porteiro, que escreve em retiradas/, não sobrescreve a assinatura da baixa', async () => {
    expect(await sobrescreverComo('porteiro', ASSINATURA)).toBe(0)
    expect(await versao(ASSINATURA)).toBe('original')
  })

  it('auxiliar, que escreve em notificacoes/, não sobrescreve a carta assinada', async () => {
    expect(await sobrescreverComo('auxiliar', CARTA)).toBe(0)
    expect(await versao(CARTA)).toBe('original')
  })

  it('síndico, que pode apagar o comprovante, continua podendo editá-lo', async () => {
    expect(await sobrescreverComo('sindico', ASSINATURA)).toBe(1)
    expect(await versao(ASSINATURA)).toBe('trocada')
  })

  it('porteiro continua editando o anexo de encomenda', async () => {
    expect(await sobrescreverComo('porteiro', ETIQUETA)).toBe(1)
    expect(await versao(ETIQUETA)).toBe('trocada')
  })

  it('porteiro não move anexo de encomenda para pasta onde não escreve', async () => {
    await db.exec(`set role authenticated; set teste.cargo = 'porteiro';`)
    await expect(
      db.query(
        `update storage.objects set name = 'piscina-atestados/1/atestado.pdf'
         where name = $1`,
        [ETIQUETA],
      ),
    ).rejects.toThrow(/row-level security/)
  })
})
