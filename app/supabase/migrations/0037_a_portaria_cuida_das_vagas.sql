-- A portaria passa a ver as vagas, e a corrigir a TAG.
--
-- Até aqui `vagas` e `tags` estavam no grupo "só administrativo" do 0015, junto
-- com churrasqueira, festas, piscina e mudanças. O agrupamento tinha uma razão
-- boa e uma distração:
--
--   A razão: aquelas quatro carregam CPF, RG e contato de quem reservou, e o
--   porteiro não precisa disso para trabalhar.
--
--   A distração: `vagas` e `tags` NÃO carregam nada disso. `vagas` é unidade,
--   número da vaga, placa, modelo e status. `tags` é unidade, veículo e status.
--   É cadastro de VEÍCULO — o que a portaria confere no portão o dia inteiro.
--
-- O porteiro já lê `moradores`, que tem CPF e telefone. Ver `vagas` não amplia
-- o alcance dele sobre dado pessoal.
--
-- O QUE ELE GANHA, E SÓ ISSO:
--
--   vagas  SELECT             — ver de quem é a vaga e qual placa mora nela.
--   tags   SELECT e UPDATE    — corrigir a TAG.
--
-- O que ele NÃO ganha, de propósito: criar vaga, editar vaga, criar TAG, e
-- apagar qualquer uma das duas. Vaga é cadastro, e cadastro é da administração;
-- apagar leva junto a que TAG pertencia a quem.
--
-- Cada linha abaixo recria UMA política nomeada. As que não aparecem aqui não
-- são tocadas, e continuam as do 0015 — recriá-las só para deixá-las iguais
-- seria a chance de alargá-las sem querer.

-- ---------------------------------------------------------------------------
-- vagas: o porteiro olha, e não escreve
-- ---------------------------------------------------------------------------
drop policy if exists vagas_ler on public.vagas;
create policy vagas_ler on public.vagas
  for select to authenticated
  using (public.eh_administrativo() or public.eh_porteiro());

-- ---------------------------------------------------------------------------
-- tags: o porteiro olha e corrige
-- ---------------------------------------------------------------------------
drop policy if exists tags_ler on public.tags;
create policy tags_ler on public.tags
  for select to authenticated
  using (public.eh_administrativo() or public.eh_porteiro());

drop policy if exists tags_editar on public.tags;
create policy tags_editar on public.tags
  for update to authenticated
  using (public.eh_administrativo() or public.eh_porteiro());
