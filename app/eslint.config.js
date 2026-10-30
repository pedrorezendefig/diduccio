import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // argsIgnorePattern espelha varsIgnorePattern: sem ele, um componente
      // recebido por prop e usado só em JSX (`{ as: Tag }`, `{ Icon }`) é
      // acusado de não usado, porque o padrão de variáveis não vale para
      // parâmetros desestruturados.
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' },
      ],
      // Assinatura, DriveImage e RetiradaDialog exportam helpers ao lado do
      // componente de propósito (a função e o componente mudam juntos). O
      // preset do Vite marca isso como erro; aqui é aviso: o único efeito é o
      // Fast Refresh recarregar a página inteira nesses três arquivos.
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Teste roda no Node, não no navegador: sem os globais de lá, `process`
    // aparecia como `no-undef`. Um falso positivo nessa regra é caro — ela é a
    // única coisa que pega identificador órfão, e ninguém confia numa lista de
    // erros que sempre tem um erro conhecido dentro.
    files: ['src/__tests__/**/*.{js,jsx}', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
])
