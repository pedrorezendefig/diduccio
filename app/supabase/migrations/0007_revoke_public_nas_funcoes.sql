-- Fecha de verdade as funções do 0006.
--
-- O 0006 fez `revoke execute ... from anon`, o que não removeu nada: no
-- Postgres, EXECUTE em função é concedido a PUBLIC por padrão, e o papel anon
-- alcança a função por herança de PUBLIC, não por grant próprio. Verificado com
-- a chave pública: o anônimo executava as duas.
--
-- O impacto prático era nulo — sem JWT o usuario_id é nulo e a UPDATE não casa
-- com nenhuma linha. Mas um grant que não corresponde à intenção é dívida que
-- cobra juros na primeira vez que a função mudar.

revoke execute on function public.senha_ja_trocada()     from public;
revoke execute on function public.marcar_senha_trocada() from public;

grant execute on function public.senha_ja_trocada()     to authenticated;
grant execute on function public.marcar_senha_trocada() to authenticated;
