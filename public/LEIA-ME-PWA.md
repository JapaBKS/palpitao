# 📱 Bolão da Copa — Arquivos PWA

Estes arquivos transformam o app em um **PWA instalável** (ícone na tela do celular, abre em tela cheia, funciona offline para abrir).

## O que vai em cada lugar

Coloque **todos** estes arquivos na pasta `public/` do seu projeto Vite:

```
public/
├── manifest.json
├── sw.js
├── icon-192.png
├── icon-512.png
├── icon-maskable-512.png
└── apple-touch-icon.png
```

> No Vite, tudo que está em `public/` é servido na raiz do site (ex: `/manifest.json`, `/sw.js`). É exatamente o que o `App.jsx` e o `index.html` esperam.

O `index.html` deste pacote já vem com as tags do PWA prontas. Substitua o seu `index.html` por ele (ou copie só as linhas dentro do `<head>` marcadas com `<!-- PWA -->` e `<!-- iOS / Safari -->`).

## Como instalar no celular (passar pro grupo)

**iPhone (Safari):**
1. Abra o link do bolão no **Safari** (precisa ser o Safari).
2. Toque no botão de **Compartilhar** (quadrado com seta pra cima).
3. Role e toque em **"Adicionar à Tela de Início"**.
4. Pronto — vai aparecer o ícone da bolinha na tela.

**Android (Chrome):**
1. Abra o link no **Chrome**.
2. Vai aparecer um aviso **"Instalar app"** (ou toque no menu ⋮ → **"Instalar aplicativo"**).
3. Confirme e pronto.

## Observações técnicas

- O **service worker** (`sw.js`) usa estratégia *network-first* para a página e **nunca** cacheia chamadas do Supabase — então os placares e palpites são sempre os mais recentes. O cache serve só pra abrir o app offline.
- Se você publicar uma atualização importante e quiser forçar todo mundo a pegar a versão nova, edite a linha `const CACHE_VERSION = "bolao-v1";` no `sw.js` (mude pra `v2`, `v3`...).
- O PWA só funciona em **HTTPS** (o que a maioria das hospedagens — Vercel, Netlify, etc. — já fornece automaticamente).
- Se você **não** subir estes arquivos, o app ainda funciona: o `App.jsx` gera um manifest e um ícone básicos em runtime como fallback. Com os arquivos, fica melhor (ícone mais bonito + offline).
