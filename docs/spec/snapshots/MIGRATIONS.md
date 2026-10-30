# MIGRATIONS.md
<!-- gerado por /snapshot; não editar à mão -->

Ordem cronológica das migrations do Postgres do Diduccio (`app/supabase/migrations/`).

| # | Arquivo | Resumo | C | A | I | D |
|---|---------|--------|---|---|---|---|
| 1 | `0001_schema.sql` | Gerado por scripts/migracao/gerar-schema.mjs | 28 | 0 | 104 | 0 |
| 2 | `0002_fks.sql` | Integridade verificada em 2026-08-05: zero órfãos nas 7 tabelas. | 0 | 7 | 0 | 0 |
| 3 | `0003_perfis_publicos.sql` | Grade de perfis da tela de login. | 0 | 0 | 0 | 0 |
| 4 | `0004_politicas.sql` | SUPERSEDIDO PELO 0015. Não rode este arquivo. | 0 | 0 | 0 | 0 |
| 5 | `0005_senha_trocada.sql` | Marca de que o usuário já substituiu a senha provisória da migração. | 0 | 1 | 0 | 0 |
| 6 | `0006_senha_trocada_por_funcao.sql` | Corrige o acesso à marca de senha trocada. | 0 | 0 | 0 | 0 |
| 7 | `0007_revoke_public_nas_funcoes.sql` | Fecha de verdade as funções do 0006. | 0 | 0 | 0 | 0 |
| 8 | `0008_login_por_cpf.sql` | Login aceitando CPF ou e-mail. | 0 | 1 | 1 | 0 |
| 9 | `0009_usuarios_id_automatico.sql` | Permite cadastrar usuário novo. | 0 | 0 | 0 | 0 |
| 10 | `0010_cargo_conselheiro.sql` | SUPERSEDIDO PELO 0015. Não rode este arquivo. | 0 | 0 | 0 | 0 |
| 11 | `0011_ids_automaticos.sql` | Torna automático o `id` de todas as tabelas que vieram da planilha. | 0 | 0 | 0 | 0 |
| 12 | `0012_ids_das_tabelas_vazias.sql` | Completa o 0011 nas tabelas que estavam vazias na planilha. | 0 | 0 | 0 | 0 |
| 14 | `0014_sequencias.sql` | Acerta as sequências de id DEPOIS da carga. | 0 | 0 | 0 | 0 |
| 15 | `0015_politicas_por_cargo.sql` | Políticas de RLS por cargo. SUBSTITUI o 0004 e o 0010 por inteiro. | 0 | 0 | 0 | 0 |
| 16 | `0016_meu_perfil.sql` | O nome de quem está logado, e o fim da view que sobrou da grade de login. | 0 | 0 | 0 | 0 |
| 17 | `0017_storage.sql` | Bucket de anexos e suas permissões. | 0 | 3 | 0 | 0 |
| 18 | `0018_apagar_anexo_segue_escrita.sql` | Apagar anexo passa a seguir a permissão de escrever, não a de síndico. | 0 | 0 | 0 | 0 |
| 19 | `0019_atestado_em_pasta_propria.sql` | Atestado médico ganha pasta própria: `piscina-atestados/`. | 0 | 0 | 0 | 0 |
| 20 | `0020_codigos_de_encomenda.sql` | O código de retirada e o número da encomenda passam a nascer no banco. | 0 | 0 | 2 | 0 |
| 21 | `0021_funcoes_fechadas_para_anonimo.sql` | Fecha para o visitante anônimo TODA função do schema `public`, menos a que o | 0 | 0 | 0 | 0 |
| 22 | `0022_avisos_do_linter.sql` | Respostas aos avisos do linter do Supabase. | 0 | 0 | 0 | 0 |
| 23 | `0023_limite_de_tentativas_de_login.sql` | Limite de tentativas de login, e o fechamento de `email_de_login`. | 1 | 0 | 1 | 0 |
| 24 | `0024_meu_perfil_sai_de_cena.sql` | `meu_perfil()` deixa de existir. | 0 | 0 | 0 | 0 |
| 25 | `0025_receita_sai_da_view.sql` | A view `receitas_reservas` deixa de existir. | 0 | 0 | 0 | 0 |
| 26 | `0026_porteiro_so_fecha_a_visita.sql` | Na portaria, o porteiro registra a visita do entregador, e só isso. | 0 | 0 | 0 | 0 |
| 27 | `0027_retiradas.sql` | A retirada de encomenda vira registro assinado, e o livro de papel sai. | 1 | 1 | 3 | 1 |
| 28 | `0028_retirada_parcial.sql` | Retirada parcial: o morador leva parte dos volumes e o resto fica. | 1 | 1 | 2 | 0 |
| 29 | `0029_retirada_por_item.sql` | Rodar com o app fechado (ver 0028: `add column` conflita com leitura do | 0 | 2 | 2 | 0 |
| 30 | `0030_notificacoes_e_multas.sql` | Notificações e multas por descumprimento de norma condominial. | 1 | 0 | 2 | 0 |
| 31 | `0031_notificacoes_anexos.sql` | O comprovante assinado da notificação. | 1 | 0 | 1 | 0 |
| 32 | `0032_permissoes_do_bucket_em_um_lugar_so.sql` | As permissões do bucket, inteiras, num lugar só. | 0 | 0 | 0 | 0 |
| 33 | `0033_texto_editavel_da_notificacao.sql` | A carta vira texto editável, e o que foi editado é o que fica arquivado. | 0 | 1 | 0 | 0 |
| 34 | `0034_portaria_recebe_visitantes.sql` | A portaria deixa de ser só de entregador. | 0 | 7 | 3 | 0 |
| 35 | `0035_portaria_registra_quem_liberou.sql` | Quem liberou a entrada, quem registrou a saída, e o serviço do próprio prédio. | 0 | 2 | 1 | 0 |
| 36 | `0036_cadastro_parado_sai_o_historico_fica.sql` | O cadastro de quem parou de vir sai sozinho. O histórico dele fica. | 0 | 0 | 0 | 0 |
| 37 | `0037_a_portaria_cuida_das_vagas.sql` | A portaria passa a ver as vagas, e a corrigir a TAG. | 0 | 0 | 0 | 0 |
| 38 | `0038_porteiro_pede_a_tag.sql` | O porteiro passa a PEDIR a TAG. Quem decide o status continua sendo a | 0 | 0 | 0 | 0 |
| 39 | `0039_porteiro_so_mexe_na_tag_disponivel.sql` | O porteiro só encosta na TAG quando ela está 'Disponivel'. | 0 | 0 | 0 | 0 |
| 40 | `0040_a_tag_pode_chegar_em_aplicado.sql` | Conserta o 0039: o porteiro voltava a não conseguir marcar a TAG como | 0 | 0 | 0 | 0 |
| 41 | `0041_a_tag_ganha_ficha.sql` | A TAG deixa de ser "carro ou moto" e passa a ter ficha. | 0 | 7 | 0 | 0 |
| 42 | `0042_tarefas.sql` | Tarefas da administração: o quadro que o síndico e o auxiliar dividem. | 1 | 0 | 3 | 0 |
| 43 | `0043_responsaveis_de_tarefa.sql` | Quem pode receber uma tarefa: os nomes da administração, só para a administração | 0 | 0 | 0 | 0 |
| 44 | `0044_notas_das_tarefas.sql` | O bloco de notas das Tarefas: um rascunho por pessoa. | 1 | 0 | 0 | 0 |
| 45 | `0045_auxiliar_ve_so_as_dele.sql` | O auxiliar cuida só das tarefas dele; o síndico e o dev, de todas. | 0 | 0 | 0 | 0 |
| 63 | `0063_modelo_do_veiculo.sql` | O modelo do veículo: como ele é, em texto livre. | 0 | 2 | 0 | 0 |

**Legenda:** C = CREATE TABLE, A = ALTER TABLE (coluna ou FK), I = CREATE INDEX, D = DROP.
**Total:** 45 migrations.
