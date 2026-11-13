const { test, expect } = require('@playwright/test');

test('health, security headers and static assets', async ({ page, request }) => {
  const health = await request.get('/healthz');
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toEqual({ status: 'ok' });
  const root = await request.get('/');
  expect(root.ok()).toBeTruthy();
  expect(root.headers()['content-security-policy']).toContain("default-src 'none'");
  expect(root.headers()['x-frame-options']).toBe('DENY');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Cloudflare MCP Explorer' })).toBeVisible();
});

test('shows upstream servers and tools, never portal admin controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toContainText('1 serwerów / 3 narzędzi');
  await expect(page.locator('#servers .nav-item')).toHaveCount(1);
  await expect(page.locator('#tools .nav-item')).toHaveCount(3);
  await expect(page.locator('body')).not.toContainText('portal_toggle_servers');
  await page.locator('#toolSearch').fill('mutate');
  await expect(page.locator('#tools .nav-item')).toHaveCount(1);
  await page.locator('#toolSearch').fill('');
});

test('read-only query executes MCP and displays response', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /e2e__search/i }).click();
  await page.locator('#query').fill('testowana fraza');
  await page.getByRole('button', { name: 'Wykonaj narzędzie' }).click();
  await expect(page.locator('#result')).toContainText('WYNIK: testowana fraza');
  await expect(page.locator('#runtime')).toContainText('OK');
});

test('required query is validated without handwritten JSON', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /e2e__search/i }).click();
  await expect(page.locator('textarea#arguments')).toHaveCount(0);
  await expect(page.locator('#arguments')).toContainText('{}');
  await page.getByRole('button', { name: 'Wykonaj narzędzie' }).click();
  await expect(page.locator('#result')).toContainText('Błąd parametrów');
});

test('enum parameters render as selectable buttons and retain schema values', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /e2e__search/i }).click();
  const group = page.locator('.parameter[data-field="court_filter"]');
  await expect(group.getByRole('button', { name: 'Dodaj parametr court_filter' })).toBeVisible();
  await group.getByRole('button', { name: 'Dodaj parametr court_filter' }).click();
  await group.getByRole('button', { name: 'NSA' }).click();
  await expect(group.getByRole('button', { name: 'NSA' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#arguments')).toContainText('"court_filter": "NSA"');
  await page.locator('#query').fill('orzeczenia');
  await page.getByRole('button', { name: 'Wykonaj narzędzie' }).click();
  await expect(page.locator('#result')).toContainText('"court_filter": "NSA"');
});

test('numeric parameter enforces minimum, maximum and integer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /e2e__search/i }).click();
  const group = page.locator('.parameter[data-field="limit"]');
  await group.getByRole('button', { name: 'Dodaj parametr limit' }).click();
  await group.getByRole('spinbutton', { name: 'limit' }).fill('25');
  await page.locator('#query').fill('próba');
  await page.getByRole('button', { name: 'Wykonaj narzędzie' }).click();
  await expect(page.locator('#result')).toContainText('poza dozwolonym zakresem');
  await group.getByRole('spinbutton', { name: 'limit' }).fill('7');
  await page.getByRole('button', { name: 'Wykonaj narzędzie' }).click();
  await expect(page.locator('#result')).toContainText('"limit": 7');
});

test('boolean parameters render Tak/Nie buttons with explicit opt-in', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /e2e__search/i }).click();
  const group = page.locator('.parameter[data-field="skip_external"]');
  await group.getByRole('button', { name: 'Dodaj parametr skip_external' }).click();
  await group.getByRole('button', { name: 'Tak' }).click();
  await expect(group.getByRole('button', { name: 'Tak' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#arguments')).toContainText('"skip_external": true');
  await group.getByRole('button', { name: 'Usuń parametr skip_external' }).click();
  await expect(page.locator('#arguments')).not.toContainText('skip_external');
});

test('mutating tool requires explicit confirmation and sends selected query', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /e2e__mutate/i }).click();
  await page.locator('#query').fill('kontrola');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Wykonaj narzędzie' }).click();
  await expect(page.locator('#result')).toContainText('Brak wywołania');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Wykonaj narzędzie' }).click();
  await expect(page.locator('#result')).toContainText('WYKONANO: kontrola');
});

test('MCP tool errors remain visible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /e2e__fail/i }).click();
  await page.getByRole('button', { name: 'Wykonaj narzędzie' }).click();
  await expect(page.locator('#runtime')).toContainText('Błąd narzędzia');
  await expect(page.locator('#result')).toContainText('FAIL FROM MCP');
});

test('API rejects admin tools, mismatched server, missing confirmation and foreign origin', async ({ request }) => {
  const p = { serverId:'e2e', name:'e2e__search', arguments:{query:'x'} };
  const admin = await request.post('/api/call', { data:{...p, name:'portal_toggle_servers'} });
  expect(admin.status()).toBe(404);
  const wrongServer = await request.post('/api/call', { data:{...p, serverId:'unknown'} });
  expect(wrongServer.status()).toBe(404);
  const missingServer = await request.post('/api/call', { data:{name:'e2e__search', arguments:{query:'x'}} });
  expect(missingServer.status()).toBe(400);
  const unconfirmed = await request.post('/api/call', { data:{...p, name:'e2e__mutate', arguments:{text:'x'}} });
  expect(unconfirmed.status()).toBe(409);
  const badContent = await request.post('/api/call', {
    data:'plain text', headers:{'Content-Type':'text/plain'}
  });
  expect(badContent.status()).toBe(415);
  const origin = await request.post('/api/call', {
    data:p, headers:{Origin:'https://evil.example'}
  });
  expect(origin.status()).toBe(403);
});

test('API validates request bounds and JSON types', async ({ request }) => {
  const p = {serverId:'e2e', name:'e2e__search', arguments:{query:'x'}};
  const badName = await request.post('/api/call', {
    data:{...p, name:'../etc/passwd?'}
  });
  expect(badName.status()).toBe(400);
  const badArgs = await request.post('/api/call', {data:{...p, arguments:[]}});
  expect(badArgs.status()).toBe(400);
  const empty = await request.post('/api/call', {data:{}});
  expect([400, 404, 413]).toContain(empty.status());
});

test('mobile layout has no horizontal document overflow', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('button', {name:/e2e__search/i}).click();
  const rootWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(rootWidth).toBeLessThanOrEqual(390);
});


test('numeric parameters expose stepper and preset buttons rather than raw JSON inputs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /e2e__search/i }).click();
  const group = page.locator('.parameter[data-field="limit"]');
  await group.getByRole('button', { name: 'Dodaj parametr limit' }).click();
  await expect(group.getByRole('button', { name: 'Zwiększ parametr limit' })).toBeVisible();
  await group.getByRole('button', { name: 'Domyślnie: 3' }).click();
  await expect(page.locator('#arguments')).toContainText('"limit": 3');
  await group.getByRole('button', { name: 'Zwiększ parametr limit' }).click();
  await expect(page.locator('#arguments')).toContainText('"limit": 4');
  await group.getByRole('button', { name: 'Max: 10' }).click();
  await expect(page.locator('#arguments')).toContainText('"limit": 10');
  await expect(group.getByRole('button', { name: 'Zwiększ parametr limit' })).toBeDisabled();
});


test('RAW JSON / Pretty toggle formats Markdown without re-running the MCP tool', async ({ page }) => {
  const markdown = [
    '# Nagłówek wyniku',
    '',
    '**Pogrubienie**, *kursywa*, ~~skreślenie~~ i `kod`.',
    '',
    '- Pierwsza pozycja',
    '- Druga pozycja',
    '',
    '> Cytat z dokumentacji',
    '',
    '| Pole | Wartość |',
    '| --- | --- |',
    '| Odpowiedź | **Tak** |',
    '',
    '```json',
    '{"ok": true}',
    '```',
    '',
    '[Oficjalna strona](https://example.org/docs)',
    '[Zły link](javascript:alert(1))',
    '<img src=x onerror=alert(1)>',
  ].join('\n');
  let calls = 0;
  await page.route('**/api/call', async (route) => {
    calls++;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({result:{content:[{type:'text',text:markdown}],isError:false}}),
    });
  });
  await page.goto('/');
  await expect(page.locator('#resultMode')).toHaveText('Widok: RAW JSON');
  await expect(page.locator('#resultMode')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', {name:/e2e__search/i}).click();
  await page.locator('#query').fill('test');
  await page.getByRole('button', {name:'Wykonaj narzędzie'}).click();
  await expect(page.locator('#result')).toContainText('Nagłówek wyniku');
  await expect(page.locator('#result')).toContainText('**Pogrubienie**');
  await expect(page.locator('#prettyResult')).toBeHidden();

  await page.locator('#resultMode').click();
  const pretty = page.locator('#prettyResult');
  await expect(pretty).toBeVisible();
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#resultMode')).toHaveText('Widok: Pretty');
  await expect(page.locator('#resultMode')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#copy')).toHaveText('Kopiuj tekst');
  await expect(pretty.locator('h1')).toHaveText('Nagłówek wyniku');
  await expect(pretty.locator('strong').first()).toHaveText('Pogrubienie');
  await expect(pretty.locator('em')).toHaveText('kursywa');
  await expect(pretty.locator('del')).toHaveText('skreślenie');
  await expect(pretty.locator('li')).toHaveCount(2);
  await expect(pretty.locator('blockquote')).toContainText('Cytat z dokumentacji');
  await expect(pretty.locator('table th')).toHaveCount(2);
  await expect(pretty.locator('pre code')).toContainText('"ok": true');
  await expect(pretty.locator('a[href="https://example.org/docs"]')).toHaveText('Oficjalna strona');
  await expect(pretty.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(pretty.locator('img')).toHaveCount(0);
  await expect(pretty).toContainText('<img src=x onerror=alert(1)>');
  await expect(pretty).toContainText('[Zły link](javascript:alert(1))');

  await page.locator('#resultMode').click();
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#copy')).toHaveText('Kopiuj JSON');
  await expect(page.locator('#result')).toContainText('**Pogrubienie**');
  expect(calls).toBe(1);
});

test('Pretty expands JSON serialized inside MCP text and shows structured content', async ({ page }) => {
  const text = JSON.stringify({
    success:true,
    article_content:'# Artykuł\n\n**Treść przepisu**',
    clauses:['Pierwszy paragraf', 'Drugi paragraf'],
  });
  await page.route('**/api/call', (route) => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({result:{
      content:[{type:'text',text}],
      structuredContent:{source:'korpus', count:2},
    }}),
  }));
  await page.goto('/');
  await page.getByRole('button', {name:/e2e__search/i}).click();
  await page.locator('#query').fill('art');
  await page.locator('#resultMode').click();
  await page.getByRole('button', {name:'Wykonaj narzędzie'}).click();
  const pretty = page.locator('#prettyResult');
  await expect(pretty.locator('.pretty-key')).toContainText(['success','article_content','clauses']);
  await expect(pretty.locator('h1')).toHaveText('Artykuł');
  await expect(pretty.locator('strong')).toHaveText('Treść przepisu');
  await expect(pretty.locator('li')).toHaveCount(2);
  await expect(pretty.locator('details summary')).toHaveText('Dane strukturalne');
  await pretty.locator('details summary').click();
  await expect(pretty).toContainText('korpus');
});

test('Pretty shows an MCP error and preserves messages in either view', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name:/e2e__fail/i}).click();
  await page.locator('#resultMode').click();
  await page.getByRole('button', {name:'Wykonaj narzędzie'}).click();
  await expect(page.locator('#prettyResult .pretty-error')).toContainText('Błąd');
  await expect(page.locator('#prettyResult')).toContainText('FAIL FROM MCP');
  await page.locator('#resultMode').click();
  await expect(page.locator('#result')).toContainText('"isError": true');
});
