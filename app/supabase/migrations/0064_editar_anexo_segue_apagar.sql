-- Quem não pode apagar um anexo também não pode sobrescrevê-lo.
--
-- A 0032 fechou o DELETE de `retiradas/` e `notificacoes/` com
-- `pode_apagar_anexo`: ali o arquivo é prova (a assinatura da baixa, a carta
-- assinada) e só o síndico desfaz. Mas a política de UPDATE, `anexos_editar`,
-- ficou como veio da 0017, com `pode_escrever_anexo`. Escrever em
-- `retiradas/` o porteiro pode; então ele não apagava a assinatura, mas
-- conseguia trocar o conteúdo dela. Sobrescrever é apagar com outro nome.
--
-- O `using` decide qual linha existente pode ser alterada: segue a regra de
-- apagar. O `with check` decide como a linha pode ficar depois: segue a regra
-- de escrever, igual ao INSERT, para ninguém mover arquivo para uma pasta onde
-- não escreveria.
--
-- O app não usa UPDATE no bucket hoje: os uploads vão com `upsert: false`
-- (src/api/anexos.js e src/api/retiradas.js). Nada na tela muda.

drop policy if exists anexos_editar on storage.objects;

create policy anexos_editar on storage.objects
  for update to authenticated
  using (bucket_id = 'anexos' and public.pode_apagar_anexo(name))
  with check (bucket_id = 'anexos' and public.pode_escrever_anexo(name));
