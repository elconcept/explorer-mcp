# lex_mcp_explorer: plan i status, 2026-11-07

## Cel
Prywatny webservice https://explorer.xlap.pl na Synology, dostęp wyłącznie przez istniejące Cloudflare Access (laptopshop.pl). Serwer łączy się z https://lex.xlap.pl/mcp przez service token (CF-Access-Client-Id / CF-Access-Client-Secret), prezentuje serwery MCP, ich narzędzia i schematy argumentów, umożliwia wykonanie tools/call z polem query i JSON, prezentuje pełną odpowiedź.

## Technologia
Python 3.12 bez zależności zewnętrznych, HTML/CSS/Vanilla JS, Docker Compose i Cloudflare Tunnel. Brak bazy i zależności JS/Python. Sekrety wyłącznie w konfiguracji uruchomieniowej, nigdy w Git, przeglądarce ani logach.

## Funkcjonalności
GET /healthz, GET /api/catalog, POST /api/call. MCP Streamable HTTP z initialize, tools/list, paginacją, tools/call, JSON i SSE. Grupowanie narzędzi według wiarygodnych metadanych serwera lub nazw z prefiksem, brak zgadywania przypisania. Edycja query i argumentów JSON. Ograniczenie rozmiaru wejścia/wyjścia, timeouty, walidacja nazwy narzędzia, CSP, bez CORS i bez dowolnego URL upstream. Audyt techniczny tylko nazw, czasu i statusu, bez treści i sekretów.

## Stan początkowy potwierdzony
GitHub elconcept działa, ale elconcept/lex_mcp_explorer oraz warianty z łącznikami zwracają 404, nie wykryto repo na połączonym koncie. Nie tworzyć kopii pod inną nazwą. Dostępne Synology i Portainer. Działa stos cloudflared zarządzany zdalnie przez Cloudflare. Istnieje uwierzytelnianie service tokenem w mcp-orzeczenia (nazwy zmiennych potwierdzone, wartości nie ujawnione). Brak stosu lex_mcp_explorer. MCP Cloudflare jest włączony, ale w aktualnie wykonywalnym katalogu administracyjnym dostępne są tylko PORTAINER i SYNOLOGY.

## Zrealizowano — 2026-11-07

[x] Backend Python Streamable HTTP MCP (initialize / tools/list / tools/call; JSON/SSE), paginacja, obsługa błędów i logi bez argumentów.
[x] Interfejs HTML/CSS/JS: wybór serwera/narzędzia, filtrowanie, schemat JSON, query, odpowiedź, kopiowanie, potwierdzanie operacji.
[x] Snapshot Cloudflare MCP portal lex-prawo: 12 serwerów, 70 narzędzi i schematy; oznaczony tryb awaryjny przy braku połączenia MCP.
[x] Testy jednostkowe exit 0; test /api/catalog: snapshot 12 serwerów i 70 narzędzi.
[x] Synology/Portainer: stos 51 lex-mcp-explorer, dedykowana sieć cf_explorer, bez publikowanych portów, healthy.
[x] Tunel cloudflared: sieć cf_explorer trwałe dodana do Compose stosu ID 14; zachowano 32 rzeczywiste sieci; plik sprzed zmian zabezpieczono.
[x] Cloudflare Tunnel ds1821: ingress explorer.xlap.pl -> http://lex-mcp-explorer:8080 oraz DNS CNAME proxied.
[x] Cloudflare Access: self_hosted app Lex MCP Explorer, ID f508f4bf-99c0-49f4-b012-e72c3dbf2896, wyłącznie istniejąca polityka laptopshop.pl.
[x] README.md, PROJECT_PLAN.md, OPERATIONS_LOG.md, .gitignore, test_app.py i portal_catalog.json na NAS.

## Pozostałe kroki
[ ] W Portainer w stosie 51 podać rzeczywiste wartości CF_ACCESS_CLIENT_ID i CF_ACCESS_CLIENT_SECRET jako zmienne środowiskowe (obecnie UNCONFIGURED). Próby transferu sekretów między konektorami zablokowane przez zabezpieczenia, nie należy ich obchodzić.
[ ] Test tools/list i tools/call na żywo przez Lex MCP z prawdziwym service tokenem.
[ ] Zewnętrzny test logowania HTTPS w przeglądarce laptopshop.pl i przekierowania gościa na Cloudflare Access. Odczyt API potwierdził prawidłowe DNS, ingress i regułę.
[ ] Publikacja w właściwym repo GitHub; elconcept/lex_mcp_explorer i warianty nazwy zwracają 404. Nie modyfikowano żadnego innego repo.
[ ] Opcjonalnie: automatyczne odświeżanie metadanych serwerów przez Cloudflare API z osobnym tokenem; snapshot ma datę 2026-11-07.

## Ścieżki / identyfikatory
NAS: /docker/lex_mcp_explorer; host Docker: /volume2/docker/lex_mcp_explorer.
Adres: https://explorer.xlap.pl; MCP upstream: https://lex.xlap.pl/mcp.
Portainer: Explorer ID 51, cloudflared ID 14. Tunel Cloudflare ds1821.
Backup Compose cloudflared: /docker/cloudflared/docker-compose.yml.bak-lex-explorer-20261107.



## Jakość kodu i testy — aktualizacja 2026-11-07
- Ruff 0.17.3 przypięty w `pyproject.toml` i uruchomiony na Synology w odrębnym kontenerze; `ruff check --no-cache /app` zakończył się exit 0, `ruff format --check --no-cache /app` zakończył się exit 0 (7 plików Python).
- Testy Python `unittest`/transport JSON-RPC, headers i SSE: 10 testów OK.
- Testy Chromium Playwright 1.65.0 w oddzielnej sieci Docker i na izolowanej atrapie MCP: 9/9 OK (finalne wykonanie zakończone exit 0). Testy obejmują UI, wybór serwera, paginację, read-only query, parametry JSON, potwierdzenia operacji zapisu, isError, ograniczenie Origin, walidację HTTP, widok mobilny.
- Wykryto i poprawiono błąd: puste pole Query nadpisywało niepuste dane argumentów w JSON; wprowadzono znacznik `queryTouched`.
- `test_transport.py`, `tests/e2e_server.py`, `tests/ui.spec.js`, `playwright.config.cjs`, `package.json`, `package-lock.json` i `docker-compose.test.yml` zawierają odtwarzalne testy; `.github/workflows/ci.yml` przygotowano do repo GitHub.
- Uruchomienie lokalne: `ruff check --no-cache . && ruff format --check .` oraz `docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from playwright`. Testy nie przeprowadzają prawdziwych mutacji na połączonych MCP.
- Aktualny brak rozwiązania: service token w stosie Portainer ID 51 nadal ma wartość testową `UNCONFIGURED`. Testy produkcyjnych `tools/list` i `tools/call` wymagają autoryzacji; nie twierdzić, że przeszły. Autoryzacja Cloudflare Access dla użytkownika nie została sprawdzona przeglądarką w zalogowanej sesji.


## Końcowa kontrola po uruchomieniu Ruff / Playwright (2026-11-07)
- Ruff `0.17.3`: `check --no-cache` exit 0, `format --check --no-cache` exit 0.
- Python `unittest`: 10/10 OK.
- Playwright Chromium `1.65.0` przeciw izolowanemu serwerowi MCP: 9/9 OK (finalna powtórka po poprawce nadpisywania JSON).
- Playwright przeciw rzeczywistemu wdrożeniu (tylko katalog/snapshot, bez ingerowania w dane): 2/2 OK, w tym odmowa dostępu do publicznego endpointu bez tożsamości na Cloudflare edge (HTTP 403).
- Finalny przebieg ogólnego zestawu E2E w trybie fixture: 9 passed, 2 skipped zgodnie z przeznaczeniem testów produkcyjnych, exit 0.
- `.github/workflows/ci.yml` oraz `docker-compose.test.yml` pozwalają odtworzyć testy; GitHub Actions **nie wykonano**, bo docelowe repo nadal zwraca 404.
- **Uwaga dotycząca brakującej funkcji:** produkcyjne `tools/list` i `tools/call` na portalu Lex pozostają niezweryfikowane, bo stack 51 nadal ma `CF_ACCESS_CLIENT_ID/SECRET=UNCONFIGURED`. Nie utworzono nieużywanego Cloudflare service tokena, którego jednorazowy sekret nie mógłby zostać bezpiecznie przeniesiony do Portainera. Zainstalowanie tokena wymaga skonfigurowania jego dwóch wartości bezpośrednio w Portainer (lub w obsługiwanym, zatwierdzonym magazynie sekretów).


## Stan aktualny — 2026-11-13 (nadpisuje wcześniejsze sekcje „brak tokena” i stare liczby)

1. Wdrożenie działa na Synology; sesja Lex jest uwierzytelniona (niezależnie od historycznych placeholderów zmiennych stosu). Potwierdzono `tools/call` PrawMI w produkcji.
2. Explorer nie korzysta już z portalu Lex jako źródła **listy serwerów**, lecz z eksportu rejestru Cloudflare `cloudflare_registry.json`: 13 serwerów i 375 narzędzi, tagi trzech istniejących portali, bez sztucznego włączania serwerów do portali.
3. Dostępność narzędzi jest weryfikowana bieżącymi połączeniami MCP: 17 narzędzi przez Lex oraz 18 przez sześć serwerów bezpośrednich, łącznie 35. Uprawnienia bearer/OAuth innych serwerów należą do ich sesji/portali i nie zostały nieuprawnienie przekazane Explorerowi.
4. Zastąpiono blokadę zależną wyłącznie od Lex `tools/list` poprawnym wyborem trasy narzędzia według serwera i faktycznej dostępności; działa również testowany bezpośredni `tools/call` EU-SPARQL.
5. Zweryfikowano reguły formularzy, testy Python, Ruff i Chromium Playwright, w tym dwa produkcyjne wywołania przez GUI.
6. **Otwarte:** automatyczna synchronizacja rejestru Cloudflare wymaga niezależnej autoryzacji API dla usługi. Przycisk „Sprawdź dostępność” odnawia połączenia MCP, ale nie pobiera ponownie rejestru konta. Serwery z OAuth/Bearer spoza sesji Lex nadal potrzebują zatwierdzonej trasy autoryzacji.
