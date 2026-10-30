-- ATENÇÃO: ESTE SCRIPT APAGA TABELAS E DADOS.
--
-- Não faz parte da sequência de migrations. Serve para recriar o schema do
-- zero enquanto a produção ainda roda na planilha. Depois que o sistema
-- entrar no ar, rodar isto destrói a migração inteira.
--
-- `usuarios` NÃO está na lista, de propósito: cada linha dela está amarrada
-- a uma conta de autenticação pelo app_metadata.usuario_id, e derrubá-la
-- deixaria as contas órfãs — ninguém mais conseguiria entrar.
--
-- Gerado por scripts/migracao/gerar-schema.mjs

DROP TABLE IF EXISTS public.unidades CASCADE;
DROP TABLE IF EXISTS public.entregadores CASCADE;
DROP TABLE IF EXISTS public.entregadores_chegadas CASCADE;
DROP TABLE IF EXISTS public.assembleias CASCADE;
DROP TABLE IF EXISTS public.confirmacao CASCADE;
DROP TABLE IF EXISTS public.log CASCADE;
DROP TABLE IF EXISTS public.churrasqueira CASCADE;
DROP TABLE IF EXISTS public.uploads_churrasqueira CASCADE;
DROP TABLE IF EXISTS public.uploads_compras CASCADE;
DROP TABLE IF EXISTS public.moradores CASCADE;
DROP TABLE IF EXISTS public.mudancas CASCADE;
DROP TABLE IF EXISTS public.vagas CASCADE;
DROP TABLE IF EXISTS public.entregas CASCADE;
DROP TABLE IF EXISTS public.entregas_foto CASCADE;
DROP TABLE IF EXISTS public.entregas_nf CASCADE;
DROP TABLE IF EXISTS public.entregas_recebimento CASCADE;
DROP TABLE IF EXISTS public.agendamentos CASCADE;
DROP TABLE IF EXISTS public.piscina CASCADE;
DROP TABLE IF EXISTS public.compras CASCADE;
DROP TABLE IF EXISTS public.compras_produtos CASCADE;
DROP TABLE IF EXISTS public.auditoria CASCADE;
DROP TABLE IF EXISTS public.notas CASCADE;
DROP TABLE IF EXISTS public.assinatura CASCADE;
DROP TABLE IF EXISTS public.tags CASCADE;
DROP TABLE IF EXISTS public.festas CASCADE;
DROP TABLE IF EXISTS public.uploads_festas CASCADE;
DROP TABLE IF EXISTS public.multas CASCADE;
DROP TABLE IF EXISTS public.uploads_piscina CASCADE;