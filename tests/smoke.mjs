import { chromium } from '/workspace/pwtools/node_modules/playwright/index.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8765/', SH = '/workspace/hotel-jardim/shots/';
const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome' }); let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
for (const w of [390, 360]) {
  const ctx = await br.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2 }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.stack.split('\n').slice(0,3).join(' '))); p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('dialog', d => d.type() === 'prompt' ? d.accept('x') : d.accept());
  await p.goto(BASE + '?demo=1'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#nav:not([hidden])');
  const fill = async o => { for (const [k, v] of Object.entries(o)) { const el = p.locator(`#dlg [name=${k}]`); (await el.evaluate(e => e.tagName)) === 'SELECT' ? await el.selectOption(v) : await el.fill(String(v)); } };
  const save = () => p.click('#dlgOk');
  const nav = t => p.click(`#nav [data-tab=${t}]`); const subt = s => p.click(`[data-sub="${s}"]`);
  // quartos
  await nav('hotel'); for (const n of ['101', '102', '103']) { await p.click('.fab'); await fill({ numero: n, diaria: 150 }); await save(); }
  ok(await p.locator('.card.item').count() === 3, `${w}: 3 quartos criados`);
  await p.locator('.card.item', { hasText: 'Quarto 101' }).getByText('Check-in').click(); await fill({ hospede: 'Ana Souza' });
  ok(await p.inputValue('#dlg [name=valor]') === '150.00', `${w}: valor da estadia calculado`); await save();
  ok(await p.locator('.card.item', { hasText: 'Quarto 101' }).locator('.st-ocupado').count() === 1, `${w}: quarto 101 ocupado após check-in`);
  await nav('inicio'); ok((await p.textContent('[data-test=disponiveis] b')) === '2', `${w}: painel mostra 2 disponíveis`);
  await p.screenshot({ path: `${SH}${w}-inicio.png`, fullPage: true });
  await nav('hotel'); await p.locator('.card.item', { hasText: 'Quarto 101' }).getByText('Check-out').click();
  ok(await p.locator('.card.item', { hasText: 'Quarto 101' }).locator('.st-limpeza').count() === 1, `${w}: check-out → limpeza`);
  await subt('hotel:cam'); await p.click('.fab'); await fill({ nome: 'Maria', valor_limpeza: 30 }); await save();
  await p.getByText('Atribuir limpeza').first().click(); await fill({ quarto_id: await p.locator('#dlg [name=quarto_id] option', { hasText: '101' }).getAttribute('value') }); await save();
  await subt('hotel:limp'); await p.getByText('Concluir').click(); await p.getByText('Pagar', { exact: true }).click();
  ok(await p.locator('.st-concluida').count() === 1 && await p.getByText('✅ pago').count() === 1, `${w}: limpeza concluída e paga`);
  await subt('hotel:quartos'); ok(await p.locator('.card.item', { hasText: 'Quarto 101' }).locator('.st-disponivel').count() === 1, `${w}: quarto volta a disponível`);
  await p.screenshot({ path: `${SH}${w}-quartos.png`, fullPage: true });
  // despesa
  await nav('financas'); await subt('fin:desp'); await p.click('.fab'); await fill({ valor: 45.5, obs: 'conta de luz' }); await p.setInputFiles('#dlg [name=comprovante]', '/workspace/hotel-jardim/icon-192.png'); await save();
  await p.waitForSelector('img.thumb'); ok(true, `${w}: despesa com foto`);
  await subt('fin:resumo'); ok((await p.textContent('#app')).replace(/\s/g,' ').includes('R$ 45,50'), `${w}: resumo mostra despesa`);
  await p.screenshot({ path: `${SH}${w}-financas.png`, fullPage: true });
  // crédito
  await nav('credito'); await subt('cred:cli'); await p.click('.fab'); await fill({ nome: 'Carlos Devedor', telefone: '91999990000' }); await save();
  await p.getByText('Emprestar').click(); const d = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
  await fill({ valor: 1000, taxa: 10, tipo: 'simples', parcelas: 5, data: d }); ok((await p.textContent('#empPrev')).includes('300,00'), `${w}: prévia 5x R$300`); await save();
  await subt('cred:devendo'); ok(await p.locator('.card.late').count() === 1, `${w}: atrasado destacado`);
  ok(await p.isVisible('#navBadge') && Number(await p.textContent('#navBadge')) >= 1, `${w}: badge de alertas`);
  await p.getByText('Registrar pagamento').first().click(); await save();
  ok((await p.textContent('#app')).replace(/\s/g,' ').includes('R$ 1.200,00'), `${w}: saldo devedor após pagamento = 1.200`);
  await p.screenshot({ path: `${SH}${w}-credito.png`, fullPage: true });
  // agenda
  await nav('agenda'); await p.click('.fab'); await fill({ titulo: 'Reunião fornecedor', inicio: '2030-01-10T10:00' }); await save();
  ok(await p.getByText('Reunião fornecedor').count() === 1 && await p.locator('.card', { hasText: 'Carlos Devedor' }).count() >= 1, `${w}: agenda com evento + vencimentos`);
  await p.locator('.card', { hasText: 'Reunião fornecedor' }).getByText('Excluir').click(); ok(await p.getByText('Reunião fornecedor').count() === 0, `${w}: excluir com confirmação`);
  await p.screenshot({ path: `${SH}${w}-agenda.png`, fullPage: true });
  // chat
  await nav('chat'); await p.click('.fab'); await p.locator('#dlg input[name=m]').first().check(); await save();
  await p.fill('#chatTxt', 'Olá Maria, quarto 102 por favor'); await p.click('#composer button[type=submit]');
  await p.waitForSelector('.bub:not(.mine)', { timeout: 4000 }); ok(await p.locator('.bub.mine').count() === 1, `${w}: chat envia e recebe`);
  await p.setInputFiles('#chatFoto', '/workspace/hotel-jardim/icon-192.png'); await p.waitForSelector('.bub img'); ok(true, `${w}: chat envia foto`);
  await p.screenshot({ path: `${SH}${w}-chat.png` });
  // dark + overflow
  await nav('inicio'); await p.click('#btnTheme'); await p.screenshot({ path: `${SH}${w}-inicio-dark.png`, fullPage: true });
  for (const t of ['inicio', 'hotel', 'financas', 'credito', 'agenda', 'chat']) { await nav(t); const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); ok(ov <= 0, `${w}: sem rolagem horizontal em ${t} (${ov})`); }
  ok(errs.length === 0, `${w}: sem erros JS ${errs.join(' | ')}`);
  // tela de login (Supabase configurado falso)
  const ctx2 = await br.newContext({ viewport: { width: w, height: 800 }, serviceWorkers: 'block' }); const p2 = await ctx2.newPage(); await p2.route('**/config.js*', r => r.fulfill({ contentType: 'text/javascript', body: "window.HJ_CONFIG={url:'https://exemplo.supabase.co',anon:'x'}" }));
  await p2.goto(BASE); await p2.waitForSelector('#login:not([hidden])'); ok(true, `${w}: tela de login`); await p2.screenshot({ path: `${SH}${w}-login.png` });
  await ctx.close(); await ctx2.close();
}
await br.close(); console.log(fails ? `FALHAS: ${fails}` : 'TODOS OK'); process.exit(fails ? 1 : 0);
