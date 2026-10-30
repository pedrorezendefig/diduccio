# FLUXOGRAMAS.md
<!-- gerado por /snapshot; não editar à mão -->

Fluxos do Diduccio no subset Mermaid que o dashboard desenha (flowchart TD, sequenceDiagram,
stateDiagram-v2). Renderiza nativo no GitHub.

## Contexto: quem fala com quem

```mermaid
flowchart TD
    vercel[Vercel] -- hospeda o build --> app[Diduccio<br/>React 19 + Vite 7]
    app -- login e sessão --> auth[Supabase Auth]
    app -- leitura e escrita com RLS --> db[Supabase Postgres]
    app -- anexos e fotos --> storage[Supabase Storage]
    app -- fetch com o token da sessão --> edge[Edge Functions<br/>criar-usuario, entrar, gerir-usuario, ia, receita]
    edge -- service role --> db
    edge -- texto, primeiro da cascata --> gemini[Gemini]
    edge -- texto, segundo da cascata --> groq[Groq]
    app -- link click-to-chat --> whatsapp[WhatsApp]
```

**Quem é quem (para leigo):**
- **app** - o Diduccio no navegador: React servido pela Vercel, fala direto com o Supabase.
- **vercel** - hospeda o build estático e reescreve toda URL para `index.html`.
- **auth** - Supabase Auth guarda as contas; o login entra pela função `entrar`, que converte CPF em e-mail.
- **db** - Postgres do Supabase; o RLS decide o que cada cargo lê e escreve.
- **storage** - bucket do Supabase com fotos, atestados, notas e assinaturas.
- **edge** - funções Deno no Supabase para o que não pode rodar no navegador: criar e gerir usuário, login, IA e receita.
- **gemini** - modelos de texto do Google, primeiro provedor da função `ia`.
- **groq** - segundo provedor da função `ia`, usado quando o Gemini falha.
- **whatsapp** - link pronto que abre a conversa com o morador; o app não manda mensagem sozinho.
