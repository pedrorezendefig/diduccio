-- Apagar anexo passa a seguir a permissão de escrever, não a de síndico.
--
-- O 0017 espelhou nas políticas do bucket a regra das tabelas: o auxiliar cria
-- e edita, só o síndico apaga. Nas tabelas isso é certo — apagar reserva paga
-- ou registro de entrega é irreversível e é onde mora o prejuízo.
--
-- Em arquivo, o efeito foi o oposto do pretendido. Trocar a foto de um cadastro
-- é editar, e o arquivo substituído é lixo por definição: ninguém mais aponta
-- para ele, e ele não aparece em tela nenhuma. Com a regra antiga, um auxiliar
-- trocando a foto conseguia subir a nova e NÃO conseguia remover a velha —
-- então o bucket ia acumulando arquivo abandonado que continua alcançável por
-- URL assinada. Num cadastro de piscina, isso é atestado médico de alguém.
--
-- Guardar mais gente do que o necessário não era proteção nenhuma aqui: era
-- vazamento com aparência de rigor.
--
-- A proteção real continua de pé, e no lugar certo: `piscina_apagar`,
-- `compras_apagar` e as demais seguem exigindo síndico. Ninguém apaga o
-- registro; só o arquivo que o próprio registro deixou de usar.

drop policy if exists anexos_apagar on storage.objects;

create policy anexos_apagar on storage.objects
  for delete to authenticated
  using (bucket_id = 'anexos' and public.pode_escrever_anexo(name));
