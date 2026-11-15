// Opt-in local QA only. Requires installed Playwright, Chromium and ffmpeg; never uses a real camera.
const fs = require('fs'), assert = require('assert/strict'), { createRequire } = require('module'), req = createRequire(require('path').resolve(__dirname, '../package.json')), pool = req('./src/config/database'), { chromium } = require('playwright');
assert.equal(process.env.ZAIRO_OPERATION_TEST, '1');
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(process.env.DATABASE_URL).hostname));
const f = JSON.parse(fs.readFileSync(process.env.OPERATION_FIXTURES || '/workspace/work/stage6-private-fixtures.json')), base = 'http://127.0.0.1:4302', out = process.env.OPERATION_CAPTURES || '/workspace/work/stage6-close-captures';
fs.mkdirSync(out, { recursive: true });
let browser;
const report = { conditions: 'Chromium local, viewport emulated; no physical phones', checks: [], metrics: {} };
(async () => {
    assert.deepEqual(await fetch('http://127.0.0.1:3002/api/qa-safety').then(r => r.json()), { emailStub: true, notifications: false });
    await req('qrcode').toFile('/workspace/work/stage6-camera.png', 'http://127.0.0.1:4302/t/' + f.camera.entries[0].uuid_entrada, { width: 280, margin: 4 });
    require('child_process').execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-i', '/workspace/work/stage6-camera.png', '-vf', 'pad=640:480:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p', '-r', '10', '-t', '2', '/workspace/work/stage6-camera.y4m']);
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=/workspace/work/stage6-camera.y4m'] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Costa_Rica', reducedMotion: 'reduce' });
    await ctx.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
    const p = await ctx.newPage();
    p.setDefaultTimeout(12000);
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => d.accept());
    const go = async (path) => p.goto(base + path, { waitUntil: 'networkidle' });
    const shot = async (name) => { await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' horizontal page overflow'); await p.screenshot({ path: out + '/' + name + '.png', fullPage: !(await p.locator('.operational-overlay').count()), animations: 'disabled' }); };
    async function login(role) { await go('/login'); await p.getByLabel('Correo', { exact: true }).fill(f.users.find(u => u.role === role).correo); await p.getByLabel('Contraseña', { exact: true }).fill(f.password); await p.getByRole('button', { name: 'Ingresar al sistema' }).click(); await p.waitForURL(u => u.pathname != '/login'); await p.waitForLoadState('networkidle'); }
    async function chooseScanner() { await p.getByLabel('Evento de control', { exact: true }).selectOption({ label: 'Evento ficticio de acceso 1' }); }
    async function manual(entry) { await p.getByText('Ingresar QR manualmente', { exact: true }).click(); await p.getByLabel('Contenido del QR', { exact: true }).fill(typeof entry === 'string' ? entry : entry.uuid_entrada); const t = performance.now(); await p.getByRole('button', { name: 'Validar QR', exact: true }).click(); return t; }
    async function next() { await p.getByRole('button', { name: 'Siguiente QR', exact: true }).click(); await p.locator('.camera-workspace:visible').waitFor(); assert.equal(await p.locator('.access-result:visible').count(), 0); }
    const group = p.locator('app-grupo-operativo');
    const benefit = name => group.locator('.benefit-card').filter({ has: p.getByRole('heading', { name, exact: true }) });
    async function deliver(name, n, { drop = false, correction = false } = {}) { const row = benefit(name); if (correction)
        await row.locator('summary').click(); await row.getByLabel((correction ? 'Cantidad a corregir · ' : 'Cantidad a entregar · ') + name, { exact: true }).fill(String(n)); if (correction)
        await row.getByLabel('Motivo de corrección · ' + name, { exact: true }).fill('Corrección ficticia por cantidad registrada de más'); await row.getByRole('button', { name: (correction ? 'Revisar corrección de ' : 'Revisar entrega de ') + name, exact: true }).click(); await row.locator('.operation-confirmation').waitFor({ state: 'visible' }); const btn = row.getByRole('button', { name: new RegExp('^Confirmar ') }); await btn.dblclick({ delay: 30 }); if (drop) {
        await group.getByRole('heading', { name: 'Resultado sin confirmar', exact: true }).waitFor();
        await p.waitForFunction(() => { const e = document.querySelector('.pending-operation'); return e && e.getBoundingClientRect().top >= 0 && e.getBoundingClientRect().top < innerHeight - 80; });
    }
    else
        await group.getByRole('status').filter({ hasText: correction ? 'Corrección registrada' : 'Entrega confirmada' }).waitFor(); }
    const gid = f.visual.entries[0].id_paquete;
    await login('entrada');
    const initial = performance.now();
    await go('/admin/kiosk');
    await p.waitForFunction(() => document.querySelectorAll('select option').length >= 3);
    report.metrics.warmInitialMs = performance.now() - initial;
    await chooseScanner();
    const accountingBefore=(await pool.query('SELECT id_compra,subtotal,descuento,total FROM compras_entradas WHERE id_compra=ANY($1::int[]) ORDER BY id_compra',[f.purchases])).rows;
    let warmRequestAt=0;p.on('request',r=>{if(r.url().endsWith('/operacion/escanear'))warmRequestAt=performance.now();});
    let responseAt = 0;
    p.on('response', r => { if (r.url().endsWith('/operacion/escanear'))
        responseAt = performance.now(); });
    let t = await manual(f.visual.entries[2]);
    await p.getByRole('heading', { name: 'ACCESO APROBADO', exact: true }).waitFor();
    await p.getByRole('button', { name: 'Siguiente QR', exact: true }).waitFor({ state: 'visible' });
    await p.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Siguiente QR')?.disabled);
    report.metrics.validationToUsableMs = performance.now() - t;
    report.metrics.responseToUsableMs = performance.now() - responseAt;
        report.metrics.validationHttpMs=responseAt-warmRequestAt;
    assert.ok((await p.locator('.access-result').innerText()).includes('3 de 6'));
    assert.equal(await group.count(), 0);
    for (const width of [360, 390]) {
        await p.setViewportSize({ width, height: 740 });
        const box = await p.getByRole('button', { name: 'Siguiente QR', exact: true }).boundingBox();
        assert.ok(box.y + box.height <= 740, 'next visible ' + width);
        await shot('vip-' + width);
    }
    await p.setViewportSize({ width: 1440, height: 1000 });
    await shot('vip-computadora');
    await p.setViewportSize({ width: 390, height: 844 });
    await p.getByRole('button', { name: 'Ver grupo y beneficios', exact: true }).click();
    await group.waitFor();
    const countBefore = Number((await pool.query('SELECT count(fecha_ingreso) n FROM compra_entrada_detalles WHERE id_paquete=$1', [gid])).rows[0].n);
    await group.getByText('Integrantes del paquete', { exact: true }).click();
    await shot('detalle-grupo-celular');
    await p.setViewportSize({ width: 1440, height: 1000 });
    await shot('detalle-grupo-computadora');
    await p.setViewportSize({ width: 390, height: 844 });
    await group.locator('.member-list').scrollIntoViewIfNeeded();
    await shot('grupo-integrantes-celular');
    assert.equal(countBefore, 3);
    assert.equal(Number((await pool.query('SELECT count(fecha_ingreso) n FROM compra_entrada_detalles WHERE id_paquete=$1', [gid])).rows[0].n), 3);
    report.checks.push('Compact result 360/390/desktop, group read has no admission effect');
    // Actual backend commit followed by dropped delivery response. Reload in another operational route.
    let deliveryRequests = 0, dropDelivery = true;
    await p.route('**/api/operacion/paquetes/*/entrega', async (route) => { deliveryRequests++; if (dropDelivery) {
        const r = await route.fetch();
        assert.equal(r.status(), 200);
        await r.body();
        dropDelivery = false;
        return route.abort('failed');
    } return route.continue(); });
    await deliver('Bebida ficticia', 1, { drop: true });
    await shot('entrega-incierta-celular');
    await p.setViewportSize({ width: 1440, height: 1000 });
    await shot('entrega-incierta-computadora');
    await p.setViewportSize({ width: 390, height: 844 });
    const pendingKey = await p.evaluate(() => Object.keys(localStorage).find(k => k.startsWith('zairo-operation:')));
    const pending = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), pendingKey);
    await p.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
    assert.equal(await p.getByRole('button', { name: 'Siguiente QR', exact: true }).isDisabled(), true);
    await go('/recepcion');
    await p.getByRole('button', { name: 'Pendientes · recuperar resultado', exact: true }).click();
    assert.ok(!(await p.locator('app-pending-operations').innerText()).includes('El ingreso está confirmado'));
    await p.getByRole('button', { name: 'Recuperar resultado', exact: true }).click();
    await p.getByText('Resultado recuperado. Podés cerrar este panel.', { exact: true }).waitFor();
    await p.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
    await p.getByLabel('Evento de recepción', { exact: true }).selectOption({ label: 'Evento ficticio de acceso 1' });
    await p.getByRole('button', { name: 'Ver paquete #' + gid, exact: true }).click();
    await group.waitFor();
    assert.equal(deliveryRequests, 1);
    let row = benefit('Bebida ficticia');
    assert.equal(await row.getByLabel('Cantidad a entregar · Bebida ficticia', { exact: true }).inputValue(), '');
    assert.equal(await row.locator('dd').allTextContents().then(x => x.join(',')), '4,1,3');
    await row.scrollIntoViewIfNeeded();
    await shot('entrega-parcial-celular');
    await p.setViewportSize({ width: 1440, height: 1000 });
    await shot('entrega-parcial-computadora');
    await p.setViewportSize({ width: 390, height: 844 });
    // Invalid quantities must not send. Then complete all, with cleared fields/completion state.
    for (const amount of ['0', '-1', '0.5', '4']) {
        await row.getByLabel('Cantidad a entregar · Bebida ficticia', { exact: true }).fill(amount);
        await row.getByRole('button', { name: 'Revisar entrega de Bebida ficticia', exact: true }).click();
        assert.equal(await row.locator('.operation-confirmation').count(), 0);
    }
    assert.equal(deliveryRequests, 1);
    await deliver('Bebida ficticia', 3);
    await row.getByText('Entrega completa: 4 de 4', { exact: true }).waitFor();
    assert.equal(await row.getByLabel('Cantidad a entregar · Bebida ficticia', { exact: true }).count(), 0);
    await deliver('Litro ficticio', 1);
    await p.locator('.operational-dialog-body').evaluate(e => e.scrollTop = 0);
    await shot('entrega-completa-celular');
    await p.setViewportSize({ width: 1440, height: 1000 });
    await shot('entrega-completa-computadora');
    report.checks.push('Partial/full/invalid quantities; one POST on double click; lost delivery recovered by original identity after route/reload; cleared inputs');
    await p.getByRole('button', { name: 'Volver a la lista', exact: true }).click();
    await p.setViewportSize({ width: 390, height: 844 });
    await p.getByLabel('Buscar mesa, promoción, compra o paquete', { exact: true }).fill('Promoción ficticia');
    await p.getByRole('button', { name: 'Ver paquete #' + gid, exact: true }).scrollIntoViewIfNeeded();
    const scroll = await p.evaluate(() => window.scrollY);
    await p.getByRole('button', { name: 'Ver paquete #' + gid, exact: true }).click();
    await group.waitFor();
    await p.getByRole('button', { name: 'Volver a la lista', exact: true }).click();
    assert.equal(await p.getByLabel('Buscar mesa, promoción, compra o paquete', { exact: true }).inputValue(), 'Promoción ficticia');
    await p.waitForFunction(y => Math.abs(window.scrollY - y) < 3, scroll);
    await p.evaluate(() => window.scrollTo(0, 0));
    await shot('recepcion-celular');
    await p.setViewportSize({ width: 1440, height: 1000 });
    await shot('recepcion-computadora');
    report.checks.push('Reception mobile related fields together, desktop table, detail returns search/event/scroll');
    // Late event response cannot overwrite current event. Late group response cannot reopen closed panel.
    let release;
    await p.route('**/api/operacion/recepcion?*', async (route) => { if (new URL(route.request().url()).searchParams.get('id_evento') === String(f.events[0])) {
        const r = await route.fetch();
        await new Promise(resolve => release = resolve);
        return route.fulfill({ response: r });
    } return route.continue(); });
    const waiting = p.waitForRequest(r => r.url().includes('/operacion/recepcion?'));
    await p.getByRole('button', { name: 'Actualizar recepción', exact: true }).click();
    await waiting;
    await p.getByLabel('Evento de recepción', { exact: true }).selectOption({ label: 'Evento ficticio de acceso 2' });
    await p.getByText('No hay paquetes pagados para esta consulta.', { exact: true }).waitFor();
    release();
    await p.waitForTimeout(200);
    assert.equal(await p.getByRole('button', { name: 'Ver paquete #' + gid, exact: true }).count(), 0);
    await p.unroute('**/api/operacion/recepcion?*');
    await p.getByLabel('Evento de recepción', { exact: true }).selectOption({ label: 'Evento ficticio de acceso 1' });
    await p.getByRole('button', { name: 'Ver paquete #' + gid, exact: true }).waitFor();
    await p.route('**/api/operacion/paquetes/*?*', async (route) => { const r = await route.fetch(); await new Promise(resolve => release = resolve); return route.fulfill({ response: r }); });
    await p.getByRole('button', { name: 'Ver paquete #' + gid, exact: true }).click();
    await p.getByRole('button', { name: 'Volver a la lista', exact: true }).click();
    release();
    await p.waitForTimeout(200);
    assert.equal(await group.count(), 0);
    await p.unroute('**/api/operacion/paquetes/*?*');
    report.checks.push('Late event and group responses ignored');
    // Rejections and general. Lost admission after server commit recovers after reload.
    await go('/admin/kiosk');
    await chooseScanner();
    await manual(f.visual.entries[2]);
    await p.getByRole('heading', { name: 'ACCESO RECHAZADO', exact: true }).waitFor();
    await p.setViewportSize({ width: 390, height: 844 });
    await shot('rechazo-celular');
    await next();
    await manual('QR-ficticio-invalido');
    await p.getByRole('heading', { name: 'ACCESO RECHAZADO', exact: true }).waitFor();
    await next();
    await p.getByLabel('Evento de control', { exact: true }).selectOption({ label: 'Evento ficticio de acceso 2' });
    await manual(f.visual.entries[4]);
    await p.getByRole('heading', { name: 'ACCESO RECHAZADO', exact: true }).waitFor();
    await next();
    await chooseScanner();
    await manual(f.general.entries[0]);
    await p.getByRole('heading', { name: 'ACCESO APROBADO', exact: true }).waitFor();
    assert.equal(await p.locator('.zone-tag').first().innerText(), 'GENERAL');
    await shot('general-celular');
    await p.setViewportSize({ width: 1440, height: 1000 });
    await shot('general-computadora');
    await next();
    let scanPosts = 0;
    await p.route('**/api/operacion/escanear', async (route) => { scanPosts++; const r = await route.fetch(); assert.equal(r.status(), 200); await r.body(); return route.abort('failed'); });
    await manual(f.visual.entries[3]);
    await p.getByRole('heading', { name: 'RESULTADO SIN CONFIRMAR', exact: true }).waitFor();
    await p.setViewportSize({ width: 390, height: 844 });
    await shot('ingreso-incierto-celular');
    await p.reload({ waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Recuperar resultado', exact: true }).click();
    await p.getByRole('heading', { name: 'ACCESO APROBADO', exact: true }).waitFor();
    assert.equal(scanPosts, 1);
    assert.equal(Number((await pool.query('SELECT count(fecha_ingreso) n FROM compra_entrada_detalles WHERE id_paquete=$1', [gid])).rows[0].n), 4);
    await p.unroute('**/api/operacion/escanear');
    for (const entry of f.visual.entries.slice(4)) {
        await next();
        await manual(entry);
        await p.getByRole('heading', { name: 'ACCESO APROBADO', exact: true }).waitFor();
    }
    assert.ok((await p.locator('.access-result').innerText()).includes('6 de 6'));
    const nextStart = performance.now();
    await next();
    report.metrics.nextUsableMs = performance.now() - nextStart;
    report.checks.push('General, used, malformed, wrong event; 3 then 3 VIP; lost admission after commit recovered on reload with no second POST');
    // Synthetic actual decoder. Same video frame cannot replace result or create a second admission.
    await p.getByRole('button', { name: 'Iniciar cámara', exact: true }).click();
    const cameraStart = performance.now();
    await p.getByRole('heading', { name: 'ACCESO APROBADO', exact: true }).waitFor();
    report.metrics.syntheticCameraAndDecodeMs = performance.now() - cameraStart;
    report.metrics.syntheticCameraReadyMs = await p.evaluate(() => performance.getEntriesByName('zairo.camera-ready').at(-1)?.duration);
    let cameraPosts = 0;
    p.on('request', r => { if (r.url().endsWith('/operacion/escanear'))
        cameraPosts++; });
    const videoId = await p.locator('#qr-reader video').evaluate(v => v.srcObject.getVideoTracks()[0].id);
    await next();
    await p.waitForTimeout(900);
    assert.equal(cameraPosts, 0);
    assert.equal(await p.locator('#qr-reader video').evaluate(v => v.srcObject.getVideoTracks()[0].id), videoId);
    report.checks.push('Synthetic camera decoder, Next clears result and resumes same camera, repeated frame ignored');
    // Admin: explicit table change whose response is lost, replay original key after closing/reload.
    await login('admin');
    await go('/recepcion');
    await p.getByLabel('Evento de recepción', { exact: true }).selectOption({ label: 'Evento ficticio de acceso 1' });
    await p.getByRole('button', { name: 'Configuración de mesas', exact: true }).click();
    await p.getByLabel('Identificador visible', { exact: true }).fill('VIP Cierre');
    await p.getByRole('button', { name: 'Guardar mesa', exact: true }).click();
    await p.getByText('Mesa creada', { exact: true }).waitFor();
    await p.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
    await p.getByRole('button', { name: 'Ver paquete #' + gid, exact: true }).click();
    await group.waitFor();
    await group.getByText('Cambiar o quitar reserva de mesa', { exact: true }).click();
    await group.getByLabel('Mesa', { exact: true }).selectOption({ label: 'VIP Cierre · VIP · COCTEL · 6 personas' });
    await group.getByLabel('Motivo del cambio de reserva', { exact: true }).fill('Cambio ficticio para recepción');
    await group.getByRole('button', { name: 'Revisar cambio de mesa', exact: true }).click();
    let reservePosts = 0;
    await p.route('**/api/operacion/paquetes/*/mesa', async (route) => { reservePosts++; const r = await route.fetch(); assert.equal(r.status(), 200); await r.body(); return route.abort('failed'); });
    await group.getByRole('button', { name: 'Confirmar Reservar mesa VIP Cierre', exact: true }).click();
    await group.getByRole('heading', { name: 'Resultado sin confirmar', exact: true }).waitFor();
    await group.locator('.pending-operation').scrollIntoViewIfNeeded();
    await shot('reserva-incierta-celular');
    await p.getByRole('button', { name: 'Volver a la lista', exact: true }).click();
    await p.reload({ waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Pendientes · recuperar resultado', exact: true }).click();
    await p.unroute('**/api/operacion/paquetes/*/mesa');
    await p.getByRole('button', { name: 'Reintentar la misma operación', exact: true }).click();
    await p.getByText('Resultado recuperado. Podés cerrar este panel.', { exact: true }).waitFor();
    await p.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
    assert.equal(reservePosts, 1);
    assert.equal(Number((await pool.query('SELECT count(*) n FROM mesa_historial WHERE id_paquete=$1 AND motivo=$2', [gid, 'Cambio ficticio para recepción'])).rows[0].n), 1);
    await p.getByRole('button', { name: 'Ver paquete #' + gid, exact: true }).click();
    await group.waitFor();
    await deliver('Bebida ficticia', 1, { correction: true });
    assert.equal(await benefit('Bebida ficticia').locator('dd').allTextContents().then(x => x.join(',')), '4,3,1');
    await group.getByText('Historial de reservas, entregas y correcciones', { exact: true }).click();
    await group.locator('.operation-history').scrollIntoViewIfNeeded();
    await shot('historial-correccion-celular');
    await p.setViewportSize({ width: 1440, height: 1000 });
    await shot('historial-correccion-computadora');
    assert.ok((await group.locator('.operation-history').innerText()).includes('Equipo ficticio admin'));
    assert.ok((await group.locator('.operation-history').innerText()).includes('Corrección ficticia'));
    report.checks.push('Lost reservation after commit retained across panel close/reload; same-operation retry creates one history; correction reason and named audit shown');
    // Short viewport emulates keyboard occlusion; focus and scroll to explicit confirmation remain reachable.
    await p.setViewportSize({ width: 360, height: 440 });
    await deliver('Bebida ficticia', 1);
    await benefit('Bebida ficticia').getByText('Entrega completa: 4 de 4', { exact: true }).waitFor();
    await p.getByRole('button', { name: 'Volver a la lista', exact: true }).click();
    report.checks.push('360×440 emulated short viewport, form confirmation and close reachable');
    for (const role of ['contabilidad', 'rrhh', 'visor']) {
        await login(role);
        for (const path of ['/recepcion', '/admin/kiosk']) {
            await go(path);
            assert.equal(new URL(p.url()).pathname, role === 'visor' ? '/mi-acceso' : '/dashboard');
        }
    }
    report.checks.push('Five roles retained; unrelated roles denied operational routes');
    assert.deepEqual((await pool.query('SELECT id_compra,subtotal,descuento,total FROM compras_entradas WHERE id_compra=ANY($1::int[]) ORDER BY id_compra',[f.purchases])).rows,accountingBefore);
    report.checks.push('Existing purchase subtotal, discount and total unchanged by all operational actions');
    assert.deepEqual(errors, []);
    await ctx.close();
    // Cold cache lab network. Measures HTTP duration separately from response-to-interactive paint.
    const slow = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const q = await slow.newPage();
    await slow.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
    const u = f.users.find(u => u.role === 'entrada');
    const auth = await fetch('http://127.0.0.1:3002/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: u.correo, password: f.password }) }).then(r => r.json());
    await q.addInitScript(a => { localStorage.setItem('token', a.token); localStorage.setItem('user', JSON.stringify(a.user)); }, auth);
    const cdp = await slow.newCDPSession(q);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 400000 / 8, uploadThroughput: 400000 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const cold = performance.now();
    await q.goto(base + '/admin/kiosk', { waitUntil: 'domcontentloaded' });
    await q.waitForFunction(() => document.querySelectorAll('select option').length >= 3, { timeout: 60000 });
    report.metrics.slowColdInitialMs = performance.now() - cold;
    await q.getByLabel('Evento de control', { exact: true }).selectOption({ label: 'Evento ficticio de acceso 1' });
    await q.getByText('Ingresar QR manualmente', { exact: true }).click();
    await q.getByLabel('Contenido del QR', { exact: true }).fill(f.double.entries[1].uuid_entrada);
    let requestAt = 0, slowResponseAt = 0;
    q.on('request', r => { if (r.url().endsWith('/operacion/escanear'))
        requestAt = performance.now(); });
    q.on('response', r => { if (r.url().endsWith('/operacion/escanear'))
        slowResponseAt = performance.now(); });
    await q.getByRole('button', { name: 'Validar QR', exact: true }).click();
    await q.getByRole('heading', { name: 'ACCESO APROBADO', exact: true }).waitFor();
    await q.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Siguiente QR')?.disabled);
    report.metrics.slowValidationHttpMs = slowResponseAt - requestAt;
    report.metrics.slowResponseToUsableMs = performance.now() - slowResponseAt;
    const nextSlow = performance.now();
    await q.getByRole('button', { name: 'Siguiente QR', exact: true }).click();
    await q.locator('.camera-workspace:visible').waitFor();
    report.metrics.slowNextUsableMs = performance.now() - nextSlow;
    await slow.close();
    fs.writeFileSync('/workspace/work/stage6-close-browser-results.json', JSON.stringify(report, null, 2));
    console.log('PASS', JSON.stringify(report));
})().catch(async (e) => { console.error(e.stack); try {
    const p = browser?.contexts()[0]?.pages()[0];
    if (p) {
        await p.screenshot({ path: '/workspace/work/stage6-close-failure.png', fullPage: true });
        console.log((await p.locator('body').innerText()).slice(-2500));
    }
}
catch { } process.exitCode = 1; }).finally(async () => { await browser?.close(); await pool.end(); });
