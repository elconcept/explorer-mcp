# Dziennik operacji — 2026-11-07
- Sprawdzono GitHub (elconcept), AI Admin Tools, Synology, Portainer.
- elconcept/lex_mcp_explorer i warianty nazwy: 404 / brak widoczności. Bez modyfikacji innych repo.
- Sprawdzono stack cloudflared i autoryzację service tokenem w stosie mcp-orzeczenia bez ujawniania wartości.
- Sprawdzono listę kontenerów i /docker. Nie stwierdzono stosu lex_mcp_explorer.
- Utworzono katalog /docker/lex_mcp_explorer.

- 2026-11-07 — Zapisano app.py, index.html, app.js, styles.css, docker-compose.yml. Backend MCP JSON-RPC/SSE, katalog i interfejs wywołań.
- 2026-11-07 — Utworzono stack Portainer lex-mcp-explorer (ID 51, endpoint 3). Kontener w izolowanej sieci Docker cf_explorer (172.16.12.0/28), bez portów hosta, healthy; test /healthz przechodzi.
- 2026-11-07 — Tymczasowe wartości CF_ACCESS_CLIENT_ID/SECRET to UNCONFIGURED. Funkcje pobierania narzędzi MCP nie są uwierzytelnione ani przetestowane produkcyjnie.
- 2026-11-07 — Utworzono Cloudflare Access self-hosted app Lex MCP Explorer (ID f508f4bf-99c0-49f4-b012-e72c3dbf2896) dla explorer.xlap.pl, wyłącznie istniejąca polityka laptopshop.pl (ID 01d5095b-f8ab-4027-b7db-a5d1b8d40af3).
- 2026-11-07 — Zweryfikowano zdrowy tunel ds1821 i 37 istniejących reguł ingress; DNS explorer.xlap.pl i nowa reguła ingress jeszcze nieutworzone.
- 2026-11-07 — Próby programowego przeniesienia istniejącego service tokena oraz utworzenia i wstrzyknięcia nowego tokena między usługami zostały zablokowane przez zabezpieczenia. Tokenów nie zapisano do repo, logów ani interfejsu.
- 2026-11-07 — Wykryto rozbieżność: Portainer StackFileInspect dla cloudflared pokazuje starszy Compose niż plik na NAS i rzeczywista lista sieci. Aktualizację tunelu należy prowadzić na podstawie aktualnego stanu, bez odłączania innych sieci.
- 2026-11-07 — Przez Docker Engine/Portainer podłączono cloudflared do sieci cf_explorer bez restartowania; potwierdzono oba kontenery w sieci.
- 2026-11-07 — Cloudflare: utworzono ingress explorer.xlap.pl -> http://lex-mcp-explorer:8080 (konfiguracja tunelu wersja 172) oraz rekord CNAME proxied.
- 2026-11-07 — Zabezpieczono kopię /docker/cloudflared/docker-compose.yml.bak-lex-explorer-20261107, zaktualizowano Compose zachowując 32 aktywne sieci Docker; wdrożono przez Portainer StackUpdate ID14. Tunel healthy, cf_explorer podłączona.
- 2026-11-07 — Cloudflare API potwierdziło zdrowy tunel ds1821, regułę ingress, rekord DNS i tylko politykę laptopshop.pl w Access.
- 2026-11-07 — Odczytano za pomocą Cloudflare MCP Portal API aktualny katalog portalu lex-prawo: 12 serwerów i 70 narzędzi. Zapisano lokalną kopię portal_catalog.json (bez poświadczeń) i dodano oznaczony fallback w /api/catalog.
- 2026-11-07 — Dodano test_app.py, README.md i .gitignore. Testy jednostkowe wykonane w kontenerze: Docker exec exit code 0.
- 2026-11-07 — Po restarcie aplikacji test /api/catalog potwierdził snapshot=true, 12 serwerów, 70 narzędzi (exit code 0). Frontend wyłącza wywołania w trybie snapshot, wskazuje brak autoryzacji na żywo.
- 2026-11-07 — Próba zewnętrznego curl HTTPS z sesji analitycznej nie rozwiązała domeny; brak niezależnego testu logowania przeglądarkowego, mimo pozytywnych odczytów Cloudflare API.
- 2026-11-07 — Końcowy stan: Portainer Explorer healthy, cloudflared healthy, Cloudflare Access i DNS skonfigurowane. Nadal wymagane rzeczywiste poświadczenia service token i publikacja w nieodnalezionym repo GitHub. Narzędzia live MCP nie zostały wykonane.
- 2026-11-07 — Rozszerzono przypisywanie live tools/list do serwerów przy użyciu wiarygodnego katalogu Cloudflare: namespace id (np. mcp_prawmi_*) oraz jednoznaczne nazwy narzędzi. Wywołanie MCP pozostaje zależne od service tokena.
- 2026-11-07 — Testy jednostkowe zaktualizowano do nazw portalu (MCP-PRAWMI/USTAWY). Ostateczny wynik: 4 testy, OK, exit code 0.

- 2026-11-07 — Dodano konfigurację `pyproject.toml` Ruff 0.17.3, `package.json` Playwright 1.65.0, `playwright.config.cjs`, `test_transport.py`, `tests/e2e_server.py`, `tests/ui.spec.js`, `docker-compose.test.yml`, `.github/workflows/ci.yml` i package-lock.json.
- 2026-11-07 — Ruff 0.17.3 uruchomiono na Synology; automatyczne naprawienie wybranych błędów, formatowanie, ręczne naprawienie S310/B904/S104, końcowe lint exit 0 i format-check exit 0.
- 2026-11-07 — Rozszerzono testy Python do 10; końcowy wynik 10/10, OK. Test protokołu: nagłówki Cloudflare, sesja, SSE, JSON-RPC errors, HTTP 403, max length i cykl paginacji.
- 2026-11-07 — Pobranie obrazu przeglądarkowego mcr.microsoft.com/playwright:v1.65.0-noble; uruchomiono testowy serwer MCP w kontenerze i testy Playwright z Chromium.
- 2026-11-07 — Pierwsza seria E2E ujawniła 403 Origin na fixture; poprawiono wyłącznie origin izolowanego fixture, bez rozluźniania walidacji produkcyjnej. Druga seria wykryła nadpisywanie pola JSON `text` pustym query; poprawiono frontend przez `queryTouched`.
- 2026-11-07 — Trzecia seria przeglądarkowa Chromium Playwright: 9 passed, exit 0. Testy HTTP fixture potwierdziły tools/list oraz tools/call, w tym treść query.
- 2026-11-07 — Udokumentowano i utrzymano blocker autoryzacji backend -> lex.xlap.pl/mcp (UNCONFIGURED); transfer poświadczeń między narzędziami został wcześniej zablokowany przez zabezpieczenia, nie podejmowano prób obejścia blokady.

- 2026-11-07 — Testy Chromium z E2E fixture po korekcie `queryTouched`: 9/9 OK (exit 0). Dodatkowe scenariusze testowe zaimplementowane dla produkcyjnego snapshotu i ochrony CF Access.
- 2026-11-07 — Test Chromium przeciw rzeczywistemu kontenerowi `lex-mcp-explorer` (bez tokena): snapshot 12 serwerów / 70 narzędzi i disabled calls, OK. Publiczny endpoint `https://explorer.xlap.pl/healthz` bez tożsamości został odrzucony na Cloudflare edge, HTTP 403; 2/2 testy produkcyjnego smoke OK (exit 0).
- 2026-11-07 — Finalny przebieg zestawu Playwright z fixture i testami produkcyjnymi warunkowymi: 9 passed, 2 skipped (w fixture), exit 0.
- 2026-11-07 — Python unittest: 10/10 OK; Ruff 0.17.3 check exit 0, Ruff format --check exit 0; przygotowano CI dla GitHub, ale nie uruchomiono GitHub Actions, ponieważ repo lex_mcp_explorer nadal niewidoczne.
- 2026-11-07 — Produkcyjny backend zdrowy po restarcie, `/healthz=ok`, `/api/catalog`: snapshot=true, 12 serwerów / 70 narzędzi. Zakończenie konfiguracji tokena zastrzeżone: nie utworzono nieużywanego tokena, nie kopiowano poświadczeń pomiędzy systemami z pominięciem zabezpieczeń.

- 2026-11-07 — Po testach usunięto 13 wyłącznie tymczasowych kontenerów Ruff, Playwright i fixture MCP utworzonych w tej sesji. Zachowano obrazy testowe do ponownego uruchomienia; nie usunięto żadnego stosu produkcyjnego.
- 2026-11-07 — Kontrola końcowa po czyszczeniu: Portainer stack 51 Status=running, kontener lex-mcp-explorer running/healthy, CF_ACCESS_CLIENT_ID oraz CF_ACCESS_CLIENT_SECRET nadal placeholder UNCONFIGURED. Repo źródłowe na NAS kompletne wraz z `.github/workflows/ci.yml`, package-lock.json oraz testami.

- 2026-11-09 — Diagnoza: produkcyjny proces Python na Synology korzystał ze starego kodu, mimo zaktualizowanych plików w bind mount /app. Stare API /api/catalog zwracało Lex MCP Portal i portal_list_servers, nie konfigurację serwerów źródłowych. Restart kontenera lex-mcp-explorer wczytał aktualny backend.
- 2026-11-09 — Weryfikacja Cloudflare API GET MCP portal lex-prawo: code_mode=off, skonfigurowane pięć serwerów: PrawMI1 (17), KRS (3), REPERTORIUM (1), PrawMI2 (17), USTAWY (1); razem 39. Odświeżono portal_catalog.json z pełnymi schematami przy użyciu truncate:false; wynik nie zawiera sztucznych wpisów TRUNCATED. Usunięty wcześniej serwer MCP-PRAWO nie jest już wyświetlany.
- 2026-11-09 — Parametry UI: schema enum i bool renderowane jako przyciski, liczby rozszerzono o +/- oraz przyciski Min/Domyślnie/Max, nadal z walidacją zakresu. Tekst pozostaje tylko dla parametrów dowolnych, jak sygnatura lub KRS. Poprawiono blokowanie walidacji formularza przez przeglądarkę (novalidate) na rzecz walidacji aplikacyjnej.
- 2026-11-09 — Testy Python: 11/11 OK; Ruff check: exit 0. Testy Chromium Playwright fixture: 13/13 OK, exit 0. Test produkcyjnego interfejsu Chromium w sieci cf_explorer: 1/1 OK, 1 test edge celowo skipped, exit 0; bez wykonywania realnych mutacji danych.
- 2026-11-09 — Prod /api/catalog: pięć serwerów i 39 narzędzi, 17 aktywnych PrawMI1, snapshot=false, codeMode=off. Diagnostyczny odczyt tools/call portal_list_servers przy obecnej tożsamości zwrócił PrawMI1 enabled i REPERTORIUM disabled; KRS/PrawMI2/USTAWY nie pojawiły się jako dostępne w tej sesji, pomimo ich obecności w konfiguracji Cloudflare. Explorer zachowuje jednoznaczne odróżnienie skonfigurowania i aktualnej dostępności narzędzia.


## 2026-11-13 — account-wide MCP registry, portal tags, real execution routes

- Sprawdzono API Cloudflare `/access/ai-controls/mcp/servers` oraz `/portals`; zidentyfikowano 13 serwerów i portale xtools, lex-prawo, ai-admin-tools. Rejestr i schema narzędzi zapisane do `cloudflare_registry.json`, bez sekretów.
- Zastąpiono pobieranie listy serwerów wyłącznie z `portal_catalog.json`. Każdy serwer otrzymuje osobny identyfikator, metadane synchronizacji i tagi przynależności portalowej. Dodano sortowanie i filtrowanie według portali.
- Zdiagnozowano odmowy `portal_toggle_single_server` dla KRS i USTAWY w sesji Lex mimo wpisu w jego konfiguracji. Nie dodawano serwerów do Lex, nie zwiększano zakresu uprawnień service tokena.
- Zaimplementowano osobne połączenia Streamable HTTP dla serwerów z `authType=unauthenticated`, bez wysyłania poświadczeń Lex na inne domeny. Równoległe `initialize`/ `tools/list` dla sześciu serwerów zakończyły się powodzeniem; 18 narzędzi bezpośrednich. Dodatkowo 17 przez Lex, razem 35 dostępnych/375.
- Zweryfikowano produkcyjne wywołania: `PrawMI/get_article(KC,1)` — HTTP 200, isError=false; `EU-SPARQL/search_by_celex(32016R0679)` — HTTP 200, isError=false, poprawny rekord RODO. KRS przy błędnym numerze odpowiada z narzędzia upstream, a nie z blokady Explorera.
- Testy Python: 12/12 OK; Ruff check OK; Playwright fixture: 13/13 OK; Playwright produkcyjny: katalog/tagi i 2 rzeczywiste `tools/call` poprzez GUI — 3/3 OK, origin testowy prawidłowo symulowany bez zmian prod-CSRF.
- Przycisk odświeżania opisano „Sprawdź dostępność”; odświeża rzeczywiste sesje, nie pobiera ponownie rejestru Cloudflare. Pozostałe 340 narzędzi wymagają autoryzowanych tras do serwerów o auth bearer/OAuth lub właściwych portali.


## 2026-11-13 — przełącznik RAW JSON / Pretty

- Dodano `pretty.js` (samodzielny, lokalny renderer Markdown i tekstu JSON bez HTML injection), aktualizację `index.html` i `app.js`, bez naruszania komunikacji MCP ani poświadczeń.
- Przycisk w nagłówku wyników: `Widok: RAW JSON` / `Widok: Pretty`; zachowuje otrzymaną odpowiedź, przełącza bez nowego wywołania. Kopiowanie zależy od wybranego widoku.
- Renderowanie Markdown: nagłówki, listy/checkboxy, em/strong/del, cytaty, tabele, fenced/inline code, linki tylko HTTP(S). Odpowiedź JSON przekazywana jako tekst jest czytelnie rozbijana na pola; pełny JSON zawsze pozostaje dostępny.
- Nowy asset `/pretty.js` dopisany do białej listy serwowanych plików w `app.py`; poprawki CSS, responsywny tryb Pretty. Nie wprowadzono `innerHTML`, CDN ani dodatkowego kodu wykonywanego z MCP.
- Testy: 16/16 Chromium Playwright z izolowanym MCP, 3/3 Chromium produkcyjne z rzeczywistym wywołaniem `get_article` i `search_by_celex`, Python 12/12, Ruff check i format check 0. Test formatowania weryfikuje brak uruchomienia kodu JavaScript ze zwróconego tekstu i brak dodatkowego `tools/call` przy przełączaniu.


## 2026-11-13 — bieżący rejestr Cloudflare i korekta badge

- Zdiagnozowano błąd: historyczny eksport miał 13 serwerów i 3 portale, w tym nieistniejący już tag `xtools`.
- Z API konta Cloudflare odświeżono `cloudflare_registry.json`: **15 serwerów, 381 narzędzi, 2 portale** (`ai-admin-tools` i `lex-prawo`). Przynależność jest obliczana po *ID* serwera w odpowiedzi API portali, nie po zbliżonej nazwie.
- Po restarcie Explorer API pokazało 41 aktywnych narzędzi; status kontenera `healthy`. Test przeglądarkowy katalogu/badge: 1/1; testy Python: 12/12.
- Źródłowe narzędzie `mcp-ustawy/przepis` otrzymało dokładny nowy opis przez aktualizację `grounding-prawo` (dwie kopie skryptu na `main`), poprawkę kontenera i obrazu `mcp-ustawy:latest` z zachowaniem starego obrazu pod tagiem `before-description-20261113` oraz poprawkę źródła bieżącego kontekstu budowania na NAS.
- Po restarcie `mcp-ustawy`: `initialize` HTTP 200, `tools/list` HTTP 200 i dokładna zgodność opisu. `POST /api/call` przez Explorer dla `przepis(akt="kc", art="1", widok="tekst")`: HTTP 200, isError=false. Cloudflare `servers/mcp-ustawy/sync`: sukces, metadane narzędzia potwierdzone.
- Git: Explorer nie ma katalogu `.git` i nie istnieje repo GitHub o tej nazwie; build snapshot `build-ustawy-20261031` nie jest klonem z `.git`. Na `elconcept/grounding-prawo` scalono PR #78, #82, #83, #87, #92, #93, #94, #95 z `main`. Pozostałe szkice #81/#86 są rozbieżne/niesamodzielne; nie wykonano force-merge.
- Eksport Cloudflare jest aktualizowany ręcznie, nie cyklicznie. Po nowych zmianach w Cloudflare konieczny jest kolejny bezpieczny eksport rejestru.
