# Relatório fallow — video-controller

> Gerado em 2026-09-01 · branch `main` · fallow v3.22.0 · extensão Chrome MV3 em JavaScript vanilla (sem bundler em dev), testes Jest/jsdom, lint/format via oxlint/oxfmt, build de release via esbuild + GitHub Actions

## Resumo executivo

O repositório está em bom estado geral: 0 dependências circulares, 0 duplicação, 0 dependências não usadas, lint limpo, suíte de 150 testes passando e exercitando comportamento real (DOM via jsdom), não apenas mocks. O ponto que mais dói é arquitetural, não de qualidade de código: `content.js` concentra ~13 responsabilidades distintas em uma única IIFE de 1069 linhas (risco 43.1, densidade 0.28, 55 commits e 3053 de churn em 6 meses — de longe o maior hotspot do projeto). O segundo ponto mais importante é operacional: o único workflow de CI (`build.yml`) publica um release público a cada push em `main` sem rodar `npm test`, `oxlint` ou `oxfmt --check` antes — o que já é evidenciado por formatação divergente em 4 arquivos. O restante são achados pontuais e baratos de corrigir (licença inconsistente, 1 export morto, 1 versão desalinhada, 1 comentário narrando raciocínio abandonado). Atacar os dois primeiros pontos (CI gate + quebra de `content.js`) é o que mais reduz risco para um repositório público.

## Métricas

| Métrica | Valor |
|---|---|
| Arquivos analisados | 10 (após confirmar que `node_modules/`, `dist/` e `graphify-out/` **não** entram no escopo — ver nota abaixo) |
| Maintainability | 93.2 (bom) · health score 80 B (90 A sem a penalidade de hotspot) |
| Arquivos/exports não usados (confirmados) | 1 confirmado manualmente (`popup.js:222` `_getFound`); 0 reportados automaticamente pelo `dead-code` do fallow |
| Dependências circulares | 0 |
| Blocos duplicados | 0 (dupes: "No code duplication found") |
| Dependências não usadas | 0 |
| Hotspots (churn × complexidade) | 5 arquivos rastreados (≥3 commits) — `content.js` domina com score 100.0 (55 commits, 3053 churn, risco 43.1); `popup.js` 28.3; `content.test.js` 24.5; `popup.test.js` 10.4 (acelerando); `panelTemplate.js` 0.8 (esfriando) |

**Nota sobre "410 arquivos analisados" do run preliminar:** confirmado como leitura errada. `fallow list` descobre exatamente 10 arquivos (`content.js`, `content.test.js`, `content.css`, `panelTemplate.js`, `panelTemplate.test.js`, `popup.html`, `popup.js`, `popup.test.js`, `scripts/utils.js`, `scripts/utils.test.js`) e `fallow health --coverage-gaps --format json` mostra explicitamente `"files_analyzed": 10` e `"functions_analyzed": 410` — o 410 é a contagem de **funções**, não de arquivos. `node_modules/`, `dist/` e `graphify-out/` não aparecem em nenhuma saída do fallow; nada a escopar.

`fallow security`: 0 itens. `fallow similar-code`: pulado — exige `fallow similar-code setup --local` (modelo local não instalado, opt-in), sem sinal coletado.

## Achados

### F1 — `content.js` acumula ~13 responsabilidades em uma única IIFE de 1069 linhas
- **Severidade:** Alta
- **Esforço:** G (>1 dia, mas divisível em etapas incrementais)
- **Categoria:** arquitetura
- **Onde:** `content.js` (arquivo inteiro, 1069 linhas úteis + 1 export block); função `bindPanelEvents` sozinha tem 166 linhas (`content.js:622-787`)
- **O quê:** o `fallow health --hotspots --file-scores` classifica `content.js` como único arquivo com "risk" (43.1, o próximo mais alto é 7.5) e como o hotspot #1 do projeto (score 100.0, 55 commits, 3053 de churn em 6 meses — 2x mais que todo o resto do projeto somado). Lendo o arquivo, ele mistura pelo menos estas responsabilidades independentes:
  1. Acesso nativo a propriedades (bypass de overrides de player): `content.js:20-49` (`_desc`, `_rawGet`, `_rawSet`, `_get`, `_set`)
  2. Constantes de domínio: `content.js:51-64`
  3. Estado global do módulo + `IntersectionObserver` + `FRAME_TOKEN`: `content.js:66-106`
  4. Ações de vídeo (play/pause, seek, speed, volume, fullscreen, PiP, loop): `content.js:119-228`
  5. Construção do DOM do painel/indicador e promoção Popover API: `content.js:230-346`
  6. Funções de sincronização de UI + polling via rAF: `content.js:367-453`
  7. Registro/poda de vídeos conhecidos: `content.js:455-474` e detecção via `MutationObserver`: `content.js:927-983`
  8. Seletor de múltiplos vídeos: `content.js:476-531`
  9. Attach/detach do vídeo ativo: `content.js:533-570`
  10. Visibilidade do painel, drag e wiring de todos os botões + atalhos de teclado: `content.js:572-787`
  11. Indicador de hover (hit-testing por retângulo, cache, throttle por rAF): `content.js:791-925`
  12. Ponte com `popup.js` via `chrome.runtime.onConnect`: `content.js:985-1016`
  13. Liga/desliga via `chrome.storage.local`: `content.js:1018-1038`
- **Por que importa:** é o arquivo que mais muda (55 commits/6 meses) e o único com risco alto — qualquer alteração em uma responsabilidade (ex.: atalhos de teclado) obriga a reler/recompilar mentalmente as outras 12. É o que mais vai custar caro à medida que o projeto cresce, e é o motivo direto pelo qual a maintainability geral (93.2) esconde um ponto fraco real.
- **Como corrigir:** o projeto já usa o padrão de módulo certo para content scripts MV3 sem bundler — `scripts/utils.js` e `panelTemplate.js` já são arquivos separados que expõem globais (`window.formatDuration`, `window.VC_PANEL_TEMPLATE`) e são listados em ordem no `manifest.json`. Replicar o mesmo padrão para `content.js`:
  1. `scripts/native-access.js` — `_desc`/`_rawGet`/`_rawSet`/`_get`/`_set` (menor acoplamento, maior reuso — é o nó mais conectado do grafo, 15 arestas)
  2. `scripts/video-actions.js` — `seek`, `seekTo`, `changeSpeed`, `setSpeed`, `onRateChange`, `togglePlay`, `setVolume`, `toggleMute`, `toggleFullscreen`, `togglePiP`, `toggleLoop`, `clamp`, `roundRate`, constantes
  3. `scripts/panel-dom.js` — criação do DOM do painel/indicador, `promoteToTopLayer`/`dropFromTopLayer`
  4. `scripts/ui-sync.js` — `updatePlayBtn` … `syncAll`, `startPolling`/`stopPolling`
  5. `scripts/video-registry.js` — `registerVideo`/`scanVideos`/`pruneVideos`/`connectedVideos`/`handleRemovals`/`MutationObserver` + seletor (`refreshVideoSelector` e afins)
  6. `scripts/panel-controller.js` — `attachVideo`/`showPanel`/`hidePanel`/`disableUI`/`placePanel`/drag
  7. `scripts/keyboard-shortcuts.js` — `KEY_HANDLERS` + listener de `keydown` (extraído de `bindPanelEvents`)
  8. `scripts/hover-indicator.js` — `positionIndicator`/`pointInRect`/`videoAtPoint`/`updateIndicator` + listeners de mousemove/scroll/resize
  9. `scripts/popup-bridge.js` — `videoSummaries` + `chrome.runtime.onConnect`
  10. `scripts/enabled-toggle.js` — `applyEnabled` + listeners de `chrome.storage`
  11. `content.js` fica só como bootstrap: guard de double-injection, orquestra a chamada inicial (`scanVideos()`, `bindPanelEvents()`, etc.)
  Fazer incrementalmente (1 módulo por PR, testes verdes a cada passo) e atualizar em conjunto: `manifest.json:19` (array `js` do `content_scripts`, mesma ordem de dependência) e `scripts/build.sh` (linha do `esbuild ... --outdir=dist`, incluir os novos arquivos antes de `content.js`).
- **Verificação:** `npm test` continua com 150+ testes passando após cada extração; `npx fallow@3.22.0 health --file-scores` deixa de listar qualquer arquivo com tag `risk` acima de ~15; `npx fallow@3.22.0 health --hotspots` deixa de ter `content.js` disparado sozinho no topo.

### F2 — CI publica release público sem rodar testes, lint ou format
- **Severidade:** Alta
- **Esforço:** P (<1h)
- **Categoria:** testes
- **Onde:** `.github/workflows/build.yml:1-33` (job único `build`: checkout → build.sh → upload artifact → cria/atualiza GitHub Release); dispara em todo `push` para `main`, sem PR/branch protection visível no repo
- **O quê:** o único workflow existente builda o bundle minificado e publica automaticamente um GitHub Release (tag `v<version>` extraída do `manifest.json`) a cada push em `main` — mas nunca executa `npm test`, `npm run lint` ou `npm run format:check`. Não há nenhum outro workflow no repo. Evidência de que essa lacuna já causa drift real: `npx oxfmt --check '**/*.{js,mjs,cjs,css}'` falha hoje em 4 arquivos (`content.test.js`, `panelTemplate.test.js`, `popup.js`, `popup.test.js`) mesmo o projeto tendo formatter configurado e script `npm run format:check` pronto.
- **Por que importa:** este é um repositório público que distribui uma extensão de navegador real; um commit que quebre um teste (ou introduza uma regressão comportamental) vai direto para um Release do GitHub sem qualquer verificação automática — o único freio hoje é humano.
- **Como corrigir:** adicionar um step antes do build em `build.yml`, por exemplo:
  ```yaml
      - name: Install dependencies
        run: npm ci
      - name: Test
        run: npm test
      - name: Lint
        run: npm run lint
      - name: Format check
        run: npm run format:check
  ```
  Rodar isso antes do step "Build minified bundle" e falhar o job (portanto não publicar release) se qualquer um falhar. Depois, corrigir a formatação já divergente com `npm run format:fix`/`npx oxfmt '**/*.{js,mjs,cjs,css}'`.
- **Verificação:** `gh workflow view build.yml` (ou o YAML) mostra os steps de test/lint/format antes do build; `npx oxfmt --check '**/*.{js,mjs,cjs,css}'` sai limpo (exit 0).

### F3 — Licença inconsistente entre README, package.json e ausência de arquivo LICENSE
- **Severidade:** Média
- **Esforço:** P (<1h)
- **Categoria:** ai-slop
- **Onde:** `README.md:7` (badge "license-MIT") e `README.md:149` ("## License / MIT") vs. `package.json:22` (`"license": "ISC"`); não existe nenhum arquivo `LICENSE`/`LICENSE.md` na raiz
- **O quê:** o README afirma duas vezes que o projeto é MIT, o `package.json` declara ISC, e nenhum arquivo de licença real existe no repositório para arbitrar entre os dois.
- **Por que importa:** é um repositório público — quem for decidir se pode usar/forkar o código (inclusive ferramentas automatizadas de compliance de licença) não tem uma fonte de verdade, e tecnicamente, sem arquivo LICENSE, os termos reais são ambíguos independentemente do que os badges dizem.
- **Como corrigir:** decidir a licença pretendida (aparentemente MIT, dado o README) e (1) adicionar `LICENSE` com o texto MIT na raiz, (2) corrigir `package.json:22` para `"license": "MIT"`.
- **Verificação:** `test -f LICENSE && grep -q '"license": "MIT"' package.json`

### F4 — `package.json` nunca teve a versão atualizada (trava em 1.0.0 desde o commit inicial)
- **Severidade:** Baixa
- **Esforço:** P (<1h)
- **Categoria:** dependências
- **Onde:** `package.json:3` (`"version": "1.0.0"`) vs. `manifest.json:4` (`"version": "1.0.7"`, que confere com as 5 tags git `v1.0.3`…`v1.0.7` já publicadas)
- **O quê:** `git log -p --follow -- package.json` mostra que a chave `version` nunca foi alterada desde a criação do arquivo — está congelada em `1.0.0` enquanto o `manifest.json` (fonte real da versão da extensão, usada pelo CI para taguear releases) já está em `1.0.7`.
- **Por que importa:** qualquer tooling de npm/CI futuro que confie em `package.json` como fonte de versão (changelogs automáticos, `npm version`, badges) vai relatar um número errado; hoje só não causa dano porque nada além do CI de release (que lê `manifest.json` diretamente) depende disso.
- **Como corrigir:** sincronizar manualmente agora (`"version": "1.0.7"`) e, para não repetir, considerar que `scripts/build.sh` (ou um novo script `npm run sync-version`) leia `manifest.json` como fonte única e escreva em `package.json` via `jq`/`npm version --no-git-tag-version`.
- **Verificação:** `diff <(jq -r .version manifest.json) <(jq -r .version package.json)` retorna vazio.

### F5 — Export de teste morto em produção: `popup.js:222` `_getFound`
- **Severidade:** Baixa
- **Esforço:** P (<1h)
- **Categoria:** dead-code
- **Onde:** `popup.js:222` (`_getFound: () => found,` dentro do bloco `module.exports`)
- **O quê:** confirmado com `npx fallow@3.22.0 dead-code --trace popup.js:_getFound` → `Reason: No internal references, but file is an entry point`. Fallow não marca como "unused export" automático porque `popup.js` é um entry point externo, então confirmei manualmente: `grep -rn "_getFound" *.js` só retorna a própria definição — nem `popup.test.js` chama esse helper.
- **Por que importa:** é código morto de teste que vazou para o bundle de produção (o `esbuild` do `scripts/build.sh` inclui `popup.js` inteiro, `module.exports` incluso, embora `typeof module` seja `undefined` no browser e o bloco nunca rode ali — ainda assim é peso morto no arquivo fonte e sinaliza um helper de teste que ficou órfão).
- **Como corrigir:** remover a linha `_getFound: () => found,` de `popup.js:222`.
- **Verificação:** `npx fallow@3.22.0 dead-code --trace popup.js:_getFound` deixa de encontrar o símbolo; `npm test` continua verde.

### F6 — Comentário narra uma decisão de implementação abandonada em vez de documentar o código atual
- **Severidade:** Baixa
- **Esforço:** P (<1h)
- **Categoria:** ai-slop
- **Onde:** `popup.js:60-61`
- **O quê:**
  ```js
  function bindVideoCardEvents(card, btn, v) {
    // Clear old listeners by replacing elements with clones if needed, or simply handle it.
    // Instead of replacing the whole element, we'll store a reference to the current video object on the element.
    card._vcVideo = v
  ```
  As duas linhas de comentário narram um raciocínio de "estamos decidindo entre A e B" que já foi resolvido — não descrevem o que o código faz nem por quê, só o processo de chegar até ele. É o único comentário do projeto com esse padrão (todo o resto do código comenta o "porquê" de decisões finais, ex. `content.js:37-39`, `content.js:59-62`).
- **Por que importa:** ruído de manutenção — quem lê depois não sabe se "ou simply handle it" é uma alternativa ainda válida ou lixo esquecido.
- **Como corrigir:** substituir por um comentário direto, ex.: `/* guarda o vídeo atual no próprio elemento para reaproveitar o card entre re-renders (ver diffVideoCards) */`.
- **Verificação:** revisão visual (`git diff -- popup.js`).

## Plano de ataque sugerido

1. **PR "ci-gate-e-higiene"** — agrupa F2 (adiciona test/lint/format ao `build.yml`), F3 (LICENSE + `package.json` license), F4 (sincroniza versão), F5 (remove `_getFound`) e F6 (reescreve comentário) e roda `npm run format:fix` para zerar o drift já existente. Tudo de esforço P, zero risco de regressão de comportamento, fecha a maior lacuna operacional do repo (release sem verificação) e as inconsistências de metadados de uma vez.
2. **PR series "decompor content.js"** (F1) — um módulo por PR na ordem sugerida (native-access → video-actions → panel-dom/ui-sync → video-registry/seletor → panel-controller/keyboard-shortcuts → hover-indicator/popup-bridge/enabled-toggle), atualizando `manifest.json` e `scripts/build.sh` a cada passo e mantendo `npm test` verde. É o único item G do relatório; o ganho é reduzir de vez o hotspot #1 do projeto antes que ele cresça mais (já é o arquivo com mais commits e mais churn dos últimos 6 meses).

## Falsos positivos descartados

| Candidato do fallow | Por que foi descartado |
|---|---|
| "410 arquivos analisados" (run preliminar) | `fallow list` descobre 10 arquivos; `health --coverage-gaps --format json` confirma `"files_analyzed": 10, "functions_analyzed": 410` — 410 é contagem de funções, não de arquivos. `node_modules/`, `dist/`, `graphify-out/` não aparecem em nenhuma saída do fallow. |
| `content.js` / `popup.js` como código "não referenciado" | São entrypoints declarados em `manifest.json:16-24` (`content_scripts`) e `manifest.json:7-14` (`action.default_popup`), confirmados por grep direto no manifesto — não há service worker/background script neste projeto (não declarado, não existe). |
| `popup.html` listado como "untested file" em `health --coverage-gaps` | Arquivo HTML estático sem exports; a lógica que importa (`popup.js`) já é testada diretamente via jsdom em `popup.test.js`. Gap de cobertura estático, não real. |
| CSS health -10 / 96.4% `!important` (`health --css`) | Intencional: `content.css` é injetado em páginas de terceiros e precisa vencer a cascata do site hospedeiro — documentado em `content.js:575-576` e reforçado por `all: revert` em `content.css:8-17`. É a técnica padrão para content scripts, não descuido. |
| Permissões amplas do manifest (`<all_urls>`, `all_frames: true`) | Já corrigido: commit `87b385f` ("fix(security): restrict host permissions to activeTab", 2026-08-20) removeu `host_permissions` amplo — `manifest.json:6` hoje só declara `storage` e `activeTab`. `<all_urls>`/`all_frames` em `content_scripts` seguem necessários pois detectar vídeo em qualquer site/iframe é a funcionalidade central do produto. |
| `video-controller-v1.0.3.zip`, `v1.0.6.zip` e `dist/` na raiz | Já estão no `.gitignore` e nunca foram commitados (`git status --ignored` confirma). São artefatos locais de builds manuais anteriores. `.github/workflows/build.yml` já publica o zip automaticamente como GitHub Release a cada push — a melhoria pedida pela tarefa já está implementada; a única sobra é local (`rm -rf dist video-controller-v*.zip` no ambiente de quem investigou, não um achado de repositório). |
| `similar-code` | Comando exige `fallow similar-code setup --local` (modelo local não instalado); é opt-in e foi pulado sem coletar sinal. |
