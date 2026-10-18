'use strict';
/* Mi despensa · app independiente. Los datos viven en un archivo JSON de tu repositorio privado de GitHub. */

/* ---------- utilidades ---------- */
const PLACES = [['nevera', 'Nevera'], ['congelador', 'Congelador'], ['despensa', 'Despensa']];
const PLACENAME = Object.fromEntries(PLACES);
const UNITS = ['ud', 'paquete', 'bote', 'lata', 'botella', 'g', 'kg', 'ml', 'l'];
const AVISO_DIAS = 3;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fmtNum = n => (Math.round(n * 100) / 100).toLocaleString('es-ES');
const stepFor = u => (u === 'g' || u === 'ml') ? 100 : (u === 'kg' || u === 'l') ? 0.5 : 1;
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const cap1 = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const num = v => Number(v) || 0;
function todayDate() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }
function daysLeft(d) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const [y, m, dd] = d.split('-').map(Number);
  return Math.round((new Date(y, m - 1, dd) - todayDate()) / 86400000);
}
function status(v) {
  const d = daysLeft(v.caduca);
  if (d === null) return { cls: 'none', txt: 'Sin fecha', short: '', rank: 9999 };
  if (d < 0) return { cls: 'bad', txt: d === -1 ? 'Caducó ayer' : 'Caducó hace ' + (-d) + ' días', short: 'caducado', rank: d };
  if (d === 0) return { cls: 'bad', txt: 'Caduca hoy', short: 'hoy', rank: d };
  if (d === 1) return { cls: 'warn', txt: 'Caduca mañana', short: 'mañana', rank: d };
  if (d <= AVISO_DIAS) return { cls: 'warn', txt: 'Caduca en ' + d + ' días', short: d + ' días', rank: d };
  const [y, m, dd] = v.caduca.split('-').map(Number);
  return { cls: 'ok', txt: d <= 30 ? d + ' días' : new Date(y, m - 1, dd).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }), short: '', rank: d };
}
function ago(ts) {
  if (!ts) return '';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
  if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h';
  const d = Math.floor(s / 86400); return d === 1 ? 'ayer' : 'hace ' + d + ' días';
}
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('off'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('off'), 2800); }

/* ---------- emparejar ingredientes con productos ---------- */
const STOP = new Set(('de del la el los las un una unos unas en con y o a al para sin por su sus fresco fresca frescos frescas natural naturales ' +
  'entero entera enteros enteras grande grandes pequeno pequena pequenos pequenas bote botes lata latas paquete paquetes botella botellas ' +
  'unidad unidades ud uds kg gr gramo gramos ml litro litros cucharada cucharadas cucharadita cucharaditas taza tazas pizca diente dientes ' +
  'trozo trozos rodaja rodajas hoja hojas gusto picado picada troceado troceada rallado rallada opcional chorro punado vaso vasos media medio').split(' '));
const canon = w => w.replace(/s$/, '').replace(/e$/, '');
const keyCache = new Map();
function keys(s) {
  let k = keyCache.get(s);
  if (!k) { k = norm(s).split(/[^a-z]+/).filter(w => w.length >= 3 && !STOP.has(w)).map(canon).filter(w => w.length >= 3); keyCache.set(s, k); }
  return k;
}
// Coinciden si todas las palabras clave de uno están en el otro: «leche» ↔ «Leche semidesnatada» sí, «leche de coco» no.
const matches = (ingredient, product) => { const a = keys(ingredient), b = keys(product); return a.length > 0 && b.length > 0 && (a.every(w => b.includes(w)) || b.every(w => a.includes(w))); };
function cleanIngredient(s) {
  let t = String(s).trim().replace(/\(.*?\)/g, '').replace(/^[\d.,/½¼¾\s-]+/, '');
  const unit = /^(g|gr|grs|gramos?|kg|kilos?|ml|cl|l|litros?|cucharad(a|ita)s?|tazas?|latas?|botes?|paquetes?|dientes?|unidad(es)?|uds?|pizcas?|puñados?|chorros?|vasos?|hojas?|ramas?|rodajas?|trozos?|sobres?|bolsas?)\b\.?\s*/i;
  for (let i = 0; i < 2; i++) t = t.replace(unit, '').replace(/^de\s+/i, '');
  return cap1(t.trim()).slice(0, 60);
}

/* ---------- estado ---------- */
const K = { cfg: 'md.cfg', data: 'md.data', dirty: 'md.dirty', tab: 'md.tab', sha: 'md.sha' };
let cfg = ls.get(K.cfg, null);           // {owner, repo, branch, path, token, nombre} o {demo:true, nombre}
let D = ls.get(K.data, null) || { productos: {}, recetas: {} };
if (!D.productos) D.productos = {};
if (!D.recetas) D.recetas = {};
let dirty = ls.get(K.dirty, false);
let sha = ls.get(K.sha, null);
let tab = ls.get(K.tab, 'despensa');
let fPlace = 'todo', qText = '', rqText = '', shopDraft = '', showConn = false;
let sync = { s: 'ok', msg: '' };
let editSeq = 0;
const connected = () => !!(cfg && !cfg.demo && cfg.token);

const liveEntries = m => Object.entries(m).filter(([, v]) => v && !v.borrado);
const products = () => liveEntries(D.productos).filter(([, v]) => v.nombre);
const recipes = () => liveEntries(D.recetas).filter(([, v]) => v.titulo);

function stamp(o) {
  const v = Object.assign({}, o, { editado: Date.now() });
  delete v.borrado;
  if (cfg && cfg.nombre) { v.editadoPor = cfg.nombre; if (!v.por) v.por = cfg.nombre; }
  if (!v.creado) v.creado = v.editado;
  return v;
}
function changed() { ls.set(K.data, D); dirty = true; ls.set(K.dirty, true); editSeq++; render(); scheduleSync(); }
function putP(id, o) { D.productos[id] = stamp(o); changed(); }
function delP(id) { D.productos[id] = { borrado: true, editado: Date.now() }; changed(); }
function putR(id, o) { D.recetas[id] = stamp(o); changed(); }
function delR(id) { D.recetas[id] = { borrado: true, editado: Date.now() }; changed(); }

/* ---------- archivo: formato y fusión ---------- */
function packFile(data) {
  const cut = Date.now() - 30 * 86400000;   // los borrados se olvidan a los 30 días
  const pack = m => Object.entries(m).filter(([, v]) => !(v.borrado && num(v.editado) < cut))
    .map(([id, v]) => Object.assign({ id }, v))
    .sort((a, b) => num(a.creado) - num(b.creado) || (a.id < b.id ? -1 : 1));
  return { app: 'mi-despensa', version: 1, productos: pack(data.productos), recetas: pack(data.recetas) };
}
function fromFile(doc) {
  const out = { productos: {}, recetas: {} }; let fixed = false;
  for (const k of ['productos', 'recetas']) {
    const arr = Array.isArray(doc && doc[k]) ? doc[k] : [];
    for (const it of arr) {
      if (!it || typeof it !== 'object') continue;
      let id = it.id;
      if (!id || typeof id !== 'string') { id = newId(); fixed = true; }
      const v = Object.assign({}, it); delete v.id;
      if (!v.borrado && k === 'productos' && !v.nombre) continue;
      if (!v.borrado && k === 'recetas' && !v.titulo) continue;
      out[k][id] = v;
    }
  }
  return { data: out, fixed };
}
function mergeMaps(a, b) {
  const o = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[id], y = b[id];
    o[id] = !x ? y : !y ? x : (num(y.editado) > num(x.editado) ? y : x);
  }
  return o;
}
const serialize = data => JSON.stringify(packFile(data), null, 2) + '\n';

/* ---------- GitHub ---------- */
const API = 'https://api.github.com';
class GhError extends Error { constructor(kind, msg) { super(msg); this.kind = kind; } }
const enc = encodeURIComponent;
const repoUrl = c => API + '/repos/' + enc(c.owner) + '/' + enc(c.repo);
const fileUrl = c => repoUrl(c) + '/contents/' + c.path.split('/').map(enc).join('/');
function gh(c, url, opts = {}) {
  return fetch(url, Object.assign({ cache: 'no-store' }, opts, {
    headers: Object.assign({ 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + c.token, 'X-GitHub-Api-Version': '2022-11-28' }, opts.headers || {})
  }));
}
function explain(r, writing) {
  if (r.status === 401) return new GhError('auth', 'El token no es válido o ha caducado. Crea uno nuevo y pégalo en Hogar › Conexión.');
  if (r.status === 403 || r.status === 429) {
    if (r.headers.get('x-ratelimit-remaining') === '0') return new GhError('rate', 'GitHub ha limitado las peticiones durante un rato. Espera unos minutos.');
    return new GhError('perm', writing ? 'El token no tiene permiso de escritura. Edítalo en GitHub y pon Contents en «Read and write».' : 'El token no tiene acceso a este repositorio.');
  }
  if (r.status === 404) return new GhError('notfound', 'No encuentro el repositorio o la rama. Revisa el usuario, el repositorio y la rama, y que el token tenga acceso a ese repositorio.');
  return new GhError('other', 'GitHub respondió con un error (' + r.status + '). Prueba de nuevo en un rato.');
}
function b64dec(s) { const bin = atob(String(s).replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))); }
function b64enc(str) {
  const bytes = new TextEncoder().encode(str); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function pull(c) {
  const r = await gh(c, fileUrl(c) + '?ref=' + enc(c.branch));
  if (r.status === 404) {
    const rb = await gh(c, repoUrl(c) + '/branches/' + enc(c.branch));
    if (rb.ok) return { doc: null, sha: null };          // el repositorio existe pero el archivo aún no: lo crearé
    throw explain(rb, false);
  }
  if (!r.ok) throw explain(r, false);
  const j = await r.json();
  if (Array.isArray(j) || j.type !== 'file') throw new GhError('other', 'La ruta del archivo apunta a una carpeta. Escribe el nombre del archivo, por ejemplo despensa.json.');
  let text = '';
  if (j.content) text = b64dec(j.content);
  else if (j.git_url) { const rr = await gh(c, j.git_url); if (!rr.ok) throw explain(rr, false); text = b64dec((await rr.json()).content); }
  let doc;
  try { doc = text.trim() ? JSON.parse(text) : {}; }
  catch (e) { throw new GhError('json', 'El archivo ' + c.path + ' no es un JSON válido. Corrígelo en GitHub o recupera una versión anterior desde su historial.'); }
  return { doc, sha: j.sha };
}
async function push(c, content, prevSha) {
  const body = { message: 'Mi despensa: cambios' + (c.nombre ? ' de ' + c.nombre : ''), content: b64enc(content), branch: c.branch };
  if (prevSha) body.sha = prevSha;
  const r = await gh(c, fileUrl(c), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) return null;   // otro dispositivo guardó antes: vuelvo a leer y fusiono
  if (!r.ok) throw explain(r, true);
  return (await r.json()).content.sha;
}

/* ---------- sincronización ---------- */
let syncing = false, again = false, syncTimer = null;
const wait = ms => new Promise(r => setTimeout(r, ms));
function setSync(s, msg = '') {
  sync = { s, msg };
  const b = $('syncBtn');
  if (b) { b.dataset.s = s; b.querySelector('span').textContent = syncLabel(); }
}
function syncLabel() {
  if (!cfg || cfg.demo) return 'Modo prueba · solo en este móvil';
  if (sync.s === 'saving') return 'Guardando…';
  if (sync.s === 'checking') return 'Sincronizando…';
  if (sync.s === 'offline') return dirty ? 'Sin conexión · se subirá al volver' : 'Sin conexión';
  if (sync.s === 'error') return 'No se pudo sincronizar';
  return dirty ? 'Cambios pendientes' : 'Sincronizado';
}
function scheduleSync(ms = 1500) { clearTimeout(syncTimer); if (connected()) syncTimer = setTimeout(syncNow, ms); }
async function syncNow() {
  if (!connected()) return;
  if (syncing) { again = true; return; }
  if (navigator.onLine === false) { setSync('offline'); return; }
  syncing = true; again = false;
  setSync(dirty ? 'saving' : 'checking');
  const seq = editSeq, c = cfg;
  try {
    let done = false;
    for (let i = 0; i < 4 && !done; i++) {
      if (i) await wait(600 * i);
      const remote = await pull(c);
      const parsed = remote.doc ? fromFile(remote.doc) : { data: { productos: {}, recetas: {} }, fixed: false };
      D = { productos: mergeMaps(D.productos, parsed.data.productos), recetas: mergeMaps(D.recetas, parsed.data.recetas) };
      const cut = Date.now() - 30 * 86400000;
      for (const m of [D.productos, D.recetas]) for (const k in m) if (m[k].borrado && num(m[k].editado) < cut) delete m[k];
      ls.set(K.data, D);
      const out = serialize(D);
      if (remote.doc && !parsed.fixed && out === serialize(parsed.data)) { sha = remote.sha; done = true; break; }
      const nsha = await push(c, out, remote.sha);
      if (nsha) { sha = nsha; done = true; }
    }
    if (!done) throw new GhError('conflict', '');
    ls.set(K.sha, sha);
    if (editSeq === seq) { dirty = false; ls.set(K.dirty, false); }
    setSync('ok');
  } catch (e) {
    if (e instanceof GhError) { if (e.kind === 'conflict') { again = true; setSync('saving'); } else setSync('error', e.message); }
    else setSync('offline');
  } finally {
    syncing = false;
    render();
    if (again || (dirty && editSeq !== seq)) scheduleSync(800);
  }
}
window.addEventListener('online', () => syncNow());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);

/* ---------- ejemplo (modo prueba) ---------- */
function seedDemo() {
  const t = todayDate(), d = k => { const x = new Date(t); x.setDate(x.getDate() + k); return iso(x); };
  const rows = [
    ['Leche semidesnatada', 2, 'botella', 'nevera', d(5)], ['Yogures naturales', 4, 'ud', 'nevera', d(1)], ['Pechugas de pollo', 500, 'g', 'nevera', d(0)],
    ['Espinacas frescas', 1, 'paquete', 'nevera', d(2)], ['Huevos', 8, 'ud', 'nevera', d(12)], ['Cebollas', 3, 'ud', 'despensa', ''],
    ['Guisantes', 1, 'paquete', 'congelador', d(120)], ['Merluza en filetes', 400, 'g', 'congelador', d(60)], ['Arroz redondo', 1, 'kg', 'despensa', ''],
    ['Tomate triturado', 2, 'lata', 'despensa', d(240)], ['Aceite de oliva', 0, 'botella', 'despensa', ''], ['Café molido', 0, 'paquete', 'despensa', '']
  ];
  const now = Date.now();
  rows.forEach((r, i) => { D.productos['ej' + i] = { nombre: r[0], cantidad: r[1], unidad: r[2], lugar: r[3], caduca: r[4], enLista: r[1] === 0, creado: now + i, editado: now }; });
  const recs = [
    ['Tortilla de espinacas', ['4 huevos', '1 paquete de espinacas frescas', '1 cebolla', 'Aceite de oliva', 'Sal'], 'Pocha la cebolla, añade las espinacas hasta que bajen, mezcla con el huevo batido y cuaja la tortilla por los dos lados.'],
    ['Pollo al curry con arroz', ['500 g de pechugas de pollo', '200 g de arroz redondo', '1 cebolla', '1 lata de leche de coco', 'Curry en polvo'], ''],
    ['Batido de yogur y plátano', ['2 yogures naturales', '2 plátanos', '1 vaso de leche', 'Miel'], '']
  ];
  recs.forEach((r, i) => { D.recetas['ejr' + i] = { titulo: r[0], ingredientes: r[1], notas: r[2], creado: now + i, editado: now }; });
  ls.set(K.data, D);
}

/* ---------- cálculos comunes ---------- */
function analysis() {
  const all = products();
  const stock = all.filter(([, v]) => num(v.cantidad) > 0);
  const urg = stock.filter(([, v]) => { const d = daysLeft(v.caduca); return d !== null && d <= AVISO_DIAS; })
    .sort((a, b) => daysLeft(a[1].caduca) - daysLeft(b[1].caduca));
  const recs = recipes().map(([id, r]) => {
    const ings = (Array.isArray(r.ingredientes) ? r.ingredientes : String(r.ingredientes || '').split('\n')).map(String).map(s => s.trim()).filter(Boolean);
    const rows = ings.map(line => {
      const hot = urg.find(([, p]) => matches(line, p.nombre));
      const have = hot || stock.find(([, p]) => matches(line, p.nombre));
      return { line, have: !!have, hot: hot ? hot[1] : null, prod: have ? have[1] : null };
    });
    const hotProds = [...new Set(rows.filter(x => x.hot).map(x => x.hot))];
    return { id, r, rows, hotProds, missing: rows.filter(x => !x.have), haveCount: rows.filter(x => x.have).length };
  });
  const hotRecs = recs.filter(x => x.hotProds.length)
    .sort((a, b) => b.hotProds.length - a.hotProds.length || a.missing.length - b.missing.length || a.r.titulo.localeCompare(b.r.titulo, 'es'));
  return { all, stock, urg, recs, hotRecs };
}
function peopleNames() {
  const s = new Set();
  if (cfg && cfg.nombre) s.add(cfg.nombre);
  products().forEach(([, v]) => { if (v.por) s.add(v.por); if (v.editadoPor) s.add(v.editadoPor); });
  recipes().forEach(([, v]) => { if (v.por) s.add(v.por); });
  return [...s];
}

/* ---------- pantallas ---------- */
function brand() {
  return '<header class="brand"><div class="id"><img src="favicon.svg" alt=""><div><div class="appname">Mi despensa</div>' +
    '<button class="sync" id="syncBtn" type="button" data-s="' + sync.s + '" aria-label="Estado de la sincronización. Toca para sincronizar"><i></i><span>' + esc(syncLabel()) + '</span></button></div></div>' +
    (cfg && cfg.nombre ? '<div class="me">Hola, ' + esc(cfg.nombre) + '</div>' : '') + '</header>' +
    (sync.s === 'error' && sync.msg ? '<p class="note">' + esc(sync.msg) + '</p>' : '');
}

function screenDespensa(A) {
  const { all, stock, urg, hotRecs } = A;
  let h = '';
  if (connected() && !cfg.nombre) h += '<p class="info">Pon tu nombre en <b>Hogar</b> para que en casa se sepa quién cambia cada cosa.</p>';
  h += '<section class="summary" aria-label="Úsalo pronto"><div class="eyebrow">Úsalo pronto · caduca en ' + AVISO_DIAS + ' días o menos</div>';
  if (urg.length) {
    h += '<div class="big">' + urg.length + (urg.length === 1 ? ' producto' : ' productos') + '</div><ul>' + urg.map(([, v]) => {
      const st = status(v);
      return '<li><span>' + esc(v.nombre) + ' <small>· ' + esc(PLACENAME[v.lugar] || '') + '</small></span><span class="pill ' + st.cls + '">' + st.txt + '</span></li>';
    }).join('') + '</ul>';
    if (hotRecs.length) {
      h += '<div class="recs"><div class="eyebrow">Recetas para aprovecharlo</div>' + hotRecs.slice(0, 3).map(x =>
        '<button type="button" data-go="recetas"><span>' + esc(x.r.titulo) + '</span><small>' + (x.missing.length ? 'faltan ' + x.missing.length : 'lo tienes todo') + '</small></button>').join('') + '</div>';
    } else if (recipes().length === 0) {
      h += '<div class="recs"><button type="button" data-go="recetas"><span>Guarda tus recetas y te diré cuáles usan esto</span><small>→</small></button></div>';
    }
  } else h += '<div class="big">Todo en orden</div><p class="calm">Nada caduca en los próximos ' + AVISO_DIAS + ' días.</p>';
  h += '</section>';

  h += '<div class="head"><div><h1>Despensa</h1><p class="sub">' + stock.length + (stock.length === 1 ? ' producto' : ' productos') + ' en casa</p></div><button class="btn" type="button" id="addBtn">+ Añadir</button></div>';
  const counts = { todo: stock.length };
  PLACES.forEach(([k]) => counts[k] = stock.filter(([, v]) => v.lugar === k).length);
  h += '<div class="filters" role="group" aria-label="Filtrar por sitio">' + [['todo', 'Todo']].concat(PLACES).map(([k, n]) =>
    '<button class="fchip" type="button" data-f="' + k + '" aria-pressed="' + (k === fPlace) + '">' + n + '<span class="num">' + counts[k] + '</span></button>').join('') + '</div>';
  h += '<input type="search" id="q" class="search" placeholder="Buscar producto…" aria-label="Buscar producto" value="' + esc(qText) + '">';

  const q = norm(qText), many = peopleNames().length > 1;
  const shown = all.filter(([, v]) => (fPlace === 'todo' || v.lugar === fPlace) && (!q || norm(v.nombre).includes(q)))
    .filter(([, v]) => num(v.cantidad) > 0 || !v.enLista)
    .sort((a, b) => status(a[1]).rank - status(b[1]).rank || a[1].nombre.localeCompare(b[1].nombre, 'es'));
  if (!shown.length) {
    h += q ? '<div class="empty"><b>Sin resultados</b>No hay ningún producto que coincida con «' + esc(qText) + '».</div>'
      : '<div class="empty"><b>Aquí no hay nada</b>Pulsa «+ Añadir» para guardar el primer producto.</div>';
  } else {
    h += '<div class="list">' + shown.map(([id, v]) => {
      const st = status(v), qn = num(v.cantidad), out = qn <= 0;
      return '<div class="row' + (out ? ' out' : '') + '"><button class="main" type="button" data-edit="' + esc(id) + '" aria-label="Editar ' + esc(v.nombre) + '"><span class="name">' + esc(v.nombre) + '</span><span class="meta"><span class="pill ' + (out ? 'none' : st.cls) + '">' + (out ? 'Agotado' : st.txt) + '</span>' +
        (fPlace === 'todo' ? '<span>' + esc(PLACENAME[v.lugar] || '') + '</span>' : '') + (v.enLista ? '<span>· en la lista</span>' : '') + (many && v.editadoPor ? '<span>· ' + esc(v.editadoPor) + '</span>' : '') + '</span></button>' +
        '<div class="step"><button class="sbtn" type="button" data-dec="' + esc(id) + '" aria-label="Quitar ' + esc(v.nombre) + '"' + (out ? ' disabled' : '') + '>−</button><span class="qty num">' + fmtNum(qn) + ' ' + esc(v.unidad || 'ud') + '</span><button class="sbtn add" type="button" data-inc="' + esc(id) + '" aria-label="Añadir ' + esc(v.nombre) + '">+</button></div></div>';
    }).join('') + '</div>';
  }
  return h;
}

function screenLista(A) {
  const list = A.all.filter(([, v]) => v.enLista).sort((a, b) => (a[1].lugar || '').localeCompare(b[1].lugar || '') || a[1].nombre.localeCompare(b[1].nombre, 'es'));
  let h = '<div class="head"><div><h1>Lista de la compra</h1><p class="sub">' + (list.length ? list.length + (list.length === 1 ? ' cosa' : ' cosas') + ' por comprar' : 'Lo que se agota aparece aquí solo') + '</p></div><button class="btn ghost sm" type="button" id="copyBtn"' + (list.length ? '' : ' disabled') + '>Copiar</button></div>';
  h += '<section class="card">';
  if (!list.length) h += '<p class="sub" style="margin:0">La lista está vacía. Cuando un producto llega a cero en la despensa, lo apunto aquí.</p>';
  else h += list.map(([id, v]) => '<button class="check" type="button" data-buy="' + esc(id) + '" role="checkbox" aria-checked="false"><span class="box"></span><span class="main"><span>' + esc(v.nombre) + '</span><br><small>' + esc(PLACENAME[v.lugar] || '') + (num(v.cantidad) > 0 ? ' · quedan ' + fmtNum(v.cantidad) + ' ' + esc(v.unidad || 'ud') : ' · agotado') + '</small></span></button>').join('');
  h += '<form class="addline" id="shopForm" autocomplete="off"><input type="text" id="shopName" placeholder="Añadir algo que falta: pan, café…" maxlength="60" aria-label="Producto para la lista" value="' + esc(shopDraft) + '"><button class="btn sm" type="submit">Añadir</button></form>';
  h += '<textarea id="copyArea" hidden readonly aria-label="Lista para copiar"></textarea></section>';
  h += '<p class="sub" style="margin-top:12px">Al marcar algo como comprado vuelve a la despensa con una unidad más.</p>';
  screenLista.text = list.map(([, v]) => '• ' + v.nombre).join('\n');
  return h;
}

function recipeCard(x, hot) {
  const st = p => status(p);
  let h = '<article class="recipe' + (hot ? ' hot' : '') + '" id="rec-' + esc(x.id) + '"><div class="top"><div><h2>' + esc(x.r.titulo) + '</h2><div class="rmeta">' +
    (x.rows.length ? 'Tienes ' + x.haveCount + ' de ' + x.rows.length + ' ingredientes' : 'Sin ingredientes') + (x.r.por ? ' · de ' + esc(x.r.por) : '') + '</div></div>' +
    '<button class="linkbtn" type="button" data-redit="' + esc(x.id) + '">Editar</button></div>';
  if (x.hotProds.length) h += '<div class="tags">' + x.hotProds.map(p => '<span class="pill ' + st(p).cls + '">' + esc(p.nombre) + ' · ' + esc(st(p).short) + '</span>').join('') + '</div>';
  if (x.rows.length) h += '<ul class="ingl">' + x.rows.map(rw => '<li class="' + (rw.hot ? 'hot' : rw.have ? 'have' : 'miss') + '"><span>' + esc(rw.line) + (rw.prod && norm(rw.prod.nombre) !== norm(rw.line) ? ' <small>(' + esc(rw.prod.nombre) + ')</small>' : '') + '</span></li>').join('') + '</ul>';
  if (x.missing.length) h += '<div class="missing"><span><b>Te falta:</b> ' + esc(x.missing.map(m => cleanIngredient(m.line) || m.line).join(', ')) + '</span><button class="btn ghost sm" type="button" data-missing="' + esc(x.id) + '">Añadir a la lista</button></div>';
  if (x.r.notas) h += '<details><summary class="linkbtn">Preparación</summary><p class="notes">' + esc(x.r.notas) + '</p></details>';
  return h + '</article>';
}

function screenRecetas(A) {
  const { recs, hotRecs, urg } = A;
  let h = '<div class="head"><div><h1>Recetas</h1><p class="sub">' + (recs.length ? recs.length + (recs.length === 1 ? ' receta guardada' : ' recetas guardadas') : 'Tus recetas, con lo que tienes en casa') + '</p></div><button class="btn" type="button" id="addRec">+ Nueva</button></div>';
  if (!recs.length) return h + '<div class="empty"><b>Aún no hay recetas</b>Pulsa «+ Nueva», escribe el título y los ingredientes, uno por línea. Cuando algo esté a punto de caducar, te diré qué recetas lo usan.</div>';
  h += '<div class="legend"><span><i class="hot"></i>Caduca pronto</span><span><i class="have"></i>Lo tienes</span><span><i></i>Te falta</span></div>';
  if (hotRecs.length) {
    h += '<div class="sect"><div class="eyebrow">Para aprovechar ya</div>' + hotRecs.map(x => recipeCard(x, true)).join('') + '</div>';
  } else if (urg.length) {
    h += '<p class="info">Ninguna receta usa lo que caduca pronto (' + esc(urg.map(([, v]) => v.nombre).join(', ')) + '). Guarda alguna que lo lleve y aparecerá aquí.</p>';
  }
  const q = norm(rqText);
  const rest = recs.filter(x => !x.hotProds.length).filter(x => !q || norm(x.r.titulo).includes(q) || x.rows.some(rw => norm(rw.line).includes(q)))
    .sort((a, b) => a.missing.length - b.missing.length || a.r.titulo.localeCompare(b.r.titulo, 'es'));
  h += '<div class="sect"><div class="eyebrow">' + (hotRecs.length ? 'El resto' : 'Todas') + '</div>';
  if (recs.length > 4) h += '<input type="search" id="rq" class="search" placeholder="Buscar receta o ingrediente…" aria-label="Buscar receta" value="' + esc(rqText) + '">';
  h += rest.length ? rest.map(x => recipeCard(x, false)).join('') : '<p class="sub">' + (q ? 'Ninguna receta coincide con «' + esc(rqText) + '».' : 'Todas tus recetas están arriba.') + '</p>';
  return h + '</div>';
}

function connForm(isWelcome) {
  const c = connected() ? cfg : { owner: '', repo: 'mi-despensa-datos', branch: 'main', path: 'despensa.json', token: '', nombre: (cfg && cfg.nombre) || '' };
  const fromDemo = cfg && cfg.demo && products().length;
  return '<form class="card" id="cfgForm" novalidate autocomplete="off"><h2>Repositorio de datos en GitHub</h2><div class="form">' +
    '<div class="field"><label for="cOwner">Usuario de GitHub</label><input id="cOwner" value="' + esc(c.owner) + '" placeholder="tu-usuario" autocapitalize="off" spellcheck="false"></div>' +
    '<div class="field"><label for="cRepo">Repositorio</label><input id="cRepo" value="' + esc(c.repo) + '" autocapitalize="off" spellcheck="false"></div>' +
    '<div class="field"><label for="cBranch">Rama</label><input id="cBranch" value="' + esc(c.branch) + '" autocapitalize="off" spellcheck="false"></div>' +
    '<div class="field"><label for="cPath">Archivo</label><input id="cPath" value="' + esc(c.path) + '" autocapitalize="off" spellcheck="false"></div>' +
    '<div class="field span"><label for="cToken">Token de acceso personal</label><input id="cToken" type="password" value="' + esc(c.token) + '" placeholder="github_pat_…" autocapitalize="off" spellcheck="false"></div>' +
    '<div class="field span"><label for="cName">Tu nombre</label><input id="cName" value="' + esc(c.nombre || '') + '" placeholder="Ana" maxlength="30"></div>' +
    '<p class="hint span">Crea un token <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained</a> con acceso solo al repositorio de datos y el permiso <b>Contents: Read and write</b>. El token se guarda únicamente en este dispositivo.</p>' +
    (fromDemo ? '<label class="toggle"><input type="checkbox" id="cKeep"> Subir también lo que he hecho en el modo prueba</label>' : '') +
    '<p class="err" id="cErr" role="status"></p>' +
    '<div class="actions"><button class="btn" type="submit" id="cGo">' + (connected() ? 'Guardar y reconectar' : 'Conectar') + '</button>' + (!isWelcome ? '<button class="btn ghost" type="button" id="cCancel">Cancelar</button>' : '') + '</div></div></form>';
}

function screenWelcome() {
  return '<img class="logo-xl" src="icon-192.png" alt=""><h1>Bienvenido a Mi despensa</h1><p class="sub" style="margin-bottom:16px">Conecta tu repositorio de datos de GitHub para guardar la despensa, la lista y las recetas, y verlas en todos los móviles de casa.</p>' +
    connForm(true) +
    '<section class="card"><h2>Probar sin GitHub</h2><p class="sub">Usa la app con productos y recetas de ejemplo guardados solo en este móvil. Podrás conectar GitHub más tarde.</p><div class="actions" style="margin-top:12px"><button class="btn ghost" type="button" id="demoBtn">Usar modo prueba</button></div></section>';
}

function screenHogar() {
  let h = '<div class="head"><div><h1>Hogar</h1><p class="sub">Quién usa la despensa, la conexión y los avisos.</p></div></div>';
  h += '<form class="card" id="nameForm" autocomplete="off"><h2>Tu nombre</h2><p class="hint" style="margin-top:4px">Aparece junto a lo que cambias. Se guarda solo en este dispositivo.</p><div class="addline"><input id="myName" maxlength="30" placeholder="Ana" value="' + esc((cfg && cfg.nombre) || '') + '" aria-label="Tu nombre"><button class="btn sm" type="submit">Guardar</button></div></form>';

  if (showConn || (cfg && cfg.demo)) {
    if (cfg && cfg.demo) h += '<section class="card"><h2>Modo prueba</h2><p class="sub">Todo se guarda solo en este móvil. Conecta GitHub para compartirlo con tu casa y no perderlo.</p></section>';
    h += connForm(false);
  } else {
    h += '<section class="card"><h2>Conexión</h2><p class="sub">Los cambios se guardan en <b>' + esc(cfg.owner + '/' + cfg.repo) + '</b> (' + esc(cfg.path) + ') unos segundos después de hacerlos. Sin cobertura se quedan en el móvil y se suben al volver.</p>' +
      '<div class="actions" style="margin-top:12px"><button class="btn ghost sm" type="button" id="syncNow">Sincronizar ahora</button><button class="btn ghost sm" type="button" id="editConn">Cambiar</button><button class="btn ghost sm" type="button" id="disconnect">Desconectar</button></div></section>';
  }

  const names = peopleNames();
  h += '<section class="card"><h2>Quién la usa</h2>' + (names.length ? '<div class="people">' + names.map(n => '<span class="chip">' + esc(n) + (cfg && n === cfg.nombre ? ' (tú)' : '') + '</span>').join('') + '</div>' : '<p class="sub">Aún nadie ha puesto su nombre.</p>') +
    '<ol class="steps"><li>Para compartirla, la otra persona instala la app desde la misma dirección.</li><li>Al conectar, usa el mismo usuario, repositorio y archivo, y un token con acceso al repositorio de datos.</li><li>Cada uno pone su nombre y veréis la misma despensa, lista y recetas.</li></ol></section>';

  h += '<section class="card"><h2>Avisos de caducidad</h2><p style="margin:8px 0 0;font-size:14.5px">Cada mañana, a las 8:50, GitHub revisa el archivo de la despensa y te manda una notificación a la app <b>ntfy</b> del móvil con lo que caduca en los próximos ' + AVISO_DIAS + ' días y las recetas que lo usan. Si no caduca nada, no te molesta.</p><p class="hint" style="margin-top:8px">Se configura una vez en el repositorio de datos: mira su README.</p></section>';

  const feed = products().filter(([, v]) => v.editado).sort((a, b) => b[1].editado - a[1].editado).slice(0, 8);
  if (feed.length) h += '<section class="card"><h2>Últimos cambios</h2><ul class="feed">' + feed.map(([, v]) => '<li><span>' + (v.editadoPor ? '<b>' + esc(v.editadoPor) + '</b> · ' : '') + esc(v.nombre) + '</span><time>' + ago(v.editado) + '</time></li>').join('') + '</ul></section>';

  h += '<section class="card"><h2>Copia de seguridad</h2><p class="sub">GitHub guarda el historial de cada cambio. También puedes descargar una copia del archivo.</p><div class="actions" style="margin-top:12px"><button class="btn ghost sm" type="button" id="backup">Descargar copia</button></div></section>';
  return h;
}

/* ---------- pintar ---------- */
function render() {
  const app = $('app');
  const ae = document.activeElement, aid = ae && ae.id && app.contains(ae) ? ae.id : null;
  let pos = null; try { pos = ae && ae.selectionStart; } catch (e) { }
  if (!cfg) {
    app.className = 'wrap welcome'; app.innerHTML = screenWelcome(); $('nav').hidden = true; return;
  }
  app.className = 'wrap';
  const A = analysis();
  let h = brand();
  if (tab === 'lista') h += screenLista(A);
  else if (tab === 'recetas') h += screenRecetas(A);
  else if (tab === 'hogar') h += screenHogar();
  else h += screenDespensa(A);
  app.innerHTML = h;
  if (aid && $(aid)) { const el = $(aid); el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch (e) { } }
  $('nav').hidden = false;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  const listCount = A.all.filter(([, v]) => v.enLista).length;
  const setB = (id, n) => { const b = $(id); b.hidden = !n; b.textContent = n; };
  setB('b-despensa', A.urg.length); setB('b-lista', listCount); setB('b-recetas', A.hotRecs.length);
}

/* ---------- hoja de producto ---------- */
let lastPlace = 'nevera';
function closeSheet() { $('sheetRoot').innerHTML = ''; }
function sheetShell(title, body) {
  const root = $('sheetRoot');
  root.innerHTML = '<div class="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="shT"><div class="grab"></div><h2 id="shT">' + title + '</h2>' + body + '</div></div>';
  root.querySelector('.scrim').addEventListener('click', e => { if (e.target.classList.contains('scrim') || e.target.closest('[data-close]')) closeSheet(); });
  return root;
}
function openProduct(id) {
  const v = id ? D.productos[id] : null;
  const d = v || { nombre: '', cantidad: 1, unidad: 'ud', lugar: lastPlace, caduca: '' };
  let place = d.lugar || 'nevera';
  const root = sheetShell(v ? 'Editar producto' : 'Añadir producto',
    '<form id="pForm" class="form" novalidate autocomplete="off">' +
    '<div class="field span"><label for="fName">Producto</label><input id="fName" maxlength="60" placeholder="Yogures naturales" value="' + esc(d.nombre) + '"></div>' +
    '<div class="field"><label for="fQty">Cantidad</label><input id="fQty" inputmode="decimal" value="' + esc(String(d.cantidad).replace('.', ',')) + '"></div>' +
    '<div class="field"><label for="fUnit">Unidad</label><select id="fUnit">' + UNITS.map(u => '<option' + (u === d.unidad ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></div>' +
    '<div class="field span"><span class="flabel" id="fPlaceL">Dónde lo guardas</span><div class="seg" role="group" aria-labelledby="fPlaceL">' + PLACES.map(([k, n]) => '<button type="button" data-place="' + k + '" aria-pressed="' + (k === place) + '">' + n + '</button>').join('') + '</div></div>' +
    '<div class="field span"><label for="fExp">Caduca (opcional)</label><div class="datebox"><input type="date" id="fExp" value="' + esc(d.caduca || '') + '"><button type="button" class="quick" data-add="3">+3 días</button><button type="button" class="quick" data-add="7">+1 semana</button><button type="button" class="quick" data-add="30">+1 mes</button><button type="button" class="quick" data-add="">Sin fecha</button></div></div>' +
    (v ? '<label class="toggle"><input type="checkbox" id="fList"' + (v.enLista ? ' checked' : '') + '> En la lista de la compra</label>' : '') +
    (v && (v.por || v.editadoPor) ? '<p class="by">' + (v.por ? 'Lo añadió ' + esc(v.por) : '') + (v.editadoPor && v.editado ? (v.por ? ' · ' : '') + 'último cambio de ' + esc(v.editadoPor) + ' ' + ago(v.editado) : '') + '</p>' : '') +
    '<p class="err" id="fErr" role="status"></p>' +
    '<div class="actions">' + (v ? '<button type="button" class="btn warnbtn" id="fDel">Borrar</button>' : '') + '<button type="button" class="btn ghost" data-close>Cancelar</button><button type="submit" class="btn">' + (v ? 'Guardar' : 'Añadir') + '</button></div></form>');
  root.querySelectorAll('[data-place]').forEach(b => b.addEventListener('click', () => {
    place = b.dataset.place; root.querySelectorAll('[data-place]').forEach(x => x.setAttribute('aria-pressed', x.dataset.place === place));
  }));
  root.querySelectorAll('.quick').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.add === '') { $('fExp').value = ''; return; }
    const x = todayDate(); x.setDate(x.getDate() + Number(b.dataset.add)); $('fExp').value = iso(x);
  }));
  const del = $('fDel');
  if (del) del.addEventListener('click', () => {
    if (del.dataset.confirm) { delP(id); closeSheet(); toast(v.nombre + ' borrado'); return; }
    del.dataset.confirm = '1'; del.textContent = '¿Seguro? Toca otra vez';
  });
  $('fName').addEventListener('input', () => $('fErr').textContent = '');
  $('pForm').addEventListener('submit', e => {
    e.preventDefault();
    const nombre = $('fName').value.trim();
    const cantidad = Number(String($('fQty').value).replace(',', '.'));
    const unidad = $('fUnit').value, caduca = $('fExp').value || '';
    if (!nombre) { $('fErr').textContent = 'Escribe el nombre del producto.'; $('fName').focus(); return; }
    if (!isFinite(cantidad) || cantidad < 0 || (!v && cantidad === 0)) { $('fErr').textContent = 'La cantidad tiene que ser un número mayor que cero.'; $('fQty').focus(); return; }
    lastPlace = place;
    if (v) {
      putP(id, Object.assign({}, v, { nombre, cantidad, unidad, lugar: place, caduca, enLista: $('fList').checked }));
      toast('Cambios guardados');
    } else {
      const ex = products().find(([, x]) => norm(x.nombre) === norm(nombre) && x.lugar === place && x.unidad === unidad);
      if (ex) {
        putP(ex[0], Object.assign({}, ex[1], { cantidad: Math.round((num(ex[1].cantidad) + cantidad) * 100) / 100, caduca: caduca || ex[1].caduca || '', enLista: false }));
        toast('Sumado a ' + ex[1].nombre + ' en ' + PLACENAME[place]);
      } else {
        putP(newId(), { nombre, cantidad, unidad, lugar: place, caduca, enLista: false });
        toast(nombre + ' añadido a ' + PLACENAME[place]);
      }
    }
    closeSheet();
  });
  if (!v) setTimeout(() => $('fName') && $('fName').focus(), 50);
}

/* ---------- hoja de receta ---------- */
function openRecipe(id) {
  const r = id ? D.recetas[id] : null;
  const ings = r ? (Array.isArray(r.ingredientes) ? r.ingredientes : String(r.ingredientes || '').split('\n')) : [];
  sheetShell(r ? 'Editar receta' : 'Nueva receta',
    '<form id="rForm" class="form" novalidate autocomplete="off">' +
    '<div class="field span"><label for="rTitle">Título</label><input id="rTitle" maxlength="80" placeholder="Tortilla de espinacas" value="' + esc(r ? r.titulo : '') + '"></div>' +
    '<div class="field span"><label for="rIngs">Ingredientes, uno por línea</label><textarea id="rIngs" placeholder="4 huevos&#10;1 paquete de espinacas&#10;1 cebolla">' + esc(ings.join('\n')) + '</textarea>' +
    '<p class="hint">Escribe el ingrediente como lo llamas en la despensa (por ejemplo «espinacas») para que pueda reconocerlo. Las cantidades son opcionales.</p></div>' +
    '<div class="field span"><label for="rNotes">Preparación (opcional)</label><textarea id="rNotes" placeholder="Pasos, tiempos, trucos…">' + esc(r ? r.notas || '' : '') + '</textarea></div>' +
    '<p class="err" id="rErr" role="status"></p>' +
    '<div class="actions">' + (r ? '<button type="button" class="btn warnbtn" id="rDel">Borrar</button>' : '') + '<button type="button" class="btn ghost" data-close>Cancelar</button><button type="submit" class="btn">Guardar</button></div></form>');
  const del = $('rDel');
  if (del) del.addEventListener('click', () => {
    if (del.dataset.confirm) { delR(id); closeSheet(); toast('Receta borrada'); return; }
    del.dataset.confirm = '1'; del.textContent = '¿Seguro? Toca otra vez';
  });
  $('rForm').addEventListener('submit', e => {
    e.preventDefault();
    const titulo = $('rTitle').value.trim();
    const ingredientes = $('rIngs').value.split('\n').map(s => s.replace(/^[\s•\-*·]+/, '').trim()).filter(Boolean).slice(0, 40);
    if (!titulo) { $('rErr').textContent = 'Escribe el título de la receta.'; $('rTitle').focus(); return; }
    if (!ingredientes.length) { $('rErr').textContent = 'Añade al menos un ingrediente.'; $('rIngs').focus(); return; }
    putR(id || newId(), Object.assign({}, r || {}, { titulo, ingredientes, notas: $('rNotes').value.trim() }));
    closeSheet(); toast(r ? 'Receta actualizada' : 'Receta guardada');
  });
  if (!r) setTimeout(() => $('rTitle') && $('rTitle').focus(), 50);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('sheetRoot').firstChild) closeSheet(); });

/* ---------- acciones ---------- */
function setTab(t) { tab = t; ls.set(K.tab, t); render(); window.scrollTo(0, 0); }
$('nav').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });

function addMissing(recId) {
  const x = analysis().recs.find(y => y.id === recId); if (!x || !x.missing.length) return;
  let n = 0;
  x.missing.forEach(m => {
    const name = cleanIngredient(m.line) || m.line;
    const ex = products().find(([, p]) => matches(m.line, p.nombre) || norm(p.nombre) === norm(name));
    if (ex) { if (!ex[1].enLista) { D.productos[ex[0]] = stamp(Object.assign({}, ex[1], { enLista: true })); n++; } }
    else { D.productos[newId()] = stamp({ nombre: name, cantidad: 0, unidad: 'ud', lugar: 'despensa', caduca: '', enLista: true }); n++; }
  });
  changed();
  toast(n ? (n === 1 ? '1 cosa añadida a la lista' : n + ' cosas añadidas a la lista') : 'Ya estaba todo en la lista');
}

async function connect() {
  const c = {
    owner: $('cOwner').value.trim(), repo: $('cRepo').value.trim(), branch: $('cBranch').value.trim() || 'main',
    path: $('cPath').value.trim().replace(/^\/+/, '') || 'despensa.json', token: $('cToken').value.trim(), nombre: $('cName').value.trim().slice(0, 30)
  };
  const err = $('cErr');
  if (!c.owner || !c.repo) { err.textContent = 'Escribe tu usuario de GitHub y el nombre del repositorio.'; return; }
  if (!c.token) { err.textContent = 'Pega el token de acceso.'; $('cToken').focus(); return; }
  const btn = $('cGo'); btn.disabled = true; btn.textContent = 'Conectando…'; err.textContent = '';
  try {
    await pull(c);
    const wasDemo = cfg && cfg.demo, keep = $('cKeep') && $('cKeep').checked;
    const sameRepo = connected() && cfg.owner === c.owner && cfg.repo === c.repo && cfg.path === c.path && cfg.branch === c.branch;
    if ((wasDemo && !keep) || (connected() && !sameRepo)) { D = { productos: {}, recetas: {} }; ls.set(K.data, D); }
    if (wasDemo && keep) { const now = Date.now(); for (const m of [D.productos, D.recetas]) for (const k in m) m[k] = Object.assign({}, m[k], { editado: now }); }
    cfg = c; ls.set(K.cfg, cfg); showConn = false;
    dirty = true; ls.set(K.dirty, true); editSeq++;
    tab = 'despensa'; ls.set(K.tab, tab);
    render(); toast('Conectado a ' + c.owner + '/' + c.repo);
    syncNow();
  } catch (e) {
    err.textContent = e instanceof GhError ? e.message : 'No hay conexión con GitHub. Revisa tu conexión a internet.';
    btn.disabled = false; btn.textContent = 'Conectar';
  }
}

document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t || !$('app').contains(t)) return;
  const ds = t.dataset;
  if (t.id === 'demoBtn') { cfg = { demo: true, nombre: '' }; ls.set(K.cfg, cfg); D = { productos: {}, recetas: {} }; seedDemo(); render(); toast('Modo prueba: los datos son de ejemplo'); return; }
  if (t.id === 'syncBtn' || t.id === 'syncNow') { if (connected()) { syncNow(); if (t.id === 'syncNow') toast('Sincronizando…'); } return; }
  if (ds.go) { setTab(ds.go); return; }
  if (t.id === 'addBtn') { openProduct(null); return; }
  if (t.id === 'addRec') { openRecipe(null); return; }
  if (ds.f) { fPlace = ds.f; render(); return; }
  if (ds.edit) { openProduct(ds.edit); return; }
  if (ds.redit) { openRecipe(ds.redit); return; }
  if (ds.missing) { addMissing(ds.missing); return; }
  if (ds.dec || ds.inc) {
    const id = ds.dec || ds.inc, v = D.productos[id]; if (!v) return;
    const qn = num(v.cantidad), s = stepFor(v.unidad);
    if (ds.inc) { putP(id, Object.assign({}, v, { cantidad: Math.round((qn + s) * 100) / 100 })); return; }
    const n = Math.max(0, Math.round((qn - s) * 100) / 100), upd = Object.assign({}, v, { cantidad: n });
    if (n === 0 && !v.enLista) { upd.enLista = true; toast(v.nombre + ' se ha agotado: lo he puesto en la lista de la compra'); }
    putP(id, upd); return;
  }
  if (ds.buy) {
    const v = D.productos[ds.buy]; if (!v) return;
    const qn = num(v.cantidad), s = stepFor(v.unidad);
    putP(ds.buy, Object.assign({}, v, { enLista: false, cantidad: qn > 0 ? qn : (s === 1 ? 1 : (v.unidad === 'g' || v.unidad === 'ml') ? 500 : 1) }));
    toast(v.nombre + ' comprado: de vuelta en ' + (PLACENAME[v.lugar] || 'la despensa'));
    return;
  }
  if (t.id === 'copyBtn') {
    const text = 'Lista de la compra\n' + (screenLista.text || ''), area = $('copyArea');
    const fallback = () => { area.hidden = false; area.value = text; area.focus(); area.select(); toast('Selecciona y copia el texto de abajo'); };
    try { navigator.clipboard.writeText(text).then(() => toast('Lista copiada. Pégala en WhatsApp o en Notas.'), fallback); } catch (err) { fallback(); }
    return;
  }
  if (t.id === 'editConn') { showConn = true; render(); return; }
  if (t.id === 'cCancel') { showConn = false; render(); return; }
  if (t.id === 'disconnect') {
    if (!t.dataset.confirm) { t.dataset.confirm = '1'; t.textContent = '¿Seguro? Toca otra vez'; return; }
    const nombre = cfg && cfg.nombre;
    cfg = null; D = { productos: {}, recetas: {} }; sha = null; dirty = false;
    [K.cfg, K.data, K.sha, K.dirty].forEach(k => ls.del(k));
    render(); toast('Desconectado. Tus datos siguen en GitHub.' + (nombre ? '' : ''));
    return;
  }
  if (t.id === 'backup') {
    const blob = new Blob([serialize(D)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'despensa-' + iso(new Date()) + '.json';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return;
  }
});
document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'q') { qText = e.target.value; render(); }
  else if (id === 'rq') { rqText = e.target.value; render(); }
  else if (id === 'shopName') shopDraft = e.target.value;
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'cfgForm') { e.preventDefault(); connect(); return; }
  if (f.id === 'nameForm') {
    e.preventDefault();
    const n = $('myName').value.trim().slice(0, 30);
    cfg = Object.assign({}, cfg, { nombre: n }); ls.set(K.cfg, cfg); render(); toast(n ? 'Hola, ' + n : 'Nombre borrado');
    return;
  }
  if (f.id === 'shopForm') {
    e.preventDefault();
    const nombre = $('shopName').value.trim(); if (!nombre) return;
    const ex = products().find(([, v]) => norm(v.nombre) === norm(nombre));
    shopDraft = '';
    if (ex) putP(ex[0], Object.assign({}, ex[1], { enLista: true }));
    else putP(newId(), { nombre: nombre.slice(0, 60), cantidad: 0, unidad: 'ud', lugar: 'despensa', caduca: '', enLista: true });
    toast(nombre + ' añadido a la lista');
    setTimeout(() => $('shopName') && $('shopName').focus(), 0);
  }
});

/* ---------- arranque ---------- */
render();
syncNow();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}
