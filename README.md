# Hotel Jardim (PRÉVIA TEMPORÁRIA)

PWA de gestão do Hotel Jardim + módulo de crédito + agenda + chat. Infra própria, separada do Minera Pará.
> Esta publicação no GitHub Pages é uma **prévia temporária** (modo demonstração, dados só no aparelho) até a decisão do repositório definitivo e do projeto Supabase novo.

## Configurar
1. Crie um projeto Supabase novo. Em SQL Editor rode `sql/hotel-jardim-COMPLETO.sql` (= 001 + 002).
2. Edite **só** `config.js` com a URL e a chave anon do projeto novo.
3. Auth > URL Configuration: adicione a URL do GitHub Pages em Site URL/Redirect URLs.

## Testes
- `node --test tests/` (juros simples/compostos, parcelas, vencimentos, status de quartos, resumo)
- `python3 -m http.server 8765` e `node tests/smoke.mjs` (Playwright, 390 e 360 px, modo demo)
