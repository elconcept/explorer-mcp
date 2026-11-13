# Cloudflare MCP Explorer

Repozytorium: https://github.com/elconcept/explorer-mcp (publiczne).
Na Synology kod jest w /volume2/docker/explorer-mcp; pliki .cf-service-token i cloudflare_registry.json są lokalnymi plikami czasu działania i nie są wersjonowane. Po nowym klonowaniu należy dostarczyć własny eksport rejestru Cloudflare, skonfigurować poświadczenia i dopiero uruchomić usługę.


Prywatny interfejs `https://explorer.xlap.pl` uruchomiony na Synology/Portainer (stack 51, kontener `lex-mcp-explorer`). Publiczny dostęp jest kontrolowany przez Cloudflare Access.

## Stan produkcyjny — 2026-11-13

- **Jeden widok wszystkich zarejestrowanych serwerów MCP konta Cloudflare**: 13 serwerów / 375 narzędzi.
- Przy każdym serwerze tagi jego istniejących portali: `lex-prawo`, `xtools`, `ai-admin-tools`. Serwery spoza portali nie mają tagu.
- Źródło rejestru: `cloudflare_registry.json`, eksport metadanych przez Cloudflare Admin API `GET /accounts/{account_id}/access/ai-controls/mcp/servers` wraz z listą portali. Rozróżniane są identyfikatory nawet przy jednakowych nazwach.
- **35 narzędzi aktywnych**: 17 poprzez `lex.xlap.pl/mcp` (PrawMI), 18 przez sześć serwerów MCP z połączeniem bezpośrednim. Przy odświeżeniu dostępność jest sprawdzana za pomocą rzeczywistych `initialize` i `tools/list`, równolegle, z timeoutami i cache ~60 s.
- Dla serwerów z dostępem bezpośrednim żadne poświadczenia portalu Lex nie są wysyłane do innej domeny. Narzędzia z auth `bearer`/`oauth` są oznaczone jako niepołączone, jeżeli bieżąca sesja nie daje do nich autoryzowanej trasy. Sam status `ready` w Cloudflare nie jest dowodem dostępności wywołań.
- **340 narzędzi obecnych w rejestrze, ale niedostępnych tą tożsamością/przez te trasy** nie jest fałszywie oznaczanych jako aktywne. Dla nich potrzebna jest autoryzowana integracja ze źródłowym MCP lub odpowiednim portalem. Nie włączano dodatkowych uprawnień do administrowania NAS/Portainerem.
- Przyciski i formularze są generowane na podstawie `inputSchema`; enum i boolean to wybory przyciskowe, integer/number mają przyciski +/- i presety min/domyslnie/max; tekst wymagający dowolnej wartości pozostaje polem tekstowym. Argumenty JSON pokazuje podgląd, nie trzeba go ręcznie edytować.
- `Sprawdź dostępność` odświeża faktyczne połączenia; **nie aktualizuje pliku rejestru Cloudflare**. Po zmianie konfiguracji konta rejestr trzeba ponownie wyeksportować przez Cloudflare Admin, dopóki nie zostanie zapewniona osobna autoryzacja API do automatycznej synchronizacji.
- Backend nie loguje argumentów ani sekretów. Operacje modyfikujące wymagają potwierdzenia. Origin POST musi pasować do `https://explorer.xlap.pl`.

## Architektura

- Kod: `/volume2/docker/explorer-mcp`, w kontenerze `/app` (bind mount read-only).
- Python 3.12, standardowa biblioteka, Streamable HTTP JSON-RPC 2.0, JSON/SSE, sesje MCP.
- `GET /healthz`, `GET /api/catalog?refresh=1`, `POST /api/call`.
- `app.py` ładuje `cloudflare_registry.json`; `portal_catalog.json` zachowano historycznie jako fallback.
- Poświadczenia do Lex pozostają na serwerze w konfiguracji kontenera lub w nieśledzonym pliku `.cf-service-token`; nigdy nie są wysyłane do przeglądarki. Dostęp przez Lex jest faktycznie potwierdzony produkcyjnym `tools/call`.
- Bezpośrednia droga wywołania używa wyłącznie URL HTTPS ze zaufanego eksportu Cloudflare, bez przenoszenia tokenu Lex do pozostałych hostów.

## Testy (2026-11-13)

- Python `unittest discover`: 12/12 OK; Ruff `check`: OK.
- Playwright Chromium, izolowany fixture MCP: 13/13 OK.
- Playwright Chromium, produkcyjny interfejs w wewnętrznej sieci Docker: kontrola 13 serwerów, 375 narzędzi i tagów portali — OK.
- **Dwa produkcyjne E2E z realnym tools/call w przeglądarce** — PrawMI `get_article(KC, 1)` i EU-SPARQL `search_by_celex(32016R0679)` — OK.
- Dla testów przez wewnętrzny adres `http://lex-mcp-explorer:8080` testowy HTTP proxy Playwright ustawia prawidłowy publiczny Origin. Nie zmieniono walidacji Origin w produkcji.
- Testy UI, formularzy, bezpieczeństwa i API: `tests/ui.spec.js`, `tests/snapshot.spec.js`, `test_app.py`, `test_transport.py`.

Kod oraz zaktualizowany dziennik wdrożenia znajdują się na Synology, nie na GitHub.


## Widok odpowiedzi RAW JSON / Pretty — 2026-11-13

Przycisk `Widok: RAW JSON` / `Widok: Pretty` znajduje się obok wyniku wywołania MCP. Domyślnie pokazywany jest surowy JSON jak przed zmianą. Przełączenie jest lokalne, nie uruchamia ponownie narzędzia, a ostatnio wybrany tryb pozostaje aktywny podczas wyboru kolejnych narzędzi.

- `RAW JSON`: niezmieniona, pełna odpowiedź MCP jako czytelny JSON.
- `Pretty`: sformatowane bloki tekstowe MCP (Markdown: nagłówki, pogrubienia, kursywa, przekreślenia, listy i zadania, cytaty, tabele, kod i linki). Gdy blok tekstowy zawiera JSON, jest przedstawiany jako struktura z nazwami pól i ich zawartością; `structuredContent` dostępne jest w rozwijanej sekcji.
- `Kopiuj JSON` / `Kopiuj tekst` kopiuje treść aktualnie wybranego widoku.
- Renderer `pretty.js` działa lokalnie w przeglądarce, nie używa `innerHTML`, nie wykonuje treści HTML/JavaScript zwróconej przez MCP. Linki klikalne tylko dla protokołów HTTP(S). Przy bardzo dużych wynikach tryb Pretty może skracać wyświetlanie; RAW JSON pozostaje pełny.
- Backend jawnie udostępnia plik `/pretty.js`, zgodnie z CSP `script-src 'self'` bez dodawania zewnętrznych skryptów.

**Testy po wdrożeniu:** Chromium Playwright mock MCP 16/16 (w tym formatowanie Markdown, strukturalny JSON, bezpieczne traktowanie HTML i JavaScript, przełączanie bez drugiego `tools/call`); Chromium produkcyjne 3/3 (katalog i dwa rzeczywiste narzędzia PrawMI/EU-SPARQL z przełączaniem widoków); unittest Python 12/12; Ruff check i format --check OK.
