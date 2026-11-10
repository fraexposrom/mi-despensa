'use strict';
/* Mi Despensa · app independiente. Los datos viven en un archivo JSON de tu repositorio privado de GitHub. */

/* ---------- utilidades ---------- */
const PLACES = [['nevera', 'Nevera'], ['congelador', 'Congelador'], ['despensa', 'Despensa']];
const PLACENAME = Object.fromEntries(PLACES);
const UNITS = ['ud', 'paquete', 'bote', 'lata', 'botella', 'g', 'kg', 'ml', 'l'];
const AVISO_DIAS = 3;
const DAY = 86400000;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const round2 = n => Math.round(n * 100) / 100;
const fmtNum = n => round2(n).toLocaleString('es-ES');
const stepFor = u => (u === 'g' || u === 'ml') ? 100 : (u === 'kg' || u === 'l') ? 0.5 : 1;
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const cap1 = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const num = v => Number(v) || 0;
const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
function todayDate() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }
function addDays(k) { const x = todayDate(); x.setDate(x.getDate() + k); return iso(x); }
function daysLeft(d) {
  if (!validDate(d)) return null;
  const [y, m, dd] = d.split('-').map(Number);
  return Math.round((new Date(y, m - 1, dd) - todayDate()) / DAY);
}
function fmtDate(d) { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); }
function status(v) {
  const d = daysLeft(v.caduca);
  if (d === null) return { cls: 'none', txt: 'Sin fecha', short: '', rank: 9999 };
  if (d < 0) return { cls: 'bad', txt: d === -1 ? 'Caducó ayer' : 'Caducó hace ' + (-d) + ' días', short: 'caducado', rank: d };
  if (d === 0) return { cls: 'bad', txt: 'Caduca hoy', short: 'hoy', rank: d };
  if (d === 1) return { cls: 'warn', txt: 'Caduca mañana', short: 'mañana', rank: d };
  if (d <= AVISO_DIAS) return { cls: 'warn', txt: 'Caduca en ' + d + ' días', short: d + ' días', rank: d };
  return { cls: 'ok', txt: d <= 30 ? d + ' días' : fmtDate(v.caduca), short: '', rank: d };
}
function lotWhen(c) {
  const d = daysLeft(c);
  if (d === null) return 'sin fecha';
  if (d < 0) return 'caducado';
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d <= 7) return 'en ' + d + ' días';
  return fmtDate(c);
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
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('off'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('off'), 3200); }

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

/* ---------- lotes ----------
   Cada producto guarda sus lotes: misma cosa, comprada en días distintos y con fechas distintas.
   Se gasta primero el lote que caduca antes. En el archivo se escriben también "cantidad" (total)
   y "caduca" (la fecha más próxima) para que se pueda leer a simple vista. */
function lotsOf(v) {
  if (!v) return [];
  if (Array.isArray(v.lotes)) {
    return v.lotes.filter(l => l && num(l.cantidad) > 0).map((l, i) => ({
      id: typeof l.id === 'string' && l.id ? l.id : 'l' + i, cantidad: round2(num(l.cantidad)),
      caduca: validDate(l.caduca) ? l.caduca : '', inicial: num(l.inicial) || round2(num(l.cantidad)), alta: num(l.alta)
    }));
  }
  const q = num(v.cantidad);   // formato antiguo, sin lotes
  return q > 0 ? [{ id: 'l0', cantidad: round2(q), caduca: validDate(v.caduca) ? v.caduca : '', inicial: round2(q), alta: num(v.creado) }] : [];
}
const byExpiry = (a, b) => (a.caduca ? 0 : 1) - (b.caduca ? 0 : 1) || (a.caduca < b.caduca ? -1 : a.caduca > b.caduca ? 1 : 0) || a.alta - b.alta;
function withLots(v, lots) {
  const L = lots.filter(l => num(l.cantidad) > 0).map(l => Object.assign({}, l, { cantidad: round2(num(l.cantidad)) })).sort(byExpiry);
  const r = Object.assign({}, v, { lotes: L, cantidad: round2(L.reduce((s, l) => s + l.cantidad, 0)), caduca: (L.find(l => l.caduca) || {}).caduca || '' });
  delete r.enLista;   // la lista de la compra ya no existe en esta app
  return r;
}
const view = v => withLots(v, lotsOf(v));

/* ---------- estado ---------- */
const MAPS = ['productos', 'recetas', 'habituales', 'registro'];
const emptyData = () => ({ productos: {}, recetas: {}, habituales: {}, registro: {} });
function normData(d) { const o = emptyData(); if (d) for (const k of MAPS) if (d[k] && typeof d[k] === 'object') o[k] = d[k]; return o; }
const K = { cfg: 'md.cfg', data: 'md.data', dirty: 'md.dirty', tab: 'md.tab', sha: 'md.sha' };
let cfg = ls.get(K.cfg, null);           // {owner, repo, branch, path, token, nombre} o {demo:true, nombre}
let D = normData(ls.get(K.data, null));
let dirty = ls.get(K.dirty, false);
let sha = ls.get(K.sha, null);
let tab = ls.get(K.tab, 'despensa');
if (!['despensa', 'recetas', 'hogar'].includes(tab)) tab = 'despensa';
let prevTab = 'despensa';
let fPlace = 'todo', qText = '', rqText = '', showConn = false;
let sync = { s: 'ok', msg: '' };
let editSeq = 0;
const connected = () => !!(cfg && !cfg.demo && cfg.token);

const liveEntries = m => Object.entries(m).filter(([, v]) => v && !v.borrado);
const products = () => liveEntries(D.productos).filter(([, v]) => v.nombre).map(([id, v]) => [id, view(v)]);
const recipes = () => liveEntries(D.recetas).filter(([, v]) => v.titulo);
const habits = () => liveEntries(D.habituales).filter(([, v]) => v.nombre);

function stamp(o) {
  const v = Object.assign({}, o, { editado: Date.now() });
  delete v.borrado;
  if (cfg && cfg.nombre) { v.editadoPor = cfg.nombre; if (!v.por) v.por = cfg.nombre; }
  if (!v.creado) v.creado = v.editado;
  return v;
}
function changed() { ls.set(K.data, D); dirty = true; ls.set(K.dirty, true); editSeq++; render(); scheduleSync(); }
function putP(id, base, lots) { D.productos[id] = stamp(withLots(base, lots)); }
function delP(id) { D.productos[id] = { borrado: true, editado: Date.now() }; changed(); }
function putR(id, o) { D.recetas[id] = stamp(o); changed(); }
function delR(id) { D.recetas[id] = { borrado: true, editado: Date.now() }; changed(); }

/* Registro de lo que se gasta y se tira (para las estadísticas). Un apunte por lote que se termina o se tira. */
function logEvent(tipo, p, lot, qty) {
  const now = Date.now(), d = daysLeft(lot.caduca);
  const e = {
    tipo, nombre: p.nombre, unidad: p.unidad || 'ud', lugar: p.lugar || '',
    cantidad: round2(qty != null ? qty : tipo === 'usado' ? (lot.inicial || lot.cantidad) : lot.cantidad),
    caducado: tipo === 'tirado' && d !== null && d < 0, fecha: now, editado: now
  };
  if (cfg && cfg.nombre) e.por = cfg.nombre;
  D.registro[newId()] = e;
}

/* Productos habituales: se aprenden solos cada vez que añades algo. */
const hKey = s => 'h-' + norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
function learn(nombre, unidad, lugar, cantidad, caduca) {
  const k = hKey(nombre); if (k === 'h-') return;
  const old = D.habituales[k] && !D.habituales[k].borrado ? D.habituales[k] : null;
  const dl = caduca ? daysLeft(caduca) : null;
  let vida = old && old.vida != null ? num(old.vida) : null;
  if (dl !== null && dl >= 0) vida = vida == null ? dl : Math.round((vida + dl) / 2);
  const now = Date.now();
  D.habituales[k] = { nombre, unidad, lugar, cantidad: round2(cantidad), vida, usos: (old ? num(old.usos) : 0) + 1, ultimo: now, editado: now };
}
function habitFor(nombre) { const h = D.habituales[hKey(nombre)]; return h && !h.borrado ? h : null; }
// La primera vez, aprende de lo que ya hay en la despensa.
function seedHabits() {
  if (Object.keys(D.habituales).length) return false;
  const P = products(); if (!P.length) return false;
  const now = Date.now();
  P.forEach(([, v]) => {
    const k = hKey(v.nombre); if (k === 'h-' || D.habituales[k]) return;
    const l = v.lotes[v.lotes.length - 1];
    D.habituales[k] = { nombre: v.nombre, unidad: v.unidad || 'ud', lugar: v.lugar || 'despensa', cantidad: l ? (l.inicial || l.cantidad) : 1, vida: null, usos: 1, ultimo: num(v.editado) || now, editado: now };
  });
  return true;
}

/* ---------- archivo: formato y fusión ---------- */
function purge(data) {
  const cut = Date.now() - 30 * DAY, old = Date.now() - 400 * DAY;   // los borrados se olvidan a los 30 días; el registro, al año
  for (const k of MAPS) for (const id in data[k]) {
    const v = data[k][id];
    if (!v || (v.borrado && num(v.editado) < cut) || (k === 'registro' && !v.borrado && num(v.fecha) < old)) delete data[k][id];
  }
  return data;
}
function packFile(data) {
  const d = purge(normData(JSON.parse(JSON.stringify(data))));
  const pack = (m, key) => Object.entries(m).map(([id, v]) => Object.assign({ id }, v))
    .sort((a, b) => key(a) - key(b) || (a.id < b.id ? -1 : 1));
  return {
    app: 'mi-despensa', version: 2,
    productos: pack(d.productos, v => num(v.creado)), recetas: pack(d.recetas, v => num(v.creado)),
    habituales: pack(d.habituales, () => 0), registro: pack(d.registro, v => num(v.fecha))
  };
}
function fromFile(doc) {
  const out = emptyData(); let fixed = false;
  const need = { productos: v => v.nombre, recetas: v => v.titulo, habituales: v => v.nombre, registro: v => v.nombre && v.tipo };
  for (const k of MAPS) {
    const arr = Array.isArray(doc && doc[k]) ? doc[k] : [];
    for (const it of arr) {
      if (!it || typeof it !== 'object') continue;
      let id = it.id;
      if (!id || typeof id !== 'string') { id = newId(); fixed = true; }
      const v = Object.assign({}, it); delete v.id;
      if (!v.borrado && !need[k](v)) continue;
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
  const body = { message: 'Mi Despensa: cambios' + (c.nombre ? ' de ' + c.nombre : ''), content: b64enc(content), branch: c.branch };
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
      const parsed = remote.doc ? fromFile(remote.doc) : { data: emptyData(), fixed: false };
      const merged = emptyData();
      for (const k of MAPS) merged[k] = mergeMaps(D[k], parsed.data[k]);
      D = purge(merged);
      seedHabits();
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
  D = emptyData();
  const now = Date.now();
  // nombre, unidad, sitio, lotes [cantidad, días hasta caducar (null = sin fecha)], vida habitual
  const P = [
    ['Leche semidesnatada', 'botella', 'nevera', [[2, 5]], 7], ['Yogures naturales', 'ud', 'nevera', [[2, 1], [4, 12]], 14],
    ['Pechugas de pollo', 'g', 'nevera', [[500, 0]], 3], ['Espinacas frescas', 'paquete', 'nevera', [[1, 2]], 5],
    ['Huevos', 'ud', 'nevera', [[8, 12]], 20], ['Cebollas', 'ud', 'despensa', [[3, null]], null],
    ['Guisantes', 'paquete', 'congelador', [[1, 120]], 180], ['Merluza en filetes', 'g', 'congelador', [[400, 60]], 90],
    ['Arroz redondo', 'kg', 'despensa', [[1, null]], null], ['Tomate triturado', 'lata', 'despensa', [[2, 240]], 365],
    ['Pan de molde', 'paquete', 'despensa', [[1, -2]], 7], ['Aceite de oliva', 'botella', 'despensa', [], null], ['Café molido', 'paquete', 'despensa', [], null]
  ];
  P.forEach((r, i) => {
    const lots = r[3].map(([q, k], j) => ({ id: 'ejl' + i + '-' + j, cantidad: q, caduca: k === null ? '' : addDays(k), inicial: q, alta: now - (10 - j) * DAY }));
    D.productos['ej' + i] = withLots({ nombre: r[0], unidad: r[1], lugar: r[2], creado: now + i, editado: now, por: i % 3 ? 'Ana' : 'Luis', editadoPor: i % 3 ? 'Ana' : 'Luis' }, lots);
    D.habituales[hKey(r[0])] = { nombre: r[0], unidad: r[1], lugar: r[2], cantidad: (r[3][0] || [1])[0], vida: r[4], usos: 12 - i, ultimo: now - i * DAY, editado: now };
  });
  D.habituales[hKey('Plátanos')] = { nombre: 'Plátanos', unidad: 'ud', lugar: 'despensa', cantidad: 6, vida: 6, usos: 9, ultimo: now - 3 * DAY, editado: now };
  // tipo, nombre, unidad, cantidad, sitio, caducado, hace cuántos días, quién
  const E = [
    ['tirado', 'Espinacas frescas', 'paquete', 1, 'nevera', true, 6, 'Ana'], ['tirado', 'Espinacas frescas', 'paquete', 1, 'nevera', true, 41, 'Luis'],
    ['tirado', 'Yogures naturales', 'ud', 2, 'nevera', true, 19, 'Ana'], ['tirado', 'Pan de molde', 'paquete', 1, 'despensa', false, 12, 'Luis'],
    ['tirado', 'Leche semidesnatada', 'botella', 1, 'nevera', true, 76, 'Ana'], ['tirado', 'Pechugas de pollo', 'g', 300, 'nevera', true, 52, 'Luis'],
    ['tirado', 'Plátanos', 'ud', 3, 'despensa', false, 33, 'Ana']
  ];
  for (let i = 0; i < 26; i++) {
    const p = P[[0, 1, 4, 8, 10, 2, 7, 0, 1, 4][i % 10]];
    E.push(['usado', p[0], p[1], (p[3][0] || [1])[0], p[2], false, 2 + i * 3, i % 2 ? 'Ana' : 'Luis']);
  }
  E.forEach((e, i) => { D.registro['eje' + i] = { tipo: e[0], nombre: e[1], unidad: e[2], cantidad: e[3], lugar: e[4], caducado: e[5], fecha: now - e[6] * DAY, por: e[7], editado: now }; });
  const recs = [
    ['Tortilla de espinacas', ['4 huevos', '1 paquete de espinacas frescas', '1 cebolla', 'Aceite de oliva', 'Sal'], 'Pocha la cebolla, añade las espinacas hasta que bajen, mezcla con el huevo batido y cuaja la tortilla por los dos lados.'],
    ['Pollo al curry con arroz', ['500 g de pechugas de pollo', '200 g de arroz redondo', '1 cebolla', '1 lata de leche de coco', 'Curry en polvo'], ''],
    ['Batido de yogur y plátano', ['2 yogures naturales', '2 plátanos', '1 vaso de leche', 'Miel'], '']
  ];
  recs.forEach((r, i) => { D.recetas['ejr' + i] = { titulo: r[0], ingredientes: r[1], notas: r[2], creado: now + i, editado: now, por: 'Ana' }; });
  ls.set(K.data, D);
}

/* ---------- cálculos comunes ---------- */
function analysis() {
  const all = products();
  const stock = all.filter(([, v]) => v.cantidad > 0);
  const out = all.filter(([, v]) => v.cantidad <= 0);
  const urgLots = [];
  stock.forEach(([id, v]) => v.lotes.forEach(l => { const d = daysLeft(l.caduca); if (d !== null && d <= AVISO_DIAS) urgLots.push({ id, v, l, d }); }));
  urgLots.sort((a, b) => a.d - b.d || a.v.nombre.localeCompare(b.v.nombre, 'es'));
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
  return { all, stock, out, urg, urgLots, recs, hotRecs };
}
function peopleNames() {
  const s = new Set();
  if (cfg && cfg.nombre) s.add(cfg.nombre);
  products().forEach(([, v]) => { if (v.por) s.add(v.por); if (v.editadoPor) s.add(v.editadoPor); });
  recipes().forEach(([, v]) => { if (v.por) s.add(v.por); });
  return [...s];
}

/* ---------- pantallas ---------- */
const HOUSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 4l9 7"/><path d="M5 9.5V20h14V9.5"/><circle cx="12" cy="13" r="2"/><path d="M8.8 20a3.2 3.2 0 0 1 6.4 0"/></svg>';
function brand() {
  return '<header class="brand"><div class="id"><img src="favicon.svg" alt=""><div><div class="appname">Mi Despensa</div>' +
    '<button class="sync" id="syncBtn" type="button" data-s="' + sync.s + '" aria-label="Estado de la sincronización. Toca para sincronizar"><i></i><span>' + esc(syncLabel()) + '</span></button></div></div>' +
    '<button class="hbtn" id="hogarBtn" type="button" aria-current="' + (tab === 'hogar' ? 'page' : 'false') + '">' + HOUSE + '<span>Hogar</span></button></header>' +
    (sync.s === 'error' && sync.msg ? '<p class="note">' + esc(sync.msg) + '</p>' : '');
}

function screenDespensa(A) {
  const { stock, out, urg, urgLots, hotRecs } = A;
  let h = '';
  if (connected() && !cfg.nombre) h += '<p class="info">Pon tu nombre en <b>Hogar</b> para que en casa se sepa quién cambia cada cosa.</p>';
  h += '<section class="summary" aria-label="Úsalo pronto"><div class="eyebrow">Úsalo pronto · caduca en ' + AVISO_DIAS + ' días o menos</div>';
  if (urgLots.length) {
    h += '<div class="big">' + urg.length + (urg.length === 1 ? ' producto' : ' productos') + '</div><ul>' + urgLots.map(x => {
      const st = status(x.l);
      return '<li><span>' + esc(x.v.nombre) + ' <small>· ' + fmtNum(x.l.cantidad) + ' ' + esc(x.v.unidad || 'ud') + ' · ' + esc(PLACENAME[x.v.lugar] || '') + '</small></span><span class="lr"><span class="pill ' + st.cls + '">' + st.txt + '</span>' +
        (x.d < 0 ? '<button class="mini" type="button" data-toss="' + esc(x.id + '|' + x.l.id) + '" aria-label="Tirar ' + esc(x.v.nombre) + '">Tirar</button>' : '') + '</span></li>';
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
  if (fPlace === 'agotados' && !out.length) fPlace = 'todo';
  const counts = { todo: stock.length, agotados: out.length };
  PLACES.forEach(([k]) => counts[k] = stock.filter(([, v]) => v.lugar === k).length);
  const chips = [['todo', 'Todo']].concat(PLACES).concat(out.length ? [['agotados', 'Agotados']] : []);
  h += '<div class="filters" role="group" aria-label="Filtrar por sitio">' + chips.map(([k, n]) =>
    '<button class="fchip" type="button" data-f="' + k + '" aria-pressed="' + (k === fPlace) + '">' + n + '<span class="num">' + counts[k] + '</span></button>').join('') + '</div>';
  h += '<input type="search" id="q" class="search" placeholder="Buscar producto…" aria-label="Buscar producto" value="' + esc(qText) + '">';

  const q = norm(qText), many = peopleNames().length > 1;
  let shown;
  if (fPlace === 'agotados') shown = out.filter(([, v]) => !q || norm(v.nombre).includes(q)).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, 'es'));
  else {
    const pool = q ? stock.concat(out) : stock;   // al buscar, también salen los agotados para reponerlos
    shown = pool.filter(([, v]) => (fPlace === 'todo' || v.lugar === fPlace) && (!q || norm(v.nombre).includes(q)))
      .sort((a, b) => (a[1].cantidad > 0 ? 0 : 1) - (b[1].cantidad > 0 ? 0 : 1) || status(a[1]).rank - status(b[1]).rank || a[1].nombre.localeCompare(b[1].nombre, 'es'));
  }
  if (!shown.length) {
    h += q ? '<div class="empty"><b>Sin resultados</b>No hay ningún producto que coincida con «' + esc(qText) + '».</div>'
      : '<div class="empty"><b>Aquí no hay nada</b>Pulsa «+ Añadir» para guardar el primer producto.</div>';
  } else {
    h += '<div class="list">' + shown.map(([id, v]) => {
      const st = status(v), qn = v.cantidad, isOut = qn <= 0, unit = esc(v.unidad || 'ud');
      const multi = v.lotes.length > 1;
      return '<div class="row' + (isOut ? ' out' : '') + '"><button class="main" type="button" data-edit="' + esc(id) + '" aria-label="Editar ' + esc(v.nombre) + '"><span class="name">' + esc(v.nombre) + '</span><span class="meta"><span class="pill ' + (isOut ? 'none' : st.cls) + '">' + (isOut ? 'Agotado' : st.txt) + '</span>' +
        (fPlace !== v.lugar ? '<span>' + esc(PLACENAME[v.lugar] || '') + '</span>' : '') + (multi ? '<span>· ' + v.lotes.length + ' lotes</span>' : '') + (many && v.editadoPor ? '<span>· ' + esc(v.editadoPor) + '</span>' : '') + '</span>' +
        (multi ? '<span class="lots">' + v.lotes.map(l => fmtNum(l.cantidad) + ' ' + unit + ' ' + esc(lotWhen(l.caduca))).join(' · ') + '</span>' : '') + '</button>' +
        '<div class="step"><button class="sbtn" type="button" data-dec="' + esc(id) + '" aria-label="Gastar ' + esc(v.nombre) + '"' + (isOut ? ' disabled' : '') + '>−</button><span class="qty num">' + fmtNum(qn) + ' ' + unit + '</span><button class="sbtn add" type="button" data-inc="' + esc(id) + '" aria-label="' + (isOut ? 'Reponer ' : 'Añadir ') + esc(v.nombre) + '">+</button></div></div>';
    }).join('') + '</div>';
    if (fPlace === 'agotados') h += '<p class="sub" style="margin-top:12px">Pulsa + para reponer un producto con su nueva fecha de caducidad.</p>';
  }
  return h;
}

function recipeCard(x, hot) {
  const st = p => status(p);
  let h = '<article class="recipe' + (hot ? ' hot' : '') + '" id="rec-' + esc(x.id) + '"><div class="top"><div><h2>' + esc(x.r.titulo) + '</h2><div class="rmeta">' +
    (x.rows.length ? 'Tienes ' + x.haveCount + ' de ' + x.rows.length + ' ingredientes' : 'Sin ingredientes') + (x.r.por ? ' · de ' + esc(x.r.por) : '') + '</div></div>' +
    '<button class="linkbtn" type="button" data-redit="' + esc(x.id) + '">Editar</button></div>';
  if (x.hotProds.length) h += '<div class="tags">' + x.hotProds.map(p => '<span class="pill ' + st(p).cls + '">' + esc(p.nombre) + ' · ' + esc(st(p).short) + '</span>').join('') + '</div>';
  if (x.rows.length) h += '<ul class="ingl">' + x.rows.map(rw => '<li class="' + (rw.hot ? 'hot' : rw.have ? 'have' : 'miss') + '"><span>' + esc(rw.line) + (rw.prod && norm(rw.prod.nombre) !== norm(rw.line) ? ' <small>(' + esc(rw.prod.nombre) + ')</small>' : '') + '</span></li>').join('') + '</ul>';
  if (x.missing.length) h += '<div class="missing"><span><b>Te falta:</b> ' + esc(x.missing.map(m => cleanIngredient(m.line) || m.line).join(', ')) + '</span><button class="btn ghost sm" type="button" data-copymiss="' + esc(x.id) + '">Copiar</button></div>';
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
  return '<img class="logo-xl" src="icon-192.png" alt=""><h1>Bienvenido a Mi Despensa</h1><p class="sub" style="margin-bottom:16px">Conecta tu repositorio de datos de GitHub para guardar la despensa y las recetas, y verlas en todos los móviles de casa.</p>' +
    connForm(true) +
    '<section class="card"><h2>Probar sin GitHub</h2><p class="sub">Usa la app con productos y recetas de ejemplo guardados solo en este móvil. Podrás conectar GitHub más tarde.</p><div class="actions" style="margin-top:12px"><button class="btn ghost" type="button" id="demoBtn">Usar modo prueba</button></div></section>';
}

function wasteSummary(days) {
  const since = Date.now() - days * DAY;
  return liveEntries(D.registro).filter(([, e]) => e.tipo === 'tirado' && num(e.fecha) >= since).length;
}

function screenHogar() {
  let h = '<button class="linkbtn back" type="button" data-go="' + prevTab + '">‹ Volver</button>';
  h += '<div class="head" style="margin-top:2px"><div><h1>Hogar</h1><p class="sub">Quién usa la despensa, la conexión y los avisos.</p></div></div>';
  h += '<form class="card" id="nameForm" autocomplete="off"><h2>Tu nombre</h2><p class="hint" style="margin-top:4px">Aparece junto a lo que cambias. Se guarda solo en este dispositivo.</p><div class="addline"><input id="myName" maxlength="30" placeholder="Ana" value="' + esc((cfg && cfg.nombre) || '') + '" aria-label="Tu nombre"><button class="btn sm" type="submit">Guardar</button></div></form>';

  if (showConn || (cfg && cfg.demo)) {
    if (cfg && cfg.demo) h += '<section class="card"><h2>Modo prueba</h2><p class="sub">Todo se guarda solo en este móvil. Conecta GitHub para compartirlo con tu casa y no perderlo.</p></section>';
    h += connForm(false);
  } else {
    h += '<section class="card"><h2>Conexión</h2><p class="sub">Los cambios se guardan en <b>' + esc(cfg.owner + '/' + cfg.repo) + '</b> (' + esc(cfg.path) + ') unos segundos después de hacerlos. Sin cobertura se quedan en el móvil y se suben al volver.</p>' +
      '<div class="actions" style="margin-top:12px"><button class="btn ghost sm" type="button" id="syncNow">Sincronizar ahora</button><button class="btn ghost sm" type="button" id="editConn">Cambiar</button><button class="btn ghost sm" type="button" id="disconnect">Desconectar</button></div></section>';
  }

  const w30 = wasteSummary(30);
  h += '<section class="card"><h2>Lo que se tira</h2><p class="sub">' + (liveEntries(D.registro).some(([, e]) => e.tipo === 'tirado')
    ? (w30 ? 'En los últimos 30 días se han tirado ' + w30 + (w30 === 1 ? ' cosa.' : ' cosas.') : 'En los últimos 30 días no se ha tirado nada.')
    : 'Cuando tires algo, márcalo como «Tirado» en el producto y aquí verás cuánto, qué y por qué.') + '</p>' +
    '<div class="actions" style="margin-top:12px"><button class="btn ghost sm" type="button" id="statsBtn">Ver estadísticas</button></div></section>';

  const nh = habits().length;
  h += '<section class="card"><h2>Productos habituales</h2><p class="sub">' + (nh ? nh + (nh === 1 ? ' producto recordado.' : ' productos recordados.') + ' Te los propongo al añadir, con su cantidad, sitio y caducidad de siempre.' : 'Se aprenden solos a medida que añades productos.') + '</p>' +
    (nh ? '<div class="actions" style="margin-top:12px"><button class="btn ghost sm" type="button" id="habitsBtn">Gestionar</button></div>' : '') + '</section>';

  const names = peopleNames();
  h += '<section class="card"><h2>Quién la usa</h2>' + (names.length ? '<div class="people">' + names.map(n => '<span class="chip">' + esc(n) + (cfg && n === cfg.nombre ? ' (tú)' : '') + '</span>').join('') + '</div>' : '<p class="sub">Aún nadie ha puesto su nombre.</p>') +
    '<ol class="steps"><li>Para compartirla, la otra persona instala la app desde la misma dirección.</li><li>Al conectar, usa el mismo usuario, repositorio y archivo, y un token con acceso al repositorio de datos.</li><li>Cada uno pone su nombre y veréis la misma despensa y las mismas recetas.</li></ol></section>';

  h += '<section class="card"><h2>Avisos de caducidad</h2><p style="margin:8px 0 0;font-size:14.5px">Cuando algo caduca en ' + AVISO_DIAS + ' días o menos, aparece un aviso arriba de la app, en cualquier pestaña. Desaparece cuando lo gastas, lo tiras o corriges su fecha.</p></section>';

  const feed = products().filter(([, v]) => v.editado).sort((a, b) => b[1].editado - a[1].editado).slice(0, 8);
  if (feed.length) h += '<section class="card"><h2>Últimos cambios</h2><ul class="feed">' + feed.map(([, v]) => '<li><span>' + (v.editadoPor ? '<b>' + esc(v.editadoPor) + '</b> · ' : '') + esc(v.nombre) + '</span><time>' + ago(v.editado) + '</time></li>').join('') + '</ul></section>';

  h += '<section class="card"><h2>Copia de seguridad</h2><p class="sub">GitHub guarda el historial de cada cambio. También puedes descargar una copia del archivo.</p><div class="actions" style="margin-top:12px"><button class="btn ghost sm" type="button" id="backup">Descargar copia</button></div></section>';
  return h;
}

/* ---------- aviso de caducidad (arriba, en todas las pestañas) ---------- */
const WARN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9 2.5h6"/></svg>';
// Cerrar el aviso lo oculta en este móvil hasta que entre otro producto en la ventana de días o hasta mañana.
const alertKey = () => iso(new Date());
function alertHidden(A) {
  const h = ls.get('md.alertHidden', null);
  return !!(h && h.day === alertKey() && Array.isArray(h.ids) && A.urg.every(([id]) => h.ids.includes(id)));
}
function hideAlert() {
  ls.set('md.alertHidden', { day: alertKey(), ids: analysis().urg.map(([id]) => id) });
  render(); toast('Aviso oculto hasta mañana o hasta que caduque algo más.');
}
function alertBanner(A) {
  const n = A.urg.length;
  if (!n || alertHidden(A)) return '';
  const cls = A.urg.some(([, v]) => daysLeft(v.caduca) <= 0) ? 'bad' : 'warn';
  const items = A.urg.slice(0, 3).map(([, v]) => esc(v.nombre) + ' <span>' + esc(status(v).txt.toLowerCase()) + '</span>').join(' · ');
  return '<div class="alert ' + cls + '" role="status"><button class="amain" type="button" id="alertBtn" aria-label="' + n + (n === 1 ? ' producto caduca' : ' productos caducan') + ' en ' + AVISO_DIAS + ' días o menos. Ver en la despensa">' + WARN_ICON +
    '<span class="at"><b>' + (n === 1 ? '1 producto caduca' : n + ' productos caducan') + ' en ' + AVISO_DIAS + ' días o menos</b><span class="al">' + items + (n > 3 ? ' · y ' + (n - 3) + ' más' : '') + '</span></span><span class="go" aria-hidden="true">›</span></button>' +
    '<button class="x" type="button" id="alertClose" aria-label="Cerrar el aviso hasta mañana">✕</button></div>';
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
  let h = brand() + alertBanner(A);
  if (tab === 'recetas') h += screenRecetas(A);
  else if (tab === 'hogar') h += screenHogar();
  else h += screenDespensa(A);
  app.innerHTML = h;
  if (aid && $(aid)) { const el = $(aid); el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch (e) { } }
  $('nav').hidden = false;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  const setB = (id, n) => { const b = $(id); b.hidden = !n; b.textContent = n; };
  setB('b-despensa', A.urg.length); setB('b-recetas', A.hotRecs.length);
}

/* ---------- hojas ---------- */
let lastPlace = 'nevera';
function closeSheet() { $('sheetRoot').innerHTML = ''; }
function sheetShell(title, body) {
  const root = $('sheetRoot');
  root.innerHTML = '<div class="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="shT"><div class="grab"></div><h2 id="shT">' + esc(title) + '</h2>' + body + '</div></div>';
  root.querySelector('.scrim').addEventListener('click', e => { if (e.target.classList.contains('scrim') || e.target.closest('[data-close]')) closeSheet(); });
  return root;
}
const placeSeg = (place, lid) => '<div class="seg" role="group" aria-labelledby="' + lid + '">' + PLACES.map(([k, n]) => '<button type="button" data-place="' + k + '" aria-pressed="' + (k === place) + '">' + n + '</button>').join('') + '</div>';
const unitSelect = (id, u) => '<select id="' + id + '">' + UNITS.map(x => '<option' + (x === u ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>';
function parseQty(s) { return Number(String(s).replace(',', '.').trim()); }

/* Añadir (o reponer) un producto: crea un lote nuevo. Si el producto ya existe en ese sitio, se suma como otro lote. */
function openAdd(pre) {
  const d = Object.assign({ nombre: '', cantidad: 1, unidad: 'ud', lugar: lastPlace, caduca: '' }, pre || {});
  let place = d.lugar || 'nevera';
  const restock = !!(pre && pre.nombre);
  const root = sheetShell(pre && pre.titulo ? pre.titulo : 'Añadir producto',
    '<form id="pForm" class="form" novalidate autocomplete="off">' +
    '<div class="field span"><label for="fName">Producto</label><input id="fName" maxlength="60" placeholder="Yogures naturales" value="' + esc(d.nombre) + '"></div>' +
    '<div class="sugs" id="sugs"></div>' +
    '<div class="field"><label for="fQty">Cantidad</label><input id="fQty" inputmode="decimal" value="' + esc(String(d.cantidad).replace('.', ',')) + '"></div>' +
    '<div class="field"><label for="fUnit">Unidad</label>' + unitSelect('fUnit', d.unidad) + '</div>' +
    '<div class="field span"><span class="flabel" id="fPlaceL">Dónde lo guardas</span>' + placeSeg(place, 'fPlaceL') + '</div>' +
    '<div class="field span"><label for="fExp">Caduca (opcional)</label><div class="datebox"><input type="date" id="fExp" value="' + esc(d.caduca || '') + '"><button type="button" class="quick" data-add="3">+3 días</button><button type="button" class="quick" data-add="7">+1 semana</button><button type="button" class="quick" data-add="30">+1 mes</button><button type="button" class="quick" data-add="">Sin fecha</button></div>' +
    '<p class="hint" id="fHint">' + (d.hint ? esc(d.hint) : '') + '</p></div>' +
    '<p class="err" id="fErr" role="status"></p>' +
    '<div class="actions"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="submit" class="btn">' + (restock ? 'Reponer' : 'Añadir') + '</button></div></form>');
  const setPlace = p => { place = p; root.querySelectorAll('[data-place]').forEach(x => x.setAttribute('aria-pressed', x.dataset.place === place)); };
  root.querySelectorAll('[data-place]').forEach(b => b.addEventListener('click', () => setPlace(b.dataset.place)));
  root.querySelectorAll('.quick').forEach(b => b.addEventListener('click', () => {
    $('fExp').value = b.dataset.add === '' ? '' : addDays(Number(b.dataset.add));
  }));

  // sugerencias de productos habituales
  let sugs = [];
  const drawSugs = () => {
    const box = $('sugs'), q = norm($('fName').value);
    let L = habits().map(([, h]) => h);
    // propone los que tienen alguna palabra que empieza por lo escrito («yog» → Yogures; «ch» no → Leche)
    if (q) L = L.filter(h => { const n = norm(h.nombre); return n !== q && (n.startsWith(q) || n.split(/[^a-z0-9]+/).some(w => w.startsWith(q))); });
    L.sort((a, b) => num(b.usos) - num(a.usos) || num(b.ultimo) - num(a.ultimo));
    sugs = L.slice(0, q ? 6 : 8);
    box.innerHTML = sugs.length ? (q ? '' : '<span class="flabel">Habituales</span>') + '<div class="sugs-in">' + sugs.map((h, i) =>
      '<button type="button" class="sug" data-sug="' + i + '"><b>' + esc(h.nombre) + '</b><small>' + esc(PLACENAME[h.lugar] || '') + ' · ' + fmtNum(num(h.cantidad) || 1) + ' ' + esc(h.unidad || 'ud') + '</small></button>').join('') + '</div>' : '';
  };
  const apply = h => {
    $('fName').value = h.nombre;
    $('fQty').value = String(num(h.cantidad) || 1).replace('.', ',');
    $('fUnit').value = UNITS.includes(h.unidad) ? h.unidad : 'ud';
    setPlace(PLACENAME[h.lugar] ? h.lugar : 'nevera');
    $('fExp').value = h.vida != null ? addDays(num(h.vida)) : '';
    $('fHint').textContent = h.vida != null ? 'Te propongo la caducidad de siempre: unos ' + num(h.vida) + ' días. Cámbiala si el envase dice otra cosa.' : '';
    $('sugs').innerHTML = ''; sugs = [];
  };
  if (!restock) {
    drawSugs();
    $('sugs').addEventListener('click', e => { const b = e.target.closest('[data-sug]'); if (b) apply(sugs[Number(b.dataset.sug)]); });
    $('fName').addEventListener('input', () => { $('fErr').textContent = ''; $('fHint').textContent = ''; drawSugs(); });
    $('fName').addEventListener('change', () => {   // si escribe el nombre completo de un habitual, relleno lo demás
      const h = habitFor($('fName').value.trim());
      if (h && $('fQty').value.trim() === '1' && !$('fExp').value) apply(Object.assign({}, h, { nombre: $('fName').value.trim() }));
    });
  }

  $('pForm').addEventListener('submit', e => {
    e.preventDefault();
    const nombre = $('fName').value.trim();
    const cantidad = parseQty($('fQty').value);
    const unidad = $('fUnit').value, caduca = $('fExp').value || '';
    if (!nombre) { $('fErr').textContent = 'Escribe el nombre del producto.'; $('fName').focus(); return; }
    if (!isFinite(cantidad) || cantidad <= 0) { $('fErr').textContent = 'La cantidad tiene que ser un número mayor que cero.'; $('fQty').focus(); return; }
    lastPlace = place;
    const now = Date.now();
    const ex = products().find(([, x]) => norm(x.nombre) === norm(nombre) && x.lugar === place && (x.unidad || 'ud') === unidad);
    if (ex) {
      const [pid, pv] = ex;
      const lots = pv.lotes.map(l => Object.assign({}, l));
      const same = lots.find(l => l.caduca === caduca);
      if (same) { same.cantidad = round2(same.cantidad + cantidad); same.inicial = round2(num(same.inicial) + cantidad); }
      else lots.push({ id: newId(), cantidad, caduca, inicial: cantidad, alta: now });
      putP(pid, D.productos[pid], lots);
      toast(pv.cantidad > 0 ? (same ? 'Sumado a ' + pv.nombre : 'Nuevo lote de ' + pv.nombre + (caduca ? ' · caduca ' + lotWhen(caduca) : '')) : pv.nombre + ' repuesto en ' + PLACENAME[place]);
    } else {
      putP(newId(), { nombre, unidad, lugar: place }, [{ id: newId(), cantidad, caduca, inicial: cantidad, alta: now }]);
      toast(nombre + ' añadido a ' + PLACENAME[place]);
    }
    learn(nombre, unidad, place, cantidad, caduca);
    changed();
    closeSheet();
  });
  if (!restock) setTimeout(() => $('fName') && $('fName').focus(), 50);
  else setTimeout(() => $('fExp') && $('fExp').focus(), 50);
}

function openRestock(id) {
  const v = view(D.productos[id]); if (!v) return;
  const h = habitFor(v.nombre);
  openAdd({
    titulo: 'Reponer ' + v.nombre, nombre: v.nombre, unidad: v.unidad || 'ud', lugar: v.lugar || 'nevera',
    cantidad: h ? (num(h.cantidad) || 1) : 1, caduca: h && h.vida != null ? addDays(num(h.vida)) : '',
    hint: h && h.vida != null ? 'Te propongo la caducidad de siempre: unos ' + num(h.vida) + ' días. Cámbiala si el envase dice otra cosa.' : 'Pon la fecha del envase nuevo.'
  });
}

/* Editar un producto: nombre, unidad, sitio y sus lotes. Cada lote se puede corregir, marcar como gastado o como tirado. */
function openEdit(id) {
  const raw = D.productos[id]; if (!raw) return;
  const v = view(raw);
  let place = v.lugar || 'nevera';
  const w = v.lotes.map(l => Object.assign({}, l, { fate: null }));
  const root = sheetShell('Editar producto',
    '<form id="eForm" class="form" novalidate autocomplete="off">' +
    '<div class="field span"><label for="eName">Producto</label><input id="eName" maxlength="60" value="' + esc(v.nombre) + '"></div>' +
    '<div class="field span"><span class="flabel" id="ePlaceL">Dónde lo guardas</span>' + placeSeg(place, 'ePlaceL') + '</div>' +
    '<div class="field"><label for="eUnit">Unidad</label>' + unitSelect('eUnit', v.unidad || 'ud') + '</div>' +
    '<div class="lotbox"><span class="flabel">Lotes · se gasta primero el que caduca antes</span><div id="lots"></div><button type="button" class="linkbtn" id="addLot">+ Añadir lote</button></div>' +
    (v.por || v.editadoPor ? '<p class="by">' + (v.por ? 'Lo añadió ' + esc(v.por) : '') + (v.editadoPor && v.editado ? (v.por ? ' · ' : '') + 'último cambio de ' + esc(v.editadoPor) + ' ' + ago(v.editado) : '') + '</p>' : '') +
    '<p class="err" id="eErr" role="status"></p>' +
    '<div class="actions"><button type="button" class="btn warnbtn" id="eDel">Borrar</button><button type="button" class="btn ghost" data-close>Cancelar</button><button type="submit" class="btn">Guardar</button></div></form>');
  root.querySelectorAll('[data-place]').forEach(b => b.addEventListener('click', () => {
    place = b.dataset.place; root.querySelectorAll('[data-place]').forEach(x => x.setAttribute('aria-pressed', x.dataset.place === place));
  }));
  const readLots = () => w.forEach((l, i) => {
    const q = $('lq' + i), dd = $('ld' + i);
    if (q) l.cantidad = parseQty(q.value);
    if (dd) l.caduca = dd.value || '';
  });
  const drawLots = () => {
    const unit = esc($('eUnit').value);
    $('lots').innerHTML = w.length ? w.map((l, i) => l.fate
      ? '<div class="lot gone"><span class="fate">' + fmtNum(l.cantidad) + ' ' + unit + ' · ' + (l.fate === 'tirado' ? 'se apuntará como tirado' : 'se apuntará como gastado') + '</span><div class="lact"><button type="button" class="linkbtn" data-undo="' + i + '">Deshacer</button></div></div>'
      : '<div class="lot"><div class="field"><label for="lq' + i + '">Cantidad</label><input id="lq' + i + '" inputmode="decimal" value="' + esc(String(l.cantidad).replace('.', ',')) + '"></div>' +
      '<div class="field"><label for="ld' + i + '">Caduca</label><input type="date" id="ld' + i + '" value="' + esc(l.caduca || '') + '"></div>' +
      '<div class="lact"><button type="button" class="linkbtn" data-fate="usado" data-i="' + i + '">Lo he gastado</button><button type="button" class="linkbtn danger" data-fate="tirado" data-i="' + i + '">Lo he tirado</button></div></div>'
    ).join('') : '<p class="hint">No queda nada. Añade un lote para reponerlo.</p>';
  };
  drawLots();
  $('eUnit').addEventListener('change', () => { readLots(); drawLots(); });
  $('lots').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    readLots();
    if (b.dataset.fate) w[Number(b.dataset.i)].fate = b.dataset.fate;
    if (b.dataset.undo != null) w[Number(b.dataset.undo)].fate = null;
    drawLots();
  });
  $('addLot').addEventListener('click', () => {
    readLots();
    const h = habitFor(v.nombre);
    w.push({ id: newId(), cantidad: h ? (num(h.cantidad) || 1) : 1, caduca: h && h.vida != null ? addDays(num(h.vida)) : '', inicial: 0, alta: Date.now(), fate: null, nuevo: true });
    drawLots();
    const i = w.length - 1; setTimeout(() => $('lq' + i) && $('lq' + i).focus(), 30);
  });
  const del = $('eDel');
  del.addEventListener('click', () => {
    if (del.dataset.confirm) { delP(id); closeSheet(); toast(v.nombre + ' borrado'); return; }
    del.dataset.confirm = '1'; del.textContent = '¿Seguro? Toca otra vez';
  });
  $('eForm').addEventListener('submit', e => {
    e.preventDefault();
    readLots();
    const nombre = $('eName').value.trim(), unidad = $('eUnit').value;
    if (!nombre) { $('eErr').textContent = 'Escribe el nombre del producto.'; $('eName').focus(); return; }
    if (w.some(l => !l.fate && (!isFinite(l.cantidad) || l.cantidad < 0))) { $('eErr').textContent = 'Revisa las cantidades: tienen que ser números.'; return; }
    const meta = { nombre, unidad, lugar: place };
    let tossed = 0;
    w.filter(l => l.fate).forEach(l => { logEvent(l.fate, meta, l, l.fate === 'usado' ? (l.inicial || l.cantidad) : l.cantidad); if (l.fate === 'tirado') tossed++; });
    const kept = w.filter(l => !l.fate && l.cantidad > 0).map(l => {
      const o = { id: l.id, cantidad: round2(l.cantidad), caduca: l.caduca, inicial: l.nuevo ? round2(l.cantidad) : Math.max(num(l.inicial), round2(l.cantidad)), alta: l.alta };
      if (l.nuevo) learn(nombre, unidad, place, l.cantidad, l.caduca);
      return o;
    });
    putP(id, Object.assign({}, raw, meta), kept);
    changed(); closeSheet();
    toast(tossed ? 'Guardado. Lo tirado queda apuntado en Hogar › Lo que se tira.' : 'Cambios guardados');
  });
}

/* Receta */
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

/* Productos habituales: ver y olvidar */
function openHabits() {
  sheetShell('Productos habituales',
    '<p class="hint">Se aprenden solos cada vez que añades algo: nombre, cantidad, sitio y cuántos días suele durar. Olvida los que ya no compres o los que estén mal escritos.</p><ul class="hlist" id="hList"></ul><div class="actions"><button type="button" class="btn ghost" data-close>Cerrar</button></div>');
  const draw = () => {
    const L = habits().sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, 'es'));
    $('hList').innerHTML = L.length ? L.map(([k, h]) => '<li><span><b>' + esc(h.nombre) + '</b><small>' + esc(PLACENAME[h.lugar] || '') + ' · ' + fmtNum(num(h.cantidad) || 1) + ' ' + esc(h.unidad || 'ud') +
      (h.vida != null ? ' · dura unos ' + num(h.vida) + ' días' : '') + '</small></span><button type="button" class="linkbtn danger" data-forget="' + esc(k) + '">Olvidar</button></li>').join('')
      : '<li><span class="sub">No queda ninguno.</span></li>';
  };
  draw();
  $('hList').addEventListener('click', e => {
    const b = e.target.closest('[data-forget]'); if (!b) return;
    if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = '¿Olvidar?'; return; }
    D.habituales[b.dataset.forget] = { borrado: true, editado: Date.now() };
    changed(); draw();
  });
}

/* Estadísticas de lo que se tira (solo se calculan cuando las pides) */
function openStats() {
  let per = 90;
  sheetShell('Lo que se tira',
    '<div class="seg" id="sPer" role="group" aria-label="Periodo">' + [[30, '30 días'], [90, '3 meses'], [365, '12 meses']].map(([d, n]) => '<button type="button" data-per="' + d + '" aria-pressed="' + (d === per) + '">' + n + '</button>').join('') + '</div>' +
    '<div id="sBody"></div><div class="actions" style="margin-top:16px"><button type="button" class="btn ghost" data-close>Cerrar</button></div>');
  const bars = (rows, fmt) => {
    const max = Math.max(1, ...rows.map(r => r.n));
    return '<div class="bars">' + rows.map(r => '<div class="bar"><span class="bl">' + esc(r.label) + '</span><span class="bt" aria-hidden="true"><i style="width:' + (r.n ? Math.max(4, Math.round(r.n / max * 100)) : 0) + '%"></i></span><span class="bv">' + esc(fmt(r)) + '</span></div>').join('') + '</div>';
  };
  const draw = () => {
    const since = Date.now() - per * DAY;
    const ev = liveEntries(D.registro).map(([, e]) => e).filter(e => num(e.fecha) >= since);
    const T = ev.filter(e => e.tipo === 'tirado'), U = ev.filter(e => e.tipo === 'usado');
    let h = '';
    if (!T.length) {
      h = '<p class="statbig">Nada tirado</p><p class="sub">' + (U.length ? 'En este periodo se ha terminado todo lo que se ha gastado, sin tirar nada. ¡Bien!' : 'Aún no hay nada apuntado en este periodo.') + '</p>' +
        '<p class="hint" style="margin-top:12px">Para apuntar algo como tirado, abre el producto y pulsa «Lo he tirado» en su lote, o «Tirar» en lo caducado de «Úsalo pronto».</p>';
      $('sBody').innerHTML = h; return;
    }
    const total = T.length + U.length, of10 = Math.round(T.length / total * 10);
    const exp = T.filter(e => e.caducado).length;
    h += '<p class="statbig">' + T.length + (T.length === 1 ? ' vez' : ' veces') + '</p><p class="sub">se ha tirado algo en ' + (per === 30 ? 'los últimos 30 días' : per === 90 ? 'los últimos 3 meses' : 'los últimos 12 meses') + '.</p>';
    h += '<div class="sblk"><p style="margin:0;font-size:15px">De cada 10 compras que se terminan, <b>' + of10 + '</b> ' + (of10 === 1 ? 'acaba' : 'acaban') + ' en la basura.</p>' +
      '<p class="sub">' + exp + ' de ' + T.length + (exp === 1 ? ' estaba caducada' : ' estaban caducadas') + ' cuando se tiraron' + (T.length - exp ? '; el resto se estropeó antes de su fecha.' : '.') + '</p></div>';
    const by = {};
    T.forEach(e => { const k = norm(e.nombre); const o = by[k] || (by[k] = { label: e.nombre, n: 0, q: {} }); o.n++; o.q[e.unidad || 'ud'] = round2((o.q[e.unidad || 'ud'] || 0) + num(e.cantidad)); });
    const top = Object.values(by).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'es')).slice(0, 6);
    h += '<div class="sblk"><div class="eyebrow">Lo que más se tira</div>' + bars(top, r => r.n + (r.n === 1 ? ' vez' : ' veces') + ' · ' + Object.entries(r.q).map(([u, q]) => fmtNum(q) + ' ' + u).join(' + ')) + '</div>';
    const pl = PLACES.map(([k, n]) => ({ label: n, n: T.filter(e => e.lugar === k).length })).filter(r => r.n);
    if (pl.length) h += '<div class="sblk"><div class="eyebrow">Desde dónde</div>' + bars(pl, r => String(r.n)) + '</div>';
    if (per > 30) {
      const months = [], now = new Date();
      for (let i = per === 90 ? 2 : 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ y: d.getFullYear(), m: d.getMonth(), label: cap1(d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })), n: 0 }); }
      T.forEach(e => { const d = new Date(num(e.fecha)); const mm = months.find(x => x.y === d.getFullYear() && x.m === d.getMonth()); if (mm) mm.n++; });
      h += '<div class="sblk"><div class="eyebrow">Por mes</div>' + bars(months, r => String(r.n)) + '</div>';
    }
    const who = {}; T.forEach(e => { if (e.por) who[e.por] = (who[e.por] || 0) + 1; });
    if (Object.keys(who).length > 1) h += '<div class="sblk"><div class="eyebrow">Quién lo apuntó</div>' + bars(Object.entries(who).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n), r => String(r.n)) + '</div>';
    if (top[0] && top[0].n >= 2) h += '<p class="info">Lo que más se tira es <b>' + esc(top[0].label) + '</b>. Prueba a comprar menos cantidad o a buscarle una receta en cuanto aparezca en «Úsalo pronto».</p>';
    $('sBody').innerHTML = h;
  };
  draw();
  $('sPer').addEventListener('click', e => {
    const b = e.target.closest('[data-per]'); if (!b) return;
    per = Number(b.dataset.per);
    document.querySelectorAll('#sPer [data-per]').forEach(x => x.setAttribute('aria-pressed', Number(x.dataset.per) === per));
    draw();
  });
}

function copyText(text, okMsg) {
  const fallback = () => {
    sheetShell('Copiar', '<textarea class="copyarea" id="cpA" readonly aria-label="Texto para copiar">' + esc(text) + '</textarea><p class="hint">Mantén pulsado el texto para copiarlo.</p><div class="actions"><button type="button" class="btn ghost" data-close>Cerrar</button></div>');
    const a = $('cpA'); a.focus(); a.select();
  };
  try { navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback); } catch (e) { fallback(); }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('sheetRoot').firstChild) closeSheet(); });

/* ---------- acciones ---------- */
function setTab(t) { if (t === 'hogar' && tab !== 'hogar') prevTab = tab; tab = t; ls.set(K.tab, t === 'hogar' ? prevTab : t); render(); window.scrollTo(0, 0); }
$('nav').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });

// Gastar: se resta del lote que caduca antes. Cuando un lote se termina, queda apuntado como gastado.
function consume(id) {
  const raw = D.productos[id]; if (!raw) return;
  const v = view(raw); if (!v.cantidad) return;
  let rest = stepFor(v.unidad);
  const kept = [];
  for (const l of v.lotes.slice().sort(byExpiry)) {
    if (rest > 0) {
      const take = Math.min(rest, l.cantidad);
      l.cantidad = round2(l.cantidad - take); rest = round2(rest - take);
      if (l.cantidad <= 0) { logEvent('usado', v, l); continue; }
    }
    kept.push(l);
  }
  putP(id, raw, kept); changed();
  if (!kept.length) toast(v.nombre + ' se ha agotado. Lo tienes en «Agotados» para reponerlo.');
}
// Sumar: si queda algo, se suma al último lote comprado; si está agotado, se pide la fecha nueva.
function increase(id) {
  const raw = D.productos[id]; if (!raw) return;
  const v = view(raw);
  if (!v.cantidad) { openRestock(id); return; }
  const s = stepFor(v.unidad);
  const lots = v.lotes.map(l => Object.assign({}, l));
  const last = lots.reduce((a, b) => (num(b.alta) >= num(a.alta) ? b : a));
  last.cantidad = round2(last.cantidad + s); last.inicial = round2(num(last.inicial) + s);
  putP(id, raw, lots); changed();
}
function toss(pid, lid) {
  const raw = D.productos[pid]; if (!raw) return;
  const v = view(raw), lot = v.lotes.find(l => l.id === lid); if (!lot) return;
  logEvent('tirado', v, lot);
  putP(pid, raw, v.lotes.filter(l => l.id !== lid)); changed();
  toast(v.nombre + ' tirado. Queda apuntado en Hogar › Lo que se tira.');
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
    if ((wasDemo && !keep) || (connected() && !sameRepo)) { D = emptyData(); ls.set(K.data, D); }
    if (wasDemo && keep) { const now = Date.now(); for (const k of MAPS) for (const id in D[k]) D[k][id] = Object.assign({}, D[k][id], { editado: now }); }
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
  if (t.id === 'demoBtn') { cfg = { demo: true, nombre: '' }; ls.set(K.cfg, cfg); seedDemo(); render(); toast('Modo prueba: los datos son de ejemplo'); return; }
  if (t.id === 'syncBtn' || t.id === 'syncNow') { if (connected()) { syncNow(); if (t.id === 'syncNow') toast('Sincronizando…'); } return; }
  if (t.id === 'alertClose') { hideAlert(); return; }
  if (t.id === 'alertBtn') {
    if (tab !== 'despensa') setTab('despensa');
    const sm = document.querySelector('.summary'); if (sm) sm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (t.id === 'hogarBtn') { setTab(tab === 'hogar' ? prevTab : 'hogar'); return; }
  if (ds.go) { setTab(ds.go); return; }
  if (t.id === 'addBtn') { openAdd(null); return; }
  if (t.id === 'addRec') { openRecipe(null); return; }
  if (ds.f) { fPlace = ds.f; render(); return; }
  if (ds.edit) { openEdit(ds.edit); return; }
  if (ds.redit) { openRecipe(ds.redit); return; }
  if (ds.dec) { consume(ds.dec); return; }
  if (ds.inc) { increase(ds.inc); return; }
  if (ds.toss) {
    if (!ds.confirm) { t.dataset.confirm = '1'; t.textContent = '¿Tirar?'; return; }
    const [pid, lid] = ds.toss.split('|'); toss(pid, lid); return;
  }
  if (ds.copymiss) {
    const x = analysis().recs.find(y => y.id === ds.copymiss); if (!x) return;
    copyText('Para «' + x.r.titulo + '»:\n' + x.missing.map(m => '• ' + (cleanIngredient(m.line) || m.line)).join('\n'), 'Copiado. Pégalo en Mi Cesta o en Notas.');
    return;
  }
  if (t.id === 'statsBtn') { openStats(); return; }
  if (t.id === 'habitsBtn') { openHabits(); return; }
  if (t.id === 'editConn') { showConn = true; render(); return; }
  if (t.id === 'cCancel') { showConn = false; render(); return; }
  if (t.id === 'disconnect') {
    if (!t.dataset.confirm) { t.dataset.confirm = '1'; t.textContent = '¿Seguro? Toca otra vez'; return; }
    cfg = null; D = emptyData(); sha = null; dirty = false;
    [K.cfg, K.data, K.sha, K.dirty].forEach(k => ls.del(k));
    render(); toast('Desconectado. Tus datos siguen en GitHub.');
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
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'cfgForm') { e.preventDefault(); connect(); return; }
  if (f.id === 'nameForm') {
    e.preventDefault();
    const n = $('myName').value.trim().slice(0, 30);
    cfg = Object.assign({}, cfg, { nombre: n }); ls.set(K.cfg, cfg); render(); toast(n ? 'Hola, ' + n : 'Nombre borrado');
  }
});

/* ---------- arranque ---------- */
if (cfg && seedHabits()) { ls.set(K.data, D); dirty = true; ls.set(K.dirty, true); }
render();
syncNow();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}
