# ENTIDADES.md
<!-- gerado por /snapshot; não editar à mão -->

Modelo de dados do Diduccio. Tabelas no Postgres (via Supabase), reconstruídas das migrations.

## unidades

> Origem: `0001_schema.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `bloco` | `numeric` | - | - | - |
| `unidade` | `numeric` | - | - | - |
| `ocupado` | `text` | - | - | - |
| `status` | `text` | - | - | - |
| `valor` | `numeric` | - | - | - |
| `created_at` | `timestamptz` | NOT NULL | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_unidades_status` em `(status)` (de `0001_schema.sql`)
- `idx_unidades_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_unidades_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## entregadores

> Origem: `0001_schema.sql` (alterada em: 0034_portaria_recebe_visitantes.sql, 0063_modelo_do_veiculo.sql)

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | - | - |
| `cpf` | `text` | - | - | - |
| `nome` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `created_by` | `text` | - | - | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |
| `veiculo` | `text` | - | - | - |
| `placa` | `text` | - | - | - |
| `tipo` | `text` | - | - | - |
| `empresa` | `text` | - | - | - |
| `modelo` | `text` | - | - | - |

**Indexes:**
- `idx_entregadores_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_entregadores_updated_at` em `(updated_at)` (de `0001_schema.sql`)
- `uniq_entregadores_cpf` em `(cpf)` (de `0034_portaria_recebe_visitantes.sql`)

## entregadores_chegadas

> Origem: `0001_schema.sql` (alterada em: 0034_portaria_recebe_visitantes.sql, 0035_portaria_registra_quem_liberou.sql, 0063_modelo_do_veiculo.sql)

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `cpf` | `text` | - | - | - |
| `nome` | `text` | - | - | - |
| `veiculo` | `text` | - | - | - |
| `placa` | `text` | - | - | - |
| `bloco` | `text` | - | - | - |
| `apartamento` | `text` | - | - | - |
| `liberado_por` | `text` | - | - | - |
| `horario_entrada` | `timestamptz` | - | - | - |
| `horario_saida` | `timestamptz` | - | - | - |
| `created_by` | `text` | - | - | - |
| `created_at` | `timestamptz` | NOT NULL | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |
| `tipo` | `text` | NOT NULL | `'ENTREGADOR'` | - |
| `empresa` | `text` | - | - | - |
| `minutos_permitidos` | `int` | - | - | - |
| `saida_por` | `text` | - | - | - |
| `do_condominio` | `boolean` | NOT NULL | `false` | - |
| `modelo` | `text` | - | - | - |

**Indexes:**
- `idx_entregadores_chegadas_horario_entrada` em `(horario_entrada)` (de `0001_schema.sql`)
- `idx_entregadores_chegadas_horario_saida` em `(horario_saida)` (de `0001_schema.sql`)
- `idx_entregadores_chegadas_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_entregadores_chegadas_updated_at` em `(updated_at)` (de `0001_schema.sql`)
- `idx_chegadas_dentro` em `(horario_entrada desc)` (de `0034_portaria_recebe_visitantes.sql`)
- `idx_chegadas_tipo` em `(tipo)` (de `0034_portaria_recebe_visitantes.sql`)
- `idx_chegadas_bloco` em `(bloco)` (de `0035_portaria_registra_quem_liberou.sql`)

## assembleias

> Origem: `0001_schema.sql` (alterada em: 0017_storage.sql)

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `text` | PK | - | - |
| `titulo` | `text` | - | - | - |
| `data_assembleia` | `date` | - | - | - |
| `resumo_geral` | `text` | - | - | - |
| `decisoes` | `text` | - | - | - |
| `assinantes` | `text` | - | - | - |
| `pdf_url` | `text` | - | - | - |
| `pdf_id` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `created_by` | `text` | - | - | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |
| `caminho_pdf` | `text` | - | - | - |

**Indexes:**
- `idx_assembleias_data_assembleia` em `(data_assembleia)` (de `0001_schema.sql`)
- `idx_assembleias_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_assembleias_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## confirmacao

> Origem: `0001_schema.sql` (alterada em: 0002_fks.sql)

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_morador` | `numeric` | - | - | - |
| `id_unidade` | `bigint` | - | - | `unidades.id` |
| `nome` | `text` | - | - | - |
| `telefone` | `text` | - | - | - |
| `status` | `text` | - | - | - |
| `numero_solicitado` | `text` | - | - | - |
| `data_envio` | `timestamptz` | - | - | - |
| `updated_at` | `timestamptz` | - | `now()` | - |
| `updated_by` | `text` | - | - | - |
| `created_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_confirmacao_id_unidade` em `(id_unidade)` (de `0001_schema.sql`)
- `idx_confirmacao_status` em `(status)` (de `0001_schema.sql`)
- `idx_confirmacao_data_envio` em `(data_envio)` (de `0001_schema.sql`)
- `idx_confirmacao_updated_at` em `(updated_at)` (de `0001_schema.sql`)
- `idx_confirmacao_created_at` em `(created_at)` (de `0001_schema.sql`)

## log

> Origem: `0001_schema.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | - | - |
| `id_ref` | `text` | - | - | - |
| `usuario` | `text` | - | - | - |
| `acao` | `text` | - | - | - |
| `modulo` | `text` | - | - | - |
| `descricao` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_log_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_log_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## churrasqueira

> Origem: `0001_schema.sql` (alterada em: 0002_fks.sql)

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `data_reserva` | `date` | - | - | - |
| `unidade_id` | `bigint` | - | - | `unidades.id` |
| `morador` | `text` | - | - | - |
| `status` | `text` | - | - | - |
| `cpf` | `text` | - | - | - |
| `convidados` | `numeric` | - | - | - |
| `valor_taxa` | `numeric` | - | - | - |
| `pago` | `text` | - | - | - |
| `contato` | `text` | - | - | - |
| `churrasqueira` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `rg` | `text` | - | - | - |
| `divergencia_local` | `text` | - | - | - |
| `obs` | `text` | - | - | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_churrasqueira_data_reserva` em `(data_reserva)` (de `0001_schema.sql`)
- `idx_churrasqueira_unidade_id` em `(unidade_id)` (de `0001_schema.sql`)
- `idx_churrasqueira_status` em `(status)` (de `0001_schema.sql`)
- `idx_churrasqueira_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_churrasqueira_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## uploads_churrasqueira

> Origem: `0001_schema.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_festa` | `text` | - | - | - |
| `nome_arquivo` | `text` | - | - | - |
| `url_drive` | `text` | - | - | - |
| `file_id` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_uploads_churrasqueira_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_uploads_churrasqueira_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## uploads_compras

> Origem: `0001_schema.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `text` | PK | - | - |
| `id_compras` | `text` | - | - | - |
| `nome_arquivo` | `text` | - | - | - |
| `url_drive` | `text` | - | - | - |
| `file_id` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_uploads_compras_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_uploads_compras_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## moradores

> Origem: `0001_schema.sql` (alterada em: 0002_fks.sql)

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_unidade` | `bigint` | - | - | `unidades.id` |
| `nome` | `text` | - | - | - |
| `cpf` | `text` | - | - | - |
| `tipo_vinculo` | `text` | - | - | - |
| `telefone` | `text` | - | - | - |
| `email` | `text` | - | - | - |
| `data_entrada` | `date` | - | - | - |
| `data_saida` | `date` | - | - | - |
| `status` | `text` | - | - | - |
| `rg` | `text` | - | - | - |
| `tipo_morador` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `updated_at` | `timestamptz` | - | `now()` | - |
| `created_by` | `text` | - | - | - |

**Indexes:**
- `idx_moradores_id_unidade` em `(id_unidade)` (de `0001_schema.sql`)
- `idx_moradores_data_entrada` em `(data_entrada)` (de `0001_schema.sql`)
- `idx_moradores_data_saida` em `(data_saida)` (de `0001_schema.sql`)
- `idx_moradores_status` em `(status)` (de `0001_schema.sql`)
- `idx_moradores_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_moradores_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## mudancas

> Origem: `0001_schema.sql` (alterada em: 0002_fks.sql)

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_unidade` | `bigint` | - | - | `unidades.id` |
| `id_morador` | `text` | - | - | - |
| `morador` | `text` | - | - | - |
| `cpf` | `text` | - | - | - |
| `rg` | `text` | - | - | - |
| `contato` | `text` | - | - | - |
| `periodo` | `text` | - | - | - |
| `data_mudanca` | `timestamptz` | - | - | - |
| `status` | `text` | - | - | - |
| `tipo` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `obs` | `text` | - | - | - |
| `data_fim` | `timestamptz` | - | - | - |
| `created_by` | `text` | - | - | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_mudancas_id_unidade` em `(id_unidade)` (de `0001_schema.sql`)
- `idx_mudancas_data_mudanca` em `(data_mudanca)` (de `0001_schema.sql`)
- `idx_mudancas_status` em `(status)` (de `0001_schema.sql`)
- `idx_mudancas_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_mudancas_data_fim` em `(data_fim)` (de `0001_schema.sql`)
- `idx_mudancas_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## vagas

> Origem: `0001_schema.sql` (alterada em: 0002_fks.sql, 0041_a_tag_ganha_ficha.sql)

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_unidade` | `bigint` | - | - | `unidades.id` |
| `possui_carro` | `text` | - | - | - |
| `vaga_carro` | `text` | - | - | - |
| `placa_carro` | `text` | - | - | - |
| `modelo_carro` | `text` | - | - | - |
| `status_carro` | `text` | - | - | - |
| `possui_moto` | `text` | - | - | - |
| `vaga_moto` | `text` | - | - | - |
| `placa_moto` | `text` | - | - | - |
| `modelo_moto` | `text` | - | - | - |
| `status_moto` | `text` | - | - | - |
| `observacoes` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `created_by` | `text` | - | - | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |
| `cor_carro` | `text` | - | - | - |
| `cor_moto` | `text` | - | - | - |

**Indexes:**
- `idx_vagas_id_unidade` em `(id_unidade)` (de `0001_schema.sql`)
- `idx_vagas_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_vagas_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## entregas

> Origem: `0001_schema.sql` (alterada em: 0027_retiradas.sql, 0028_retirada_parcial.sql)

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_unidade` | `bigint` | - | - | - |
| `id_morador` | `text` | - | - | - |
| `nome` | `text` | - | - | - |
| `telefone` | `text` | - | - | - |
| `quantidade_encomenda` | `text` | - | - | - |
| `numero_encomenda` | `text` | - | - | - |
| `data_entrada` | `timestamptz` | - | - | - |
| `data_saida` | `timestamptz` | - | - | - |
| `status` | `text` | - | - | - |
| `notificado` | `text` | - | - | - |
| `status_notificacao` | `text` | - | - | - |
| `cod` | `text` | - | - | - |
| `cod_entrega` | `text` | - | - | - |
| `ident_interna` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `created_by` | `text` | - | - | - |
| `entregue_por` | `text` | - | - | - |
| `nome_morador` | `text` | - | - | - |
| `cpf_morador` | `text` | - | - | - |
| `armazenado_local` | `text` | - | - | - |
| `armazenado_por` | `text` | - | - | - |
| `armazenado_data` | `timestamptz` | - | - | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |
| `id_retirada` | `bigint` | - | - | `retiradas.id` |
| `volumes_retirados` | `int` | NOT NULL | `0` | - |

**Indexes:**
- `idx_entregas_id_unidade` em `(id_unidade)` (de `0001_schema.sql`)
- `idx_entregas_data_entrada` em `(data_entrada)` (de `0001_schema.sql`)
- `idx_entregas_data_saida` em `(data_saida)` (de `0001_schema.sql`)
- `idx_entregas_status` em `(status)` (de `0001_schema.sql`)
- `idx_entregas_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_entregas_armazenado_data` em `(armazenado_data)` (de `0001_schema.sql`)
- `idx_entregas_updated_at` em `(updated_at)` (de `0001_schema.sql`)
- `uq_entregas_cod` em `(cod)` (de `0020_codigos_de_encomenda.sql`)
- `uq_entregas_numero_encomenda` em `(numero_encomenda)` (de `0020_codigos_de_encomenda.sql`)
- `idx_entregas_id_retirada` em `(id_retirada)` (de `0027_retiradas.sql`)

## entregas_foto

> Origem: `0001_schema.sql` (alterada em: 0029_retirada_por_item.sql)

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_entrega` | `text` | - | - | - |
| `nome_arquivo` | `text` | - | - | - |
| `url_drive` | `text` | - | - | - |
| `file_id` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `created_by` | `text` | - | - | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |
| `id_nota` | `bigint` | - | - | `entregas_nf.id` |

**Indexes:**
- `idx_entregas_foto_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_entregas_foto_updated_at` em `(updated_at)` (de `0001_schema.sql`)
- `idx_entregas_foto_id_nota` em `(id_nota)` (de `0029_retirada_por_item.sql`)

## entregas_nf

> Origem: `0001_schema.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_encomenda` | `text` | - | - | - |
| `numero_fiscal` | `text` | - | - | - |
| `transportadora` | `text` | - | - | - |
| `created_by` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_entregas_nf_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_entregas_nf_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## agendamentos

> Origem: `0001_schema.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `tipo` | `text` | - | - | - |
| `id_unidade` | `bigint` | - | - | - |
| `nome` | `text` | - | - | - |
| `telefone` | `text` | - | - | - |
| `data` | `date` | - | - | - |
| `hora_inicio` | `time` | - | - | - |
| `duracao` | `text` | - | - | - |
| `assunto` | `text` | - | - | - |
| `obs` | `text` | - | - | - |
| `status` | `text` | - | - | - |
| `created_by` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_agendamentos_id_unidade` em `(id_unidade)` (de `0001_schema.sql`)
- `idx_agendamentos_data` em `(data)` (de `0001_schema.sql`)
- `idx_agendamentos_hora_inicio` em `(hora_inicio)` (de `0001_schema.sql`)
- `idx_agendamentos_status` em `(status)` (de `0001_schema.sql`)
- `idx_agendamentos_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_agendamentos_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## piscina

> Origem: `0001_schema.sql` (alterada em: 0002_fks.sql, 0017_storage.sql)

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_unidade` | `bigint` | - | - | `unidades.id` |
| `id_morador` | `text` | - | - | - |
| `nome` | `text` | - | - | - |
| `nascimento` | `date` | - | - | - |
| `telefone` | `text` | - | - | - |
| `validade_atestado` | `date` | - | - | - |
| `url_foto` | `text` | - | - | - |
| `id_foto_drive` | `text` | - | - | - |
| `url_atestado` | `text` | - | - | - |
| `status` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `obs` | `text` | - | - | - |
| `cpf` | `text` | - | - | - |
| `id_atestado_drive` | `text` | - | - | - |
| `created_by` | `text` | - | - | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |
| `caminho_foto` | `text` | - | - | - |
| `caminho_atestado` | `text` | - | - | - |

**Indexes:**
- `idx_piscina_id_unidade` em `(id_unidade)` (de `0001_schema.sql`)
- `idx_piscina_nascimento` em `(nascimento)` (de `0001_schema.sql`)
- `idx_piscina_validade_atestado` em `(validade_atestado)` (de `0001_schema.sql`)
- `idx_piscina_status` em `(status)` (de `0001_schema.sql`)
- `idx_piscina_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_piscina_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## compras

> Origem: `0001_schema.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `text` | PK | - | - |
| `solicitacao` | `text` | - | - | - |
| `produto` | `text` | - | - | - |
| `categoria` | `text` | - | - | - |
| `solicitado_por` | `text` | - | - | - |
| `solicitado_data` | `timestamptz` | - | - | - |
| `status` | `text` | - | - | - |
| `created_by` | `text` | - | - | - |
| `auditoria_id` | `text` | - | - | - |
| `id_nota` | `text` | - | - | - |
| `id_assinatura` | `text` | - | - | - |
| `obs` | `text` | - | - | - |
| `valor` | `numeric` | - | - | - |
| `fornecedor` | `text` | - | - | - |
| `requer_aprovacao` | `text` | - | - | - |
| `comprado_data` | `timestamptz` | - | - | - |
| `unidade` | `text` | - | - | - |
| `titulo_solicitacao` | `text` | - | - | - |
| `created_at` | `timestamptz` | NOT NULL | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_compras_solicitado_data` em `(solicitado_data)` (de `0001_schema.sql`)
- `idx_compras_status` em `(status)` (de `0001_schema.sql`)
- `idx_compras_comprado_data` em `(comprado_data)` (de `0001_schema.sql`)
- `idx_compras_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_compras_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## compras_produtos

> Origem: `0001_schema.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `text` | PK | - | - |
| `id_compra` | `text` | - | - | - |
| `produto` | `text` | - | - | - |
| `quantidade` | `numeric` | - | - | - |
| `valor` | `numeric` | - | - | - |
| `created_at` | `timestamptz` | NOT NULL | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_compras_produtos_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_compras_produtos_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## auditoria

> Origem: `0001_schema.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `tabela` | `text` | - | - | - |
| `acao` | `text` | - | - | - |
| `old_status` | `text` | - | - | - |
| `new_status` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `usuario` | `text` | - | - | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_auditoria_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_auditoria_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## notas

> Origem: `0001_schema.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_compra` | `text` | - | - | - |
| `solicitacao` | `text` | - | - | - |
| `categoria` | `text` | - | - | - |
| `produto` | `text` | - | - | - |
| `comprado_em` | `timestamptz` | - | - | - |
| `solicitado_em` | `timestamptz` | - | - | - |
| `status` | `text` | - | - | - |
| `solicitado_por` | `text` | - | - | - |
| `created_by` | `text` | - | - | - |
| `auditoria_id` | `text` | - | - | - |
| `obs` | `text` | - | - | - |
| `valor` | `text` | - | - | - |
| `fornecedor` | `text` | - | - | - |
| `unidade` | `text` | - | - | - |
| `titulo_solicitacao` | `text` | - | - | - |
| `created_at` | `timestamptz` | NOT NULL | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_notas_comprado_em` em `(comprado_em)` (de `0001_schema.sql`)
- `idx_notas_solicitado_em` em `(solicitado_em)` (de `0001_schema.sql`)
- `idx_notas_status` em `(status)` (de `0001_schema.sql`)
- `idx_notas_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_notas_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## assinatura

> Origem: `0001_schema.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_compra` | `text` | - | - | - |
| `data_solicitacao` | `timestamptz` | - | - | - |
| `descricao` | `text` | - | - | - |
| `valor` | `text` | - | - | - |
| `status` | `text` | - | - | - |
| `assinatura_base64` | `text` | - | - | - |
| `dispositivo` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_assinatura_data_solicitacao` em `(data_solicitacao)` (de `0001_schema.sql`)
- `idx_assinatura_status` em `(status)` (de `0001_schema.sql`)
- `idx_assinatura_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_assinatura_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## tags

> Origem: `0001_schema.sql` (alterada em: 0041_a_tag_ganha_ficha.sql)

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_vagas` | `numeric` | - | - | - |
| `id_unidade` | `bigint` | - | - | - |
| `veiculo` | `text` | - | - | - |
| `status` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |
| `nome_solicitante` | `text` | - | - | - |
| `tipo_solicitante` | `text` | - | - | - |
| `custo_total` | `numeric(10, 2)` | - | - | - |
| `data_entrega` | `date` | - | - | - |
| `observacoes` | `text` | - | - | - |

**Indexes:**
- `idx_tags_id_unidade` em `(id_unidade)` (de `0001_schema.sql`)
- `idx_tags_status` em `(status)` (de `0001_schema.sql`)
- `idx_tags_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_tags_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## festas

> Origem: `0001_schema.sql` (alterada em: 0002_fks.sql)

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `data_reserva` | `date` | - | - | - |
| `unidade_id` | `bigint` | - | - | `unidades.id` |
| `morador` | `text` | - | - | - |
| `status` | `text` | - | - | - |
| `cpf` | `text` | - | - | - |
| `convidados` | `numeric` | - | - | - |
| `valor_taxa` | `numeric` | - | - | - |
| `pago` | `text` | - | - | - |
| `contato` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `rg` | `text` | - | - | - |
| `divergencia_local` | `text` | - | - | - |
| `obs` | `text` | - | - | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_festas_data_reserva` em `(data_reserva)` (de `0001_schema.sql`)
- `idx_festas_unidade_id` em `(unidade_id)` (de `0001_schema.sql`)
- `idx_festas_status` em `(status)` (de `0001_schema.sql`)
- `idx_festas_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_festas_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## uploads_festas

> Origem: `0001_schema.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `text` | PK | - | - |
| `id_festa` | `numeric` | - | - | - |
| `nome_arquivo` | `text` | - | - | - |
| `url_drive` | `text` | - | - | - |
| `file_id` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_uploads_festas_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_uploads_festas_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## multas

> Origem: `0001_schema.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_unidade` | `bigint` | - | - | - |
| `descricao` | `text` | - | - | - |
| `valor` | `text` | - | - | - |
| `data` | `date` | - | - | - |
| `status` | `text` | - | - | - |
| `created_at` | `timestamptz` | NOT NULL | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_multas_id_unidade` em `(id_unidade)` (de `0001_schema.sql`)
- `idx_multas_data` em `(data)` (de `0001_schema.sql`)
- `idx_multas_status` em `(status)` (de `0001_schema.sql`)
- `idx_multas_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_multas_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## uploads_piscina

> Origem: `0001_schema.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_piscina` | `text` | - | - | - |
| `nome_arquivo` | `text` | - | - | - |
| `url_drive` | `text` | - | - | - |
| `file_id` | `text` | - | - | - |
| `created_at` | `timestamptz` | - | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_uploads_piscina_created_at` em `(created_at)` (de `0001_schema.sql`)
- `idx_uploads_piscina_updated_at` em `(updated_at)` (de `0001_schema.sql`)

## tentativas_login

> Origem: `0023_limite_de_tentativas_de_login.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `chave` | `text` | PK | - | - |
| `tentativas` | `int` | NOT NULL | `0` | - |
| `ate` | `timestamptz` | NOT NULL | - | - |

**Indexes:**
- `idx_tentativas_login_ate` em `(ate)` (de `0023_limite_de_tentativas_de_login.sql`)

## retiradas

> Origem: `0027_retiradas.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_unidade` | `bigint` | - | - | - |
| `retirado_por_nome` | `text` | NOT NULL | - | - |
| `retirado_por_cpf` | `text` | NOT NULL | - | - |
| `id_morador` | `bigint` | - | - | - |
| `via` | `text` | NOT NULL | - | - |
| `assinatura_caminho` | `text` | NOT NULL | - | - |
| `observacao` | `text` | - | - | - |
| `entregue_por` | `text` | - | - | - |
| `created_at` | `timestamptz` | NOT NULL | `now()` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_retiradas_created_at` em `(created_at)` (de `0027_retiradas.sql`)
- `idx_retiradas_id_unidade` em `(id_unidade)` (de `0027_retiradas.sql`)

## retirada_itens

> Origem: `0028_retirada_parcial.sql` (alterada em: 0029_retirada_por_item.sql)

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_retirada` | `bigint` | NOT NULL | - | `retiradas.id` |
| `id_entrega` | `bigint` | NOT NULL | - | `entregas.id` |
| `volumes` | `int` | NOT NULL | - | - |
| `created_at` | `timestamptz` | NOT NULL | `now()` | - |
| `id_nota` | `bigint` | - | - | `entregas_nf.id` |

**Indexes:**
- `idx_retirada_itens_id_retirada` em `(id_retirada)` (de `0028_retirada_parcial.sql`)
- `idx_retirada_itens_id_entrega` em `(id_entrega)` (de `0028_retirada_parcial.sql`)
- `uniq_retirada_itens_nota` em `(id_nota)` (de `0029_retirada_por_item.sql`)

## notificacoes

> Origem: `0030_notificacoes_e_multas.sql` (alterada em: 0033_texto_editavel_da_notificacao.sql)

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `tipo` | `text` | NOT NULL | - | - |
| `id_unidade` | `bigint` | NOT NULL | - | - |
| `id_morador` | `bigint` | - | - | - |
| `destinatario` | `text` | NOT NULL | - | - |
| `assunto` | `text` | NOT NULL | - | - |
| `descricao` | `text` | NOT NULL | - | - |
| `ocorrido_em` | `date` | - | - | - |
| `justificativa` | `text` | - | - | - |
| `created_at` | `timestamptz` | NOT NULL | `now()` | - |
| `created_by` | `text` | - | - | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |
| `texto` | `text` | - | - | - |

**Indexes:**
- `idx_notificacoes_unidade_data` em `(id_unidade, created_at desc)` (de `0030_notificacoes_e_multas.sql`)
- `idx_notificacoes_tipo` em `(tipo)` (de `0030_notificacoes_e_multas.sql`)

## notificacoes_anexos

> Origem: `0031_notificacoes_anexos.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `id_notificacao` | `bigint` | NOT NULL | - | `notificacoes.id` |
| `nome_arquivo` | `text` | - | - | - |
| `caminho_storage` | `text` | NOT NULL | - | - |
| `created_at` | `timestamptz` | NOT NULL | `now()` | - |
| `created_by` | `text` | - | - | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_notificacoes_anexos_notificacao` em `(id_notificacao)` (de `0031_notificacoes_anexos.sql`)

## tarefas

> Origem: `0042_tarefas.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `id` | `bigint` | PK | `as identity` | - |
| `titulo` | `text` | NOT NULL | - | - |
| `descricao` | `text` | - | - | - |
| `situacao` | `text` | NOT NULL | `'A_FAZER'` | - |
| `responsavel_id` | `bigint` | - | - | `usuarios.id` |
| `prazo` | `date` | - | - | - |
| `id_unidade` | `bigint` | - | - | `unidades.id` |
| `concluida_em` | `timestamptz` | - | - | - |
| `movida_em` | `timestamptz` | - | - | - |
| `movida_por` | `text` | - | - | - |
| `created_at` | `timestamptz` | NOT NULL | `now()` | - |
| `created_by` | `text` | - | - | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

**Indexes:**
- `idx_tarefas_situacao` em `(situacao)` (de `0042_tarefas.sql`)
- `idx_tarefas_responsavel` em `(responsavel_id)` (de `0042_tarefas.sql`)
- `idx_tarefas_concluida` em `(concluida_em)` (de `0042_tarefas.sql`)

## notas_tarefas

> Origem: `0044_notas_das_tarefas.sql`

| Campo | Tipo | Constraints | Default | FK |
|-------|------|-------------|---------|-----|
| `usuario_id` | `bigint` | PK | - | `usuarios.id` |
| `texto` | `text` | NOT NULL | `''` | - |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | - |

---

**Resumo:** 34 tabelas vivas.
