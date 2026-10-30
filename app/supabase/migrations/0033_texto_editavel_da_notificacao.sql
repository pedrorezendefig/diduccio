-- A carta vira texto editável, e o que foi editado é o que fica arquivado.
--
-- A folha nasce montada a partir dos campos do cadastro, mas cada caso tem um
-- parágrafo próprio — o síndico ajusta a redação antes de imprimir. Sem guardar
-- o resultado, o papel entregue ao morador e o registro no sistema divergem já
-- na primeira edição, e é o registro que sustenta a multa seguinte.
--
-- `texto` nulo significa "nunca foi editada": a tela monta a carta a partir dos
-- campos, como antes. Só depois da primeira edição a coluna passa a mandar.

alter table public.notificacoes add column if not exists texto text;

-- ---------------------------------------------------------------------------
-- Quem edita o quê
-- ---------------------------------------------------------------------------
-- O 0030 deixou todo UPDATE com o síndico, e isso torna a edição inútil para o
-- auxiliar — que é justamente quem digita. Mas abrir o UPDATE inteiro para
-- `eh_administrativo()` abriria junto o `tipo`: um auxiliar transformaria uma
-- MULTA em NOTIFICACAO e desfaria o fechamento do ciclo de contagem, que é
-- exatamente o que a restrição de apagar existe para proteger.
--
-- Então o UPDATE abre, e um gatilho decide o que cada um pode mexer.

drop policy if exists notificacoes_editar on public.notificacoes;

create policy notificacoes_editar on public.notificacoes
  for update to authenticated
  using (public.eh_administrativo())
  with check (public.eh_administrativo());

-- Compara a linha inteira em jsonb, e não coluna a coluna. Lista escrita à mão
-- protege o que existia no dia em que foi escrita, e a coluna acrescentada no
-- ano que vem nasceria aberta — foi o engano cometido na primeira versão do
-- gatilho do 0026.
--
-- `updated_at` fica de fora porque `tocar_updated_at` já a carimbou antes deste
-- rodar: os dois são BEFORE UPDATE e a ordem entre gatilhos é alfabética, e
-- trg_notificacao_* vem depois de trg_notificacoes_updated_at.
create or replace function public.notificacao_auxiliar_so_edita_texto()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  alterados text;
begin
  -- O síndico corrige o que precisar: erro de unidade ou de descrição numa
  -- notificação já emitida é coisa que ele tem que poder consertar.
  if public.eh_sindico() then
    return new;
  end if;

  select string_agg(chave, ', ' order by chave) into alterados
    from jsonb_each(to_jsonb(new) - 'texto' - 'updated_at') as campo(chave, valor)
   where campo.valor is distinct from (to_jsonb(old) -> campo.chave);

  if alterados is not null then
    raise exception 'Sem ser o síndico, só a redação da carta pode ser alterada. Não pode alterar: %', alterados
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

revoke execute on function public.notificacao_auxiliar_so_edita_texto() from public;
revoke execute on function public.notificacao_auxiliar_so_edita_texto() from anon;

drop trigger if exists trg_notificacao_auxiliar_so_edita_texto on public.notificacoes;
create trigger trg_notificacao_auxiliar_so_edita_texto
  before update on public.notificacoes
  for each row execute function public.notificacao_auxiliar_so_edita_texto();
