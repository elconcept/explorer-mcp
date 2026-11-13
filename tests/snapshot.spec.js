const {test, expect} = require('@playwright/test');

test('account-wide Cloudflare registry, portal tags, and live tool gating', async ({page}) => {
  test.skip(!process.env.E2E_BASE_URL?.includes('lex-mcp-explorer:8080'), 'Production-only smoke');
  await page.goto('/');
  await expect(page.locator('#status')).toContainText('15 serwerów / 381 narzędzi');
  await expect(page.locator('#servers .nav-item')).toHaveCount(15);
  await expect(page.locator('body')).not.toContainText('portal_toggle_servers');
  await expect(page.locator('body')).not.toContainText('Lex MCP Portal');
  const left = page.locator('#servers');
  await expect(left).toContainText('PrawMI');
  await expect(left).toContainText('PORTAINER');
  await expect(left).toContainText('SYNOLOGY');
  await expect(left).toContainText('EU-SPARQL');
  await expect(left).toContainText('KRS');
  await expect(left).toContainText('REPERTORIUM');
  await expect(left).toContainText('USTAWY');
  await expect(page.locator('#servers')).not.toContainText('xtools');
  await expect(page.locator('#servers')).toContainText('ai-admin-tools');
  await expect(page.locator('#servers')).toContainText('lex-prawo');
  await expect(page.locator('.portal-tag')).toHaveCount(8);
  await page.getByRole('button', {name:/PrawMI/}).first().click();
  await page.getByRole('button', {name:/search_rulings/}).first().click();
  const enumGroup = page.locator('.parameter[data-field="court_filter"]');
  await enumGroup.getByRole('button', {name:'Dodaj parametr court_filter'}).click();
  await enumGroup.getByRole('button', {name:'NSA'}).click();
  await expect(enumGroup.getByRole('button', {name:'NSA'})).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#arguments')).toContainText('"court_filter": "NSA"');
  const limit = page.locator('.parameter[data-field="limit"]');
  await limit.getByRole('button', {name:'Dodaj parametr limit'}).click();
  await limit.getByRole('button', {name:'Domyślnie: 5'}).click();
  await limit.getByRole('button', {name:'Zwiększ parametr limit'}).click();
  await expect(page.locator('#arguments')).toContainText('"limit": 6');
  await expect(page.locator('textarea#arguments')).toHaveCount(0);
  await expect(page.locator('#run')).toBeEnabled();
  await page.getByRole('button', {name:/SAOS/}).first().click();
  await page.getByRole('button', {name:/^search/}).first().click();
  await expect(page.locator('#run')).toBeDisabled();
  await expect(page.locator('#risk')).toContainText('Brak autoryzowanego połączenia');
  await page.getByRole('button', {name:/KRS/}).first().click();
  await page.getByRole('button', {name:/get_entity/}).first().click();
  await expect(page.locator('#run')).toBeEnabled();
});

test('public endpoint rejects unauthenticated request at Cloudflare Access', async ({request}) => {
  test.skip(process.env.TEST_CLOUDFLARE_EDGE !== '1', 'Edge probe opt-in');
  const r = await request.get('https://explorer.xlap.pl/healthz', {maxRedirects:0, timeout:15000});
  expect([302,401,403]).toContain(r.status());
});


test('live portal tool: PrawMI article read via browser', async ({page}) => {
  test.skip(process.env.TEST_LIVE_TOOL !== '1', 'Live read-only tool probe opt-in');
  test.setTimeout(15000);
  // Internal Docker origin differs from the public origin expected by production CSRF checks.
  await page.route('**/api/call', async route => {
    const response = await route.fetch({headers:{...route.request().headers(), origin:'https://explorer.xlap.pl'}});
    await route.fulfill({response});
  });
  await page.goto('/');
  await page.locator('#servers .nav-item').filter({hasText:'PrawMI'}).first().click();
  await page.locator('#tools .nav-item').filter({hasText:'get_article'}).first().click();
  await page.locator('.parameter[data-field="act_shortname"] input').fill('KC');
  await page.locator('.parameter[data-field="article_number"] input').fill('1');
  await page.getByRole('button', {name:'Wykonaj narzędzie'}).click();
  await expect(page.locator('#result')).toContainText('Kodeks', {timeout:30000});
  await expect(page.locator('#runtime')).toContainText('OK');
  await page.locator('#resultMode').click();
  await expect(page.locator('#prettyResult')).toContainText('Kodeks');
  await expect(page.locator('#prettyResult .pretty-key')).toContainText(['act_title','article_content']);
  await expect(page.locator('#result')).toBeHidden();
  await page.locator('#resultMode').click();
  await expect(page.locator('#result')).toBeVisible();
});

test('live direct tool: EU-SPARQL CELEX via browser', async ({page}) => {
  test.skip(process.env.TEST_LIVE_TOOL !== '1', 'Live read-only tool probe opt-in');
  test.setTimeout(15000);
  // Internal Docker origin differs from the public origin expected by production CSRF checks.
  await page.route('**/api/call', async route => {
    const response = await route.fetch({headers:{...route.request().headers(), origin:'https://explorer.xlap.pl'}});
    await route.fulfill({response});
  });
  await page.goto('/');
  await page.locator('#servers .nav-item').filter({hasText:'EU-SPARQL'}).first().click();
  await page.locator('#tools .nav-item').filter({hasText:'search_by_celex'}).first().click();
  await page.locator('.parameter[data-field="celex"] input').fill('32016R0679');
  await page.getByRole('button', {name:'Wykonaj narzędzie'}).click();
  await expect(page.locator('#result')).toContainText('32016R0679', {timeout:30000});
  await expect(page.locator('#runtime')).toContainText('OK');
  await page.locator('#resultMode').click();
  await expect(page.locator('#prettyResult')).toContainText('32016R0679');
  await expect(page.locator('#prettyResult')).toContainText('Rozporządzenie');
  await page.locator('#resultMode').click();
  await expect(page.locator('#result')).toBeVisible();
});
