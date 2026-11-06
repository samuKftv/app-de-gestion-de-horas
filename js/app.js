"use strict";
// ===== MOTOR (sin dependencias) =====
const DAY = 864e5;
const toD = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const toS = t => new Date(t).toISOString().slice(0, 10);
const addDays = (s, n) => toS(toD(s) + n * DAY);
const dow = s => (new Date(toD(s)).getUTCDay() + 6) % 7; // 0 = lunes
const mondayOf = s => addDays(s, -dow(s));
const sum = a => a.reduce((x, y) => x + y, 0);
const r2 = n => Math.round(n * 100) / 100;
const durH = (ini, fin) => {
  if (!ini || !fin) return 0;
  const [a, b] = ini.split(":").map(Number), [c, d] = fin.split(":").map(Number);
  const m = (c * 60 + d) - (a * 60 + b);
  return m > 0 ? r2(m / 60) : 0;
};
const horasFranja = f => (f.horas !== "" && f.horas != null && isFinite(+f.horas)) ? Math.max(0, +f.horas) : durH(f.ini, f.fin);
const franjasGrupo = g => (g.franjas || []).map((f, i) => ({ id: f.id || "f" + (i + 1), ini: f.ini, fin: f.fin, h: horasFranja(f) }));
const aMin = t => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + m; };
const aHora = m => { m = Math.max(0, Math.min(23 * 60 + 59, Math.round(m))); return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
// Genera sesiones de "dur" minutos entre ini y fin, intercalando recreos [{ini, fin}]
const generarSesiones = (dia, ini, fin, dur, recreos, turno) => {
  const out = [], rs = (recreos || []).map(r => [aMin(r.ini), aMin(r.fin)]).sort((a, b) => a[0] - b[0]);
  let t = aMin(ini); const tf = aMin(fin);
  for (let k = 0; k < 40 && t < tf; k++) {
    const r = rs.find(x => x[0] >= t && x[0] < t + dur);
    if (r) { out.push({ dia, ini: aHora(r[0]), fin: aHora(r[1]), recreo: true, turno }); t = r[1]; continue; }
    if (t + dur > tf) break;
    out.push({ dia, ini: aHora(t), fin: aHora(t + dur), horas: 1, turno }); t += dur;
  }
  return out.map(x => ({ id: "d" + dia + "-" + x.ini.replace(":", ""), ...x }));
};
const PERIODOS_DEF = [0, 1, 2, 3, 4].flatMap(d => generarSesiones(d, "18:10", "22:45", 55, [], "noche"));
const periodosCurso = curso => {
  const base = (curso && curso.periodos && curso.periodos.length) ? curso.periodos : PERIODOS_DEF;
  const out = [];
  base.forEach((f, i) => {
    const dias = f.dia != null ? [+f.dia] : [0, 1, 2, 3, 4];
    for (const d of dias) out.push({ id: f.dia != null ? (f.id || "p" + i) : (f.id || "h" + (i + 1)) + "-" + d, dia: d, ini: f.ini, fin: f.fin, recreo: !!f.recreo && !f.fija, fija: f.fija || "", turno: f.turno || "tarde",
      h: (f.horas !== "" && f.horas != null && isFinite(+f.horas)) ? Math.max(0, +f.horas) : (f.recreo && !f.fija ? durH(f.ini, f.fin) : 1) });
  });
  return out.sort((a, b) => a.dia - b.dia || (a.ini || "").localeCompare(b.ini || ""));
};
const textoFranjas = fs => {
  if (!fs.length) return "";
  if (fs.length === 1) return fs[0].ini + "–" + fs[0].fin;
  return fs.map(f => f.ini).sort()[0] + "–" + fs.map(f => f.fin).sort().slice(-1)[0];
};

function calcular(D) {
  const { curso, grupos, profesores, asignaciones } = D;
  const R = { semanas: [], eventos: [], modInfo: {}, carga: {}, sesiones: {}, franjas: {}, huecos: [], dobles: [], solapes: [], choques: [],
    periodos: periodosCurso(curso), occ: new Map(), occFest: new Map(),
    idx: () => -1, lectivo: () => false, enCurso: () => false, noLect: new Map() };
  if (!curso || !curso.inicio || !curso.fin || curso.fin < curso.inicio) return R;
  const noLect = R.noLect;
  for (const r of curso.noLectivos || []) {
    if (!r.desde) continue;
    const hasta = r.hasta && r.hasta >= r.desde ? r.hasta : r.desde;
    for (let d = r.desde, k = 0; d <= hasta && k < 400; d = addDays(d, 1), k++) noLect.set(d, r.motivo || "No lectivo");
  }
  const lunes0 = mondayOf(curso.inicio), t0 = toD(lunes0);
  const idx = s => Math.floor((toD(s) - t0) / (7 * DAY));
  const enCurso = d => d >= curso.inicio && d <= curso.fin;
  const lectivo = d => dow(d) < 5 && enCurso(d) && !noLect.has(d);
  R.idx = idx; R.lectivo = lectivo; R.enCurso = enCurso;
  for (let m = lunes0, i = 0; m <= curso.fin && i < 80; m = addDays(m, 7), i++) {
    const dias = [0, 1, 2, 3, 4].map(k => addDays(m, k));
    R.semanas.push({
      i, lunes: m, viernes: dias[4], dias,
      diasCurso: dias.filter(enCurso).length,
      diasLectivos: dias.filter(lectivo).length,
      festivos: dias.filter(d => enCurso(d) && noLect.has(d)).map(d => ({ fecha: d, motivo: noLect.get(d) })),
    });
  }
  const n = R.semanas.length;
  const profIds = new Set(profesores.map(p => p.id));
  const fila = pid => {
    const k = profIds.has(pid) ? pid : "_";
    return R.carga[k] || (R.carga[k] = Array.from({ length: n }, () => ({ mod: 0, man: 0, items: [] })));
  };
  const addCarga = (pid, w, h, g, mod, festivo, desdoble) => {
    if (w < 0 || w >= n || h <= 0) return;
    const c = fila(pid)[w];
    c.mod += h;
    let it = c.items.find(x => x.modId === mod.id);
    if (!it) { it = { tipo: "modulo", modId: mod.id, grupoId: g.id, horas: 0, festivo: 0, desdoble: !!desdoble }; c.items.push(it); }
    it.horas += h; if (festivo) it.festivo += h;
  };
  const segundo = mod => mod.profesorId2 && mod.profesorId2 !== mod.profesorId && profIds.has(mod.profesorId2) ? mod.profesorId2 : null;
  const cargaMod = (mod, w, h, g, festivo) => {
    addCarga(mod.profesorId, w, h, g, mod, festivo, false);
    const p2 = segundo(mod); if (p2) addCarga(p2, w, h, g, mod, festivo, true);
  };
  const occ = R.occ;
  const ocupar = (mod, d, f, g, mapa) => {
    for (const pid of [mod.profesorId, segundo(mod)]) {
      if (!pid || !profIds.has(pid)) continue;
      const k = pid + "|" + d;
      const a = mapa.get(k) || []; a.push({ ini: f.ini, fin: f.fin, grupoId: g.id, franjaId: f.id, modId: mod.id }); mapa.set(k, a);
    }
  };

  for (const g of grupos) {
    const frs = franjasGrupo(g);
    R.franjas[g.id] = frs;
    const fmap = new Map(frs.map(f => [f.id, f]));
    const dias = new Set((g.dias || []).map(Number));
    const ses = [], noLectivosGrupo = [];
    for (let d = curso.inicio; d <= curso.fin; d = addDays(d, 1)) {
      if (!dias.has(dow(d))) continue;
      if (lectivo(d)) ses.push(d); else noLectivosGrupo.push(d);
    }
    R.sesiones[g.id] = ses;
    const ocupG = new Map();
    for (const m of g.modulos || []) {
      const mf = (m.franjas || []).map(id => fmap.get(id)).filter(Boolean);
      const info = { inicio: null, fin: null, sesiones: 0, horas: 0, grupoId: g.id, franjas: mf.map(f => f.id), franjaTxt: textoFranjas(mf) };
      R.modInfo[m.id] = info;
      if (!m.desde || !mf.length) continue;
      const hasta = m.hasta && m.hasta >= m.desde ? m.hasta : m.desde;
      const hSes = sum(mf.map(f => f.h));
      for (const d of ses) {
        if (d < m.desde || d > hasta) continue;
        info.sesiones++; info.horas += hSes;
        if (!info.inicio) info.inicio = d;
        info.fin = d;
        cargaMod(m, idx(d), hSes, g, false);
        for (const f of mf) {
          ocupar(m, d, f, g, occ);
          const k = f.id + "|" + d; const a = ocupG.get(k) || []; a.push(m.id); ocupG.set(k, a);
        }
      }
      // Día de clase no lectivo: cuenta como horario del módulo, para no dar avisos falsos.
      for (const d of noLectivosGrupo) if (d >= m.desde && d <= hasta) {
        cargaMod(m, idx(d), hSes, g, true);
        for (const f of mf) ocupar(m, d, f, g, R.occFest);
      }
      info.horas = r2(info.horas);
      if (info.inicio) {
        if (info.inicio === info.fin) R.eventos.push({ tipo: "unico", fecha: info.inicio, semana: idx(info.inicio), grupoId: g.id, modId: m.id });
        else {
          R.eventos.push({ tipo: "inicio", fecha: info.inicio, semana: idx(info.inicio), grupoId: g.id, modId: m.id });
          R.eventos.push({ tipo: "fin", fecha: info.fin, semana: idx(info.fin), grupoId: g.id, modId: m.id });
        }
      }
    }
    // Huecos (sesiones sin módulo) y módulos que coinciden en la misma franja
    const dobles = new Map();
    for (const f of frs) {
      let run = null;
      for (const d of ses) {
        const a = ocupG.get(f.id + "|" + d) || [];
        if (!a.length) {
          if (!run) run = { grupoId: g.id, franjaId: f.id, franjaTxt: f.ini + "–" + f.fin, desde: d, hasta: d, n: 0 };
          run.hasta = d; run.n++;
          continue;
        }
        if (run) { R.huecos.push(run); run = null; }
        if (a.length > 1) {
          const k = a.slice().sort().join("|");
          let x = dobles.get(k);
          if (!x) { x = { grupoId: g.id, franjaTxt: f.ini + "–" + f.fin, fecha: d, mods: a.slice(), n: 0 }; dobles.set(k, x); R.dobles.push(x); }
          x.n++;
        }
      }
      if (run) R.huecos.push(run);
    }
  }

  for (const a of asignaciones) {
    if (!a.profesorId || !(+a.horas > 0) || !profIds.has(a.profesorId)) continue;
    const w1 = Math.max(0, a.desde ? idx(a.desde) : 0);
    const w2 = Math.min(n - 1, a.hasta ? idx(a.hasta) : n - 1);
    for (let w = w1; w <= w2; w++) {
      const c = fila(a.profesorId)[w];
      c.man += +a.horas;
      c.items.push({ tipo: "manual", asigId: a.id, subtipo: a.tipo, descripcion: a.descripcion, horas: +a.horas });
    }
  }

  // Ocupaciones del horario de cada docente (guardias, tutorías…), con vigencia por semanas
  const perMap = new Map(R.periodos.map(x => [x.id, x]));
  const fijas = R.periodos.filter(x => x.fija);
  for (const p of profesores) {
    // Sesiones fijas para todo el profesorado (p. ej. la reunión RD de los miércoles)
    for (const per of fijas) {
      let choque = null;
      for (let w = 0; w < n; w++) {
        const c = fila(p.id)[w];
        c.man += per.h;
        let it = c.items.find(x => x.tipo === "manual" && x.subtipo === per.fija);
        if (!it) { it = { tipo: "manual", subtipo: per.fija, horas: 0, fija: true }; c.items.push(it); }
        it.horas += per.h;
        const fecha = R.semanas[w].dias[per.dia];
        const clases = (occ.get(p.id + "|" + fecha) || []).filter(e => per.ini < e.fin && e.ini < per.fin);
        if (clases.length) {
          if (!choque) { choque = { pid: p.id, ocId: null, tipo: per.fija, dia: per.dia, perTxt: per.ini + "–" + per.fin, fecha, modId: clases[0].modId, grupoId: clases[0].grupoId, n: 0 }; R.choques.push(choque); }
          choque.n++;
        }
      }
    }
    const lista = (p.horario || []).filter(o => perMap.has(o.per) && !perMap.get(o.per).fija).map(o => ({ ...o, dia: perMap.get(o.per).dia }));
    for (const o of lista) {
      const per = perMap.get(o.per);
      const w1 = Math.max(0, o.desde ? idx(o.desde) : 0), w2 = Math.min(n - 1, o.hasta ? idx(o.hasta) : n - 1);
      let choque = null;
      for (let w = w1; w <= w2; w++) {
        const c = fila(p.id)[w];
        c.man += per.h;
        let it = c.items.find(x => x.tipo === "manual" && x.subtipo === (o.tipo || "Otra"));
        if (!it) { it = { tipo: "manual", subtipo: o.tipo || "Otra", horas: 0 }; c.items.push(it); }
        it.horas += per.h;
        const fecha = R.semanas[w].dias[o.dia];
        const clases = (occ.get(p.id + "|" + fecha) || []).filter(e => per.ini < e.fin && e.ini < per.fin);
        if (clases.length) {
          if (!choque) { choque = { pid: p.id, ocId: o.id, tipo: o.tipo || "Otra", dia: o.dia, perTxt: per.ini + "–" + per.fin, fecha, modId: clases[0].modId, grupoId: clases[0].grupoId, n: 0 }; R.choques.push(choque); }
          choque.n++;
        }
      }
    }
    // Dos ocupaciones a la misma hora en semanas que se pisan
    for (let a = 0; a < lista.length; a++) for (let b = a + 1; b < lista.length; b++) {
      const x = lista[a], y = lista[b];
      const px = perMap.get(x.per), py = perMap.get(y.per);
      if (x.dia !== y.dia || !(px.ini < py.fin && py.ini < px.fin)) continue;
      const xi = x.desde || "", xf = x.hasta || "9999", yi = y.desde || "", yf = y.hasta || "9999";
      if (xi <= yf && yi <= xf) { const per = perMap.get(x.per); R.choques.push({ pid: p.id, ocId: y.id, tipo: y.tipo || "Otra", dia: y.dia, perTxt: per.ini + "–" + per.fin, fecha: addDays(xi > yi ? xi : yi, y.dia), otro: x.tipo || "Otra", n: 1 }); }
    }
  }

  // Solapes: un docente con dos clases a la misma hora el mismo día
  const vistos = new Map();
  for (const [k, arr] of occ) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      if (a.modId === b.modId) continue;
      if (a.grupoId === b.grupoId && a.franjaId === b.franjaId) continue; // ya sale como coincidencia en el grupo
      if (!(a.ini < b.fin && b.ini < a.fin)) continue;
      const [pid, fecha] = k.split("|");
      const clave = pid + "|" + [a.modId, b.modId].sort().join("|");
      let sx = vistos.get(clave);
      if (!sx) { sx = { pid, fecha, n: 0, a, b }; vistos.set(clave, sx); R.solapes.push(sx); }
      sx.n++;
    }
  }
  const orden = { fin: 0, unico: 1, inicio: 2 };
  R.eventos.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : orden[a.tipo] - orden[b.tipo]);
  return R;
}

function estadoSemana(R, prof, w) {
  const s = R.semanas[w];
  const c = (R.carga[prof.id] || [])[w] || { mod: 0, man: 0, items: [] };
  const total = r2(c.mod + c.man), min = +prof.minimo || 0, diff = r2(total - min);
  const sinMin = prof.minimo === "" || prof.minimo == null;
  let e;
  if (!s || s.diasLectivos === 0) e = "vac";
  else if (s.diasCurso < 5) e = "parcial";
  else if (sinMin) e = "sinmin";
  else if (diff < -0.04) e = "falta";
  else if (diff > 0.04) e = "exceso";
  else e = "ok";
  return { total, min, diff, e, c };
}
// ===== FIN MOTOR =====

// ===== Utilidades de presentación =====
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["L", "M", "X", "J", "V"];
const DIAS_C = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const TIPOS = ["Grupo externo", "Guardia", "Tutoría", "Otro"];
const dN = s => +s.slice(8, 10), mN = s => +s.slice(5, 7) - 1;
const fCorta = s => dN(s) + " " + MESES[mN(s)];
const fDia = s => DIAS_C[dow(s)] + " " + dN(s) + "/" + (mN(s) + 1);
const rango = (a, b) => mN(a) === mN(b) ? dN(a) + "–" + dN(b) + " " + MESES[mN(b)] : fCorta(a) + " – " + fCorta(b);
const fh = n => (Math.round(n * 10) / 10).toLocaleString("es-ES");
const fdiff = d => (d > 0 ? "+" : "−") + fh(Math.abs(d));
const hoyISO = () => { const t = new Date(); return toS(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())); };
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const corto = nombre => { const p = (nombre || "").trim().split(/\s+/); return p.length > 1 ? p[0] + " " + p[1][0] + "." : (p[0] || ""); };
const clon = o => JSON.parse(JSON.stringify(o));
const docentesMod = (m, profesores) => [m.profesorId, m.profesorId2].filter((id, i, a) => id && a.indexOf(id) === i).map(id => profesores.find(p => p.id === id)).filter(Boolean);
const porNombre = (a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es", { numeric: true, sensitivity: "base" });
const cursoPorDefecto = () => {
  const h = hoyISO(), y = +h.slice(0, 4), m = mN(h);
  const y0 = m >= 7 ? y : y - 1;
  return { inicio: y0 + "-09-15", fin: (y0 + 1) + "-06-20", noLectivos: [] };
};

// ===== Almacén (db) =====
const S = { curso: null, grupos: {}, profesores: {}, asignaciones: {}, listo: { curso: false, grupos: false, profesores: false, asignaciones: false }, modo: "cargando", error: null, lento: false, ver: 0 };
const oyentes = new Set();
const emitir = () => { S.ver++; oyentes.forEach(f => f()); };
let db = null;
// Descarga de archivos (copias de seguridad, CSV)
function descargar(nombre, contenido, tipo) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const downloads = { save: async ({ filename, data }) => descargar(filename, data, filename.endsWith(".json") ? "application/json" : "text/csv;charset=utf-8") };

// ===== Almacenes de datos =====
// Firebase (nube): cada cuenta guarda sus datos en usuarios/<uid>/…
function almacenFirebase(fs, uid) {
  const base = "usuarios/" + uid + "/";
  const limpio = d => JSON.parse(JSON.stringify(d));
  return {
    doc: p => { const r = fs.doc(base + p); return { onSnapshot: (n, e) => r.onSnapshot(n, e), set: d => r.set(limpio(d)), delete: () => r.delete() }; },
    collection: p => { const r = fs.collection(base + p); return { onSnapshot: (n, e) => r.onSnapshot(n, e) }; },
  };
}
// Local (este navegador): para probar sin Firebase o trabajar sin cuenta
function almacenLocal() {
  const CLAVE = "cuadrante-docente-datos";
  let datos = {};
  try { datos = JSON.parse(localStorage.getItem(CLAVE) || "{}") || {}; } catch (e) { datos = {}; }
  const oyDoc = new Map(), oyCol = new Map();
  const persistir = () => { try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch (e) { throw { code: "quota_exceeded", message: "el navegador no tiene espacio" }; } };
  const meta = { fromCache: false, hasPendingWrites: false };
  const snapDoc = path => { const d = datos[path]; return { id: path.split("/").pop(), exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined), metadata: meta }; };
  const snapCol = col => { const n = col.split("/").length + 1; const docs = Object.keys(datos).filter(k => k.startsWith(col + "/") && k.split("/").length === n).map(snapDoc); return { docs, size: docs.length, empty: !docs.length, metadata: meta }; };
  const avisar = path => {
    (oyDoc.get(path) || []).forEach(f => f(snapDoc(path)));
    const col = path.split("/").slice(0, -1).join("/");
    (oyCol.get(col) || []).forEach(f => f(snapCol(col)));
  };
  const oir = (mapa, k, f, snap) => { const a = mapa.get(k) || []; a.push(f); mapa.set(k, a); setTimeout(() => f(snap())); return () => mapa.set(k, (mapa.get(k) || []).filter(x => x !== f)); };
  return {
    doc: path => ({
      onSnapshot: next => oir(oyDoc, path, next, () => snapDoc(path)),
      set: async d => { datos[path] = JSON.parse(JSON.stringify(d)); persistir(); avisar(path); },
      delete: async () => { delete datos[path]; persistir(); avisar(path); },
    }),
    collection: col => ({ onSnapshot: next => oir(oyCol, col, next, () => snapCol(col)) }),
  };
}
const W = new Map(); // escrituras pendientes por ruta

function guardar(ruta, datos, espera = 500) {
  let w = W.get(ruta);
  if (!w) { w = { timer: null, busy: false, has: false, datos: null }; W.set(ruta, w); }
  w.datos = datos; w.has = true;
  if (!db) return;
  clearTimeout(w.timer);
  w.timer = setTimeout(() => { w.timer = null; vaciar(ruta); }, espera);
}
let activos = 0; const cola = [];
const turno = () => new Promise(r => { if (activos < 4) { activos++; r(); } else cola.push(r); });
const liberar = () => { const sig = cola.shift(); if (sig) sig(); else activos--; };
async function escribir(ruta, datos) {
  await turno();
  try { const ref = db.doc(ruta); return await (datos === null ? ref.delete() : ref.set(datos)); }
  finally { liberar(); }
}
async function vaciar(ruta) {
  const w = W.get(ruta);
  if (!w || w.busy || !w.has || !db) return;
  w.busy = true;
  while (w.has) {
    const d = w.datos; w.has = false;
    try { await escribir(ruta, d); }
    catch (e) {
      if (e && e.code === "unavailable") {
        await new Promise(r => setTimeout(r, 700 + Math.random() * 900));
        try { await escribir(ruta, d); } catch (e2) { fallo(e2); }
      } else fallo(e);
    }
  }
  w.busy = false;
  if (!w.has && !w.timer) W.delete(ruta);
  emitir();
}
function vaciarTodo() { for (const [ruta, w] of W) { clearTimeout(w.timer); w.timer = null; vaciar(ruta); } }
function fallo(e) {
  const c = e && e.code;
  S.error = c === "quota_exceeded" || c === "resource-exhausted" ? "No hay espacio para más datos: borra grupos o asignaciones que ya no uses."
    : c === "permission-denied" ? "No tienes permiso para guardar. Comprueba que has entrado con tu cuenta y las reglas de Firestore."
    : c === "revoked" || c === "not_granted" ? "Esta vista ya no tiene permiso para guardar. Abre de nuevo la página."
    : "No se pudo guardar el último cambio (" + (e && e.message || "error desconocido") + "). Vuelve a intentarlo.";
  emitir();
}
const sucio = ruta => W.has(ruta);

function aplicarColeccion(nombre) {
  return snap => {
    const next = {};
    for (const d of snap.docs) next[d.id] = d.data();
    for (const ruta of W.keys()) {
      const [c, id] = ruta.split("/");
      if (c !== nombre) continue;
      if (S[nombre][id]) next[id] = S[nombre][id]; else delete next[id];
    }
    S[nombre] = next; S.listo[nombre] = true;
    if (!snap.metadata.fromCache) S.lento = false;
    emitir();
  };
}
function errorSuscripcion(e) { S.error = "No se pueden leer tus datos ahora mismo (" + (e && e.code || "error") + "). Recarga la página más tarde."; emitir(); }

function suscribir() {
  const t = setTimeout(() => { if (!S.listo.grupos || !S.listo.curso) { S.lento = true; emitir(); } }, 10000);
  db.doc("config/curso").onSnapshot(snap => {
    if (!sucio("config/curso")) S.curso = snap.exists ? snap.data() : null;
    S.listo.curso = true; if (!snap.metadata.fromCache) { S.lento = false; clearTimeout(t); }
    emitir();
  }, errorSuscripcion);
  db.collection("grupos").onSnapshot(aplicarColeccion("grupos"), errorSuscripcion);
  db.collection("profesores").onSnapshot(aplicarColeccion("profesores"), errorSuscripcion);
  db.collection("asignaciones").onSnapshot(aplicarColeccion("asignaciones"), errorSuscripcion);
  for (const [ruta] of W) vaciar(ruta);
}

const hayFirebase = () => !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && window.firebase);
async function conectar() {
  if (!hayFirebase()) { db = almacenLocal(); S.modo = "local"; emitir(); suscribir(); return; }
  try {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    const fs = firebase.firestore();
    try { await fs.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* sin modo sin conexión en este navegador */ }
    firebase.auth().onAuthStateChanged(u => {
      if (!u) { S.usuario = null; S.modo = "login"; emitir(); return; }
      S.usuario = { nombre: u.displayName || "", correo: u.email || "" };
      if (db) return;
      db = almacenFirebase(fs, u.uid);
      S.modo = "db"; emitir(); suscribir();
    });
  } catch (e) {
    S.error = "No se pudo iniciar Firebase (" + (e.message || e) + "). Revisa js/firebase-config.js. Mientras, la app guarda en este navegador.";
    db = almacenLocal(); S.modo = "local"; emitir(); suscribir();
  }
}
function entrar() {
  const p = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(p).catch(e => {
    if (e && (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request")) return;
    S.error = e && e.code === "auth/unauthorized-domain" ? "Este dominio no está autorizado en Firebase. Añádelo en Authentication › Configuración › Dominios autorizados." : "No se pudo entrar (" + ((e && (e.code || e.message)) || "error") + ").";
    emitir();
  });
}
function salir() { vaciarTodo(); setTimeout(() => firebase.auth().signOut().then(() => location.reload()), 400); }
window.addEventListener("pagehide", vaciarTodo);

// Mutaciones
const curso = () => S.curso || cursoPorDefecto();
function setCurso(patch) { S.curso = { ...clon(curso()), ...patch }; guardar("config/curso", S.curso); emitir(); }
function setDoc(col, id, datos, espera) {
  if (datos === null) { const r = { ...S[col] }; delete r[id]; S[col] = r; }
  else S[col] = { ...S[col], [id]: datos };
  guardar(col + "/" + id, datos, espera); emitir();
}
function editar(col, id, fn) { const d = clon(S[col][id]); fn(d); setDoc(col, id, d); }

function datos() {
  const lista = col => Object.entries(S[col]).map(([id, d]) => ({ ...d, id }));
  return { curso: curso(), grupos: lista("grupos").sort(porNombre), profesores: lista("profesores").sort(porNombre), asignaciones: lista("asignaciones") };
}

// ===== Interfaz =====
const P = window.htmPreact;
if (!P) {
  document.getElementById("app").innerHTML = '<div class="wrap" style="padding-block:40px"><p>No se pudo cargar la aplicación. Comprueba tu conexión y recarga la página.</p></div>';
  throw new Error("htmPreact no disponible");
}
const { html, render, useState, useEffect, useMemo, useRef } = P;

function useRuta() {
  const leer = () => { const h = (location.hash || "").replace("#", ""); return ["plan", "avisos", "grupos", "profesorado", "calendario"].includes(h) ? h : "profesorado"; };
  const [r, setR] = useState(leer());
  useEffect(() => { const f = () => setR(leer()); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  return r;
}

function Confirmar({ etiqueta, pregunta, onSi, mini }) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => { if (!abierto) return; const t = setTimeout(() => setAbierto(false), 5000); return () => clearTimeout(t); }, [abierto]);
  return abierto
    ? html`<span class="fila centro" style="gap:6px"><button class=${"btn peligro confirmar" + (mini ? " mini" : "")} onClick=${() => { setAbierto(false); onSi(); }}>${pregunta || "Sí, eliminar"}</button><button class=${"btn" + (mini ? " mini" : "")} onClick=${() => setAbierto(false)}>Cancelar</button></span>`
    : html`<button class=${"btn peligro" + (mini ? " mini" : "")} onClick=${() => setAbierto(true)}>${etiqueta}</button>`;
}

function SelectSemana({ R, value, onChange, id }) {
  return html`<select id=${id} value=${value || ""} onChange=${e => onChange(e.target.value)}>
    ${R.semanas.map(s => html`<option value=${s.lunes}>S${s.i + 1} · ${fCorta(s.lunes)}</option>`)}
  </select>`;
}

function App() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force(x => x + 1); oyentes.add(f); f(); return () => oyentes.delete(f); }, []);
  const ruta = useRuta();
  const D = useMemo(datos, [S.ver]);
  const R = useMemo(() => calcular(D), [D]);
  const [profSel, setProfSelRaw] = useState(() => { try { return localStorage.getItem("cd-prof") || ""; } catch (e) { return ""; } });
  const [semFoco, setSemFoco] = useState(null);
  const recordar = id => { try { localStorage.setItem("cd-prof", id); } catch (e) { /* sin almacenamiento */ } };
  const setProfSel = id => { setProfSelRaw(id); setSemFoco(null); recordar(id); };
  const irProf = (id, w) => { setProfSelRaw(id); setSemFoco(w); recordar(id); location.hash = "profesorado"; };
  const [resaltar, setResaltar] = useState("");
  const [grupoAbierto, setGrupoAbierto] = useState(null);
  const hoy = hoyISO();
  const wHoy = Math.min(Math.max(R.idx(hoy), 0), Math.max(R.semanas.length - 1, 0));
  const cargando = S.modo === "cargando" || (S.modo === "db" && !(S.listo.curso && S.listo.grupos && S.listo.profesores && S.listo.asignaciones));
  const c = D.curso;

  const pendientesHoy = useMemo(() => {
    let k = 0;
    for (const p of D.profesores) for (let w = wHoy; w < Math.min(R.semanas.length, wHoy + 4); w++) if (estadoSemana(R, p, w).e === "falta") { k++; break; }
    return k;
  }, [R]);

  const ctx = { D, R, wHoy, irProf, profSel, setProfSel, semFoco, resaltar, setResaltar, grupoAbierto, setGrupoAbierto };
  let vista;
  if (cargando) vista = html`<div class="panel"><p class="muted">Cargando tus datos…</p></div>`;
  else if (ruta === "avisos") vista = html`<${Avisos} ...${ctx} />`;
  else if (ruta === "grupos") vista = html`<${Grupos} ...${ctx} />`;
  else if (ruta === "plan") vista = html`<${Plan} ...${ctx} />`;
  else if (ruta === "calendario") vista = html`<${Calendario} ...${ctx} />`;
  else vista = html`<${Profesorado} ...${ctx} />`;

  const guardando = W.size > 0;
  if (S.modo === "login") return html`<${Acceso} />`;
  const est = S.modo === "cargando" ? ["guardando", "Conectando…"] : S.modo === "local" ? ["local", "Modo local: guardado solo en este navegador"] : S.error ? ["error", "Error al guardar"] : guardando ? ["guardando", "Guardando…"] : ["", "Cambios guardados"];

  return html`
    <header class="top"><div class="wrap">
      <div class="brand"><h1>Cuadrante Docente</h1>
        <span class="curso">Curso ${c.inicio.slice(0, 4)}–${c.fin.slice(2, 4)} · ${R.semanas.length} semanas</span></div>
      <div class=${"estado-guardado " + est[0]} role="status"><span class="punto"></span>${est[1]}</div>
      ${S.usuario && html`<div class="cuenta-usr"><span title=${S.usuario.nombre}>${S.usuario.correo}</span><button class="btn mini" onClick=${salir}>Salir</button></div>`}
      <nav class="tabs" aria-label="Secciones">
        ${[["profesorado", "Horario por docente"], ["plan", "Vista general"], ["avisos", "Avisos"], ["grupos", "Grupos y módulos"], ["calendario", "Calendario y horas"]].map(([k, t]) =>
          html`<a href=${"#" + k} aria-current=${ruta === k ? "page" : undefined}>${t}${k === "avisos" && pendientesHoy > 0 ? html`<span class="cuenta" title="Profesores por debajo del mínimo en las próximas 4 semanas">${pendientesHoy}</span>` : ""}</a>`)}
      </nav>
    </div></header>
    <main class="wrap">
      ${S.error && html`<div class="aviso mal"><span>${S.error}</span><span class="espacio"></span><button class="btn mini" onClick=${() => { S.error = null; emitir(); }}>Cerrar</button></div>`}
      ${S.lento && html`<div class="aviso mal">Todavía no se puede conectar con tus datos. Lo que ves puede no estar actualizado.</div>`}
      ${S.modo === "local" && html`<div class="aviso info">Modo local: los datos se guardan solo en este navegador. Para guardarlos en la nube y usarlos desde cualquier equipo, configura Firebase (instrucciones en el README del proyecto). Si ya lo configuraste, recarga la página con Ctrl+Mayús+R. Haz copias en Calendario y horas › Copia de seguridad.</div>`}
      ${vista}
    </main>
  `;
}

// ----- Cuadrante -----
function Plan({ D, R, wHoy, irProf, resaltar, setResaltar, setGrupoAbierto }) {
  const n = R.semanas.length, cw = 56;
  const ref = useRef(null);
  const hoy = hoyISO();
  useEffect(() => { if (ref.current) ref.current.scrollLeft = Math.max(0, (wHoy - 1) * cw); }, [n]);
  if (!D.grupos.length && !D.profesores.length) return html`<${Vacio} />`;

  const pos = d => R.idx(d) * cw + Math.min(dow(d), 4) * cw / 5;
  const posFin = d => R.idx(d) * cw + (Math.min(dow(d), 4) + 1) * cw / 5;

  // Franjas no lectivas (por día de la semana laboral)
  const spans = [];
  let ini = -1;
  R.semanas.forEach((s, w) => s.dias.forEach((d, k) => {
    const u = w * 5 + k, nl = !R.lectivo(d);
    if (nl && ini < 0) ini = u;
    if (!nl && ini >= 0) { spans.push([ini, u]); ini = -1; }
  }));
  if (ini >= 0) spans.push([ini, n * 5]);

  const meses = [];
  R.semanas.forEach(s => { const m = mN(s.lunes); const last = meses[meses.length - 1]; if (last && last.m === m) last.k++; else meses.push({ m, k: 1, y: s.lunes.slice(2, 4) }); });

  const sinAsignar = R.carga["_"];
  const hayResaltado = !!resaltar;

  // Resumen de la semana actual
  const sHoy = R.semanas[wHoy];
  const bajos = D.profesores.map(p => ({ p, st: estadoSemana(R, p, wHoy) })).filter(x => x.st.e === "falta");
  const proximos = R.eventos.filter(e => e.semana >= wHoy && e.semana <= wHoy + 2 && (e.tipo === "inicio" || e.tipo === "fin" || e.tipo === "unico"));
  const nomMod = id => { for (const g of D.grupos) { const m = (g.modulos || []).find(x => x.id === id); if (m) return { m, g }; } return null; };

  const exportar = async () => {
    const filas = [["Profesor", "Mínimo", ...R.semanas.map(s => "S" + (s.i + 1) + " " + s.lunes)]];
    for (const p of D.profesores) filas.push([p.nombre, p.minimo, ...R.semanas.map((s, w) => String(estadoSemana(R, p, w).total).replace(".", ","))]);
    const csv = filas.map(f => f.map(x => '"' + String(x ?? "").replace(/"/g, '""') + '"').join(";")).join("\n");
    try { await downloads.save({ filename: "cuadrante-horas-profesorado.csv", data: "﻿" + csv }); }
    catch (e) { if (e && e.code !== "declined") { S.error = "No se pudo descargar el archivo (" + (e.code || "error") + ")."; emitir(); } }
  };

  return html`
    ${sHoy && html`<section class="resumen" aria-label="Resumen de la semana">
      <div class="res"><span class="eyebrow">Semana actual</span><span class="grande">S${sHoy.i + 1}</span><span class="muted small">${rango(sHoy.lunes, sHoy.viernes)}${sHoy.festivos.length ? " · " + sHoy.festivos.length + " día(s) no lectivo(s)" : ""}</span></div>
      <div class="res"><span class="eyebrow">Por debajo del mínimo esta semana</span><span class=${"grande" + (bajos.length ? " mal" : "")}>${bajos.length}</span>
        ${bajos.length ? html`<ul>${bajos.slice(0, 4).map(x => html`<li><span class="num" style="color:var(--low-ink)">${fdiff(x.st.diff)} h</span><span>${x.p.nombre}</span></li>`)}</ul>` : html`<span class="muted small">Todo el profesorado cubre su mínimo.</span>`}</div>
      <div class="res"><span class="eyebrow">Cambios de módulo · próximas 3 semanas</span><span class="grande">${proximos.length}</span>
        <ul>${proximos.slice(0, 4).map(e => { const x = nomMod(e.modId); return html`<li><span class=${"chip " + (e.tipo === "fin" ? "fin" : "inicio")}>${e.tipo === "inicio" ? "Empieza" : e.tipo === "unico" ? "Un día" : "Termina"}</span><span>${x ? x.m.nombre + " · " + (x.g.nombre || "").split(" · ")[0] : ""} · ${fDia(e.fecha)}</span></li>`; })}</ul>
        ${proximos.length > 4 && html`<a href="#avisos" class="small">Ver todos en Avisos</a>`}</div>
    </section>`}

    <div class="toolbar">
      <label class="fila centro small" style="gap:8px">Resaltar profesor
        <select id="resaltar" value=${resaltar} onChange=${e => setResaltar(e.target.value)}>
          <option value="">Ninguno</option>
          ${D.profesores.map(p => html`<option value=${p.id}>${p.nombre}</option>`)}
        </select></label>
      <button class="btn" onClick=${() => { if (ref.current) ref.current.scrollTo({ left: Math.max(0, (wHoy - 1) * cw), behavior: "smooth" }); }}>Ir a esta semana</button>
      ${downloads && D.profesores.length > 0 && html`<button class="btn" onClick=${exportar}>Exportar horas (CSV)</button>`}
      <span class="espacio"></span>
      <div class="leyenda" aria-label="Leyenda">
        <span><i style="background:var(--ok-bg);box-shadow:inset 0 0 0 1px var(--ok-ink)"></i>Cubre el mínimo</span>
        <span><i style="background:var(--low-bg);box-shadow:inset 0 0 0 1px var(--low-ink)"></i>Le faltan horas (−)</span>
        <span><i style="background:var(--over-bg);box-shadow:inset 0 0 0 1px var(--over-ink)"></i>Supera el mínimo (+)</span>
        <span><i style="background:var(--neutral-bg);box-shadow:inset 0 0 0 1px var(--muted)"></i>Sin mínimo indicado</span>
        <span><i style="background:var(--nolect)"></i>No lectivo</span>
      </div>
    </div>

    <div class="board" ref=${ref}>
      <div class="board-in" style=${{ "--n": n, "--cw": cw + "px" }}>
        <div class="overlay" aria-hidden="true">
          ${spans.map(([a, b]) => html`<div class="nl" style=${{ left: a * cw / 5 + "px", width: (b - a) * cw / 5 + "px" }}></div>`)}
          ${R.semanas[wHoy] && html`<div class="hoy-sem" style=${{ left: wHoy * cw + "px", width: cw + "px" }}></div>`}
          ${dow(hoy) < 5 && R.enCurso && R.enCurso(hoy) && html`<div class="hoy" style=${{ left: (pos(hoy) + cw / 10) + "px" }}></div>`}
        </div>
        <div class="b-head">
          <div class="b-row"><div class="b-lab"><span class="eyebrow">Semana</span></div>
            <div class="meses">${meses.map(m => html`<div style=${{ gridColumn: "span " + m.k }}>${MESES_L[m.m]} ${m.k > 2 ? "’" + m.y : ""}</div>`)}</div></div>
          <div class="b-row"><div class="b-lab"></div>
            <div class="semanas">${R.semanas.map((s, w) => html`<div class=${(w === wHoy ? "actual " : "") + (s.diasLectivos === 0 ? "vac" : "")} title=${"Semana " + (s.i + 1) + ": " + rango(s.lunes, s.viernes) + (s.festivos.length ? " · No lectivo: " + s.festivos.map(f => fCorta(f.fecha) + ": " + f.motivo).join("; ") : "")}><b>S${s.i + 1}</b>${fCorta(s.lunes)}</div>`)}</div></div>
        </div>

        <div class="b-sec"><div class="b-lab"><span class="eyebrow">Grupos · módulos</span></div><div></div></div>
        ${D.grupos.map(g => {
          const semanal = (g.dias || []).length <= 1;
          const ini = d => semanal ? R.idx(d) * cw : pos(d);
          const fin = d => semanal ? (R.idx(d) + 1) * cw : posFin(d);
          const abrir = () => { setGrupoAbierto(g.id); location.hash = "grupos"; };
          return (R.franjas[g.id] || []).map(f => {
            const mods = (g.modulos || []).filter(m => (m.franjas || []).includes(f.id));
            const hs = R.huecos.filter(h => h.grupoId === g.id && h.franjaId === f.id);
            return html`<div class="b-row" key=${g.id + f.id}>
              <div class="b-lab"><span class="t">${g.nombre || "Grupo sin nombre"}</span><span class="s">${f.ini}–${f.fin} · ${fh(f.h)} h</span></div>
              <div class="track">
                ${hs.map(h => html`<button class="bar hueco" style=${{ left: ini(h.desde) + 1 + "px", width: Math.max(4, fin(h.hasta) - ini(h.desde) - 2) + "px" }} title=${"Sin módulo: " + fDia(h.desde) + " → " + fDia(h.hasta) + " (" + h.n + " sesiones)"} onClick=${abrir}><span class="bn">Sin módulo</span></button>`)}
                ${mods.map(m => {
                  const info = R.modInfo[m.id];
                  if (!info || !info.inicio) return null;
                  const left = ini(info.inicio), right = fin(info.fin);
                  const docs = docentesMod(m, D.profesores);
                  const pn = docs.map(p => p.nombre).join(" / ");
                  const cls = "bar" + (!docs.length ? " sin" : "") + (hayResaltado ? (docs.some(p => p.id === resaltar) ? " on" : " off") : "");
                  const tip = (m.nombre || "Módulo") + " · " + (pn || "sin docente") + (docs.length > 1 ? " (desdoble)" : "") + "\n" + fDia(info.inicio) + " → " + fDia(info.fin) + " · " + info.sesiones + " sesiones · " + fh(info.horas) + " h";
                  return html`<button class=${cls} style=${{ left: left + 1 + "px", width: Math.max(4, right - left - 2) + "px" }} title=${tip} onClick=${abrir}>
                    <span class="bn">${m.nombre || "Módulo"}</span><span class="bp">${docs.length ? docs.map(p => corto(p.nombre)).join(" / ") : "Sin docente"}</span></button>`;
                })}
              </div></div>`;
          });
        })}

        <div class="b-sec"><div class="b-lab"><span class="eyebrow">Profesorado · horas/semana</span></div><div></div></div>
        ${D.profesores.map(p => html`<div class=${"b-row" + (resaltar === p.id ? " resaltado" : "")} key=${p.id}>
          <button class="b-lab" onClick=${() => setResaltar(resaltar === p.id ? "" : p.id)} title="Resaltar sus módulos">
            <span class="t">${p.nombre || "Sin nombre"}</span><span class="s">${p.minimo === "" || p.minimo == null ? "Sin mínimo" : "Mínimo " + fh(+p.minimo) + " h"}</span></button>
          <div class="cells">${R.semanas.map((s, w) => {
            const st = estadoSemana(R, p, w);
            const lab = "S" + (s.i + 1) + ": " + fh(st.total) + " h de " + fh(st.min) + " h" + (st.e === "falta" ? ", faltan " + fh(-st.diff) + " h" : st.e === "exceso" ? ", sobran " + fh(st.diff) + " h" : st.e === "vac" ? " (no lectiva)" : st.e === "parcial" ? " (semana incompleta)" : st.e === "sinmin" ? " (falta indicar su mínimo)" : "");
            return html`<button class=${"cell " + st.e} onClick=${() => irProf(p.id, w)} title=${lab} aria-label=${p.nombre + ", " + lab}>
              ${fh(st.total)}${(st.e === "falta" || st.e === "exceso") && html`<small>${fdiff(st.diff)}</small>`}</button>`;
          })}</div></div>`)}
        ${sinAsignar && sinAsignar.some(c => c.mod > 0) && html`<div class="b-row">
          <div class="b-lab"><span class="t" style="color:var(--low-ink)">Sin profesor</span><span class="s">Horas de módulos sin asignar</span></div>
          <div class="cells">${sinAsignar.map(c => html`<div class=${"cell " + (c.mod > 0 ? "falta" : "")} style="cursor:default">${c.mod > 0 ? fh(c.mod) : ""}</div>`)}</div></div>`}
      </div>
    </div>
    <p class="muted small">Pulsa una casilla de un docente para abrir su horario de esa semana y añadirle guardias, tutorías u otras ocupaciones. Los días festivos cuentan como horario del módulo en curso, así que no generan avisos falsos. Las semanas incompletas del principio y final de curso se muestran en gris.</p>
  `;
}

function Vacio() {
  return html`<div class="panel vacio">
    <span class="eyebrow">Primeros pasos</span>
    <h2>Monta tu cuadrante en tres pasos</h2>
    <ol>
      <li><a href="#calendario">Calendario</a>: fechas del curso, festivos y vacaciones.</li>
      <li><a href="#profesorado">Horario por docente</a>: cada docente con su mínimo semanal y sus guardias, tutorías y demás horas.</li>
      <li><a href="#grupos">Grupos y módulos</a>: el día de clase de cada grupo y sus módulos con franja, docente y fechas, como en el horario en PDF.</li>
    </ol>
    <p class="muted">Con eso verás aquí en qué semana empieza y termina cada módulo, y qué docentes no llegan a su mínimo.</p>
  </div>`;
}

// ----- Avisos -----
function Avisos({ D, R, wHoy, irProf, setGrupoAbierto }) {
  const [todo, setTodo] = useState(false);
  const grupo = id => D.grupos.find(g => g.id === id);
  const modulo = (g, id) => ((g && g.modulos) || []).find(x => x.id === id) || null;
  const prof = id => D.profesores.find(p => p.id === id);
  const irGrupo = id => { setGrupoAbierto(id); location.hash = "grupos"; };
  const boton = id => html` <button class="btn mini" onClick=${() => irGrupo(id)}>Abrir grupo</button>`;

  // Problemas de configuración
  const problemas = [];
  for (const g of D.grupos) {
    if (!(g.dias || []).length) problemas.push(html`<span><b>${g.nombre}</b>: no tiene día de clase marcado.${boton(g.id)}</span>`);
    for (const m of g.modulos || []) {
      const i = R.modInfo[m.id] || {}, nom = m.nombre || "Módulo sin nombre";
      if (!(i.franjas || []).length) problemas.push(html`<span><b>${nom}</b> (${g.nombre}) no tiene franja.${boton(g.id)}</span>`);
      else if (!m.desde) problemas.push(html`<span><b>${nom}</b> (${g.nombre}) no tiene fechas.${boton(g.id)}</span>`);
      else if (!i.sesiones) problemas.push(html`<span><b>${nom}</b> (${g.nombre}) no tiene ningún día de clase entre sus fechas.${boton(g.id)}</span>`);
      if (!docentesMod(m, D.profesores).length) problemas.push(html`<span><b>${nom}</b> (${g.nombre}) no tiene docente.${boton(g.id)}</span>`);
    }
  }
  for (const h of R.huecos) {
    const g = grupo(h.grupoId);
    problemas.push(html`<span><b>${g ? g.nombre : ""}</b>, ${h.franjaTxt}: sin módulo ${h.n === 1 ? "el " + fDia(h.desde) : "del " + fDia(h.desde) + " al " + fDia(h.hasta) + " (" + h.n + " sesiones)"}.${boton(h.grupoId)}</span>`);
  }
  for (const x of R.dobles) {
    const g = grupo(x.grupoId);
    problemas.push(html`<span><b>${g ? g.nombre : ""}</b>, ${x.franjaTxt}: ${x.mods.map(id => (modulo(g, id) || {}).nombre || "módulo").join(" y ")} coinciden el ${fDia(x.fecha)}${x.n > 1 ? " (y " + (x.n - 1) + " día(s) más)" : ""}.${boton(x.grupoId)}</span>`);
  }
  for (const x of R.solapes) {
    const p = prof(x.pid), ga = grupo(x.a.grupoId), gb = grupo(x.b.grupoId), ma = modulo(ga, x.a.modId), mb = modulo(gb, x.b.modId);
    problemas.push(html`<span><b>${p ? p.nombre : ""}</b> tiene dos clases a la vez el ${fDia(x.fecha)}${x.n > 1 ? " (y " + (x.n - 1) + " día(s) más)" : ""}: ${ma ? ma.nombre : ""} en ${ga ? ga.nombre : ""} (${x.a.ini}–${x.a.fin}) y ${mb ? mb.nombre : ""} en ${gb ? gb.nombre : ""} (${x.b.ini}–${x.b.fin}).</span>`);
  }

  for (const x of R.choques) {
    const p = prof(x.pid), m = x.modId ? modPorId(D, x.modId) : null;
    problemas.push(html`<span><b>${p ? p.nombre : ""}</b>: ${x.tipo.toLowerCase()} del ${DIAS_L[x.dia].toLowerCase()} ${x.perTxt} coincide con ${m ? m.m.nombre + " (" + m.g.nombre + ")" : "otra ocupación"} desde el ${fDia(x.fecha)}${x.n > 1 ? " (" + x.n + " semanas)" : ""}. <button class="btn mini" onClick=${() => irProf(x.pid, R.idx(x.fecha))}>Ver horario</button></span>`);
  }
  const desde = todo ? 0 : wHoy;
  const tarjetas = [];
  const ETQ = { inicio: "Empieza", fin: "Termina", unico: "Solo ese día" };
  for (let w = desde; w < R.semanas.length; w++) {
    const s = R.semanas[w];
    const evs = R.eventos.filter(e => e.semana === w);
    const sts = D.profesores.map(p => ({ p, st: estadoSemana(R, p, w) }));
    const bajos = sts.filter(x => x.st.e === "falta"), altos = sts.filter(x => x.st.e === "exceso");
    if (!evs.length && !bajos.length && !altos.length && !s.festivos.length) continue;
    tarjetas.push(html`<article class=${"semana-card" + (w === wHoy ? " actual" : "")} key=${w}>
      <div class="sc-fecha"><span class="eyebrow">${w === wHoy ? "Esta semana" : "Semana"}</span><b>S${s.i + 1}</b><span class="muted small">${rango(s.lunes, s.viernes)}</span></div>
      <div class="sc-body">
        ${s.festivos.length > 0 && html`<div class="ev"><span class="chip festivo">No lectivo</span><span class="que">${s.festivos.map(f => fDia(f.fecha) + ": " + f.motivo).join(" · ")}</span></div>`}
        ${evs.map(e => {
          const g = grupo(e.grupoId), m = modulo(g, e.modId), docs = m ? docentesMod(m, D.profesores) : [], i = R.modInfo[e.modId] || {};
          return html`<div class="ev"><span class=${"chip " + (e.tipo === "fin" ? "fin" : "inicio")}>${ETQ[e.tipo]}</span>
            <span class="que"><b>${m ? m.nombre : ""}</b> · ${g ? g.nombre : ""} · ${i.franjaTxt} · ${fDia(e.fecha)} · <span class="muted">${docs.length ? docs.map(p => p.nombre).join(" / ") : "sin docente"}</span></span></div>`;
        })}
        ${(bajos.length > 0 || altos.length > 0) && html`<div class="ev"><span class="chip falta">Horas</span>
          <div class="lista-bajos">
            ${bajos.map(x => html`<button onClick=${() => irProf(x.p.id, w)}>${x.p.nombre}: ${fh(x.st.total)}/${fh(x.st.min)} h · faltan ${fh(-x.st.diff)}</button>`)}
            ${altos.map(x => html`<button class="exc" onClick=${() => irProf(x.p.id, w)}>${x.p.nombre}: ${fh(x.st.total)}/${fh(x.st.min)} h · sobran ${fh(x.st.diff)}</button>`)}
          </div></div>`}
      </div></article>`);
  }

  return html`
    <div class="panel-cab"><h2>Avisos semana a semana</h2><span class="espacio"></span>
      <label class="fila centro small" style="gap:6px"><input type="checkbox" id="ver-todo" checked=${todo} onChange=${e => setTodo(e.target.checked)} /> Incluir semanas pasadas</label></div>
    ${problemas.length > 0 && html`<div class="panel"><h3>Revisar</h3><div style="display:grid;gap:6px;font-size:14px">${problemas.map(x => html`<div class="fila centro" style="gap:8px"><span class="chip falta">!</span>${x}</div>`)}</div></div>`}
    ${tarjetas.length ? tarjetas : html`<div class="panel"><p class="muted">No hay cambios ni avisos en las semanas que quedan.</p></div>`}
  `;
}

// ----- Grupos -----
const DIAS_L = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const FRANJAS_TARDE = [{ id: "f1", ini: "18:10", fin: "20:00", horas: 2 }, { id: "f2", ini: "20:00", fin: "22:45", horas: 3 }];

function Grupos({ D, R, grupoAbierto, setGrupoAbierto }) {
  const nuevo = () => {
    const id = nuevoId();
    const base = D.grupos.find(g => (g.franjas || []).length);
    setDoc("grupos", id, { nombre: "Nuevo grupo", dias: [0], franjas: clon(base ? base.franjas : FRANJAS_TARDE), modulos: [], creado: Date.now() }, 0);
    setGrupoAbierto(id);
  };
  return html`
    <div class="panel-cab"><h2>Grupos y módulos</h2><span class="espacio"></span><button class="btn primario" onClick=${nuevo}>Nuevo grupo</button></div>
    <p class="muted small" style="max-width:76ch">Cada grupo es como su horario en PDF: el día de clase, las franjas y la lista de módulos con su franja, docente y fechas. Las fechas se eligen entre los días de clase reales del grupo, ya sin festivos. La tira de sesiones te enseña cómo queda, igual que la tabla del PDF.</p>
    ${!D.grupos.length && html`<div class="panel"><p class="muted">Aún no hay grupos. Crea el primero con “Nuevo grupo”.</p></div>`}
    ${D.grupos.map(g => html`<${Grupo} key=${g.id} g=${g} D=${D} R=${R} abierto=${grupoAbierto === g.id} toggle=${() => setGrupoAbierto(grupoAbierto === g.id ? null : g.id)} />`)}
  `;
}

function Grupo({ g, D, R, abierto, toggle }) {
  const ref = useRef(null);
  useEffect(() => { if (abierto && ref.current) ref.current.scrollIntoView({ block: "start", behavior: "smooth" }); }, []);
  const ed = fn => editar("grupos", g.id, fn);
  const mods = g.modulos || [];
  const ses = R.sesiones[g.id] || [];
  const nHuecos = sum(R.huecos.filter(h => h.grupoId === g.id).map(h => h.n));
  const nDobles = R.dobles.filter(x => x.grupoId === g.id).length;
  const sinDoc = mods.filter(m => !docentesMod(m, D.profesores).length).length;
  const fines = mods.map(m => (R.modInfo[m.id] || {}).fin).filter(Boolean).sort();
  const dias = (g.dias || []).slice().sort().map(d => DIAS_L[d]).join(" y ");
  const toggleDia = i => ed(x => { const s = new Set(x.dias || []); if (s.has(i)) s.delete(i); else s.add(i); x.dias = [...s].sort(); });

  return html`<section class="grupo" ref=${ref}>
    <div class="grupo-cab">
      <h3>${g.nombre || "Grupo sin nombre"}</h3>
      <div class="resumen-grupo">
        <span>${dias || "Sin día de clase"}</span>
        <span>${mods.length} módulo(s) · ${ses.length} sesiones${fines.length ? " · acaba " + fDia(fines[fines.length - 1]) : ""}</span>
        ${nHuecos > 0 && html`<span class="chip falta">${nHuecos} sesión(es) sin módulo</span>`}
        ${nDobles > 0 && html`<span class="chip falta">Módulos que coinciden</span>`}
        ${sinDoc > 0 && html`<span class="chip falta">${sinDoc} sin docente</span>`}
        ${!nHuecos && !nDobles && !sinDoc && mods.length > 0 && html`<span class="chip ok">Completo</span>`}
      </div>
      <span class="espacio"></span>
      <button class="btn" onClick=${toggle} aria-expanded=${abierto}>${abierto ? "Cerrar" : "Editar"}</button>
    </div>
    ${abierto && html`<div class="grupo-body">
      <div class="fila">
        <label class="campo" style="flex:1;min-width:220px">Nombre del grupo<input type="text" id=${"gn-" + g.id} value=${g.nombre || ""} onInput=${e => ed(x => { x.nombre = e.target.value; })} /></label>
        <div class="campo"><span>Día(s) de clase</span>
          <div class="dias-btn">${DIAS.map((d, i) => { const on = (g.dias || []).includes(i); return html`<button class=${"dia-b" + (on ? " on" : "")} aria-pressed=${on} title=${DIAS_L[i]} onClick=${() => toggleDia(i)}>${d}</button>`; })}</div></div>
      </div>
      <${Franjas} g=${g} R=${R} ed=${ed} />
      <${Sesiones} g=${g} R=${R} />
      <${TablaModulos} g=${g} D=${D} R=${R} ed=${ed} />
      <div class="fila centro"><span class="espacio"></span><${Confirmar} etiqueta="Eliminar grupo" pregunta="Sí, eliminar el grupo" onSi=${() => setDoc("grupos", g.id, null, 0)} /></div>
    </div>`}
  </section>`;
}

function Franjas({ g, R, ed }) {
  const frs = g.franjas || [];
  const add = () => ed(x => {
    x.franjas = x.franjas || [];
    const u = x.franjas[x.franjas.length - 1];
    const usados = new Set(x.franjas.map(f => f.id));
    let k = x.franjas.length + 1; while (usados.has("f" + k)) k++;
    let ini = "18:10", fin = "20:00";
    if (u && u.fin) { const [h, m] = u.fin.split(":").map(Number); ini = u.fin; fin = String(Math.min(23, h + 1)).padStart(2, "0") + ":" + String(m).padStart(2, "0"); }
    x.franjas.push({ id: "f" + k, ini, fin, horas: "" });
  });
  const quitar = i => ed(x => {
    const id = x.franjas[i].id || "f" + (i + 1);
    x.franjas.splice(i, 1);
    for (const m of x.modulos || []) m.franjas = (m.franjas || []).filter(f => f !== id);
  });
  const resumen = (R.franjas[g.id] || []).map(f => f.ini + "–" + f.fin + " (" + fh(f.h) + " h)").join(" · ");
  return html`<details class="franjas">
    <summary><b>Franjas:</b> <span class="muted">${resumen || "ninguna"}</span> <span class="small" style="color:var(--accent)">Cambiar</span></summary>
    <div class="franjas-body">
      ${frs.map((f, i) => html`<div class="fila centro" key=${f.id || i}>
        <input type="time" id=${"fi-" + g.id + "-" + i} value=${f.ini} onChange=${e => ed(x => { x.franjas[i].ini = e.target.value; })} aria-label="Hora de inicio" />
        <span class="muted">–</span>
        <input type="time" id=${"ff-" + g.id + "-" + i} value=${f.fin} onChange=${e => ed(x => { x.franjas[i].fin = e.target.value; })} aria-label="Hora de fin" />
        <span class="muted small">cuenta</span>
        <input type="number" class="fh" min="0" step="0.5" id=${"fh-" + g.id + "-" + i} value=${f.horas ?? ""} placeholder=${fh(durH(f.ini, f.fin))} onInput=${e => ed(x => { x.franjas[i].horas = e.target.value === "" ? "" : +e.target.value; })} aria-label="Horas lectivas que cuenta la franja" />
        <span class="muted small">h lectivas</span>
        <${Confirmar} mini etiqueta="Quitar" pregunta="Quitar franja" onSi=${() => quitar(i)} />
      </div>`)}
      <div><button class="btn mini" onClick=${add}>Añadir franja</button></div>
      <p class="muted small">“Cuenta” son las horas lectivas que suma la franja al docente. Si lo dejas vacío se usa la duración real.</p>
    </div>
  </details>`;
}

function Sesiones({ g, R }) {
  const ses = R.sesiones[g.id] || [], frs = R.franjas[g.id] || [];
  if (!ses.length || !frs.length) return null;
  const mods = g.modulos || [];
  const mapa = new Map();
  mods.forEach((m, k) => {
    const i = R.modInfo[m.id];
    if (!i || !i.inicio) return;
    for (const d of ses) if (d >= i.inicio && d <= i.fin) for (const fid of i.franjas) {
      const key = fid + "|" + d; const a = mapa.get(key) || []; a.push({ m, k }); mapa.set(key, a);
    }
  });
  return html`<div style="display:grid;gap:6px">
    <h3>Sesiones del curso</h3>
    <div class="ses-wrap"><table class="ses">
      <thead><tr><th></th>${ses.map((d, j) => html`<th class=${j > 0 && mN(d) !== mN(ses[j - 1]) ? "mes-n" : ""}>${dN(d)}/${mN(d) + 1}</th>`)}</tr></thead>
      <tbody>${frs.map(f => html`<tr>
        <th>${f.ini}–${f.fin}</th>
        ${ses.map((d, j) => {
          const a = mapa.get(f.id + "|" + d) || [];
          const cls = (!a.length ? "vacia" : a.length > 1 ? "doble" : "t" + (a[0].k % 2)) + (j > 0 && mN(d) !== mN(ses[j - 1]) ? " mes-n" : "");
          const txt = a.map(x => x.m.nombre || "?").join("+");
          return html`<td class=${cls} title=${fDia(d) + " · " + f.ini + "–" + f.fin + ": " + (txt || "sin módulo")}>${txt || "—"}</td>`;
        })}
      </tr>`)}</tbody>
    </table></div>
  </div>`;
}

function SelSesion({ ses, value, min, onChange, id, label }) {
  const opts = ses.filter(d => !min || d >= min);
  const fuera = value && !ses.includes(value);
  return html`<select id=${id} aria-label=${label} value=${value || ""} onChange=${e => onChange(e.target.value)}>
    ${!value && html`<option value="">Elegir…</option>`}
    ${fuera && html`<option value=${value}>${fDia(value)} (sin clase)</option>`}
    ${opts.map(d => html`<option value=${d}>${fDia(d)}</option>`)}
  </select>`;
}

function TablaModulos({ g, D, R, ed }) {
  const ses = R.sesiones[g.id] || [], frs = R.franjas[g.id] || [];
  const mods = g.modulos || [];
  const set = (id, campo, v) => ed(x => {
    const m = (x.modulos || []).find(y => y.id === id); if (!m) return;
    m[campo] = v;
    if (campo === "desde" && v && (!m.hasta || m.hasta < v)) m.hasta = v;
    if (campo === "hasta" && v && m.desde && m.desde > v) m.desde = v;
  });
  const opcFranja = [...frs.map(f => ({ v: f.id, t: f.ini + "–" + f.fin })), ...(frs.length > 1 ? [{ v: frs.map(f => f.id).join("+"), t: "Tarde completa " + textoFranjas(frs) }] : [])];
  const valFranja = m => (m.franjas || []).join("+");
  const anadir = () => {
    const h = R.huecos.filter(x => x.grupoId === g.id).sort((a, b) => a.desde.localeCompare(b.desde))[0];
    const ult = ses[ses.length - 1] || "";
    const m = { id: nuevoId(), nombre: "", franjas: h ? [h.franjaId] : (frs[0] ? [frs[0].id] : []), profesorId: "", profesorId2: "", desde: h ? h.desde : ult, hasta: h ? h.hasta : ult };
    ed(x => { x.modulos = x.modulos || []; x.modulos.push(m); });
  };
  const ordenar = () => ed(x => {
    const pos = id => { const k = frs.findIndex(f => f.id === id); return k < 0 ? 99 : k; };
    (x.modulos || []).sort((a, b) => (pos((a.franjas || [])[0]) - pos((b.franjas || [])[0])) || ((a.desde || "").localeCompare(b.desde || "")));
  });
  const quitar = id => ed(x => { x.modulos = (x.modulos || []).filter(m => m.id !== id); });
  const nombreMod = id => (mods.find(m => m.id === id) || {}).nombre || "otro módulo";
  const opcDoc = (vacio, pref) => html`<option value="">${vacio}</option>${D.profesores.map(p => html`<option value=${p.id}>${pref}${p.nombre}</option>`)}`;
  const valDoc = id => D.profesores.some(p => p.id === id) ? id : "";

  return html`<div style="display:grid;gap:8px">
    <div class="fila centro"><h3>Módulos</h3><span class="espacio"></span>
      ${mods.length > 1 && html`<button class="btn mini" onClick=${ordenar}>Ordenar por franja y fecha</button>`}</div>
    <div class="tm">
      ${mods.length > 0 && html`<div class="tm-row tm-cab" aria-hidden="true"><span>Módulo</span><span>Franja</span><span>Docente</span><span>Desdoble</span><span>Desde</span><span>Hasta</span><span>Sesiones</span><span></span></div>`}
      ${mods.map(m => {
        const i = R.modInfo[m.id] || {};
        const avisos = [];
        if (!(i.franjas || []).length) avisos.push("Elige la franja.");
        else if (!m.desde) avisos.push("Elige las fechas.");
        else if (!i.sesiones) avisos.push("No hay ningún día de clase entre esas fechas.");
        for (const x of R.dobles) if (x.grupoId === g.id && x.mods.includes(m.id)) avisos.push("Coincide con " + x.mods.filter(id => id !== m.id).map(nombreMod).join(", ") + " en la franja " + x.franjaTxt + " el " + fDia(x.fecha) + (x.n > 1 ? " y " + (x.n - 1) + " día(s) más" : "") + ".");
        return html`<div class="tm-row" key=${m.id}>
          <label class="tm-c"><span class="tm-l">Módulo</span><input type="text" id=${"mn-" + m.id} value=${m.nombre} placeholder="Código" onInput=${e => set(m.id, "nombre", e.target.value)} /></label>
          <label class="tm-c"><span class="tm-l">Franja</span><select id=${"mf-" + m.id} value=${valFranja(m)} onChange=${e => set(m.id, "franjas", e.target.value ? e.target.value.split("+") : [])}>
            ${!valFranja(m) && html`<option value="">Elegir…</option>`}
            ${opcFranja.map(o => html`<option value=${o.v}>${o.t}</option>`)}</select></label>
          <label class="tm-c"><span class="tm-l">Docente</span><select id=${"mp-" + m.id} value=${valDoc(m.profesorId)} onChange=${e => set(m.id, "profesorId", e.target.value)}>${opcDoc("Sin docente", "")}</select></label>
          <label class="tm-c"><span class="tm-l">Desdoble</span><select id=${"mq-" + m.id} value=${valDoc(m.profesorId2)} onChange=${e => set(m.id, "profesorId2", e.target.value)}>${opcDoc("Sin desdoble", "")}</select></label>
          <label class="tm-c"><span class="tm-l">Desde</span><${SelSesion} id=${"md-" + m.id} label="Desde" ses=${ses} value=${m.desde} onChange=${v => set(m.id, "desde", v)} /></label>
          <label class="tm-c"><span class="tm-l">Hasta</span><${SelSesion} id=${"mh-" + m.id} label="Hasta" ses=${ses} min=${m.desde} value=${m.hasta} onChange=${v => set(m.id, "hasta", v)} /></label>
          <span class="tm-c tm-ses num">${i.sesiones || 0} ses · ${fh(i.horas || 0)} h</span>
          <span class="tm-c tm-x"><${Confirmar} mini etiqueta="Quitar" pregunta="Quitar" onSi=${() => quitar(m.id)} /></span>
          ${avisos.length > 0 && html`<div class="tm-aviso">${avisos.join(" ")}</div>`}
        </div>`;
      })}
    </div>
    <div class="fila centro"><button class="btn primario" onClick=${anadir}>Añadir módulo</button>
      <span class="muted small">Se propone la primera franja y fechas que estén sin módulo.</span></div>
  </div>`;
}

// ----- Profesorado: horario por docente -----
const TIPOS_OC = ["Guardia", "Tutoría", "Reunión", "Grupo externo", "Coordinación", "Otra"];
const sinMinimo = p => p.minimo === "" || p.minimo == null;
const abrevGrupo = nombre => (nombre || "").split(" · ")[0].split(" ").map(w => w.length > 4 && !/\d/.test(w) ? w.slice(0, 3) + "." : w).join(" ");
const modPorId = (D, id) => { for (const g of D.grupos) { const m = (g.modulos || []).find(x => x.id === id); if (m) return { m, g }; } return null; };

function Profesorado({ D, R, wHoy, profSel, setProfSel, semFoco }) {
  const [nom, setNom] = useState("");
  const [min, setMin] = useState("");
  const sel = D.profesores.find(p => p.id === profSel) || D.profesores[0];
  const crear = e => {
    e.preventDefault();
    if (!nom.trim()) return;
    const id = nuevoId();
    setDoc("profesores", id, { nombre: nom.trim(), minimo: min === "" ? "" : +min, horario: [], creado: Date.now() }, 0);
    setNom(""); setMin(""); setProfSel(id);
  };
  const estado = p => {
    if (sinMinimo(p)) return ["festivo", "Sin mínimo"];
    let k = 0; for (let w = wHoy; w < R.semanas.length; w++) if (estadoSemana(R, p, w).e === "falta") k++;
    const ch = R.choques.filter(x => x.pid === p.id).length;
    if (ch) return ["falta", ch + " choque(s)"];
    return k ? ["falta", k + " sem. con faltas"] : ["ok", "Cubierto"];
  };
  return html`<div class="pv">
    <aside class="pv-lista" aria-label="Docentes">
      <label class="campo pv-movil">Docente
        <select id="pv-sel" value=${sel ? sel.id : ""} onChange=${e => setProfSel(e.target.value)}>
          ${D.profesores.map(p => html`<option value=${p.id}>${p.nombre}${sinMinimo(p) ? "" : " · " + fh(+p.minimo) + " h"}</option>`)}
        </select></label>
      <div class="pv-nav">
        ${D.profesores.map(p => { const [cls, txt] = estado(p); return html`<button class=${"pv-item" + (sel && p.id === sel.id ? " on" : "")} onClick=${() => setProfSel(p.id)} aria-current=${sel && p.id === sel.id ? "true" : undefined}>
          <span class="n">${p.nombre || "Sin nombre"}</span>
          <span class="m num">${sinMinimo(p) ? "—" : fh(+p.minimo) + " h"}</span>
          <span class=${"chip " + cls}>${txt}</span></button>`; })}
      </div>
      <form class="pv-nuevo" onSubmit=${crear}>
        <span class="eyebrow">Añadir docente</span>
        <input type="text" id="np-nombre" value=${nom} onInput=${e => setNom(e.target.value)} placeholder="Nombre" aria-label="Nombre" />
        <div class="fila centro" style="gap:6px;flex-wrap:nowrap"><input type="number" id="np-min" min="0" step="0.5" value=${min} onInput=${e => setMin(e.target.value)} placeholder="Mínimo h/sem" aria-label="Mínimo semanal" style="width:120px" />
          <button class="btn" type="submit">Añadir</button></div>
      </form>
    </aside>
    <section class="pv-main">
      ${sel && R.semanas.length ? html`<${HorarioProf} key=${sel.id} p=${sel} D=${D} R=${R} wHoy=${wHoy} semFoco=${semFoco} />`
        : html`<div class="panel"><p class="muted">${D.profesores.length ? "Revisa las fechas del curso en Calendario y horas." : "Añade el primer docente con el formulario de la izquierda."}</p></div>`}
    </section>
  </div>`;
}

function HorarioProf({ p, D, R, wHoy, semFoco }) {
  const n = R.semanas.length;
  const ult = R.semanas[n - 1];
  const [w, setW] = useState(semFoco != null ? semFoco : wHoy);
  useEffect(() => { if (semFoco != null) setW(semFoco); }, [semFoco]);
  const [tipo, setTipo] = useState("Guardia");
  const [texto, setTexto] = useState("");
  const [hasta, setHasta] = useState(ult.lunes);
  const [selId, setSelId] = useState(null);
  const wi = Math.min(Math.max(w, 0), n - 1);
  const s = R.semanas[wi];
  const horario = p.horario || [];
  const activas = horario.filter(o => (o.desde || "") <= s.lunes && s.lunes <= (o.hasta || "9999"));
  const st = estadoSemana(R, p, wi);
  const editarH = fn => editar("profesores", p.id, x => { x.horario = x.horario || []; fn(x.horario, x); });
  const semIdx = lunes => R.semanas.findIndex(x => x.lunes === lunes);

  const anadir = per => {
    let fin = hasta < s.lunes ? s.lunes : hasta;
    for (const o of horario) if (o.per === per.id && (o.desde || "") > s.lunes && (o.desde || "") <= fin) fin = addDays(o.desde, -7);
    const nuevo = { id: nuevoId(), dia: per.dia, per: per.id, tipo, texto: texto.trim(), desde: s.lunes, hasta: fin };
    editarH(h => { h.push(nuevo); });
  };
  const sel = horario.find(o => o.id === selId);
  const cambiarSel = patch => editarH(h => { const o = h.find(x => x.id === selId); if (o) Object.assign(o, patch); });
  const quitarDesde = () => editarH((h, x) => {
    const o = h.find(y => y.id === selId); if (!o) return;
    if ((o.desde || "") >= s.lunes) x.horario = h.filter(y => y.id !== selId);
    else o.hasta = addDays(s.lunes, -7);
    setSelId(null);
  });
  const quitarTodo = () => { editarH((h, x) => { x.horario = h.filter(y => y.id !== selId); }); setSelId(null); };

  // Agenda proporcional al tiempo: cada día con sus propias sesiones; si tarde y noche se solapan, dos columnas.
  const K = 0.95; // píxeles por minuto
  const perDe = id => R.periodos.find(x => x.id === id);
  const clasesDe = fecha => {
    const vistas = new Set(), out = [];
    for (const e of [...(R.occ.get(p.id + "|" + fecha) || []), ...(R.occFest.get(p.id + "|" + fecha) || [])]) {
      const k = e.modId + e.ini + e.fin; if (vistas.has(k)) continue; vistas.add(k); out.push(e);
    }
    return out;
  };
  const tiempos = [...R.periodos.flatMap(x => [aMin(x.ini), aMin(x.fin)]), ...s.dias.flatMap(f => clasesDe(f).flatMap(e => [aMin(e.ini), aMin(e.fin)]))];
  const t0 = Math.floor(Math.min(...tiempos) / 60) * 60, t1 = Math.ceil(Math.max(...tiempos) / 60) * 60;
  const alto = (t1 - t0) * K;
  const y = t => (aMin(t) - t0) * K;
  const horas = []; for (let t = t0; t <= t1; t += 60) horas.push(t);
  const refAgenda = useRef(null);
  useEffect(() => {
    if (!refAgenda.current) return;
    const mios = [...horario.map(o => perDe(o.per)).filter(Boolean).map(x => aMin(x.ini)), ...R.semanas.slice(wi, wi + 1).flatMap(x => x.dias.flatMap(f => clasesDe(f).map(e => aMin(e.ini))))];
    const ini = Math.min(14 * 60, ...(mios.length ? mios : [14 * 60]));
    refAgenda.current.scrollTop = Math.max(0, (ini - t0) * K - 8);
  }, [p.id]);

  const columna = d => {
    const fecha = s.dias[d];
    const fest = R.noLect.has(fecha) || !R.enCurso(fecha);
    const lista = R.periodos.filter(x => x.dia === d);
    const solapa = lista.some(a => a.turno === "noche" && lista.some(b => b.turno !== "noche" && a.ini < b.fin && b.ini < a.fin));
    const carriles = solapa ? 2 : 1;
    const carril = x => (solapa && x.turno === "noche") ? 1 : 0;
    const clases = clasesDe(fecha);
    const manDia = activas.filter(o => { const x = perDe(o.per); return x && x.dia === d; });
    const caja = (ini, fin, c) => ({ top: y(ini) + 1 + "px", height: Math.max(12, (aMin(fin) - aMin(ini)) * K - 2) + "px", left: "calc(" + (c * 100 / carriles) + "% + 2px)", width: "calc(" + (100 / carriles) + "% - 4px)" });
    const bloques = [];
    for (const per of lista) {
      const man = manDia.filter(o => o.per === per.id);
      const conClase = clases.filter(e => per.ini < e.fin && e.ini < per.fin);
      const otraOc = manDia.filter(o => o.per !== per.id && (() => { const x = perDe(o.per); return per.ini < x.fin && x.ini < per.fin; })());
      if (per.fija) {
        bloques.push(html`<div key=${per.id} class=${"ag-b fija" + (conClase.length ? " choque" : "")} style=${{ ...caja(per.ini, per.fin, carril(per)), zIndex: 3 }} title=${per.fija + " · " + per.ini + "–" + per.fin + " · fija para todo el profesorado" + (conClase.length ? "\nCoincide con una clase" : "")}>
          <span class="ag-t">${per.ini}</span><span class="ag-oc"><b>${per.fija}</b> <span>todo el profesorado</span></span></div>`);
        continue;
      }
      const conFija = lista.some(q => q.fija && per.ini < q.fin && q.ini < per.fin);
      const choque = man.length > 0 && (conClase.length > 0 || man.length > 1 || otraOc.length > 0);
      const bloqueado = !man.length && (conClase.length > 0 || otraOc.length > 0 || conFija);
      const cls = "ag-b" + (per.recreo ? " recreo" : "") + (man.length ? " ocup" : "") + (choque ? " choque" : "") + (bloqueado ? " bloq" : "") + (fest ? " fest" : "") + (man.some(o => o.id === selId) ? " sel" : "");
      const tip = [per.ini + "–" + per.fin + (per.recreo ? " · recreo" : "") + " · " + per.turno];
      for (const o of man) tip.push(o.tipo + (o.texto ? " · " + o.texto : "") + " · de S" + (semIdx(o.desde) + 1) + " a S" + (semIdx(o.hasta) + 1));
      for (const e of conClase) { const x = modPorId(D, e.modId); tip.push("Clase: " + (x ? x.m.nombre + " · " + x.g.nombre : "") + " " + e.ini + "–" + e.fin); }
      for (const o of otraOc) tip.push("Ya tiene " + o.tipo.toLowerCase() + " a esa hora");
      if (fest) tip.push("No lectivo" + (R.noLect.get(fecha) ? ": " + R.noLect.get(fecha) : ""));
      const onClick = () => { if (man.length) setSelId(man[0].id === selId ? null : man[0].id); else if (!bloqueado) anadir(per); };
      bloques.push(html`<button key=${per.id} class=${cls} style=${{ ...caja(per.ini, per.fin, carril(per)), zIndex: choque ? 4 : 1 }} disabled=${bloqueado} onClick=${onClick} title=${tip.join("\n")}
        aria-label=${DIAS_L[d] + " " + tip.join(", ") + (man.length ? "" : bloqueado ? "" : ". Pulsa para añadir " + tipo.toLowerCase())}>
        <span class="ag-t">${per.ini}</span>
        ${man.length ? man.map(o => html`<span class="ag-oc"><b>${o.tipo}</b>${o.texto ? " " + o.texto : ""}</span>`) : per.recreo ? html`<span class="ag-rec">Recreo ${per.ini}</span>` : html`<span class="ag-mas" aria-hidden="true">+</span>`}
      </button>`);
    }
    for (const e of clases) {
      const x = modPorId(D, e.modId);
      const dentro = lista.find(q => q.ini >= e.ini && q.fin <= e.fin);
      const c = dentro ? carril(dentro) : carriles - 1;
      const des = x && x.m.profesorId !== p.id;
      bloques.push(html`<div key=${"c" + e.modId + e.ini} class=${"ag-clase" + (fest ? " fest" : "")} style=${{ ...caja(e.ini, e.fin, c), zIndex: 2 }} title=${(x ? x.m.nombre + " · " + x.g.nombre : "Clase") + (des ? " (desdoble)" : "") + " · " + e.ini + "–" + e.fin + (fest ? " · no lectivo" : "")}>
        <span class="ag-t">${e.ini}–${e.fin}</span><b>${x ? x.m.nombre : "Clase"}</b><span>${x ? abrevGrupo(x.g.nombre) : ""}${des ? " · desd." : ""}</span></div>`);
    }
    return html`<div class=${"ag-dia" + (fest ? " fest" : "")} key=${d} style=${{ height: alto + "px" }}>${bloques}</div>`;
  };

  const choques = R.choques.filter(x => x.pid === p.id);
  const items = st.c.items;
  const clasesH = st.c.mod;
  const manual = items.filter(i => i.tipo === "manual");
  const resumen = [["Clases", clasesH], ...manual.map(i => [i.subtipo, i.horas])].filter(x => x[1] > 0);

  return html`<div class="pc-cont">
    <div class="pc-cab">
      <label class="campo" style="flex:1;min-width:180px">Docente<input type="text" id=${"pn-" + p.id} value=${p.nombre} onInput=${e => editar("profesores", p.id, x => { x.nombre = e.target.value; })} /></label>
      <label class="campo">Mínimo semanal (h)<input type="number" id=${"pm-" + p.id} min="0" step="0.5" value=${p.minimo} placeholder="Ej. 24" style="width:130px" onInput=${e => editar("profesores", p.id, x => { x.minimo = e.target.value === "" ? "" : +e.target.value; })} /></label>
    </div>

    <div class="hz-nav">
      <button class="btn icono" disabled=${wi === 0} onClick=${() => { setW(wi - 1); setSelId(null); }} aria-label="Semana anterior">‹</button>
      <${SelectSemana} id="hz-sem" R=${R} value=${s.lunes} onChange=${v => { setW(semIdx(v)); setSelId(null); }} />
      <button class="btn icono" disabled=${wi === n - 1} onClick=${() => { setW(wi + 1); setSelId(null); }} aria-label="Semana siguiente">›</button>
      ${wi !== wHoy && html`<button class="btn mini" onClick=${() => { setW(wHoy); setSelId(null); }}>Esta semana</button>`}
      <span class="hz-rango">${rango(s.lunes, s.viernes)}${wi === wHoy ? " · esta semana" : ""}</span>
      <span class="espacio"></span>
      <div class="hz-tot">
        ${resumen.map(([t, h]) => html`<span class="muted small">${t} <b class="num">${fh(h)}</b></span>`)}
        <span class="small">Total <b class="num">${fh(st.total)} h</b>${sinMinimo(p) ? "" : " de " + fh(st.min)}</span>
        ${st.e === "falta" && html`<span class="chip falta">Faltan ${fh(-st.diff)} h</span>`}
        ${st.e === "exceso" && html`<span class="chip exceso">Sobran ${fh(st.diff)} h</span>`}
        ${st.e === "ok" && html`<span class="chip ok">Cubre el mínimo</span>`}
        ${st.e === "vac" && html`<span class="chip festivo">Semana no lectiva</span>`}
        ${st.e === "parcial" && html`<span class="chip festivo">Semana incompleta</span>`}
        ${st.e === "sinmin" && html`<span class="chip festivo">Pon su mínimo</span>`}
      </div>
    </div>

    <div class="hz-pincel">
      <span>Al pulsar una hora libre se añade</span>
      <select id="hz-tipo" value=${tipo} onChange=${e => setTipo(e.target.value)} aria-label="Tipo de ocupación">${TIPOS_OC.map(t => html`<option value=${t}>${t}</option>`)}</select>
      <input type="text" id="hz-texto" value=${texto} onInput=${e => setTexto(e.target.value)} placeholder="Detalle (opcional)" aria-label="Detalle" style="width:170px" />
      <span>desde esta semana hasta</span>
      <${SelectSemana} id="hz-hasta" R=${R} value=${hasta} onChange=${setHasta} />
    </div>

    <div class="ag-wrap" ref=${refAgenda}>
      <div class="ag">
        <div class="ag-cab"><span></span>${s.dias.map((f, d) => { const nl = R.noLect.get(f); return html`<div key=${d} class=${nl || !R.enCurso(f) ? "fest" : ""}><b>${DIAS_L[d]}</b> <span>${dN(f)}/${mN(f) + 1}</span>${nl ? html`<i>${nl}</i>` : ""}</div>`; })}</div>
        <div class="ag-cuerpo" style=${{ height: alto + "px", "--hora": 60 * K + "px" }}>
          <div class="ag-eje">${horas.map(t => html`<span key=${t} style=${{ top: (t - t0) * K + "px" }}>${aHora(t)}</span>`)}</div>
          ${[0, 1, 2, 3, 4].map(columna)}
        </div>
      </div>
    </div>
    <div class="leyenda"><span><i style="background:var(--accent-soft)"></i>Clase (sale sola)</span><span><i style="background:var(--bar);box-shadow:inset 0 0 0 1px var(--muted)"></i>Guardia u otra ocupación</span><span><i style="background:var(--low-bg);box-shadow:inset 0 0 0 1px var(--low-ink)"></i>Choque</span><span><i style="border:1px dashed var(--line)"></i>Hora libre: pulsa para añadir</span></div>

    ${sel && html`<div class="hz-edit">
      <div class="fila centro"><b>${sel.tipo}</b><span class="muted">· ${(() => { const x = R.periodos.find(q => q.id === sel.per); return x ? DIAS_L[x.dia] + " " + x.ini + "–" + x.fin : ""; })()} · de S${semIdx(sel.desde) + 1} a S${semIdx(sel.hasta) + 1}</span><span class="espacio"></span><button class="btn mini" onClick=${() => setSelId(null)}>Cerrar</button></div>
      <div class="fila">
        <label class="campo">Tipo<select id="ed-tipo" value=${sel.tipo} onChange=${e => cambiarSel({ tipo: e.target.value })}>${TIPOS_OC.map(t => html`<option value=${t}>${t}</option>`)}</select></label>
        <label class="campo" style="flex:1;min-width:160px">Detalle<input type="text" id="ed-texto" value=${sel.texto || ""} onInput=${e => cambiarSel({ texto: e.target.value })} /></label>
        <label class="campo">Desde<${SelectSemana} id="ed-desde" R=${R} value=${sel.desde} onChange=${v => cambiarSel(v > sel.hasta ? { desde: v, hasta: v } : { desde: v })} /></label>
        <label class="campo">Hasta<${SelectSemana} id="ed-hasta" R=${R} value=${sel.hasta} onChange=${v => cambiarSel(v < sel.desde ? { desde: v, hasta: v } : { hasta: v })} /></label>
      </div>
      <div class="fila centro">
        <button class="btn" onClick=${quitarDesde}>Quitar desde esta semana (S${wi + 1})</button>
        <${Confirmar} etiqueta="Quitar en todas las semanas" pregunta="Sí, quitar" onSi=${quitarTodo} />
      </div>
    </div>`}

    ${choques.length > 0 && html`<div class="aviso mal" style="display:grid;gap:4px">
      <b>Choques en su horario</b>
      ${choques.map(x => { const m = x.modId ? modPorId(D, x.modId) : null; const k = R.idx(x.fecha); return html`<div>${x.tipo} del ${DIAS_L[x.dia].toLowerCase()} ${x.perTxt} coincide con ${m ? m.m.nombre + " (" + abrevGrupo(m.g.nombre) + ")" : x.otro ? "otra ocupación (" + x.otro + ")" : "otra ocupación"} desde la S${k + 1}${x.n > 1 ? " (" + x.n + " semanas)" : ""}. <button class="btn mini" onClick=${() => { setW(k); setSelId(x.ocId); }}>Ver</button></div>`; })}
    </div>`}

    <div class="hz-tira" aria-label="Horas por semana">
      ${R.semanas.map((x, j) => { const e = estadoSemana(R, p, j); return html`<button key=${j} class=${"tz " + e.e + (j === wi ? " on" : "")} onClick=${() => { setW(j); setSelId(null); }} title=${"S" + (j + 1) + " · " + rango(x.lunes, x.viernes) + ": " + fh(e.total) + " h"}><b>S${j + 1}</b><span class="num">${fh(e.total)}</span></button>`; })}
    </div>
    <p class="muted small">Las clases salen solas de los horarios de los grupos y cambian cuando rota el módulo. Pulsa una hora libre para añadir la ocupación elegida arriba; pulsa una ocupación para cambiarla o quitarla. Si una guardia queda encima de una clase nueva, se marca en rojo.</p>

    <div class="fila centro"><span class="espacio"></span><${Confirmar} etiqueta="Eliminar docente" pregunta="Sí, eliminar docente" onSi=${() => setDoc("profesores", p.id, null, 0)} /></div>
  </div>`;
}

function HorarioCentro({ D }) {
  const [dia, setDia] = useState(0);
  const [gIni, setGIni] = useState("15:00");
  const [gFin, setGFin] = useState("20:00");
  const [gDur, setGDur] = useState(55);
  const [gRec, setGRec] = useState("");
  const [gTurno, setGTurno] = useState("tarde");
  const [msg, setMsg] = useState("");
  const base = (D.curso.periodos && D.curso.periodos.length ? D.curso.periodos : PERIODOS_DEF);
  const todos = periodosCurso(D.curso).map(x => { const o = base.find(b => b.id === x.id) || {}; return { id: x.id, dia: x.dia, ini: x.ini, fin: x.fin, recreo: x.recreo, fija: x.fija, turno: x.turno, horas: o.horas ?? (x.recreo ? "" : 1) }; });
  const lista = todos.filter(x => x.dia === dia);
  const guardar = l => setCurso({ periodos: l });
  const cambiar = (id, patch) => guardar(todos.map(x => x.id === id ? { ...x, ...patch } : x));
  const quitar = id => guardar(todos.filter(x => x.id !== id));
  const anadir = () => { const u = lista[lista.length - 1]; const ini = u ? aMin(u.fin) : 15 * 60; guardar([...todos, { id: nuevoId(), dia, ini: aHora(ini), fin: aHora(ini + 55), horas: 1, turno: u ? u.turno : "tarde" }]); };
  const generar = e => {
    e.preventDefault();
    const recreos = gRec.split(/[;,]/).map(t => t.trim()).filter(Boolean).map(t => { const [a, b] = t.split(/\s*[-–]\s*/); return { ini: a, fin: b }; }).filter(r => /^\d{1,2}:\d{2}$/.test(r.ini || "") && /^\d{1,2}:\d{2}$/.test(r.fin || ""));
    const nuevos = generarSesiones(dia, gIni, gFin, +gDur || 55, recreos, gTurno).filter(n => !todos.some(x => x.dia === dia && x.ini === n.ini && x.fin === n.fin)).map(n => ({ ...n, id: nuevoId() }));
    guardar([...todos, ...nuevos]);
    setMsg(nuevos.length + " tramo(s) añadidos al " + DIAS_L[dia].toLowerCase() + ".");
  };
  const copiarA = d2 => {
    guardar([...todos.filter(x => x.dia !== d2), ...lista.map(x => ({ ...x, id: nuevoId(), dia: d2 }))]);
    setMsg("Copiado el " + DIAS_L[dia].toLowerCase() + " al " + DIAS_L[d2].toLowerCase() + ".");
  };
  const TURNOS = [["manana", "Mañana"], ["tarde", "Tarde"], ["noche", "Noche"]];
  return html`<div class="panel">
    <div class="panel-cab"><h3>Horario del centro</h3><span class="muted small">Las sesiones y recreos de cada día, tal como salen en el horario de cada docente.</span></div>
    <div class="dias-btn">${DIAS_L.map((t, d) => html`<button class=${"dia-b ancho" + (d === dia ? " on" : "")} aria-pressed=${d === dia} onClick=${() => { setDia(d); setMsg(""); }}>${t} <span class="num">${todos.filter(x => x.dia === d).length}</span></button>`)}</div>
    <div class="hc-lista">
      ${lista.length > 0 && html`<div class="hc-fila hc-cab" aria-hidden="true"><span>Turno</span><span>Empieza</span><span>Termina</span><span>Tipo</span><span>Cuenta (h)</span><span></span></div>`}
      ${lista.map(x => html`<div class=${"hc-fila" + (x.recreo ? " rec" : "")} key=${x.id}>
        <select id=${"hc-t-" + x.id} value=${x.turno} onChange=${e => cambiar(x.id, { turno: e.target.value })} aria-label="Turno">${TURNOS.map(([v, t]) => html`<option value=${v}>${t}</option>`)}</select>
        <input type="time" id=${"hc-i-" + x.id} value=${x.ini} onChange=${e => e.target.value && cambiar(x.id, { ini: e.target.value })} aria-label="Empieza" />
        <input type="time" id=${"hc-f-" + x.id} value=${x.fin} onChange=${e => e.target.value && cambiar(x.id, { fin: e.target.value })} aria-label="Termina" />
        <div class="hc-tipo"><select id=${"hc-r-" + x.id} value=${x.fija ? "f" : x.recreo ? "r" : "s"} onChange=${e => { const v = e.target.value; cambiar(x.id, v === "f" ? { fija: x.fija || "Reunión", recreo: false } : { fija: "", recreo: v === "r" }); }} aria-label="Tipo"><option value="s">Sesión</option><option value="r">Recreo</option><option value="f">Fija para todos</option></select>
          ${x.fija && html`<input type="text" id=${"hc-n-" + x.id} value=${x.fija} onInput=${e => cambiar(x.id, { fija: e.target.value || "Reunión" })} aria-label="Nombre de la sesión fija" />`}</div>
        <input type="number" id=${"hc-h-" + x.id} min="0" step="0.25" value=${x.horas ?? ""} placeholder=${fh(x.recreo ? durH(x.ini, x.fin) : 1)} onInput=${e => cambiar(x.id, { horas: e.target.value === "" ? "" : +e.target.value })} aria-label="Horas que cuenta" />
        <${Confirmar} mini etiqueta="Quitar" pregunta="Quitar" onSi=${() => quitar(x.id)} />
      </div>`)}
      ${!lista.length && html`<p class="muted small">Este día no tiene sesiones. Genéralas abajo.</p>`}
    </div>
    <div class="fila centro"><button class="btn mini" onClick=${anadir}>Añadir sesión</button>
      <span class="muted small">Copiar el ${DIAS_L[dia].toLowerCase()} a:</span>
      ${DIAS_L.map((t, d) => d !== dia && html`<${Confirmar} mini etiqueta=${t} pregunta=${"Sustituir " + t.toLowerCase()} onSi=${() => copiarA(d)} />`)}</div>
    <form class="hc-gen" onSubmit=${generar}>
      <b>Generar sesiones para el ${DIAS_L[dia].toLowerCase()}</b>
      <label class="campo">Turno<select id="g-turno" value=${gTurno} onChange=${e => setGTurno(e.target.value)}>${TURNOS.map(([v, t]) => html`<option value=${v}>${t}</option>`)}</select></label>
      <label class="campo">De<input type="time" id="g-ini" value=${gIni} onChange=${e => setGIni(e.target.value)} /></label>
      <label class="campo">A<input type="time" id="g-fin" value=${gFin} onChange=${e => setGFin(e.target.value)} /></label>
      <label class="campo">Sesiones de (min)<input type="number" id="g-dur" min="10" max="120" value=${gDur} onInput=${e => setGDur(e.target.value)} style="width:90px" /></label>
      <label class="campo" style="flex:1;min-width:180px">Recreos<input type="text" id="g-rec" value=${gRec} onInput=${e => setGRec(e.target.value)} placeholder="16:45-17:15; 10:45-11:15" /></label>
      <button class="btn primario" type="submit">Generar</button>
    </form>
    <p class="muted small">${msg ? html`<b>${msg}</b> ` : ""}Si quitas una sesión, las guardias u ocupaciones puestas en ella dejan de contar. Las sesiones cuentan 1 h y los recreos su duración, salvo que pongas otra cifra. Una sesión «Fija para todos» (como la RD) cuenta en el horario de cada docente sin tener que ponerla.</p>
  </div>`;
}

// ----- Calendario -----
function Calendario({ D, R }) {
  const c = D.curso;
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [motivo, setMotivo] = useState("");
  const hoy = hoyISO();
  const rangos = (c.noLectivos || []).slice().sort((a, b) => a.desde.localeCompare(b.desde));

  const toggleDia = d => {
    const lista = clon(c.noLectivos || []);
    const k = lista.findIndex(r => d >= r.desde && d <= (r.hasta || r.desde));
    if (k >= 0) {
      const r = lista[k]; const fin = r.hasta || r.desde;
      lista.splice(k, 1);
      if (r.desde < d) lista.push({ ...r, id: nuevoId(), desde: r.desde, hasta: addDays(d, -1) });
      if (fin > d) lista.push({ ...r, id: nuevoId(), desde: addDays(d, 1), hasta: fin });
    } else lista.push({ id: nuevoId(), desde: d, hasta: d, motivo: "Festivo" });
    setCurso({ noLectivos: lista });
  };
  const anadir = e => {
    e.preventDefault();
    if (!desde) return;
    setCurso({ noLectivos: [...clon(c.noLectivos || []), { id: nuevoId(), desde, hasta: hasta && hasta >= desde ? hasta : desde, motivo: motivo.trim() || "No lectivo" }] });
    setDesde(""); setHasta(""); setMotivo("");
  };
  const meses = [];
  if (c.inicio && c.fin && c.fin >= c.inicio) {
    let y = +c.inicio.slice(0, 4), m = mN(c.inicio);
    const yF = +c.fin.slice(0, 4), mF = mN(c.fin);
    while ((y < yF || (y === yF && m <= mF)) && meses.length < 24) { meses.push({ y, m }); m++; if (m > 11) { m = 0; y++; } }
  }
  return html`
    <div class="panel-cab"><h2>Calendario y horas del centro</h2></div>
    <div class="panel">
      <h3>Fechas del curso</h3>
      <div class="fila">
        <label class="campo">Primer día lectivo<input type="date" id="c-ini" value=${c.inicio} onChange=${e => e.target.value && setCurso({ inicio: e.target.value })} /></label>
        <label class="campo">Último día lectivo<input type="date" id="c-fin" value=${c.fin} onChange=${e => e.target.value && setCurso({ fin: e.target.value })} /></label>
        <span class="muted small" style="align-self:center">${R.semanas.length} semanas · ${R.semanas.reduce((a, s) => a + s.diasLectivos, 0)} días lectivos</span>
      </div>
      ${!S.curso && html`<p class="small" style="color:var(--over-ink)">Estas fechas son una propuesta. Cámbialas por las de tu curso.</p>`}
    </div>
    <div class="panel">
      <div class="panel-cab"><h3>Días no lectivos</h3></div>
      <form class="fila" onSubmit=${anadir}>
        <label class="campo">Desde<input type="date" id="nl-desde" value=${desde} onChange=${e => setDesde(e.target.value)} /></label>
        <label class="campo">Hasta (opcional)<input type="date" id="nl-hasta" value=${hasta} onChange=${e => setHasta(e.target.value)} /></label>
        <label class="campo" style="flex:1;min-width:180px">Motivo<input type="text" id="nl-motivo" value=${motivo} onInput=${e => setMotivo(e.target.value)} placeholder="Vacaciones de Navidad, festivo local…" /></label>
        <button class="btn primario" type="submit">Añadir periodo</button>
      </form>
      <div class="rangos">
        ${rangos.length > 0 && html`<div class="rango rango-cab" aria-hidden="true"><span>Motivo</span><span>Desde</span><span>Hasta</span><span></span></div>`}
        ${rangos.map(r => { const k = r.id || r.desde; const cambiar = patch => setCurso({ noLectivos: clon(c.noLectivos).map(x => (x.id || x.desde) === k ? { ...x, ...patch } : x) }); return html`<div class="rango" key=${k}>
          <input type="text" id=${"rm-" + k} value=${r.motivo} aria-label="Motivo" onInput=${e => cambiar({ motivo: e.target.value })} />
          <input type="date" id=${"rd-" + k} value=${r.desde} aria-label="Desde" onChange=${e => e.target.value && cambiar({ desde: e.target.value, hasta: (r.hasta || r.desde) < e.target.value ? e.target.value : (r.hasta || r.desde) })} />
          <input type="date" id=${"rh-" + k} value=${r.hasta || r.desde} aria-label="Hasta" onChange=${e => e.target.value && cambiar({ hasta: e.target.value < r.desde ? r.desde : e.target.value })} />
          <button class="btn mini peligro" onClick=${() => setCurso({ noLectivos: clon(c.noLectivos).filter(x => (x.id || x.desde) !== k) })}>Quitar</button></div>`; })}
      </div>
      <p class="muted small">También puedes pulsar un día en el calendario para marcarlo o desmarcarlo.</p>
      <div class="meses-cal">
        ${meses.map(({ y, m }) => {
          const primero = y + "-" + String(m + 1).padStart(2, "0") + "-01";
          const off = dow(primero);
          const dias = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
          const celdas = [];
          for (let k = 0; k < off; k++) celdas.push(html`<span></span>`);
          for (let d = 1; d <= dias; d++) {
            const iso = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
            const wd = dow(iso), fuera = iso < c.inicio || iso > c.fin, nl = R.noLect.get(iso);
            if (wd > 4) celdas.push(html`<button class="dia finde" disabled tabindex="-1" aria-hidden="true">${d}</button>`);
            else celdas.push(html`<button class=${"dia" + (fuera ? " fuera" : "") + (nl ? " nl" : "") + (iso === hoy ? " hoy" : "")} title=${nl ? nl : fuera ? "Fuera del curso" : "Lectivo"} aria-label=${fDia(iso) + ": " + (nl ? "no lectivo, " + nl : "lectivo")} onClick=${() => toggleDia(iso)}>${d}</button>`);
          }
          return html`<div class="mes"><h3>${MESES_L[m]} ${y}</h3><div class="mes-grid">${["L", "M", "X", "J", "V", "S", "D"].map(d => html`<span class="dn">${d}</span>`)}${celdas}</div></div>`;
        })}
      </div>
    </div>
    <${HorarioCentro} D=${D} />
    <${Copia} D=${D} />
  `;
}

function Copia({ D }) {
  const [msg, setMsg] = useState("");
  const exportar = async () => {
    const data = { app: "cuadrante-docente", version: 1, exportado: new Date().toISOString(), curso: D.curso, grupos: D.grupos, profesores: D.profesores, asignaciones: D.asignaciones };
    try { await downloads.save({ filename: "cuadrante-docente-copia.json", data: JSON.stringify(data, null, 2) }); setMsg("Copia descargada."); }
    catch (e) { setMsg(e && e.code === "declined" ? "Descarga cancelada." : "No se pudo descargar (" + (e && e.code || "error") + ")."); }
  };
  const importar = e => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!d || !Array.isArray(d.grupos) || !Array.isArray(d.profesores)) throw new Error("formato");
        for (const col of ["grupos", "profesores", "asignaciones"]) for (const id of Object.keys(S[col])) setDoc(col, id, null, 0);
        if (d.curso) setCurso(d.curso);
        for (const col of ["grupos", "profesores", "asignaciones"]) for (const x of d[col] || []) { const { id, ...resto } = x; setDoc(col, id || nuevoId(), resto, 50); }
        setMsg("Copia importada: " + d.grupos.length + " grupos, " + d.profesores.length + " docentes.");
      } catch (err) { setMsg("El archivo no es una copia válida de Cuadrante Docente."); }
    };
    rd.readAsText(f);
  };
  const borrarTodo = () => {
    for (const col of ["grupos", "profesores", "asignaciones"]) for (const id of Object.keys(S[col])) setDoc(col, id, null, 0);
    setMsg("Datos borrados. Las fechas del curso y los festivos se mantienen.");
  };
  return html`<div class="panel">
    <h3>Copia de seguridad</h3>
    <div class="fila centro">
      ${downloads && html`<button class="btn" onClick=${exportar}>Descargar copia (JSON)</button>`}
      <label class="btn" for="importar">Importar copia…</label>
      <input type="file" id="importar" accept=".json,application/json" hidden onChange=${importar} />
      <span class="espacio"></span>
      <${Confirmar} etiqueta="Borrar grupos, docentes y horas" pregunta="Sí, borrar todo" onSi=${borrarTodo} />
    </div>
    <p class="muted small">Importar una copia sustituye todos los datos actuales.${msg ? " " : ""}<b>${msg}</b></p>
  </div>`;
}

function Acceso() {
  return html`<div class="acceso">
    <div class="acceso-caja">
      <img src="icons/icono.svg" alt="" width="64" height="64" />
      <h1>Cuadrante Docente</h1>
      <p class="muted">Horarios del profesorado, rotación de módulos y guardias.</p>
      ${S.error && html`<div class="aviso mal">${S.error}</div>`}
      <button class="btn primario grande" onClick=${entrar}>Entrar con Google</button>
      <p class="muted small">Tus datos se guardan en tu proyecto de Firebase y solo los ve tu cuenta.</p>
    </div>
  </div>`;
}

const raiz = document.getElementById("app");
raiz.textContent = "";
render(html`<${App} />`, raiz);
conectar();
