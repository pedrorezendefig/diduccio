# Recarregar o banco a partir da planilha

Ordem obrigatória. Cada passo depende do anterior, e dois deles não podem
trocar de lugar: o `0014` precisa rodar **depois** da carga, e a carga precisa
rodar **depois** das políticas.

O SQL vai no **SQL Editor** do painel do Supabase; os comandos `node` no
terminal, na raiz do projeto.

| # | Onde | O quê |
|---|------|-------|
| 1 | SQL Editor | `supabase/reset-dev.sql` |
| 2 | SQL Editor | `supabase/migrations/0001_schema.sql` |
| 3 | SQL Editor | `supabase/migrations/0002_fks.sql` |
| 4 | SQL Editor | `supabase/migrations/0015_politicas_por_cargo.sql` |
| 5 | Terminal | `node --env-file=.env.local scripts/migracao/carregar.mjs` |
| 6 | SQL Editor | `supabase/migrations/0014_sequencias.sql` |
| 7 | Terminal | `node --env-file=.env.local scripts/migracao/validar.mjs` |
| 8 | Terminal | `node --env-file=.env.local scripts/verificar-rls.mjs` |
| 9 | SQL Editor | `supabase/migrations/0017_storage.sql` |
| 10 | Terminal | `node --env-file=.env.local scripts/verificar-storage.mjs` |

O `0004` e o `0010` **não entram** nesta lista: o `0015` substitui os dois. Ele
apaga todas as políticas antes de criar as suas, então rodar os antigos depois
reabriria o acesso que acabamos de fechar.

## Por que essa ordem

**1 não derruba `usuarios`.** É a única tabela que sobrevive ao reset, porque
cada linha dela está amarrada a uma conta de autenticação pelo
`app_metadata.usuario_id`. Derrubá-la deixaria as contas órfãs e ninguém mais
entraria no sistema. Pelo mesmo motivo ela fica fora do passo 6.

**4 vem antes da carga** porque a carga usa a secret key, que ignora RLS — mas
as tabelas foram recriadas no passo 2 e perderam suas políticas junto. Sem
recriá-las, o app ficaria sem acesso nenhum depois da carga.

**6 vem depois da carga.** As tabelas nascem com `id` automático começando em 1,
e a carga grava os ids da planilha explicitamente — até 1509 em `unidades`. O
`0014` empurra cada sequência para depois do maior id em uso. Sem ele, o
primeiro cadastro feito pelo app colide com uma linha existente.

**7 não é opcional.** Ele confere contagem *e* valor: lê cada coluna de data de
volta do banco e compara com a conversão do serial da planilha. Contagem certa
com data errada foi exatamente o que passou despercebido na primeira migração.

**8 é a única prova real do controle de acesso.** A secret key IGNORA o RLS —
todo teste feito com ela passa, inclusive contra política quebrada. E "Success.
No rows returned" também não prova nada: SELECT negado devolve zero linhas SEM
erro, igualzinho a tabela vazia. O script cria uma conta descartável por cargo,
mede o que cada uma alcança e apaga as contas no fim, inclusive se estourar no
meio. Foi ele que pegou a auditoria aceitando escrita de conta sem cargo.

**10 mede o bucket do mesmo jeito, e é ainda mais necessário.** Política de
Storage frouxa não quebra nada: ela entrega arquivo a quem não devia, calada.
Neste bucket isso significa atestado médico. O script semeia um PDF em cada
pasta, confere quem alcança o quê, e apaga tudo no fim.

## Antes de rodar, se quiser conferir

```
node --env-file=.env.local scripts/migracao/carregar.mjs --simular
```

Converte tudo e imprime as colunas de data **sem gravar nada**.

## Se a planilha mudar

Regere o schema antes de tudo:

```
node scripts/migracao/gerar-schema.mjs
```

Ele reescreve `0001_schema.sql` e `reset-dev.sql`. Nomes e tipos de data são
decididos em `scripts/migracao/mapa.mjs` — é lá que se mexe, não no SQL gerado.

## Migrations que NÃO entram nesta lista

`0003`, `0005` a `0009` mexem só em `usuarios`, que não é derrubada — já estão
aplicadas e continuam valendo. `0011` e `0012` viraram no-op: o `0001` já cria
os ids automáticos que eles corrigiam. `0004` e `0010` foram substituídos pelo
`0015`. `0013` foi apagado: as datas nascem certas do `0001`, então não há mais
o que converter.
