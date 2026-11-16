#!/bin/bash
# O botão "copiar SQL" do hr-ondas no terminal do Mac: põe o .sql da migration na área de transferência
# byte a byte, pelo caminho (o mesmo `pbcopy < <caminho>` que a subida imprime), e confere pelo sha256.
# O copiar do Claude Code ($.ui.copy) dispara o pbcopy sem esperar e manda também um OSC 52, que o Terminal do Mac
# ignora: o que ia para a área de transferência não tinha prova, e a conferência pelo pbpaste podia ler a de antes.
#
# Uso: copiar.sh <caminho>. Imprime o sha256 do arquivo e sai 0 quando o que foi copiado é o arquivo.
# Saída 2: o arquivo não existe · 3: a área de transferência não bate com o arquivo · 4: sem pbcopy (fora do Mac).
export PATH=/usr/bin:/bin
# o pbcopy e o pbpaste convertem pelo locale: sem UTF-8, "ç" vira "√ß" e a volta pelo pbpaste desfaz, escondendo o erro
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
PBCOPY="${HR_ONDAS_PBCOPY:-/usr/bin/pbcopy}"
PBPASTE="${HR_ONDAS_PBPASTE:-/usr/bin/pbpaste}"

arq="$1"
[ -f "$arq" ] || { echo "o arquivo não existe: $arq" >&2; exit 2; }
[ -x "$PBCOPY" ] && [ -x "$PBPASTE" ] || { echo "sem pbcopy nesta máquina" >&2; exit 4; }

"$PBCOPY" < "$arq" || { echo "o pbcopy falhou" >&2; exit 3; }
esperado=$(shasum -a 256 < "$arq" | cut -d' ' -f1)
colado=$("$PBPASTE" | shasum -a 256 | cut -d' ' -f1)
if [ "$esperado" != "$colado" ]; then
  echo "a área de transferência não bate com o arquivo (sha256 ${esperado:0:12}, colado ${colado:0:12})" >&2
  exit 3
fi
echo "$esperado"
