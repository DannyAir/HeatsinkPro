/* QDPAK heatsink study — UI (rev r2) */
(function () {
'use strict';
const HS = window.HS, DEF = window.HS_DEFAULTS, CFM = HS.CFM;
const KEY = 'qdpak-hs-study-r2';
const $ = s => document.querySelector(s);
let cfg = Object.assign({}, DEF, normalize(loadCfg() || {}));
let R = null, view = 'map', sweepDirty = true;
const helper = { Irms: 150, Vdc: 800, fsw: 20, Rds: 20, Esw: 2.0, Vref: 800, Iref: 100 };

/* map older (r1) configs onto r2 keys */
function normalize(o) {
  o = Object.assign({}, o);
  if (o.perLeg != null && o.nPar == null) o.nPar = Math.max(1, Math.round(o.perLeg / 2));
  if (o.timT != null && o.timMode == null) { o.timMode = 'A'; o.timTmin = o.timT; o.timDh = 0; }
  delete o.perLeg; delete o.timT;
  return o;
}
function loadCfg() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function saveCfg() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* storage unavailable */ } }

/* ---------------- formatting ---------------- */
const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const sup = n => String(n).split('').map(c => SUP[c] || c).join('');
function fmt(x, d = 1) { if (x === Infinity) return '∞'; if (x === -Infinity) return '−∞'; if (x == null || !isFinite(x)) return '—'; return Number(x).toFixed(d); }
function sci(x, n = 3) {
  if (!isFinite(x)) return x === Infinity ? '∞' : '—'; if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e >= -2 && e < 5) return String(Number(x.toPrecision(n)));
  return (x / Math.pow(10, e)).toFixed(n - 1) + '·10' + sup(e);
}
function tfmt(t) {
  if (t === Infinity) return 'unlimited'; if (!isFinite(t)) return '—';
  if (t <= 0) return '0 s'; if (t < 1e-3) return (t * 1e6).toFixed(0) + ' µs'; if (t < 1) return (t * 1e3).toFixed(1) + ' ms';
  if (t < 120) return t.toFixed(1) + ' s'; if (t < 7200) return (t / 60).toFixed(1) + ' min'; return (t / 3600).toFixed(1) + ' h';
}
const fr = (a, b) => `<span class="fr"><span>${a}</span><span>${b}</span></span>`;
const sq = x => `<span class="sq">√<span>${x}</span></span>`;
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800); }

/* ---------------- parameter schema ---------------- */
const plate = c => c.hsType === 'plate', pin = c => c.hsType !== 'plate', forced = c => c.fanMode !== 'natural', imp = c => c.fanMode === 'impinge';
const ductModes = c => forced(c) && !imp(c);
const matHint = w => c => { const m = HS.MATERIALS[c['mat' + w]]; return m ? `k ${m.k} W/m·K · ρ ${m.rho} kg/m³ · c_p ${m.cp} J/kg·K` : 'Custom properties below'; };
const MAT_B = Object.keys(HS.MATERIALS), MAT_F = MAT_B.filter(k => !(HS.MATERIALS[k] && HS.MATERIALS[k].baseOnly));
const SCHEMA = [
  { sec: 'Losses & limits', open: true, f: [
    { k: 'Px', l: 'x · continuous loss, total', u: 'W', st: 10 },
    { k: 'Py', l: 'y · peak loss, total', u: 'W', st: 10 },
    { k: 'tp', l: 't · peak duration', u: 's', st: 1 },
    { k: 'imb', l: 'Parallel imbalance δ', u: '%', st: 1, h: 'Loss split ±δ across paralleled dies' },
    { k: 'Tamb', l: 'Ambient air', u: '°C', st: 1 },
    { k: 'preheat', l: 'Inlet pre-heat', u: 'K', st: 1 },
    { k: 'alt', l: 'Altitude (ISA)', u: 'm', st: 100 },
    { k: 'Tlim', l: 'Design limit Tj', u: '°C', st: 1 },
    { k: 'TjMax', l: 'Absolute Tj,max', u: '°C', st: 1 },
    { t: 'helper' } ] },
  { sec: 'Devices & layout', f: [
    { k: 'nLegs', l: 'Legs (phases)', u: '', st: 1, min: 1, max: 3 },
    { k: 'nPar', l: 'QDPAK ∥ per switch', t: 'sel', half: true, num: true, o: [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']] },
    { k: 'Rjc', l: 'R_th,jc (top)', u: 'K/W', st: 0.01 },
    { k: 'Ccase', l: 'Case node C', u: 'J/K', st: 0.05, h: 'Package lump outside Z_jc' },
    { k: 'padL', l: 'Exposed pad, long', u: 'mm', st: 0.5 },
    { k: 'padW', l: 'Exposed pad, short', u: 'mm', st: 0.5 },
    { k: 'pkgL', l: 'Package body, long', u: 'mm', st: 0.5 },
    { k: 'pkgW', l: 'Package body, short', u: 'mm', st: 0.5 },
    { k: 'layout', l: 'Device arrangement', t: 'sel', o: [['posRows', 'Switch rows along airflow (A-HS, A-LS … stacked across W)'], ['posCols', 'Switch rows across airflow (positions in series along L)'], ['along', 'Leg rows along airflow (HS∥ then LS∥ in one row)'], ['across', 'Leg rows across airflow']] },
    { k: 'pitchDev', l: 'Device pitch in a row', u: 'mm', st: 1 },
    { k: 'pitchLeg', l: 'Row pitch', u: 'mm', st: 1 },
    { k: 'legGap', l: 'Extra gap between legs', u: 'mm', st: 1, show: c => c.layout === 'posRows' || c.layout === 'posCols' },
    { k: 'offX', l: 'Group offset, flow', u: 'mm', st: 1 },
    { k: 'offY', l: 'Group offset, width', u: 'mm', st: 1 },
    { k: 'rotate', l: 'Rotate packages 90°', t: 'chk' },
    { k: 'pcbOn', l: 'Include PCB heat path (leads → board)', t: 'chk' },
    { k: 'Rpcb', l: 'R case → ambient via PCB', u: 'K/W', st: 1, show: c => c.pcbOn },
    { t: 'foster' } ] },
  { sec: 'Thermal interface & isolation', open: true, f: [
    { k: 'timMode', l: 'Assembly (drain pad is live)', t: 'sel', o: [['C', 'C · Gap filler + isolation foil / ceramic (guaranteed isolation)'], ['A', 'A · Insulating gap filler only'], ['B', 'B · Insulating gap pad']] },
    { k: 'timPreset', l: 'Gap material', t: 'sel', o: Object.keys(HS.TIMS).map(k => [k, k]), h: 'Class values — confirm on the supplier datasheet' },
    { k: 'timK', l: 'k gap', u: 'W/m·K', st: 0.5 },
    { k: 'timE', l: 'Dielectric strength', u: 'kV/mm', st: 0.5, h: '0 = not credited for isolation' },
    { k: 'timEr', l: 'Permittivity ε_r gap', u: '', st: 0.1 },
    { k: 'timTmin', l: 'Min bond line (highest die)', u: 'mm', st: 0.05 },
    { k: 'timDh', l: 'Height tolerance absorbed Δh', u: 'mm', st: 0.05, h: 'Package ±50 µm, solder, PCB warp, heatsink flatness' },
    { k: 'timCase', l: 'Bond line used for thermal', t: 'sel', o: [['worst', 'Worst: t_min + Δh on every die'], ['nominal', 'Mean: t_min + Δh/2']] },
    { k: 'isoPreset', l: 'Isolation layer', t: 'sel', show: c => c.timMode === 'C', o: Object.keys(HS.ISOS).map(k => [k, k]) },
    { k: 'isoK', l: 'k isolation', u: 'W/m·K', st: 1, show: c => c.timMode === 'C' },
    { k: 'isoT', l: 'Isolation thickness', u: 'mm', st: 0.01, show: c => c.timMode === 'C' },
    { k: 'isoE', l: 'Isolation strength', u: 'kV/mm', st: 1, show: c => c.timMode === 'C' },
    { k: 'isoEr', l: 'Permittivity ε_r iso', u: '', st: 0.1, show: c => c.timMode === 'C' },
    { k: 'timRc', l: 'Contact R″ (all faces)', u: 'K·mm²/W', st: 1 },
    { k: 'Vdc', l: 'DC-link voltage', u: 'V', st: 10 },
    { k: 'Vreq', l: 'Required withstand', u: 'kV', st: 0.1, h: 'From your insulation coordination / hipot spec' },
    { k: 'dvdt', l: 'Switch-node dv/dt', u: 'V/ns', st: 5 } ] },
  { sec: 'Heatsink', f: [
    { k: 'hsType', l: 'Fin shape', t: 'sel', o: [['plate', 'Straight plate fins'], ['pinIn', 'Round pins, in-line'], ['pinSt', 'Round pins, staggered']] },
    { k: 'L', l: 'Length L (along flow)', u: 'mm', st: 5 },
    { k: 'W', l: 'Width W', u: 'mm', st: 5 },
    { k: 'tb', l: 'Base thickness t_b', u: 'mm', st: 0.5 },
    { k: 'H', l: 'Fin height H', u: 'mm', st: 1 },
    { k: 'finBy', l: 'Define fins by', t: 'sel', show: plate, o: [['count', 'Fin count N'], ['gap', 'Fin gap s']] },
    { k: 'N', l: 'Fin count N', u: '', st: 1, show: c => plate(c) && c.finBy !== 'gap' },
    { k: 'finGap', l: 'Fin gap s', u: 'mm', st: 0.1, show: c => plate(c) && c.finBy === 'gap' },
    { k: 'tf', l: 'Fin thickness t_f', u: 'mm', st: 0.1, show: plate },
    { k: 'pinD', l: 'Pin diameter D', u: 'mm', st: 0.25, show: pin },
    { k: 'pinST', l: 'Pitch across S_T', u: 'mm', st: 0.25, show: pin },
    { k: 'pinSL', l: 'Pitch along S_L', u: 'mm', st: 0.25, show: pin },
    { k: 'matB', l: 'Base / spreader material', t: 'sel', o: MAT_B.map(k => [k, k]), hf: matHint('B') },
    { k: 'kB', l: 'k base', u: 'W/m·K', st: 1, show: c => c.matB === 'Custom' },
    { k: 'rhoB', l: 'ρ base', u: 'kg/m³', st: 10, show: c => c.matB === 'Custom' },
    { k: 'cpB', l: 'c_p base', u: 'J/kg·K', st: 10, show: c => c.matB === 'Custom' },
    { k: 'matF', l: 'Fin material', t: 'sel', o: MAT_F.map(k => [k, k]), hf: matHint('F') },
    { k: 'kF', l: 'k fin', u: 'W/m·K', st: 1, show: c => c.matF === 'Custom' },
    { k: 'rhoF', l: 'ρ fin', u: 'kg/m³', st: 10, show: c => c.matF === 'Custom' },
    { k: 'cpF', l: 'c_p fin', u: 'J/kg·K', st: 10, show: c => c.matF === 'Custom' },
    { k: 'emis', l: 'Emissivity ε', u: '', st: 0.05, h: 'Black anodize 0.85 · bare Al 0.05' } ] },
  { sec: 'Air path', f: [
    { k: 'flowRev', l: 'Air enters at the far end (x = L)', t: 'chk', show: ductModes },
    { k: 'shroud', l: 'Fully ducted — no bypass', t: 'chk', show: ductModes },
    { k: 'cTip', l: 'Tip clearance', u: 'mm', st: 0.5, show: c => ductModes(c) && !c.shroud },
    { k: 'cSide', l: 'Side clearance (each)', u: 'mm', st: 0.5, show: c => ductModes(c) && !c.shroud },
    { k: 'Ksys', l: 'Extra loss K_sys', u: '', st: 0.1, show: forced, h: 'Grilles, plenum, filter — on duct velocity' } ] },
  { sec: 'Fans', open: true, f: [
    { k: 'fanMode', l: 'Arrangement', t: 'sel', o: [['push', 'Push — fans at inlet'], ['pull', 'Pull — fans at outlet'], ['pushpull', 'Push-pull — inlet + outlet (series)'], ['impinge', 'Impingement — fans on fin tips'], ['natural', 'No fan — natural convection']] },
    { k: 'fanPreset', l: 'Fan model', t: 'sel', show: forced, o: Object.keys(HS.FANS).map(k => [k, k]), h: 'Class values — enter your datasheet curve' },
    { k: 'fanN', l: 'Fans per set', u: '', st: 1, min: 1, show: forced },
    { k: 'fanSpeed', l: 'Speed', u: '%', st: 5, show: forced },
    { k: 'fanD', l: 'Frame size', u: 'mm', st: 1, show: forced },
    { k: 'fanQmax', l: 'Free-air flow Q_max', u: 'CFM', st: 1, show: forced },
    { k: 'fanPmax', l: 'Shut-off Δp_max', u: 'Pa', st: 10, show: forced },
    { k: 'fanShape', l: 'Curve exponent n', u: '', st: 0.1, show: forced, h: '1 = linear, 2 = blower-like' },
    { k: 'fanPel', l: 'Electrical power each', u: 'W', st: 1, show: forced },
    { k: 'fanGap', l: 'Fan-to-fin gap', u: 'mm', st: 1, show: forced },
    { k: 'fanHub', l: 'Hub / frame ratio', u: '', st: 0.05, show: forced },
    { k: 'fanOffY', l: 'Fan row offset, width', u: 'mm', st: 1, show: forced },
    { k: 'fanX', l: 'Fan position along L', u: 'mm', st: 1, show: imp },
    { k: 'impEnh', l: 'Impingement h factor', u: '×', st: 0.05, show: imp } ] },
  { sec: 'Solver', f: [
    { k: 'grid', l: 'Map grid', t: 'sel', o: [['coarse', 'Coarse (30)'], ['medium', 'Medium (60)'], ['fine', 'Fine (96)']] } ] }
];
const FAN_KEYS = ['fanD', 'fanQmax', 'fanPmax', 'fanShape', 'fanPel'];

function buildForm() {
  const host = $('#setupForm'); host.innerHTML = '';
  SCHEMA.forEach(sec => {
    const d = document.createElement('details'); d.className = 'sec'; d.open = !!sec.open;
    const s = document.createElement('summary'); s.textContent = sec.sec; d.appendChild(s);
    const box = document.createElement('div'); box.className = 'fields'; d.appendChild(box);
    sec.f.forEach(fd => box.appendChild(fieldEl(fd)));
    host.appendChild(d);
  });
}
function fieldEl(fd) {
  if (fd.t === 'foster') return fosterEl();
  if (fd.t === 'helper') return helperEl();
  const w = document.createElement('label'); w.className = 'fld'; w.dataset.k = fd.k;
  const id = 'f_' + fd.k;
  if (fd.t === 'chk') {
    w.classList.add('chk'); w.innerHTML = `<input type="checkbox" id="${id}"><span>${fd.l}</span>`;
    w.querySelector('input').addEventListener('change', e => setField(fd, e.target.checked));
  } else if (fd.t === 'sel') {
    if (!fd.half) w.classList.add('sel');
    w.innerHTML = `<span class="lb">${fd.l}</span><select id="${id}">${fd.o.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
    w.querySelector('select').addEventListener('change', e => setField(fd, fd.num ? +e.target.value : e.target.value));
  } else {
    w.innerHTML = `<span class="lb">${fd.l}</span><span class="inp"><input type="number" id="${id}" inputmode="decimal" step="${fd.st || 'any'}"${fd.min != null ? ` min="${fd.min}"` : ''}${fd.max != null ? ` max="${fd.max}"` : ''}><span class="u">${fd.u || ''}</span></span>`;
    w.querySelector('input').addEventListener('input', e => { const v = parseFloat(e.target.value); if (isFinite(v)) setField(fd, v); });
  }
  if (fd.h || fd.hf) { const h = document.createElement('span'); h.className = 'hint'; h.textContent = fd.h || ''; w.appendChild(h); }
  return w;
}
function fosterEl() {
  const d = document.createElement('div'); d.className = 'subgrid';
  let html = `<span></span><span>R_i (K/W)</span><span>τ_i (s)</span>`;
  for (let i = 1; i <= 4; i++) html += `<label for="f_Fr${i}">Z_jc ${i}</label><input type="number" id="f_Fr${i}" step="any"><input type="number" id="f_Ft${i}" step="any" aria-label="tau ${i}">`;
  html += `<span class="hint" style="grid-column:1/-1">Foster terms from the datasheet Z_th,jc curve; rescaled so ΣR_i = R_th,jc.</span>`;
  d.innerHTML = html;
  for (let i = 1; i <= 4; i++) ['Fr', 'Ft'].forEach(p => d.querySelector('#f_' + p + i).addEventListener('input', e => { const v = parseFloat(e.target.value); if (isFinite(v)) { cfg[p + i] = v; schedule(); } }));
  return d;
}
function helperEl() {
  const d = document.createElement('details'); d.className = 'helper';
  d.innerHTML = `<summary style="cursor:pointer;font-size:12.5px;color:var(--ink)">Loss estimator (SPWM, SiC MOSFET)</summary><div class="hgrid">
    ${[['Irms', 'Phase current', 'A rms'], ['Vdc', 'DC link', 'V'], ['fsw', 'f_sw', 'kHz'], ['Rds', 'R_ds,on at T_j', 'mΩ'], ['Esw', 'E_on+E_off @ ref', 'mJ'], ['Vref', 'V_ref', 'V'], ['Iref', 'I_ref', 'A']]
      .map(([k, l, u]) => `<label class="fld"><span class="lb">${l}</span><span class="inp"><input type="number" id="h_${k}" step="any" value="${helper[k]}"><span class="u">${u}</span></span></label>`).join('')}
    <div class="out" id="h_out"></div>
    <div class="row"><button type="button" id="h_x">Use as x</button><button type="button" id="h_y">Use as y</button></div></div>`;
  setTimeout(() => {
    Object.keys(helper).forEach(k => d.querySelector('#h_' + k).addEventListener('input', e => { const v = parseFloat(e.target.value); if (isFinite(v)) { helper[k] = v; helperOut(); } }));
    d.querySelector('#h_x').addEventListener('click', () => { cfg.Px = Math.round(HS.losses(helper, 2 * cfg.nPar, cfg.nLegs).Ptot); syncForm(); schedule(); toast('x updated'); });
    d.querySelector('#h_y').addEventListener('click', () => { cfg.Py = Math.round(HS.losses(helper, 2 * cfg.nPar, cfg.nLegs).Ptot); syncForm(); schedule(); toast('y updated'); });
    helperOut();
  }, 0);
  return d;
}
function helperOut() {
  const o = HS.losses(helper, 2 * cfg.nPar, cfg.nLegs), el = $('#h_out'); if (!el) return;
  el.textContent = `per die: P_c ${fmt(o.Pc, 1)} W + P_sw ${fmt(o.Psw, 1)} W = ${fmt(o.Pdev, 1)} W · N_p = ${o.Np} · total ${fmt(o.Ptot, 0)} W`;
}
function setField(fd, v) {
  const old = cfg[fd.k]; cfg[fd.k] = v;
  if (fd.k === 'timPreset' && HS.TIMS[v]) { const m = HS.TIMS[v]; cfg.timK = m.k; cfg.timE = m.E; cfg.timEr = m.er; }
  if (['timK', 'timE', 'timEr'].includes(fd.k)) cfg.timPreset = 'Custom';
  if (fd.k === 'isoPreset' && HS.ISOS[v]) { const m = HS.ISOS[v]; cfg.isoK = m.k; cfg.isoT = m.t; cfg.isoE = m.E; cfg.isoEr = m.er; }
  if (['isoK', 'isoT', 'isoE', 'isoEr'].includes(fd.k)) cfg.isoPreset = 'Custom';
  if (fd.k === 'timMode') {
    if (v === 'C') cfg.timTmin = 0;
    else {
      if (v === 'B') { const m = HS.TIMS['Ultrasoft gap pad 5 W/m·K, insulating']; cfg.timPreset = 'Ultrasoft gap pad 5 W/m·K, insulating'; cfg.timK = m.k; cfg.timE = m.E; cfg.timEr = m.er; }
      if (!(cfg.timE > 0)) { const m = HS.TIMS['Gap filler 6 W/m·K, insulating']; cfg.timPreset = 'Gap filler 6 W/m·K, insulating'; cfg.timK = m.k; cfg.timE = m.E; cfg.timEr = m.er; }
      const need = Math.ceil(cfg.Vreq / cfg.timE * 20 - 1e-9) / 20;
      cfg.timTmin = Math.max(need, v === 'B' ? 1.0 : 0);
    }
  }
  if (fd.k === 'fanPreset' && HS.FANS[v]) { const f = HS.FANS[v]; cfg.fanD = f.D; cfg.fanQmax = f.Qmax; cfg.fanPmax = f.Pmax; cfg.fanShape = f.n; cfg.fanPel = f.Pel; }
  if (FAN_KEYS.includes(fd.k)) cfg.fanPreset = 'Custom';
  ['B', 'F'].forEach(w => { if (fd.k === 'mat' + w && v === 'Custom' && HS.MATERIALS[old]) { const m = HS.MATERIALS[old]; cfg['k' + w] = m.k; cfg['rho' + w] = m.rho; cfg['cp' + w] = m.cp; } });
  if (fd.k === 'fanMode' && v === 'impinge' && cfg.fanX <= 0) cfg.fanX = cfg.L / 2;
  if (fd.k === 'nPar' || fd.k === 'nLegs') helperOut();
  syncForm(); schedule();
}
function syncForm() {
  SCHEMA.forEach(sec => sec.f.forEach(fd => {
    if (!fd.k) return;
    const el = document.getElementById('f_' + fd.k); if (!el) return;
    const wrap = el.closest('.fld');
    if (fd.t === 'chk') el.checked = !!cfg[fd.k];
    else if (document.activeElement !== el) el.value = cfg[fd.k];
    if (wrap) {
      wrap.hidden = fd.show ? !fd.show(cfg) : false;
      if (fd.hf) wrap.querySelector('.hint').textContent = fd.hf(cfg);
    }
  }));
  for (let i = 1; i <= 4; i++) ['Fr', 'Ft'].forEach(p => { const el = document.getElementById('f_' + p + i); if (el && document.activeElement !== el) el.value = cfg[p + i]; });
}

/* ---------------- compute & render scheduling ---------------- */
let tmr = null;
function schedule() { clearTimeout(tmr); tmr = setTimeout(recompute, 70); }
function recompute() {
  const t0 = performance.now();
  try { R = HS.compute(cfg); }
  catch (e) { R = null; console.error(e); $('#alerts').innerHTML = `<div class="alert bad"><span class="pill bad">ERROR</span><span>Calculation failed: ${e.message}. Check the last edited value.</span></div>`; return; }
  $('#calcTime').textContent = `solved in ${fmt(performance.now() - t0, 0)} ms`;
  sweepDirty = true; saveCfg();
  renderSummary(); renderView();
}

/* ---------------- KPI strip + alerts ---------------- */
function stat(T) { return T > cfg.Tlim ? 'bad' : T > cfg.Tlim - 10 ? 'warn' : 'ok'; }
function renderSummary() {
  const c = cfg;
  $('#subline').textContent = `${c.nLegs}-leg inverter · ${2 * c.nLegs} switches × ${c.nPar}∥ top-side-cooled QDPAK = ${2 * c.nLegs * c.nPar} dies · ${c.Vdc} V · TIM option ${c.timMode} · ${c.fanMode === 'natural' ? 'natural convection' : c.fanMode + ' fans'} · ${c.Tamb} °C at ${c.alt} m`;
  if (!R || R.invalid) {
    $('#kpis').innerHTML = '';
    $('#alerts').innerHTML = `<div class="alert bad"><span class="pill bad">GEOMETRY</span><span>${R ? R.g.why : 'No result'} — adjust the heatsink inputs.</span></div>`;
    return;
  }
  const T = R.trans, op = R.op;
  const tiles = [
    { t: 'Tj hot · steady at x', v: fmt(R.TjHot, 1) + ' °C', c: stat(R.TjHot), s: `${R.hot.id} · margin ${fmt(c.Tlim - R.TjHot, 1)} K` },
    { t: `Tj peak · y for ${c.tp} s`, v: fmt(T.TpeakY, 1) + ' °C', c: stat(T.TpeakY), s: `${c.Py} W · steady at y: ${fmt(T.TssY, 0)} °C` },
    { t: 'Allowed time at y', v: tfmt(T.tAllow), c: T.tAllow >= c.tp ? 'ok' : 'bad', s: `from x to ${c.Tlim} °C` },
    { t: `Allowed y for ${c.tp} s`, v: fmt(T.yAllow, 0) + ' W', c: T.yAllow >= c.Py ? 'ok' : 'bad', s: `${fmt(T.yAllow / c.Px, 2)} × x` },
    { t: 'Heatsink R_sa', v: fmt(R.Rsa * 1e3, 1) + ' mK/W', c: R.Rsa <= R.RsaReqX ? 'ok' : 'bad', s: `needed ≤ ${fmt(R.RsaReqX * 1e3, 0)} at x (avg device)` },
    op ? { t: 'Airflow', v: fmt(op.Qfan / CFM, 1) + ' CFM', c: op.fanFrac < 0.35 ? 'warn' : '', s: `${fmt(op.dpFan, 0)} Pa · ${fmt(op.fanFrac * 100, 0)} % of free flow` }
       : { t: 'Airflow', v: 'natural', c: '', s: `h ${fmt(R.natRes.h, 1)} + h_rad ${fmt(R.natRes.hr, 1)} W/m²K` },
    { t: 'Mass · fan power', v: fmt(R.g.mass * 1e3, 0) + ' g', c: '', s: `fans ${fmt(R.fanPel, 1)} W · C_hs ${fmt(R.g.Chs, 0)} J/K` },
    { t: `Isolation at ${c.Vdc} V`, v: fmt(R.tim.Vbd, 1) + ' kV', c: R.tim.Vbd >= c.Vreq * (1 - 1e-9) ? 'ok' : 'bad', s: `need ${c.Vreq} kV · ${fmt(R.tim.Cdev * 1e12, 0)} pF/die · i_cm ${fmt(R.tim.icmPhase, 1)} A/phase` },
    R.fail ? { t: 'Fan failure at x', v: tfmt(R.fail.tFail), c: R.fail.tFail > 60 ? 'ok' : R.fail.tFail > 15 ? 'warn' : 'bad', s: `to ${c.Tlim} °C · τ ${tfmt(R.fail.tau)}` }
           : { t: 'Passive design', v: '—', c: '', s: 'no fan to fail' }
  ];
  $('#kpis').innerHTML = tiles.map(k => `<div class="kpi ${k.c}"><div class="t">${k.t}</div><div class="v">${k.v}</div><div class="s">${k.s}</div></div>`).join('');
  const order = { bad: 0, warn: 1, info: 2 };
  const w = R.warn.slice().sort((a, b) => order[a.lvl] - order[b.lvl]);
  $('#alerts').innerHTML = w.length ? w.map(a => `<div class="alert ${a.lvl}"><span class="pill ${a.lvl}">${a.lvl === 'bad' ? 'FAIL' : a.lvl === 'warn' ? 'CHECK' : 'NOTE'}</span><span>${a.msg}</span></div>`).join('')
    : `<div class="alert"><span class="pill ok">PASS</span><span>All checks pass at x and at y for ${c.tp} s.</span></div>`;
}

/* ---------------- views / tabs ---------------- */
const VIEWS = ['setup', 'map', 'flow', 'transient', 'sweep', 'equations'];
function showView(v) {
  if (!VIEWS.includes(v)) v = 'map';
  if (v === 'setup' && window.innerWidth > 1000) v = 'map';
  view = v;
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.v === v ? 'true' : 'false'));
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'v-' + v));
  $('#v-setup').classList.toggle('active', v === 'setup');
  renderView();
}
function renderView() {
  if (!R || R.invalid) { document.querySelectorAll('.view.active canvas').forEach(cv => { const p = prep(cv, 60); p.ctx.fillStyle = css('--bad'); p.ctx.font = '13px sans-serif'; p.ctx.fillText('Fix the geometry to see results.', 10, 30); }); return; }
  try {
    if (view === 'map') renderMap();
    else if (view === 'flow') renderFlow();
    else if (view === 'transient') renderTransient();
    else if (view === 'sweep') { if (sweepDirty) runSweep(); else drawSweep(); }
    else if (view === 'equations') renderEquations();
  } catch (e) { console.error(e); }
}

/* ---------------- canvas helpers ---------------- */
function prep(cv, h) {
  const dpr = window.devicePixelRatio || 1, w = Math.max(cv.clientWidth || cv.parentElement.clientWidth || 300, 200);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
const FONT = '11px "IBM Plex Mono", ui-monospace, monospace';
function niceStep(r, n) { const raw = r / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; }
function ticks(a, b, n) { const s = niceStep((b - a) || 1, n), out = []; for (let v = Math.ceil(a / s - 1e-9) * s; v <= b + s * 1e-9; v += s) out.push(+v.toPrecision(12)); return out; }
function decades(a, b) { const o = []; for (let e = Math.round(Math.log10(a)); e <= Math.round(Math.log10(b)); e++) o.push(Math.pow(10, e)); return o; }
function tickLab(v, log) {
  if (log) { const e = Math.round(Math.log10(v)); return e >= -1 && e <= 3 ? String(v) : '10' + sup(e); }
  const a = Math.abs(v); if (a !== 0 && (a >= 1e5 || a < 1e-3)) return sci(v, 2); return String(+v.toPrecision(6));
}
function lineChart(cv, o) {
  const { ctx, w, h } = prep(cv, o.h || 240);
  const ink = css('--ink'), muted = css('--muted'), grid = css('--line'), surf = css('--surface');
  ctx.font = FONT;
  const leg = o.series.filter(s => s.label);
  let rows = 0, lx = 0; const lw = w - 70;
  if (leg.length) { rows = 1; leg.forEach(s => { const tw = ctx.measureText(s.label).width + 34; if (lx + tw > lw && lx > 0) { rows++; lx = 0; } lx += tw; }); }
  const M = { l: o.ml || 56, r: o.mr || 14, t: rows ? 8 + rows * 16 : 12, b: 40 };
  const xs = [], ys = [];
  const okx = x => isFinite(x) && (!o.xlog || x > 0), oky = y => isFinite(y) && (!o.ylog || y > 0);
  o.series.forEach(s => s.x.forEach((x, i) => { if (okx(x) && oky(s.y[i])) { xs.push(x); ys.push(s.y[i]); } }));
  (o.hl || []).forEach(l => { if (l.inc !== false && oky(l.y)) ys.push(l.y); });
  (o.pts || []).forEach(p => { if (okx(p.x) && oky(p.y)) { xs.push(p.x); ys.push(p.y); } });
  if (!xs.length) { ctx.fillStyle = muted; ctx.fillText('No valid data for this range', M.l, h / 2); return; }
  let x0 = o.xmin != null ? o.xmin : Math.min(...xs), x1 = o.xmax != null ? o.xmax : Math.max(...xs);
  let y0 = o.ymin != null ? o.ymin : Math.min(...ys), y1 = o.ymax != null ? o.ymax : Math.max(...ys);
  if (o.ylog) { y0 = Math.pow(10, Math.floor(Math.log10(y0))); y1 = Math.pow(10, Math.ceil(Math.log10(y1))); if (y1 === y0) y1 *= 10; }
  else { if (y1 === y0) { y1 += 1; y0 -= 1; } const p = (y1 - y0) * 0.08; if (o.ymin == null) y0 -= p; if (o.ymax == null) y1 += p; if (o.zeroY && y0 > 0 && o.ymin == null) y0 = 0; }
  if (o.xlog) { x0 = Math.pow(10, Math.floor(Math.log10(x0))); x1 = Math.pow(10, Math.ceil(Math.log10(x1))); if (x1 === x0) x1 *= 10; }
  if (x1 === x0) { x1 += 1; x0 -= 1; }
  const pw = w - M.l - M.r, ph = h - M.t - M.b;
  const tx = v => M.l + (o.xlog ? (Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0)) : (v - x0) / (x1 - x0)) * pw;
  const ty = v => M.t + ph - (o.ylog ? (Math.log10(v) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0)) : (v - y0) / (y1 - y0)) * ph;
  const xt = o.xlog ? decades(x0, x1) : ticks(x0, x1, Math.max(3, Math.floor(pw / 72)));
  const yt = o.ylog ? decades(y0, y1) : ticks(y0, y1, Math.max(3, Math.floor(ph / 40)));
  ctx.lineWidth = 1; ctx.strokeStyle = grid; ctx.fillStyle = muted;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  xt.forEach(v => { const X = tx(v); if (X < M.l - 1 || X > M.l + pw + 1) return; ctx.globalAlpha = .7; ctx.beginPath(); ctx.moveTo(X, M.t); ctx.lineTo(X, M.t + ph); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(o.xfmt ? o.xfmt(v) : tickLab(v, o.xlog), X, M.t + ph + 5); });
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  yt.forEach(v => { const Y = ty(v); if (Y < M.t - 1 || Y > M.t + ph + 1) return; ctx.globalAlpha = .7; ctx.beginPath(); ctx.moveTo(M.l, Y); ctx.lineTo(M.l + pw, Y); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(o.yfmt ? o.yfmt(v) : tickLab(v, o.ylog), M.l - 6, Y); });
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(o.xl || '', M.l + pw / 2, h - 2);
  ctx.save(); ctx.translate(12, M.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(o.yl || '', 0, 0); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(M.l, M.t, pw, ph); ctx.clip();
  (o.series).forEach(s => {
    if (!s.fill) return;
    ctx.beginPath(); let started = false, lastX = 0;
    s.x.forEach((x, i) => { if (!okx(x) || !oky(s.y[i])) return; const X = tx(x), Y = ty(s.y[i]); if (!started) { ctx.moveTo(X, M.t + ph); ctx.lineTo(X, Y); started = true; } else ctx.lineTo(X, Y); lastX = X; });
    if (started) { ctx.lineTo(lastX, M.t + ph); ctx.closePath(); ctx.globalAlpha = .13; ctx.fillStyle = s.c; ctx.fill(); ctx.globalAlpha = 1; }
  });
  (o.hl || []).forEach(l => { const Y = ty(l.y); ctx.strokeStyle = l.c || muted; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(M.l, Y); ctx.lineTo(M.l + pw, Y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = l.c || muted; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(l.label || '', M.l + pw - 4, Y - 2); });
  (o.vl || []).forEach(l => { if (!okx(l.x)) return; const X = tx(l.x); ctx.strokeStyle = l.c || muted; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(X, M.t); ctx.lineTo(X, M.t + ph); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = l.c || muted; ctx.textAlign = X > M.l + pw * 0.7 ? 'right' : 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(l.label || '', X + (X > M.l + pw * 0.7 ? -4 : 4), M.t + ph - 3); });
  o.series.forEach(s => {
    ctx.strokeStyle = s.c; ctx.lineWidth = s.lw || 2; ctx.setLineDash(s.dash || []); ctx.lineJoin = 'round';
    ctx.beginPath(); let pen = false;
    s.x.forEach((x, i) => { const y = s.y[i]; if (!okx(x) || !oky(y)) { pen = false; return; } const X = tx(x), Y = ty(y); if (!pen) { ctx.moveTo(X, Y); pen = true; } else ctx.lineTo(X, Y); });
    ctx.stroke(); ctx.setLineDash([]);
    if (s.dots) s.x.forEach((x, i) => { if (!okx(x) || !oky(s.y[i])) return; ctx.beginPath(); ctx.arc(tx(x), ty(s.y[i]), 2.4, 0, 7); ctx.fillStyle = s.c; ctx.fill(); });
  });
  ctx.restore();
  (o.pts || []).forEach(p => {
    if (!okx(p.x) || !oky(p.y)) return; const X = tx(p.x), Y = ty(p.y);
    ctx.beginPath(); ctx.arc(X, Y, 5, 0, 7); ctx.fillStyle = p.c || ink; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = surf; ctx.stroke();
    if (p.label) { ctx.font = '600 11px "IBM Plex Mono", monospace'; ctx.fillStyle = ink; const right = X > M.l + pw * 0.62; ctx.textAlign = right ? 'right' : 'left'; ctx.textBaseline = Y < M.t + 16 ? 'top' : 'bottom'; ctx.fillText(p.label, X + (right ? -8 : 8), Y + (Y < M.t + 16 ? 6 : -6)); ctx.font = FONT; }
  });
  ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.strokeRect(M.l + .5, M.t + .5, pw - 1, ph - 1);
  if (leg.length) {
    let X = M.l, Y = 12; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    leg.forEach(s => { const tw = ctx.measureText(s.label).width + 34; if (X + tw > M.l + lw && X > M.l) { X = M.l; Y += 16; }
      ctx.strokeStyle = s.c; ctx.lineWidth = 2.5; ctx.setLineDash(s.dash || []); ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + 18, Y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = muted; ctx.fillText(s.label, X + 23, Y); X += tw; });
  }
}
function stackBars(cv, rows, opt = {}) {
  const rowH = 30, h = rows.length * (rowH + 18) + 26;
  const { ctx, w } = prep(cv, h); const muted = css('--muted'), ink = css('--ink'), grid = css('--line');
  const M = { l: 8, r: 10 }, pw = w - M.l - M.r;
  const tot = Math.max(...rows.map(r => r.parts.reduce((a, p) => a + Math.max(p.v, 0), 0)), 1e-12);
  ctx.font = FONT;
  rows.forEach((r, i) => {
    const y = 6 + i * (rowH + 18);
    ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(r.label, M.l, y);
    let x = M.l; const yb = y + 15;
    r.parts.forEach(p => {
      const ww = Math.max(p.v, 0) / tot * pw; if (ww <= 0) return;
      ctx.fillStyle = p.c; ctx.fillRect(x, yb, ww, rowH - 6);
      const t = p.t || ''; if (t && ctx.measureText(t).width + 6 < ww) { ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x + ww / 2, yb + (rowH - 6) / 2); }
      x += ww;
    });
    ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(r.total || '', w - M.r, y);
  });
  ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(M.l, h - 14); ctx.lineTo(w - M.r, h - 14); ctx.stroke();
  ctx.fillStyle = muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('0', M.l, h - 12); ctx.textAlign = 'right'; ctx.fillText(opt.scale ? opt.scale(tot) : sci(tot), w - M.r, h - 12);
}
const legendHTML = items => items.map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('');

/* inferno-like perceptual colour map */
const CMAP = [[0, [12, 8, 38]], [0.14, [50, 10, 94]], [0.28, [100, 21, 110]], [0.42, [150, 38, 103]], [0.56, [197, 58, 80]], [0.7, [233, 95, 46]], [0.84, [250, 150, 20]], [1, [249, 230, 120]]];
function cmap(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < CMAP.length; i++) if (t <= CMAP[i][0]) {
    const [a, ca] = CMAP[i - 1], [b, cb] = CMAP[i], f = (t - a) / (b - a);
    return [0, 1, 2].map(k => Math.round(ca[k] + (cb[k] - ca[k]) * f));
  }
  return CMAP[CMAP.length - 1][1];
}
const legColor = leg => ({ A: css('--air'), B: css('--c4'), C: css('--c3') }[leg] || css('--muted'));

/* ---------------- top view (sketch or heat map) ---------------- */
function drawTop(cv, mode) {
  const g = R.g, c = cfg, heat = mode === 'heat';
  const w0 = Math.max(cv.clientWidth || 600, 240);
  const M = { l: 42, r: 42, t: 26, b: heat ? (w0 < 500 ? 70 : 58) : 30 };
  const sc = (w0 - M.l - M.r) / g.L, ph = g.W * sc;
  const { ctx, w, h } = prep(cv, Math.round(ph + M.t + M.b));
  const X = x => M.l + x * sc, Y = y => M.t + y * sc;
  const ink = css('--ink'), muted = css('--muted'), line = css('--line'), air = css('--air'), surf = css('--surface');
  ctx.font = FONT;
  let Tmin = 0, Tmax = 1;
  if (heat) {
    const m = R.map, off = document.createElement('canvas'); off.width = m.nx; off.height = m.ny;
    const oc = off.getContext('2d'), img = oc.createImageData(m.nx, m.ny);
    Tmin = m.Tmin; Tmax = Math.max(m.Tmax, m.Tmin + 0.1);
    for (let j = 0; j < m.ny; j++) for (let i = 0; i < m.nx; i++) {
      const k = j * m.nx + i, col = cmap(0.06 + 0.94 * (m.T[k] - Tmin) / (Tmax - Tmin)), p = 4 * k;
      img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2]; img.data[p + 3] = 255;
    }
    oc.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(off, X(0), Y(0), g.L * sc, g.W * sc);
  } else {
    ctx.fillStyle = css('--surface-2'); ctx.fillRect(X(0), Y(0), g.L * sc, g.W * sc);
    ctx.strokeStyle = muted; ctx.globalAlpha = .55; ctx.lineWidth = 1;
    if (g.type === 'plate') { for (let i = 0; i < g.N; i++) { const y = i * (g.tf + g.s) + g.tf / 2; ctx.beginPath(); ctx.moveTo(X(0), Y(y)); ctx.lineTo(X(g.L), Y(y)); ctx.stroke(); } }
    else {
      ctx.fillStyle = muted;
      const spanT = (g.NT - 1) * g.ST, y0 = (g.W - spanT) / 2, x0 = (g.L - (g.NL - 1) * g.SL) / 2;
      for (let r = 0; r < g.NL; r++) { const odd = g.stag && r % 2 === 1, n = odd ? g.NT2 : g.NT; for (let k = 0; k < n; k++) { const y = y0 + k * g.ST + (odd ? g.ST / 2 : 0); ctx.beginPath(); ctx.arc(X(x0 + r * g.SL), Y(y), Math.max(g.D / 2 * sc, 0.8), 0, 7); ctx.fill(); } }
    }
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.strokeRect(X(0), Y(0), g.L * sc, g.W * sc);
  // devices
  const hot = R.hot;
  R.devs.forEach(d => {
    ctx.setLineDash([3, 3]); ctx.strokeStyle = heat ? 'rgba(255,255,255,.55)' : muted; ctx.lineWidth = 1;
    ctx.strokeRect(X(d.x - d.px / 2), Y(d.y - d.py / 2), d.px * sc, d.py * sc); ctx.setLineDash([]);
    const rx = X(d.x - d.ax / 2), ry = Y(d.y - d.ay / 2), rw = d.ax * sc, rh = d.ay * sc;
    if (heat) {
      ctx.strokeStyle = d === hot ? '#fff' : 'rgba(255,255,255,.85)'; ctx.lineWidth = d === hot ? 2.5 : 1.2; ctx.strokeRect(rx, ry, rw, rh);
      const fs = Math.max(8, Math.min(12, rw / 3.6)); ctx.font = `600 ${fs}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const two = rh > 2.6 * fs, lab = fmt(d.Tj, 0) + '°', tw = Math.max(ctx.measureText(lab).width, two ? ctx.measureText(d.id).width * 0.85 : 0) + 8, th = two ? fs * 2.3 : fs + 6;
      ctx.fillStyle = 'rgba(10,12,20,.62)'; ctx.fillRect(rx + rw / 2 - tw / 2, ry + rh / 2 - th / 2, tw, th);
      ctx.fillStyle = '#fff';
      ctx.fillText(lab, rx + rw / 2, ry + rh / 2 - (two ? fs * 0.55 : 0));
      if (two) { ctx.font = `${fs - 2}px "IBM Plex Mono", monospace`; ctx.fillText(d.id, rx + rw / 2, ry + rh / 2 + fs * 0.6); }
    } else {
      ctx.fillStyle = legColor(d.leg); ctx.globalAlpha = .85; ctx.fillRect(rx, ry, rw, rh); ctx.globalAlpha = 1;
      const fs = Math.max(8, Math.min(11, rw / 4.2)); ctx.font = `600 ${fs}px "IBM Plex Mono", monospace`;
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(rw > 5.2 * fs ? d.id : d.leg, rx + rw / 2, ry + rh / 2);
    }
  });
  ctx.font = FONT;
  // fans & flow
  const arrow = (x, y, dx, col) => { ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y); ctx.stroke(); const s = Math.sign(dx); ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.lineTo(x + dx - 6 * s, y - 4); ctx.lineTo(x + dx - 6 * s, y + 4); ctx.closePath(); ctx.fill(); };
  if (c.fanMode === 'natural') {
    for (let k = 1; k <= 3; k++) { const y = Y(g.W * k / 4); arrow(X(0) - 34, y, 26, air); arrow(X(g.L) + 6, y, 26, air); }
    ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('buoyant flow along L (fins vertical)', M.l + g.L * sc / 2, M.t - 6);
  } else if (c.fanMode === 'impinge') {
    const xf = Math.max(0.1 * g.L, Math.min(0.9 * g.L, c.fanX / 1e3)), D = c.fanD / 1e3;
    for (let i = 0; i < c.fanN; i++) {
      const yc = g.W * (i + 0.5) / c.fanN + c.fanOffY / 1e3;
      ctx.setLineDash([5, 4]); ctx.strokeStyle = heat ? '#fff' : air; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(X(xf), Y(yc), D / 2 * sc, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = .35; ctx.fillStyle = heat ? '#fff' : air; ctx.beginPath(); ctx.arc(X(xf), Y(yc), c.fanHub * D / 2 * sc, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
    for (let k = 1; k <= 3; k++) { const y = Y(g.W * k / 4); arrow(X(0) - 6, y, -26, air); arrow(X(g.L) + 6, y, 26, air); }
    ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('fans on fin tips · air exits both ends', M.l + g.L * sc / 2, M.t - 6);
  } else {
    const rev = !!c.flowRev, xin = rev ? X(g.L) : X(0), xout = rev ? X(0) : X(g.L), dir = rev ? -1 : 1, D = c.fanD / 1e3, gap = c.fanGap / 1e3;
    const fanBar = (xEdge, side) => {
      for (let i = 0; i < c.fanN; i++) {
        const yc = g.W * (i + 0.5) / c.fanN + c.fanOffY / 1e3;
        const gx = Math.min(gap * sc, M.l - 14), xb = xEdge + side * (gx + 2);
        ctx.fillStyle = air; ctx.globalAlpha = .9; ctx.fillRect(side > 0 ? xb : xb - 8, Y(yc - D / 2), 8, D * sc);
        ctx.globalAlpha = 1; ctx.fillStyle = surf; ctx.fillRect(side > 0 ? xb + 2 : xb - 6, Y(yc - c.fanHub * D / 2), 4, c.fanHub * D * sc);
      }
    };
    if (c.fanMode === 'push' || c.fanMode === 'pushpull') fanBar(xin, -dir);
    if (c.fanMode === 'pull' || c.fanMode === 'pushpull') fanBar(xout, dir);
    for (let k = 1; k <= 3; k++) { const y = Y(g.W * k / 4); arrow(xin - dir * (M.l - 6), y, dir * 18, air); arrow(xout + dir * 14, y, dir * 18, air); }
    ctx.fillStyle = muted; ctx.textBaseline = 'bottom'; ctx.textAlign = rev ? 'right' : 'left';
    ctx.fillText(`air in · ${c.fanMode}`, rev ? X(g.L) : X(0), M.t - 6);
  }
  // dimensions / colorbar
  ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  if (heat) {
    const yb = M.t + ph + 14, x0 = X(0), wb = g.L * sc;
    for (let i = 0; i < wb; i++) { const col = cmap(0.06 + 0.94 * i / wb); ctx.fillStyle = `rgb(${col})`; ctx.fillRect(x0 + i, yb, 1.5, 10); }
    ctx.fillStyle = muted; ctx.textBaseline = 'top';
    ctx.textAlign = 'left'; ctx.fillText(fmt(Tmin, 1) + ' °C', x0, yb + 13);
    ctx.textAlign = 'center'; ctx.fillText(`base temperature · L ${c.L} × W ${c.W} mm`, x0 + wb / 2, yb + (wb < 420 ? 28 : 13));
    ctx.textAlign = 'right'; ctx.fillText(fmt(Tmax, 1) + ' °C', x0 + wb, yb + 13);
  } else {
    ctx.fillText(`L = ${c.L} mm`, M.l + g.L * sc / 2, M.t + ph + 8);
    ctx.save(); ctx.translate(M.l - 30, M.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(`W = ${c.W} mm`, 0, 0); ctx.restore();
  }
}

/* ---------------- front section ---------------- */
function drawFront(cv) {
  const g = R.g, c = cfg, mm = 1e-3;
  const tim = R.tim, tP = 1.6 * mm, tD = 2.3 * mm, tGap = tim.tEval, tIso = tim.tIso, z0b = tP + tD + tGap + tIso, z1b = z0b + g.tb, zf = z1b + g.H;
  const ct = (!c.shroud && c.fanMode !== 'impinge' && c.fanMode !== 'natural') ? c.cTip * mm : 0;
  const D = c.fanD * mm, zc = z0b + (g.tb + g.H) / 2;
  let zmin = 0, zmax = zf + ct + 2 * mm;
  const fanCircles = c.fanMode !== 'natural' && c.fanMode !== 'impinge';
  if (fanCircles) { zmin = Math.min(zmin, zc - D / 2); zmax = Math.max(zmax, zc + D / 2); }
  if (c.fanMode === 'impinge') zmax = zf + c.fanGap * mm + 25 * mm;
  const ymin = -8 * mm, ymax = g.W + 8 * mm;
  const w0 = Math.max(cv.clientWidth || 500, 240), M = { l: 14, r: 14, t: 14, b: w0 < 520 ? 38 : 26 };
  let sc = (w0 - M.l - M.r) / (ymax - ymin); const hh = Math.min((zmax - zmin) * sc, 420); sc = Math.min(sc, 420 / (zmax - zmin));
  const { ctx, w, h } = prep(cv, Math.round(hh + M.t + M.b));
  const ox = M.l + ((w - M.l - M.r) - (ymax - ymin) * sc) / 2;
  const Xy = y => ox + (y - ymin) * sc, Zz = z => M.t + (zmax - z) * sc;
  const ink = css('--ink'), muted = css('--muted'), air = css('--air'), acc = css('--accent');
  const rect = (y0, z0, y1, z1, fill, alpha = 1) => { ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.fillRect(Xy(y0), Zz(z1), (y1 - y0) * sc, (z1 - z0) * sc); ctx.globalAlpha = 1; };
  rect(ymin, 0, ymax, tP, css('--c4'), .55);
  const ys = [...new Map(R.devs.map(d => [Math.round(d.y * 1e5), d])).values()];
  ys.forEach(d => { rect(d.y - d.py / 2, tP, d.y + d.py / 2, tP + tD, ink, .8); rect(d.y - d.ay / 2, tP + tD - 0.3 * mm, d.y + d.ay / 2, tP + tD, acc, 1); rect(d.y - d.ay / 2, tP + tD, d.y + d.ay / 2, tP + tD + tGap, air, .55); });
  if (tIso > 0) { const span = ys.reduce((a, d) => [Math.min(a[0], d.y - d.py / 2 - 2 * mm), Math.max(a[1], d.y + d.py / 2 + 2 * mm)], [1, -1]); rect(Math.max(span[0], 0), tP + tD + tGap, Math.min(span[1], g.W), z0b, css('--c3'), .75); }
  const metal = css('--muted');
  rect(0, z0b, g.W, z1b, metal, .55);
  if (g.type === 'plate') for (let i = 0; i < g.N; i++) { const y = i * (g.tf + g.s); rect(y, z1b, y + g.tf, zf, metal, .55); }
  else { const span = (g.NT - 1) * g.ST, y0 = (g.W - span) / 2; for (let k = 0; k < g.NT; k++) { const y = y0 + k * g.ST; rect(y - g.D / 2, z1b, y + g.D / 2, zf, metal, .55); } }
  ctx.strokeStyle = ink; ctx.lineWidth = 1.2;
  if (c.fanMode !== 'natural' && c.fanMode !== 'impinge') { const zw = c.shroud ? zf : zf + ct; ctx.beginPath(); ctx.moveTo(Xy(ymin), Zz(zw)); ctx.lineTo(Xy(ymax), Zz(zw)); ctx.stroke(); }
  if (fanCircles) {
    ctx.setLineDash([5, 4]); ctx.strokeStyle = air; ctx.lineWidth = 1.5;
    for (let i = 0; i < c.fanN; i++) { const yc = g.W * (i + 0.5) / c.fanN + c.fanOffY * mm; ctx.strokeRect(Xy(yc - D / 2), Zz(zc + D / 2), D * sc, D * sc); ctx.beginPath(); ctx.arc(Xy(yc), Zz(zc), D / 2 * 0.95 * sc, 0, 7); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  if (c.fanMode === 'impinge') {
    for (let i = 0; i < c.fanN; i++) { const yc = g.W * (i + 0.5) / c.fanN + c.fanOffY * mm, zb = zf + c.fanGap * mm; ctx.globalAlpha = .25; ctx.fillStyle = air; ctx.fillRect(Xy(yc - D / 2), Zz(zb + 25 * mm), D * sc, 25 * mm * sc); ctx.globalAlpha = 1; ctx.strokeStyle = air; ctx.strokeRect(Xy(yc - D / 2), Zz(zb + 25 * mm), D * sc, 25 * mm * sc); }
  }
  ctx.font = FONT; ctx.fillStyle = muted; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  const cap = `PCB · QDPAK · gap ${fmt(tGap * 1e3, 2)} mm${tIso > 0 ? ` · isolation ${c.isoT} mm` : ''} · base ${c.tb} mm · fins H ${c.H} mm${g.type === 'plate' ? ` · s ${fmt(g.s * 1e3, 2)} mm` : ` · D ${c.pinD} mm`}`;
  if (ctx.measureText(cap).width > w - M.l - M.r) { const parts = cap.split(' · '), half = Math.ceil(parts.length / 2); ctx.fillText(parts.slice(0, half).join(' · '), M.l, h - M.b + 4); ctx.fillText(parts.slice(half).join(' · '), M.l, h - M.b + 18); }
  else ctx.fillText(cap, M.l, h - M.b + 8);
}

/* ---------------- map view ---------------- */
function renderMap() {
  drawTop($('#cvMap'), 'heat');
  const m = R.map;
  $('#mapCap').textContent = `x = ${cfg.Px} W total · inlet ${fmt(R.Tin, 1)} °C · outlet air ${fmt(m.TairOutAvg, 1)} °C avg / ${fmt(m.TairOutMax, 1)} °C max · grid ${m.nx}×${m.ny}, ${m.iters} SOR sweeps, energy balance ${fmt(m.balance * 100, 3)} %. Labels: T_j.`;
  const pcb = cfg.pcbOn;
  let t = `<table><thead><tr><th>Device</th><th class="n">P (W)</th>${pcb ? '<th class="n">P_pcb</th>' : ''}<th class="n">T_base</th><th class="n">T_case</th><th class="n">T_j</th><th class="n">Margin (K)</th></tr></thead><tbody>`;
  R.devs.forEach(d => { t += `<tr><td>${d.id}</td><td class="n">${fmt(d.P, 1)}</td>${pcb ? `<td class="n">${fmt(d.Ppcb, 1)}</td>` : ''}<td class="n">${fmt(d.Tbase, 1)}</td><td class="n">${fmt(d.Tcase, 1)}</td><td class="n${d === R.hot ? ' hot' : ''}">${fmt(d.Tj, 1)}</td><td class="n">${fmt(cfg.Tlim - d.Tj, 1)}</td></tr>`; });
  $('#devTable').innerHTML = t + '</tbody></table>';
  const st = R.stack, hot = R.hot, P = R.PdevX;
  const C = { jc: css('--c3'), tim: css('--air'), sp: css('--c4'), d1: css('--muted'), cv: css('--accent'), cal: css('--warn') };
  const Rmap = (hot.Tbase - R.Tin) / hot.Ptop;
  stackBars($('#cvStack'), [
    { label: `Hottest · ${hot.id} (${fmt(hot.P, 1)} W, 2-D map)`, total: fmt((hot.Tj - R.Tin) / hot.P, 3) + ' K/W', parts: [
      { v: st.Rjc, c: C.jc, t: fmt(st.Rjc * hot.P, 1) + ' K' }, { v: st.Rtim, c: C.tim, t: fmt(st.Rtim * hot.Ptop, 1) + ' K' },
      { v: hot.Rv, c: C.sp, t: fmt(hot.Rv * hot.Ptop, 1) + ' K' }, { v: Rmap, c: C.cv, t: fmt(Rmap * hot.Ptop, 1) + ' K' }] },
    { label: `Average device (analytic, ${fmt(P, 1)} W)`, total: fmt(st.RjaAvg, 3) + ' K/W', parts: [
      { v: st.Rjc, c: C.jc, t: fmt(st.Rjc * P, 1) }, { v: st.Rtim, c: C.tim, t: fmt(st.Rtim * P, 1) }, { v: st.sp.RspAvg, c: C.sp, t: fmt(st.sp.RspAvg * P, 1) },
      { v: st.sp.R1D, c: C.d1, t: '' }, { v: st.RconvShare, c: C.cv, t: fmt(st.RconvShare * P, 1) }, { v: st.RcalShare, c: C.cal, t: fmt(st.RcalShare * P, 1) }] }
  ], { scale: v => fmt(v, 2) + ' K/W' });
  $('#stackLeg').innerHTML = legendHTML([[C.jc, 'R_jc'], [C.tim, 'R_TIM (gap + isolation + contact)'], [C.sp, 'spreading (R_sp / R_v)'], [C.d1, 'R_1D base'], [C.cv, 'convection (map: base+fins+air)'], [C.cal, 'air heating (caloric)']]);
  const ny = m.ny, yy = [], ww = [];
  for (let j = 0; j < ny; j++) { yy.push((j + 0.5) / ny * cfg.W); ww.push(m.wY[j]); }
  const vl = cfg.fanMode === 'natural' ? [] : Array.from({ length: cfg.fanN }, (_, i) => ({ x: cfg.W * (i + 0.5) / cfg.fanN + cfg.fanOffY, label: 'fan ' + (i + 1), c: css('--air') }));
  lineChart($('#cvWeights'), { h: 190, series: [{ x: yy, y: ww, c: css('--air'), fill: true }], vl, xl: 'position across width y (mm)', yl: 'w(y)', ymin: 0, xmin: 0, xmax: cfg.W, yfmt: v => v.toFixed(1) });
  drawFront($('#cvFront'));
  renderTimCard();
}
function renderTimCard() {
  const t = R.tim, c = cfg, P = R.hot.Ptop, A = R.stack.Apad;
  const rows = [['Gap ' + (c.timMode === 'B' ? 'pad' : 'filler'), `${fmt(t.tEval * 1e3, 2)} (${fmt(t.tmin * 1e3, 2)}…${fmt(t.tMax * 1e3, 2)})`, c.timK, t.Rparts.gap, c.timE > 0 ? fmt(t.Vgap, 2) : 'not credited', c.timEr]];
  if (t.iso) rows.push(['Isolation · ' + c.isoPreset, fmt(t.tIso * 1e3, 2), c.isoK, t.Rparts.iso, fmt(t.Viso, 2), c.isoEr]);
  rows.push(['Contact R″ (all faces)', '—', '—', t.Rparts.c, '—', '—']);
  let h = `<table><thead><tr><th>Layer</th><th class="n">t (mm)</th><th class="n">k</th><th class="n">R (K/W)</th><th class="n">ΔT (K)</th><th class="n">V_bd (kV)</th><th class="n">ε_r</th></tr></thead><tbody>`;
  rows.forEach(r => { h += `<tr><td>${r[0]}</td><td class="n">${r[1]}</td><td class="n">${r[2]}</td><td class="n">${fmt(r[3], 3)}</td><td class="n">${fmt(r[3] * P, 1)}</td><td class="n">${r[4]}</td><td class="n">${r[5]}</td></tr>`; });
  h += `<tr><td><b>Stack</b></td><td class="n">${fmt((t.tEval + t.tIso) * 1e3, 2)}</td><td></td><td class="n"><b>${fmt(t.R, 3)}</b></td><td class="n"><b>${fmt(t.R * P, 1)}</b></td><td class="n"><b>${fmt(t.Vbd, 2)}</b></td><td></td></tr></tbody></table>`;
  const ok = t.Vbd >= c.Vreq * (1 - 1e-9);
  $('#timTable').innerHTML = h + `<div class="kv" style="margin-top:8px">${kv([
    ['Withstand vs required', `${fmt(t.Vbd, 2)} / ${c.Vreq} kV ${ok ? '✓' : '✗'}`], ['Margin', fmt(t.margin, 2) + ' ×'],
    ['Working field at V_dc', fmt(t.Ework, 2) + ' kV/mm'], ['Pad area A_pad', fmt(A * 1e6, 0) + ' mm²'],
    ['C drain → heatsink', fmt(t.Cdev * 1e12, 1) + ' pF/die'], [`i_cm per phase (${c.nPar} LS dies)`, fmt(t.icmPhase, 2) + ' A @ ' + c.dvdt + ' V/ns'],
    ['Total C on switch nodes', fmt(t.Cdev * 1e12 * c.nPar * c.nLegs, 0) + ' pF'], ['Altitude clearance factor', '×' + fmt(t.kAlt, 2)],
    ...(t.iso ? [] : [['Min bond line for V_req', fmt(t.tReq, 2) + ' mm']])])}</div>`;
}

/* ---------------- flow view ---------------- */
function renderFlow() {
  drawTop($('#cvTop'), 'sketch');
  const c = cfg, op = R.op;
  if (!op) {
    const n = R.natRes;
    const p = prep($('#cvFan'), 70); p.ctx.font = FONT; p.ctx.fillStyle = css('--muted'); p.ctx.fillText('Natural convection — no fan operating point.', 8, 30);
    $('#fanCap').textContent = '';
    prep($('#cvDp'), 10);
    $('#dpLeg').innerHTML = '';
    $('#flowKV').innerHTML = kv([['Mode', 'natural convection + radiation'], ['Ra_s', sci(n.Ra)], ['El = Ra_s·s/L', sci(n.El)], ['Nu_s', fmt(n.Nu, 3)], ['h_conv', fmt(n.h, 2) + ' W/m²K'], ['h_rad', fmt(n.hr, 2) + ' W/m²K'], ['η_f', fmt(n.fe.eta * 100, 1) + ' %'], ['G_conv', fmt(n.Gc, 2) + ' W/K'], ['G_rad', fmt(n.Gr, 2) + ' W/K'], ['R_sa', fmt(n.R, 4) + ' K/W'], ['ΔT_s', fmt(n.dT, 1) + ' K']]);
    return;
  }
  const Af = R.Af, Am = R.Am, g = R.g, rr = op.rr, Qf = op.Qfree, n = 70, xs = [], fan = [], sys = [], fan100 = [];
  const c100 = Object.assign({}, c, { fanSpeed: 100 });
  for (let i = 0; i <= n; i++) {
    const Q = Qf * 1.02 * i / n; xs.push(Q / CFM);
    fan.push(Math.max(HS.fanDP(c, Af, Q), 0)); sys.push(HS.systemAt(c, g, Am, Q * rr).dp);
    if (c.fanSpeed !== 100) fan100.push(Math.max(HS.fanDP(c100, Af, Q), 0));
  }
  const fanLabel = `fan set (${c.fanMode === 'pushpull' ? '2 × ' : ''}${c.fanN} ∥ @ ${c.fanSpeed} %)`;
  const series = [{ x: xs, y: fan, c: css('--air'), label: fanLabel }, { x: xs, y: sys, c: css('--accent'), label: 'system: fins + bypass + K_sys' }];
  if (fan100.length) { const x2 = []; const y2 = []; const Q100 = HS.fanQfree(c100); for (let i = 0; i <= n; i++) { const Q = Q100 * i / n; x2.push(Q / CFM); y2.push(Math.max(HS.fanDP(c100, Af, Q), 0)); } series.push({ x: x2, y: y2, c: css('--air'), dash: [4, 4], lw: 1.4, label: 'fan @ 100 %' }); }
  lineChart($('#cvFan'), { h: 260, series, xl: 'volumetric flow at fan (CFM)', yl: 'static pressure (Pa)', ymin: 0, xmin: 0,
    ymax: Math.max(...fan, ...(fan100.length ? fan100 : [0])) * 1.08 || 1, pts: [{ x: op.Qfan / CFM, y: op.dpFan, c: css('--ink'), label: `${fmt(op.Qfan / CFM, 1)} CFM · ${fmt(op.dpFan, 0)} Pa` }] });
  $('#fanCap').textContent = `ρ at fan ${fmt(Af.rho, 3)} kg/m³ (${fmt(Af.rho / HS.RHO_REF * 100, 0)} % of sea-level curve) · ${fmt(op.Qfan, 4)} m³/s · ṁ = ${fmt(R.ht.mdotTot * 1e3, 1)} g/s`;
  const s0 = R.ht.secs[0], cc = s0.c, turn = c.fanMode === 'impinge' ? 0.5 * Am.rho * cc.V * cc.V : 0;
  const C = { c: css('--c4'), f: css('--accent'), e: css('--c3'), t: css('--warn'), s: css('--muted') };
  const parts = [{ v: cc.dpC, c: C.c, t: fmt(cc.dpC, 0) }, { v: cc.dpF, c: C.f, t: fmt(cc.dpF, 0) }, { v: cc.dpE, c: C.e, t: fmt(cc.dpE, 0) }];
  if (turn) parts.push({ v: turn, c: C.t, t: fmt(turn, 0) });
  parts.push({ v: op.dpSys, c: C.s, t: fmt(op.dpSys, 0) });
  stackBars($('#cvDp'), [{ label: `Fan static pressure at operating point`, total: fmt(op.dpFan, 1) + ' Pa', parts }], { scale: v => fmt(v, 0) + ' Pa' });
  $('#dpLeg').innerHTML = legendHTML([[C.c, 'entrance K_c'], [C.f, 'friction 4fL/D_h'], [C.e, 'exit K_e'], ...(turn ? [[C.t, 'impingement turn']] : []), [C.s, 'system K_sys']]);
  const plateT = g.type === 'plate';
  const rows = [
    ['ρ, ν at mean air', `${fmt(Am.rho, 3)} · ${sci(Am.nu)}`], ['Pr, k_air', `${fmt(Am.Pr, 3)} · ${fmt(Am.k, 4)}`],
    ['Q fan', `${fmt(op.Qfan / CFM, 1)} CFM`], ['Q through fins', `${fmt(op.Qh / rr / CFM, 1)} CFM`], ['Bypass', fmt(100 * op.Qb / Math.max(op.Q, 1e-12), 1) + ' %'],
    ['Duct velocity', fmt(op.Vd, 2) + ' m/s'], [plateT ? 'Channel velocity' : 'V_max (pins)', fmt(cc.V, 2) + ' m/s'],
    [plateT ? 'Re_Dh' : 'Re_D', fmt(cc.Re, 0)], ['Regime', cc.regime], ['Correlation', cc.corr],
    ['f (Fanning / pin)', fmt(cc.f, 4)], ['K_c · K_e', `${fmt(cc.Kc, 3)} · ${fmt(cc.Ke, 3)}`],
    ['h (bulk-ref.)', fmt(R.ht.h, 1) + ' W/m²K'], ['η_f · η_0', `${fmt(R.ht.eta * 100, 1)} · ${fmt(R.ht.eta0 * 100, 1)} %`],
    ['A_t', fmt(g.At, 4) + ' m²'], ['NTU · ε', `${fmt(R.ht.NTU, 3)} · ${fmt(R.ht.eps, 3)}`],
    ['R_conv', fmt(R.ht.Rconv * 1e3, 2) + ' mK/W'], ['R_sa', fmt(R.Rsa * 1e3, 2) + ' mK/W'],
    ['ΔT air', fmt(R.dTair, 2) + ' K'], ['Fan P_el · P_aero', `${fmt(R.fanPel, 1)} · ${fmt(R.Paero, 2)} W`]
  ];
  if (plateT && cc.hT) rows.push(['Teertstra cross-check h_in', fmt(cc.hT, 1) + ' W/m²K']);
  if (c.fanMode === 'impinge') R.ht.secs.forEach((s, i) => rows.push([`Section ${i + 1} (L ${fmt(s.Ls * 1e3, 0)} mm)`, `${fmt(s.Q / CFM, 1)} CFM · h ${fmt(s.h, 0)}`]));
  $('#flowKV').innerHTML = kv(rows);
}
const kv = rows => rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');

/* ---------------- transient view ---------------- */
function renderTransient() {
  const T = R.trans, c = cfg, tp = T.tp;
  const tauHs = Math.max(T.tauHs, 1e-3), tEnd = tp + Math.max(2 * tp, Math.min(4 * tauHs, 20 * tp));
  const n = 420, ts = [], tj = [], ths = [];
  const PdX = R.PdevX, dPa = R.PdevY - R.PdevX, ThsSS = R.Tin + PdX * T.extHs.reduce((a, x) => a + x.R, 0);
  for (let i = 0; i <= n; i++) {
    const t = -0.06 * tEnd + 1.06 * tEnd * i / n; ts.push(t);
    tj.push(T.Tpulse(t));
    ths.push(t < 0 ? ThsSS : ThsSS + dPa * (HS.Zf(T.extHs, t) - (t > tp ? HS.Zf(T.extHs, t - tp) : 0)));
  }
  ts.push(tp); tj.push(T.TpeakY); ths.push(ThsSS + dPa * HS.Zf(T.extHs, tp));
  const ord = ts.map((t, i) => i).sort((a, b) => ts[a] - ts[b]);
  const S = a => ord.map(i => a[i]);
  lineChart($('#cvPulse'), { h: 270, series: [{ x: S(ts), y: S(tj), c: css('--accent'), label: `T_j hottest (${R.hot.id})` }, { x: S(ts), y: S(ths), c: css('--air'), label: 'fin-node temperature (avg share)' }],
    hl: [{ y: c.Tlim, c: css('--warn'), label: `design limit ${c.Tlim} °C` }, { y: c.TjMax, c: css('--bad'), label: `T_j,max ${c.TjMax} °C`, inc: T.TpeakY > c.TjMax - 15 }],
    vl: [{ x: 0, label: 'y on' }, { x: tp, label: 'y off' }], pts: [{ x: tp, y: T.TpeakY, c: css('--accent'), label: `${fmt(T.TpeakY, 1)} °C` }],
    xl: 'time (s)', yl: 'temperature (°C)' });
  $('#pulseCap').textContent = `Per hottest die: x → ${fmt(T.PhotX, 1)} W, y → ${fmt(T.PhotY, 1)} W. Peak ${fmt(T.TpeakY, 1)} °C at t = ${tp} s. Allowed time at y: ${tfmt(T.tAllow)}. Allowed y for ${tp} s: ${fmt(T.yAllow, 0)} W total. Heatsink time constant R_sa·C_hs = ${tfmt(T.tauHs)}.`;
  const tz = [], zj = [], ze = [], zt = [];
  for (let i = 0; i <= 160; i++) { const t = Math.pow(10, -6 + 10 * i / 160); tz.push(t); zj.push(HS.Zf(T.jc, t)); ze.push(T.kappa * HS.Zf(T.ext, t)); zt.push(T.Zhot(t)); }
  lineChart($('#cvZth'), { h: 250, xlog: true, ylog: true, series: [{ x: tz, y: zt, c: css('--accent'), label: 'Z_ja hottest' }, { x: tz, y: zj, c: css('--c3'), label: 'Z_jc (datasheet Foster)' }, { x: tz, y: ze, c: css('--air'), label: 'κ·Z_case-air (Cauer)' }],
    vl: [{ x: tp, label: 't_p' }], ymin: 1e-3, xl: 'time (s)', yl: 'Z_th (K/W)' });
  if (R.fail) {
    const F = R.fail, tE = isFinite(F.tFail) ? Math.min(Math.max(2.2 * F.tFail, 0.3 * F.tau), 4 * F.tau) : 3 * F.tau, xs = [], ys = [];
    for (let i = 0; i <= 200; i++) { const t = tE * i / 200; xs.push(t); ys.push(F.Tj(t)); }
    const pts = isFinite(F.tFail) && F.tFail > 0 ? [{ x: F.tFail, y: c.Tlim, c: css('--bad'), label: tfmt(F.tFail) }] : [];
    lineChart($('#cvFail'), { h: 230, series: [{ x: xs, y: ys, c: css('--bad'), label: 'T_j hottest after all fans stop' }], hl: [{ y: c.Tlim, c: css('--warn'), label: 'design limit' }], pts, xl: 'time after failure (s)', yl: 'T_j (°C)' });
    $('#failCap').textContent = `Natural convection + radiation: h ${fmt(F.nr.h, 2)} W/m²K, h_rad ${fmt(F.nr.hr, 1)} W/m²K, R_nat ${fmt(F.nr.R, 3)} K/W → heatsink would settle at ${fmt(F.Tnat, 0)} °C. τ = R_nat·C_hs = ${tfmt(F.tau)}. Time to ${c.Tlim} °C: ${tfmt(F.tFail)}.`;
  } else { const p = prep($('#cvFail'), 60); p.ctx.font = FONT; p.ctx.fillStyle = css('--muted'); p.ctx.fillText('Passive design — no fan failure case.', 8, 30); $('#failCap').textContent = ''; }
  const tc = [], yc = [];
  for (let i = 0; i <= 120; i++) { const t = Math.pow(10, -1 + 5 * i / 120); const Z = T.Zhot(t); const dTa = c.Tlim - T.Tss; tc.push(t); yc.push(dTa > 0 ? (T.PhotX + dTa / Z) * R.Ndev / R.hot.fac : NaN); }
  lineChart($('#cvCap'), { h: 230, xlog: true, series: [{ x: tc, y: yc, c: css('--ok'), fill: true, label: 'allowed y (total W)' }], hl: [{ y: c.Px, c: css('--muted'), label: 'x' }],
    ymin: 0, ymax: Math.max(c.Py * 2.2, c.Px * 1.5), pts: [{ x: tp, y: c.Py, c: T.yAllow >= c.Py ? css('--ok') : css('--bad'), label: `y ${c.Py} W, ${tp} s` }], xl: 'pulse length t (s)', yl: 'peak loss y (W)' });
  const rows = [...T.jc.map((x, i) => ['Z_jc', i + 1, x.R, x.tau]), ...T.ext.map((x, i) => ['Z_case-air ×κ', i + 1, x.R * T.kappa, x.tau])];
  $('#fosterTable').innerHTML = `<table><thead><tr><th>Network</th><th>#</th><th class="n">R (K/W)</th><th class="n">τ (s)</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="n">${sci(r[2], 4)}</td><td class="n">${sci(r[3], 4)}</td></tr>`).join('')}</tbody></table><div class="cap" style="margin-top:6px">κ = ${fmt(T.kappa, 3)} scales the average-device case-to-air network to the hottest device found by the 2-D map. C nodes: case ${fmt(T.Ccells.C0, 2)}, base-local ${fmt(T.Ccells.C1, 2)}, base-cell ${fmt(T.Ccells.C2, 2)}, fins ${fmt(T.Ccells.C3, 2)} J/K.</div>`;
  $('#btnFoster').onclick = () => copyText('network,i,R_K_per_W,tau_s\n' + rows.map(r => `${r[0]},${r[1]},${r[2]},${r[3]}`).join('\n'), 'Foster CSV');
}

/* ---------------- sweep ---------------- */
const SWEEP = {
  N: { l: 'Fin count N', a: 20, b: 70, int: true, ok: c => plate(c) && c.finBy !== 'gap' },
  finGap: { l: 'Fin gap s (mm)', a: 1.2, b: 8, ok: c => plate(c) && c.finBy === 'gap' },
  tf: { l: 'Fin thickness t_f (mm)', a: 0.5, b: 3, ok: plate },
  H: { l: 'Fin height H (mm)', a: 15, b: 70 },
  tb: { l: 'Base thickness t_b (mm)', a: 2, b: 16 },
  L: { l: 'Length L (mm)', a: 80, b: 260 },
  W: { l: 'Width W (mm)', a: 90, b: 220 },
  pinD: { l: 'Pin diameter D (mm)', a: 1.5, b: 6, ok: pin },
  pinST: { l: 'Pin pitch S_T (mm)', a: 4, b: 12, ok: pin },
  fanSpeed: { l: 'Fan speed (%)', a: 30, b: 100, ok: forced },
  fanN: { l: 'Fans per set', a: 1, b: 4, int: true, ok: forced },
  fanGap: { l: 'Fan-to-fin gap (mm)', a: 0, b: 60, ok: forced },
  fanOffY: { l: 'Fan row offset (mm)', a: -30, b: 30, ok: forced },
  fanX: { l: 'Impingement fan position (mm)', a: 20, b: 120, ok: imp },
  cTip: { l: 'Tip clearance (mm)', a: 0.5, b: 20, ok: c => ductModes(c) && !c.shroud },
  timK: { l: 'Gap material k (W/m·K)', a: 1, b: 12 },
  timDh: { l: 'Height tolerance Δh (mm)', a: 0, b: 0.6 },
  timTmin: { l: 'Min bond line (mm)', a: 0, b: 1.5 },
  isoT: { l: 'Isolation thickness (mm)', a: 0.1, b: 1.0, ok: c => c.timMode === 'C' },
  isoK: { l: 'Isolation k (W/m·K)', a: 1, b: 180, ok: c => c.timMode === 'C' },
  pitchDev: { l: 'Device pitch (mm)', a: 17, b: 50 },
  pitchLeg: { l: 'Row pitch (mm)', a: 16, b: 40 },
  alt: { l: 'Altitude (m)', a: 0, b: 6000 },
  Tamb: { l: 'Ambient (°C)', a: -20, b: 70 },
  Px: { l: 'Continuous loss x (W)', a: 100, b: 1200 }
};
let swData = null;
function sweepOptions() {
  const sel = $('#swK'), cur = sel.value;
  const keys = Object.keys(SWEEP).filter(k => !SWEEP[k].ok || SWEEP[k].ok(cfg));
  sel.innerHTML = keys.map(k => `<option value="${k}">${SWEEP[k].l}</option>`).join('');
  if (keys.includes(cur)) sel.value = cur; else { sel.value = keys[0]; setSweepRange(); }
}
function setSweepRange() { const s = SWEEP[$('#swK').value]; if (!s) return; $('#swA').value = s.a; $('#swB').value = s.b; }
function runSweep() {
  sweepOptions();
  const k = $('#swK').value, s = SWEEP[k], a = +$('#swA').value, b = +$('#swB').value, n = Math.max(3, Math.min(80, Math.round(+$('#swN').value || 25)));
  const t0 = performance.now(), xs = [], out = [];
  let vals = []; for (let i = 0; i < n; i++) vals.push(a + (b - a) * i / (n - 1));
  if (s.int) vals = [...new Set(vals.map(Math.round))];
  vals.forEach(v => { const c2 = Object.assign({}, cfg, { [k]: v }); let r; try { const R2 = HS.compute(c2, { grid: 'coarse' }); r = R2.invalid ? null : { TjHot: R2.TjHot, Tpk: R2.trans.TpeakY, Rsa: R2.Rsa, Q: R2.op ? R2.op.Qfan / CFM : NaN, dp: R2.op ? R2.op.dpFan : NaN, mass: R2.g.mass * 1e3 }; } catch (e) { r = null; } xs.push(v); out.push(r); });
  swData = { k, xs, out, ms: performance.now() - t0 };
  sweepDirty = false; drawSweep();
}
function drawSweep() {
  if (!swData) return;
  const { k, xs, out } = swData, s = SWEEP[k], get = f => out.map(o => o ? o[f] : NaN), cur = cfg[k];
  const pk = get('Tpk'); let best = -1; pk.forEach((v, i) => { if (isFinite(v) && (best < 0 || v < pk[best])) best = i; });
  const vl = [{ x: cur, label: 'current', c: css('--ink') }];
  lineChart($('#cvSw1'), { h: 230, series: [{ x: xs, y: pk, c: css('--accent'), label: `peak at y, ${cfg.tp} s`, dots: true }, { x: xs, y: get('TjHot'), c: css('--air'), label: 'steady at x', dots: true }],
    hl: [{ y: cfg.Tlim, c: css('--warn'), label: 'design limit' }], vl, pts: best >= 0 ? [{ x: xs[best], y: pk[best], c: css('--accent'), label: `min ${fmt(pk[best], 1)} °C` }] : [], xl: s.l, yl: 'T_j hottest (°C)' });
  lineChart($('#cvSw2'), { h: 210, series: [{ x: xs, y: get('Rsa').map(v => v * 1e3), c: css('--accent'), dots: true }], hl: [{ y: R.RsaReqX * 1e3, c: css('--warn'), label: 'needed at x' }], vl, xl: s.l, yl: 'R_sa (mK/W)', zeroY: true });
  lineChart($('#cvSw3'), { h: 210, series: [{ x: xs, y: get('Q'), c: css('--air'), dots: true, label: 'airflow (CFM)' }], vl, xl: s.l, yl: 'Q (CFM)', zeroY: true });
  lineChart($('#cvSw4'), { h: 210, series: [{ x: xs, y: get('mass'), c: css('--c3'), dots: true }], vl, xl: s.l, yl: 'mass (g)', zeroY: true });
  $('#swCap').textContent = `${xs.length} points in ${fmt(swData.ms, 0)} ms (coarse map). ${best >= 0 ? `Lowest peak T_j at ${s.l.split(' (')[0]} = ${fmt(xs[best], 2)}: ${fmt(pk[best], 1)} °C, R_sa ${fmt(out[best].Rsa * 1e3, 1)} mK/W, ${fmt(out[best].mass, 0)} g, ${fmt(out[best].dp, 0)} Pa.` : 'No valid points.'}`;
}

/* ---------------- equations ---------------- */
function renderEquations() {
  const c = cfg, g = R.g, A = R.Am, st = R.stack, sp = st.sp, op = R.op, ht = R.ht, nat = R.nat, T = R.trans, F = R.fail;
  const s0 = ht ? ht.secs[0] : null, cc = s0 ? s0.c : null, NA = 'n/a — natural-convection mode', plateT = g.type === 'plate';
  const I = s => `<i>${s}</i>`;
  const G = [];
  G.push({ h: '1 · Air at altitude (ISA + Sutherland)', e: [
    ['ISA pressure', `${I('p')} = 101 325 (1 − 2.25577·10<sup>−5</sup> ${I('h')})<sup>5.25588</sup>`, `p = ${fmt(A.p / 1e3, 2)} kPa at h = ${c.alt} m`],
    ['Density', `${I('ρ')} = ${fr(I('p'), `${I('R')}<sub>air</sub> ${I('T')}`)}, ${I('R')}<sub>air</sub> = 287.05 J/kg·K`, `ρ = ${fmt(A.rho, 3)} kg/m³ at T_mean = ${fmt(A.Tc, 1)} °C`],
    ['Viscosity', `${I('μ')} = 1.716·10<sup>−5</sup> (${fr(I('T'), '273.15')})<sup>3/2</sup> ${fr('383.55', `${I('T')} + 110.4`)}`, `μ = ${sci(A.mu)} Pa·s, ν = ${sci(A.nu)} m²/s`],
    ['Conductivity, heat capacity, Prandtl', `${I('k')} = 0.0241 (${fr(I('T'), '273.15')})<sup>3/2</sup> ${fr('467.15', `${I('T')} + 194`)}, ${I('c<sub>p</sub>')} = 1002.5 + 2.75·10<sup>−4</sup>(${I('T')} − 200)<sup>2</sup>, Pr = ${fr(`${I('μ')} ${I('c<sub>p</sub>')}`, I('k'))}`, `k = ${fmt(A.k, 4)} W/m·K, c_p = ${fmt(A.cp, 0)} J/kg·K, Pr = ${fmt(A.Pr, 3)}`]] });
  G.push({ h: '2 · Fan–system matching', e: [
    ['Fan curve with fan laws', `Δ${I('p')}<sub>fan</sub>(${I('Q')}) = ${fr(I('ρ'), `${I('ρ')}<sub>0</sub>`)} ${I('s')}<sup>2</sup> Δ${I('p')}<sub>max</sub> [1 − (${fr(I('Q'), `${I('n<sub>p</sub>')} ${I('s')} ${I('Q')}<sub>max</sub>`)})<sup>${I('n')}</sup>]`, nat ? NA : `s = ${c.fanSpeed} %, ρ/ρ₀ = ${fmt(R.Af.rho / HS.RHO_REF, 3)}, n_p = ${c.fanN}, n = ${c.fanShape}`],
    ['Series fans (push-pull)', `Δ${I('p')}<sub>set</sub> = Δ${I('p')}<sub>push</sub>(${I('Q')}) + Δ${I('p')}<sub>pull</sub>(${I('Q')})`, c.fanMode === 'pushpull' ? 'active' : 'inactive in this arrangement'],
    ['System curve', `Δ${I('p')}<sub>sys</sub> = Δ${I('p')}<sub>core</sub>(${I('Q')}<sub>hs</sub>) + ${I('K')}<sub>sys</sub> ${fr(`${I('ρ')} ${I('V')}<sub>duct</sub><sup>2</sup>`, '2')}`, nat ? NA : `Δp_core = ${fmt(op.dpCore, 1)} Pa, K_sys term = ${fmt(op.dpSys, 1)} Pa`],
    ['Bypass split (equal Δp in parallel paths)', `Δ${I('p')}<sub>core</sub>(${I('Q')}<sub>hs</sub>) = Δ${I('p')}<sub>bp</sub>(${I('Q')} − ${I('Q')}<sub>hs</sub>), Δ${I('p')}<sub>bp</sub> = [${I('K<sub>c</sub>')} + ${I('K<sub>e</sub>')} + 4${I('f')} ${fr(I('L'), `${I('D')}<sub>h,bp</sub>`)}] ${fr(`${I('ρ')}${I('V')}<sub>bp</sub><sup>2</sup>`, '2')}`, nat ? NA : `bypass = ${fmt(100 * op.Qb / Math.max(op.Q, 1e-12), 1)} % of flow`],
    ['Operating point', `Δ${I('p')}<sub>fan</sub>(${I('Q')}) = Δ${I('p')}<sub>sys</sub>(${I('Q')} ${I('ρ')}<sub>fan</sub>/${I('ρ')}<sub>m</sub>)`, nat ? NA : `Q = ${fmt(op.Qfan / CFM, 1)} CFM (${sci(op.Qfan)} m³/s), Δp = ${fmt(op.dpFan, 1)} Pa`],
    ['Fan power', `${I('P')}<sub>el</sub> = ${I('n')} ${I('P')}<sub>el,0</sub> ${I('s')}<sup>3</sup>, ${I('P')}<sub>aero</sub> = Δ${I('p')} ${I('Q')}`, nat ? NA : `P_el = ${fmt(R.fanPel, 1)} W, P_aero = ${fmt(R.Paero, 2)} W`]] });
  if (plateT) {
    G.push({ h: '3 · Plate-fin channel flow', e: [
      ['Fin gap', `${I('s')} = ${fr(`${I('W')} − ${I('N')} ${I('t<sub>f</sub>')}`, `${I('N')} − 1`)}`, `N = ${g.N}, s = ${fmt(g.s * 1e3, 3)} mm, H/s = ${fmt(g.aspect, 1)}`],
      ['Hydraulic diameter, velocity, Reynolds', `${I('D<sub>h</sub>')} = ${fr(`2${I('sH')}`, `${I('s')} + ${I('H')}`)}, ${I('V')}<sub>ch</sub> = ${fr(`${I('Q')}<sub>hs</sub>`, `(${I('N')} − 1)${I('sH')}`)}, Re = ${fr(`${I('V')}<sub>ch</sub>${I('D<sub>h</sub>')}`, I('ν'))}`, nat ? NA : `D_h = ${fmt(cc.Dh * 1e3, 3)} mm, V = ${fmt(cc.V, 2)} m/s, Re = ${fmt(cc.Re, 0)} (${cc.regime})`],
      ['Contraction / expansion (Kays & London)', `${I('σ')} = ${fr(`(${I('N')} − 1)${I('s')}`, I('W'))}, ${I('K<sub>c</sub>')} = 0.42(1 − ${I('σ')}<sup>2</sup>), ${I('K<sub>e</sub>')} = (1 − ${I('σ')}<sup>2</sup>)<sup>2</sup>`, nat ? NA : `σ = ${fmt(g.sigma, 3)}, K_c = ${fmt(cc.Kc, 3)}, K_e = ${fmt(cc.Ke, 3)}`],
      ['Fully developed fRe (Shah & London)', `${I('f')}Re = 24(1 − 1.3553${I('λ')} + 1.9467${I('λ')}<sup>2</sup> − 1.7012${I('λ')}<sup>3</sup> + 0.9564${I('λ')}<sup>4</sup> − 0.2537${I('λ')}<sup>5</sup>), ${I('λ')} = ${I('s')}/${I('H')}`, nat ? NA : `fRe = ${fmt(cc.fRe, 2)}`],
      ['Developing laminar (Muzychka–Yovanovich)', `${I('f')}<sub>app</sub>Re = [(${fr('3.44', sq(`${I('L')}*`))})<sup>2</sup> + (${I('f')}Re)<sup>2</sup>]<sup>1/2</sup>, ${I('L')}* = ${fr(I('L'), `${I('D<sub>h</sub>')} Re`)}`, nat ? NA : `L* = ${sci(cc.Lst)}, f_app = ${fmt(cc.f, 5)}`],
      ['Turbulent (Petukhov, Fanning)', `${I('f')} = ¼(0.790 ln Re − 1.64)<sup>−2</sup>, Re > 2300`, nat ? NA : (cc.Re > 2300 ? 'active' : 'inactive (laminar)')],
      ['Core pressure drop', `Δ${I('p')} = [${I('K<sub>c</sub>')} + 4${I('f')}<sub>app</sub> ${fr(I('L'), I('D<sub>h</sub>'))} + ${I('K<sub>e</sub>')}] ${fr(`${I('ρ')}${I('V')}<sub>ch</sub><sup>2</sup>`, '2')}`, nat ? NA : `${fmt(cc.dpC, 1)} + ${fmt(cc.dpF, 1)} + ${fmt(cc.dpE, 1)} = ${fmt(cc.dp, 1)} Pa`]] });
    G.push({ h: '4 · Plate-fin heat transfer', e: [
      ['Simultaneously developing laminar (Stephan), bulk-referenced', `Nu<sub>m</sub> = 7.55 + ${fr(`0.024 ${I('x')}*<sup>−1.14</sup>`, `1 + 0.0358 Pr<sup>0.17</sup> ${I('x')}*<sup>−0.64</sup>`)}, ${I('x')}* = ${fr(I('L'), `${I('D')}<sub>h,p</sub> Re Pr`)}, ${I('D')}<sub>h,p</sub> = 2${I('s')}`, nat ? NA : `x* = ${sci(cc.xs)}, Re_p = ${fmt(cc.Rep, 0)}`],
      ['Turbulent (Gnielinski + entrance)', `Nu = ${fr(`(${I('f<sub>D</sub>')}/8)(Re − 1000)Pr`, `1 + 12.7 ${sq(`${I('f<sub>D</sub>')}/8`)} (Pr<sup>2/3</sup> − 1)`)} [1 + (${fr(I('D<sub>h</sub>'), I('L'))})<sup>2/3</sup>]`, nat ? NA : `${cc.corr}: Nu = ${fmt(cc.Nu, 2)}, h = ${fmt(cc.h, 1)} W/m²K`],
      ['Teertstra composite, inlet-referenced (cross-check, laminar)', `Nu<sub>b</sub> = [(${fr(`Re<sub>b</sub>* Pr`, '2')})<sup>−3</sup> + (0.664 ${sq('Re<sub>b</sub>*')} Pr<sup>1/3</sup> ${sq(`1 + ${fr('3.65', sq('Re<sub>b</sub>*'))}`)})<sup>−3</sup>]<sup>−1/3</sup>, Re<sub>b</sub>* = Re<sub>b</sub> ${fr(I('s'), I('L'))}`,
        nat ? NA : `h_T = ${fmt(cc.hT, 1)} W/m²K vs model inlet-referenced ε·ṁc_p/(η₀A_t) = ${fmt(s0.eps * s0.md * A.cp / (s0.fe.eta0 * s0.At), 1)} W/m²K${cc.Re > 2300 ? ' (turbulent: Teertstra not valid)' : ''}`]] });
  } else {
    G.push({ h: '3 · Pin-fin bank (Žukauskas / Khan–Culham–Yovanovich)', e: [
      ['Pin count', `${I('N<sub>L</sub>')} = ⌊(${I('L')} − ${I('D')})/${I('S<sub>L</sub>')}⌋ + 1, ${I('N<sub>T</sub>')} = ⌊(${I('W')} − ${I('D')})/${I('S<sub>T</sub>')}⌋ + 1`, `N_L = ${g.NL}, N_T = ${g.NT}, pins = ${g.Np}`],
      ['Maximum velocity', `in-line: ${I('V')}<sub>max</sub> = ${fr(I('S<sub>T</sub>'), `${I('S<sub>T</sub>')} − ${I('D')}`)}${I('V')}<sub>app</sub>; staggered: ${fr(I('S<sub>T</sub>'), `2(${I('S<sub>D</sub>')} − ${I('D')})`)}${I('V')}<sub>app</sub> if 2(${I('S<sub>D</sub>')} − ${I('D')}) < ${I('S<sub>T</sub>')} − ${I('D')}, ${I('S<sub>D</sub>')} = ${sq(`${I('S<sub>L</sub>')}<sup>2</sup> + (${I('S<sub>T</sub>')}/2)<sup>2</sup>`)}`, nat ? NA : `V_max = ${fmt(cc.V, 2)} m/s, Re_D = ${fmt(cc.Re, 0)}`],
      ['Heat transfer (Žukauskas)', `Nu<sub>D</sub> = ${I('C')}<sub>2</sub> ${I('C')} Re<sub>D,max</sub><sup>${I('m')}</sup> Pr<sup>0.36</sup>(Pr/Pr<sub>s</sub>)<sup>1/4</sup>`, nat ? NA : `C = ${fmt(cc.C, 3)}, m = ${cc.m}, C₂ = ${fmt(cc.C2, 3)}, Nu = ${fmt(cc.Nu, 2)}, h = ${fmt(cc.h, 1)} W/m²K`],
      ['Friction factor', `in-line: ${I('f')} = ${I('K')}<sub>1</sub>[0.233 + ${fr('45.78', `(${I('S<sub>T</sub>')}/${I('D')} − 1)<sup>1.1</sup> Re<sub>D</sub>`)}], ${I('K')}<sub>1</sub> = 1.009(${fr(`${I('S<sub>T</sub>')} − ${I('D')}`, `${I('S<sub>L</sub>')} − ${I('D')}`)})<sup>1.09/Re<sup>0.0553</sup></sup>; staggered: ${I('f')} = ${I('K')}<sub>1</sub> ${fr(`378.6/(${I('S<sub>T</sub>')}/${I('D')})<sup>13.1/(S<sub>T</sub>/D)</sup>`, `Re<sup>0.68/(S<sub>T</sub>/D)<sup>1.29</sup></sup>`)}, ${I('K')}<sub>1</sub> = 1.175 ${fr(`${I('S<sub>L</sub>')}/${I('D')}`, `(${I('S<sub>T</sub>')}/${I('D')})Re<sup>0.3124</sup>`)} + 0.5 Re<sup>0.0807</sup>`, nat ? NA : `f = ${fmt(cc.f, 4)}, K₁ = ${fmt(cc.K1, 3)}`],
      ['Pressure drop', `Δ${I('p')} = (${I('K<sub>c</sub>')} + ${I('K<sub>e</sub>')} + ${I('f')}${I('N<sub>L</sub>')}) ${fr(`${I('ρ')}${I('V')}<sub>max</sub><sup>2</sup>`, '2')}, ${I('K<sub>c</sub>')} = −0.0311${I('σ')}<sup>2</sup> − 0.3722${I('σ')} + 1.0676, ${I('K<sub>e</sub>')} = 0.9301${I('σ')}<sup>2</sup> − 2.5746${I('σ')} + 0.973`, nat ? NA : `${fmt(cc.dpC, 1)} + ${fmt(cc.dpF, 1)} + ${fmt(cc.dpE, 1)} = ${fmt(cc.dp, 1)} Pa`]] });
  }
  const fe = nat ? R.natRes.fe : s0.fe;
  G.push({ h: '5 · Fin efficiency, surface efficiency, ε-NTU', e: [
    ['Fin parameter', `${I('m')} = ${sq(fr(`${I('h')}${I('P')}`, `${I('k')}${I('A<sub>c</sub>')}`))} → plate ${sq(`2${I('h')}/${I('k<sub>f</sub>')}${I('t<sub>f</sub>')}`)}, pin ${sq(`4${I('h')}/${I('k<sub>f</sub>')}${I('D')}`)}`, `m = ${fmt(fe.m, 2)} 1/m, k_f = ${g.mf.k} W/m·K`],
    ['Fin efficiency (corrected length)', `${I('η<sub>f</sub>')} = ${fr(`tanh(${I('m')}${I('H<sub>c</sub>')})`, `${I('m')}${I('H<sub>c</sub>')}`)}, ${I('H<sub>c</sub>')} = ${I('H')} + ${I('t<sub>f</sub>')}/2 (pin: ${I('H')} + ${I('D')}/4)`, `H_c = ${fmt(fe.Hc * 1e3, 2)} mm, η_f = ${fmt(fe.eta * 100, 1)} %`],
    ['Overall surface efficiency', `${I('η')}<sub>0</sub> = 1 − ${fr(I('A<sub>f</sub>'), I('A<sub>t</sub>'))}(1 − ${I('η<sub>f</sub>')})`, `A_f = ${fmt(g.Afin, 4)} m², A_t = ${fmt(g.At, 4)} m², η₀ = ${fmt(fe.eta0 * 100, 1)} %`],
    ['Effectiveness', `NTU = ${fr(`${I('η')}<sub>0</sub>${I('h')}${I('A<sub>t</sub>')}`, `${I('ṁ')}${I('c<sub>p</sub>')}`)}, ${I('ε')} = 1 − e<sup>−NTU</sup>`, nat ? NA : `ṁ = ${fmt(ht.mdotHs * 1e3, 2)} g/s, NTU = ${fmt(ht.NTU, 3)}, ε = ${fmt(ht.eps, 3)}`],
    ['Heatsink resistance to inlet air', `${I('R')}<sub>sa</sub> = ${fr('1', `${I('ṁ')}${I('c<sub>p</sub>')}${I('ε')}`)} = ${I('R')}<sub>conv</sub> + ${I('R')}<sub>cal</sub>, ${I('R')}<sub>conv</sub> = ${fr('1', `${I('η')}<sub>0</sub>${I('h')}${I('A<sub>t</sub>')}`)}`, nat ? `R_sa = ${fmt(R.Rsa, 4)} K/W (natural)` : `R_sa = ${fmt(R.Rsa * 1e3, 2)} mK/W, R_conv = ${fmt(ht.Rconv * 1e3, 2)} mK/W`],
    ['Air temperature rise', `Δ${I('T')}<sub>air</sub> = ${fr(I('P'), `${I('ṁ')}${I('c<sub>p</sub>')}`)}`, nat ? NA : `ΔT_air = ${fmt(R.dTair, 2)} K`],
    ['Impingement (fans on fin tips)', `Δ${I('p')}<sub>1</sub>(${I('Q')}<sub>1</sub>, ${I('x<sub>f</sub>')}) + ½${I('ρV')}<sub>1</sub><sup>2</sup> = Δ${I('p')}<sub>2</sub>(${I('Q')} − ${I('Q')}<sub>1</sub>, ${I('L')} − ${I('x<sub>f</sub>')}) + ½${I('ρV')}<sub>2</sub><sup>2</sup>, ${I('h')} × ${I('F')}<sub>imp</sub>`, c.fanMode === 'impinge' ? `Q₁ = ${fmt(ht.secs[0].Q / CFM, 1)} CFM, Q₂ = ${fmt(ht.secs[1].Q / CFM, 1)} CFM, F_imp = ${c.impEnh}` : 'inactive']] });
  G.push({ h: '6 · Device stack and spreading (Lee–Song–Au–Moran)', e: [
    ['Thermal interface stack', `${I('R')}<sub>TIM</sub> = ${fr(`${I('t')}<sub>gap</sub>/${I('k')}<sub>gap</sub> + ${I('t')}<sub>iso</sub>/${I('k')}<sub>iso</sub> + ${I('R')}″<sub>c</sub>`, `${I('A')}<sub>pad</sub>`)}, ${I('t')}<sub>gap</sub> = ${I('t')}<sub>min</sub> + Δ${I('h')} (worst) or + Δ${I('h')}/2 (mean)`, `A_pad = ${fmt(st.Apad * 1e6, 0)} mm², t_gap = ${fmt(R.tim.tEval * 1e3, 2)} mm, R_TIM = ${fmt(st.Rtim, 4)} K/W`],
    ['Equivalent radii and parameters', `${I('a')} = ${sq(`${I('A')}<sub>pad</sub>/π`)}, ${I('b')} = ${sq(`${I('A')}<sub>cell</sub>/π`)}, ${I('ε')} = ${I('a')}/${I('b')}, ${I('τ')} = ${I('t<sub>b</sub>')}/${I('b')}, Bi = ${fr(`${I('h')}<sub>eff</sub>${I('b')}`, I('k<sub>b</sub>'))}`, `a = ${fmt(sp.a * 1e3, 2)} mm, b = ${fmt(sp.b * 1e3, 2)} mm, ε = ${fmt(sp.eps, 3)}, τ = ${fmt(sp.tau, 3)}, Bi = ${fmt(sp.Bi, 4)}`],
    ['Eigenvalue and Φ', `${I('λ<sub>c</sub>')} = π + ${fr('1', `${sq('π')}${I('ε')}`)}, ${I('Φ<sub>c</sub>')} = ${fr(`tanh(${I('λ<sub>c</sub>')}${I('τ')}) + ${I('λ<sub>c</sub>')}/Bi`, `1 + (${I('λ<sub>c</sub>')}/Bi) tanh(${I('λ<sub>c</sub>')}${I('τ')})`)}`, `λ_c = ${fmt(sp.lc, 3)}, Φ_c = ${fmt(sp.Phi, 4)}`],
    ['Spreading resistance (average source temperature)', `${I('ψ')}<sub>avg</sub> = ${fr(`${I('ε')}${I('τ')}`, sq('π'))} + ½(1 − ${I('ε')})<sup>3/2</sup>${I('Φ<sub>c</sub>')}, ${I('R')}<sub>sp</sub> = ${fr(`${I('ψ')}<sub>avg</sub>`, `${I('k<sub>b</sub>')}${I('a')}${sq('π')}`)} − ${I('R')}<sub>1D</sub>`, `ψ_avg = ${fmt(sp.psiAvg, 4)}, R_sp = ${fmt(sp.RspAvg, 4)} K/W (max-point ${fmt(sp.RspMax, 4)})`],
    ['Base 1-D conduction', `${I('R')}<sub>1D</sub> = ${fr(I('t<sub>b</sub>'), `${I('k<sub>b</sub>')}${I('A')}<sub>cell</sub>`)}, ${I('A')}<sub>cell</sub> = ${I('LW')}/${I('N')}`, `A_cell = ${fmt(st.Acell * 1e6, 0)} mm², R_1D = ${fmt(sp.R1D, 4)} K/W`],
    ['Average junction', `${I('T<sub>j</sub>')} = ${I('T')}<sub>in</sub> + ${I('P')}[${I('R')}<sub>jc</sub> + (${I('R')}<sub>TIM</sub> + ${I('R')}<sub>sp</sub> + ${I('R')}<sub>1D</sub> + ${I('N')}${I('R')}<sub>sa</sub>) ∥ ${I('R')}<sub>pcb</sub>]`, `R_ja = ${fmt(st.RjaAvg, 4)} K/W → T_j,avg = ${fmt(R.TjAvg, 1)} °C`],
    ['Required heatsink', `${I('R')}<sub>sa,req</sub> = ${fr(`(${I('T')}<sub>lim</sub> − ${I('T')}<sub>in</sub>)/${I('P')}<sub>hot</sub> − ${I('R')}<sub>jc</sub> − ${I('R')}<sub>TIM</sub> − ${I('R')}<sub>sp</sub> − ${I('R')}<sub>1D</sub>`, I('N'))}`, `x: ${fmt(R.RsaReqX * 1e3, 1)} mK/W · y steady: ${fmt(R.RsaReqY * 1e3, 1)} mK/W`]] });
  G.push({ h: '7 · 2-D base-plate model (thermal map)', e: [
    ['Plate conduction with distributed sink', `${I('k<sub>b</sub>')}${I('t<sub>b</sub>')}∇<sup>2</sup>${I('T')} − ${I('h')}″<sub>eff</sub>${I('φ')}(${I('x')},${I('y')})(${I('T')} − ${I('T')}<sub>air</sub>) + ${I('q')}″ = 0, ${I('h')}″<sub>eff</sub> = ${fr(`${I('η')}<sub>0</sub>${I('h')}${I('A<sub>t</sub>')}`, `${I('L')}${I('W')}`)}`, `h″_eff = ${fmt(R.hEff, 1)} W/m²K, grid ${R.map.nx}×${R.map.ny}`],
    ['Air marching along each channel strip', `${I('T')}<sub>air,out</sub> = ${I('T')}<sub>air,in</sub> + (${I('T')} − ${I('T')}<sub>air,in</sub>)(1 − e<sup>−${I('g')}/${I('ṁ<sub>j</sub>')}${I('c<sub>p</sub>')}</sup>), ${I('g')} = ${I('h')}″<sub>eff</sub>${I('φ')}Δ${I('x')}Δ${I('y')}`, `outlet air ${fmt(R.map.TairOutAvg, 1)} °C avg / ${fmt(R.map.TairOutMax, 1)} °C max`],
    ['Flow-distribution weight', `${I('φ')} = ${I('w')}(${I('y')})<sup>${I('m')}</sup>, ${fr('1', I('n<sub>y</sub>'))}Σ${I('w')} = 1, ${I('ṁ<sub>j</sub>')} = ${I('ṁ')}${I('w<sub>j</sub>')}/Σ${I('w')}`, `w = ${fmt(Math.min(...R.map.wY), 2)} … ${fmt(Math.max(...R.map.wY), 2)}`],
    ['Vertical constriction under the pad', `${I('R<sub>v</sub>')} = ${fr(`${I('t<sub>b</sub>')}/2`, `${I('k<sub>b</sub>')}(${I('a<sub>x</sub>')} + ${I('t<sub>b</sub>')}/2)(${I('a<sub>y</sub>')} + ${I('t<sub>b</sub>')}/2)`)}`, `R_v = ${fmt(R.hot.Rv, 4)} K/W`],
    ['Solver', `SOR, ${I('ω')} = ${fr('2', `1 + sin(π/${I('n')})`)}, plus global energy-balance shift Δ${I('T')} = (${I('Q')}<sub>in</sub> − ${I('Q')}<sub>out</sub>)/${I('G')}<sub>DC</sub>`, `${R.map.iters} sweeps, balance error ${fmt(R.map.balance * 100, 4)} %`],
    ['Hot device', `${I('T<sub>j</sub>')} = ${I('T̄')}<sub>base,pad</sub> + ${I('P')}<sub>top</sub>(${I('R<sub>v</sub>')} + ${I('R')}<sub>TIM</sub>) + ${I('P')}${I('R')}<sub>jc</sub>`, `${R.hot.id}: ${fmt(R.hot.Tbase, 1)} → ${fmt(R.hot.Tcase, 1)} → ${fmt(R.hot.Tj, 1)} °C`]] });
  G.push({ h: '8 · Transient', e: [
    ['Junction–case (datasheet Foster)', `${I('Z')}<sub>jc</sub>(${I('t')}) = Σ${I('R<sub>i</sub>')}(1 − e<sup>−${I('t')}/${I('τ<sub>i</sub>')}</sup>), Σ${I('R<sub>i</sub>')} = ${I('R')}<sub>jc</sub>`, T.jc.map(x => `${sci(x.R, 3)}/${sci(x.tau, 2)}`).join(' · ')],
    ['Case-to-air Cauer ladder', `${I('<b>C</b>')} d${I('<b>T</b>')}/d${I('t')} = −${I('<b>G</b>')}${I('<b>T</b>')} + ${I('<b>P</b>')}; nodes: case · base-local · base-cell · fins → air`, `C = ${[T.Ccells.C0, T.Ccells.C1, T.Ccells.C2, T.Ccells.C3].map(v => fmt(v, 2)).join(', ')} J/K`],
    ['Exact Cauer → Foster', `${I('<b>M</b>')} = ${I('<b>C</b>')}<sup>−½</sup>${I('<b>G</b>')}${I('<b>C</b>')}<sup>−½</sup> = ${I('<b>V</b>')}${I('<b>Λ</b>')}${I('<b>V</b>')}<sup>T</sup>, ${I('R<sub>k</sub>')} = ${fr(`${I('v')}<sub>0${I('k')}</sub><sup>2</sup>`, `${I('C')}<sub>0</sub>${I('λ<sub>k</sub>')}`)}, ${I('τ<sub>k</sub>')} = 1/${I('λ<sub>k</sub>')}`, `ΣR_k = ${fmt(T.RextNet, 4)} K/W (exact G⁻¹₀₀)`],
    ['Hot-device scaling', `${I('Z')}<sub>hot</sub> = ${I('Z')}<sub>jc</sub> + ${I('κ')}${I('Z')}<sub>ext</sub>, ${I('κ')} = ${fr(`(${I('T')}<sub>case,hot</sub> − ${I('T')}<sub>in</sub>)/${I('P')}<sub>hot</sub>`, `Σ${I('R<sub>k</sub>')}`)}`, `κ = ${fmt(T.kappa, 4)}`],
    ['Pulse superposition', `${I('T<sub>j</sub>')}(${I('t')}) = ${I('T')}<sub>j,ss</sub>(${I('x')}) + Δ${I('P')}[${I('Z')}(${I('t')}) − ${I('Z')}(${I('t')} − ${I('t<sub>p</sub>')})u(${I('t')} − ${I('t<sub>p</sub>')})]`, `ΔP_hot = ${fmt(T.dP, 2)} W → T_peak = ${fmt(T.TpeakY, 1)} °C`],
    ['Allowed time and allowed peak', `${I('Z')}(${I('t')}<sub>allow</sub>) = ${fr(`${I('T')}<sub>lim</sub> − ${I('T')}<sub>j,ss</sub>`, `Δ${I('P')}`)}, ${I('y')}<sub>allow</sub> = ${fr(I('N'), `1 + ${I('δ')}`)}[${I('P')}<sub>hot,x</sub> + ${fr(`${I('T')}<sub>lim</sub> − ${I('T')}<sub>j,ss</sub>`, `${I('Z')}(${I('t<sub>p</sub>')})`)}]`, `t_allow = ${tfmt(T.tAllow)}, y_allow = ${fmt(T.yAllow, 0)} W`],
    ['Fan failure', `${I('T')}<sub>hs</sub>(${I('t')}) = ${I('T')}<sub>nat</sub> − (${I('T')}<sub>nat</sub> − ${I('T')}<sub>0</sub>)e<sup>−${I('t')}/${I('τ')}</sup>, ${I('τ')} = ${I('R')}<sub>nat</sub>${I('C')}<sub>hs</sub>`, F ? `τ = ${tfmt(F.tau)}, T_nat = ${fmt(F.Tnat, 0)} °C, t_fail = ${tfmt(F.tFail)}` : 'n/a']] });
  const tm = R.tim;
  G.push({ h: '6b · Isolation and EMI (live drain pad, ' + c.Vdc + ' V)', e: [
    ['Withstand of credited layers (thinnest point)', `${I('V')}<sub>bd</sub> = ${I('E')}<sub>gap</sub>${I('t')}<sub>min</sub> + ${I('E')}<sub>iso</sub>${I('t')}<sub>iso</sub> ≥ ${I('V')}<sub>req</sub>`, `${fmt(tm.Vgap, 2)} + ${fmt(tm.Viso, 2)} = ${fmt(tm.Vbd, 2)} kV vs ${c.Vreq} kV (×${fmt(tm.margin, 2)})`],
    ['Minimum bond line without isolation layer', `${I('t')}<sub>min,req</sub> = ${fr(`${I('V')}<sub>req</sub>`, `${I('E')}<sub>gap</sub>`)}`, tm.iso ? 'option C — isolation layer carries the voltage' : `${fmt(tm.tReq, 2)} mm`],
    ['Working field', `${I('E')}<sub>w</sub> = ${fr(`${I('V')}<sub>dc</sub>`, `${I('t')}<sub>ins</sub>`)}`, `${fmt(tm.Ework, 2)} kV/mm`],
    ['Drain-to-heatsink capacitance (series layers)', `${I('C')} = ${fr(`${I('ε')}<sub>0</sub>${I('A')}<sub>pad</sub>`, `${I('t')}<sub>min</sub>/${I('ε')}<sub>r,gap</sub> + ${I('t')}<sub>iso</sub>/${I('ε')}<sub>r,iso</sub>`)}`, `${fmt(tm.Cdev * 1e12, 1)} pF per die (parallel-plate, fringing ignored)`],
    ['Common-mode current into the heatsink', `${I('i')}<sub>cm</sub> = ${I('N')}<sub>par</sub>${I('C')} ${fr(`d${I('v')}`, `d${I('t')}`)} (low-side drains = switch node)`, `${fmt(tm.icmPhase, 2)} A per phase at ${c.dvdt} V/ns`],
    ['Altitude correction for clearances (IEC 60664-1 Table A.2)', `${I('d')}<sub>cl</sub>(${I('h')}) = ${I('k')}<sub>alt</sub>(${I('h')}) · ${I('d')}<sub>cl</sub>(2000 m)`, `k_alt = ${fmt(tm.kAlt, 2)} at ${c.alt} m`]] });
  const NR = nat ? R.natRes : (F ? F.nr : null);
  G.push({ h: '9 · Natural convection and radiation', e: [
    ['Vertical channel (Bar-Cohen & Rohsenow)', `Nu<sub>s</sub> = [${fr('576', 'El<sup>2</sup>')} + ${fr('2.873', sq('El'))}]<sup>−1/2</sup>, El = Ra<sub>s</sub>${fr(I('s'), I('L'))}, Ra<sub>s</sub> = ${fr(`${I('g')}${I('β')}Δ${I('T')}${I('s')}<sup>3</sup>`, `${I('ν')}${I('α')}`)}`, NR ? `Ra_s = ${sci(NR.Ra)}, El = ${sci(NR.El)}, h = ${fmt(NR.h, 2)} W/m²K` : '—'],
    ['Radiation from the envelope', `${I('h')}<sub>rad</sub> = ${I('ε')}${I('σ')}(${I('T<sub>s</sub>')}<sup>2</sup> + ${I('T<sub>a</sub>')}<sup>2</sup>)(${I('T<sub>s</sub>')} + ${I('T<sub>a</sub>')}), ${I('A')}<sub>env</sub> = ${I('LW')} + 2(${I('L')} + ${I('W')})(${I('H')} + ${I('t<sub>b</sub>')})`, NR ? `h_rad = ${fmt(NR.hr, 2)} W/m²K, A_env = ${fmt(NR.Aenv, 4)} m²` : '—']] });
  const L = HS.losses(helper, 2 * c.nPar, c.nLegs);
  G.push({ h: '10 · Mass, heat capacity and loss estimate', e: [
    ['Mass and heat capacity', `${I('m')} = ${I('ρ<sub>b</sub>')}${I('V')}<sub>base</sub> + ${I('ρ<sub>f</sub>')}${I('V')}<sub>fins</sub>, ${I('C')}<sub>hs</sub> = Σ${I('ρ')}${I('c<sub>p</sub>')}${I('V')}`, `m = ${fmt(g.mass * 1e3, 0)} g, C_hs = ${fmt(g.Chs, 0)} J/K`],
    ['Conduction loss per die (synchronous, SPWM)', `${I('P<sub>c</sub>')} = ½(${fr(`${I('I')}<sub>rms</sub>`, I('N<sub>p</sub>'))})<sup>2</sup>${I('R')}<sub>ds,on</sub>(${I('T<sub>j</sub>')})`, `P_c = ${fmt(L.Pc, 2)} W`],
    ['Switching loss per die (linear E_sw(I))', `${I('P')}<sub>sw</sub> = ${I('f')}<sub>sw</sub>${I('E')}<sub>sw,ref</sub>${fr(`${I('V')}<sub>dc</sub>`, `${I('V')}<sub>ref</sub>`)}${fr(`${sq('2')}${I('I')}<sub>rms</sub>`, `π${I('N<sub>p</sub>')}${I('I')}<sub>ref</sub>`)}`, `P_sw = ${fmt(L.Psw, 2)} W → total ${fmt(L.Ptot, 0)} W`]] });
  let html = G.map((grp, gi) => `<div class="eqgrp"><h2>${grp.h}</h2>${grp.e.map((e, i) => `<div class="eq"><div class="id">E${gi + 1}.${i + 1}</div><div class="nm">${e[0]}</div><div class="fx">${e[1]}</div><div class="val">${e[2]}</div></div>`).join('')}</div>`).join('');
  html += `<div class="eqgrp notes"><h2>Assumptions and validity</h2><ul>
    <li>Losses x, y are inputs, independent of T<sub>j</sub>; use the loss estimator with R<sub>ds,on</sub> at the expected junction temperature.</li>
    <li>Plate fins: laminar developing correlations with a Gnielinski turbulent branch; Teertstra is shown as an independent laminar cross-check.</li>
    <li>Pin fins: Žukauskas tube-bank heat transfer (bulk-referenced) and Khan–Culham–Yovanovich friction; validity 10 &lt; Re<sub>D</sub> &lt; 2·10⁵.</li>
    <li>Fan curves are analytic class approximations; the stall saddle of axial fans is not modelled. Replace Q<sub>max</sub>, Δp<sub>max</sub> and n with a fit to the datasheet curve.</li>
    <li>The flow-distribution weight w(y) and the impingement factor are empirical engineering estimates: calibrate with CFD or a pressure/velocity traverse.</li>
    <li>Thermal map: 2-D thickness-averaged base with uniform h″ modulated by w(y); developing-flow enhancement near the inlet is averaged, not resolved.</li>
    <li>Transient: datasheet Z<sub>jc</sub> Foster in series with an exact Foster equivalent of the case-to-air Cauer ladder (standard approximation; slightly optimistic below ~10 ms where the package and TIM interact).</li>
    <li>Fan failure assumes all fans stop, fins vertical, no blockage by stalled fans; radiation from the outer envelope only.</li>
    <li>Air properties at mean bulk temperature; mass flow from density at the fan (pull fans handle hot, thinner air).</li>
    <li>QDPAK package 15 × 21 × 2.3 mm, top exposed drain pad (electrically live): the TIM stack must insulate. Pad size default 16 × 12 mm — confirm on the package drawing.</li>
    <li>Infineon's Q-DPAK guidance lists three assemblies: A gap filler only, B gap pad (both need guaranteed minimum thickness for isolation), C gap filler + isolation foil or ceramic plate, presented as guaranteed isolation and highest safety for 800 V systems. Typical TIM conductivity 5–8 W/m·K; with five Q-DPAKs the highest-to-lowest height difference was kept below 300 µm; about 100 N per package; package standoff 0…150 µm and drawing tolerance ±50 µm.</li>
    <li>The ultrasoft gap pad or dispensed filler must fill the mould-compound groove that provides the package creepage (&gt; 4.75 mm).</li>
    <li>Dielectric strengths in the presets are short-term class values at sea level; use the supplier's rated withstand and partial-discharge data at minimum operating pressure.</li></ul></div>
    <div class="eqgrp notes"><h2>References</h2><ul>
    <li>Teertstra, Yovanovich, Culham — Analytical forced convection modeling of plate-fin heat sinks, SEMI-THERM 1999.</li>
    <li>Muzychka, Yovanovich — Modeling friction factors in non-circular ducts for developing laminar flow, AIAA 1998.</li>
    <li>Shah, London — Laminar Flow Forced Convection in Ducts, 1978 (fRe, Stephan correlation).</li>
    <li>Gnielinski — New equations for heat and mass transfer in turbulent pipe and channel flow, 1976.</li>
    <li>Žukauskas — Heat transfer from tubes in crossflow, Adv. Heat Transfer 8, 1972.</li>
    <li>Khan, Culham, Yovanovich — Optimization of pin-fin heat sinks using entropy generation minimization, IEEE Trans. CPT 28(2), 2005.</li>
    <li>Lee, Song, Au, Moran — Constriction/spreading resistance model for electronics packaging, ASME/JSME 1995.</li>
    <li>Bar-Cohen, Rohsenow — Thermally optimum spacing of vertical natural-convection-cooled parallel plates, J. Heat Transfer 106, 1984.</li>
    <li>Kays, London — Compact Heat Exchangers (entrance/exit loss coefficients).</li></ul></div>`;
  $('#eqHost').innerHTML = html;
}

/* ---------------- copy / load / reset ---------------- */
function copyText(txt, what) {
  const fallback = () => openModal(what, txt, false);
  try { navigator.clipboard.writeText(txt).then(() => toast(what + ' copied'), fallback); } catch (e) { fallback(); }
}
function openModal(title, text, apply) {
  $('#modalTitle').textContent = title; $('#modalText').value = text;
  $('#modalHint').textContent = apply ? 'Paste a configuration JSON and press Apply.' : 'Select all and copy.';
  $('#modalApply').hidden = !apply; $('#modal').classList.add('open'); $('#modalText').focus(); if (!apply) $('#modalText').select();
}
function summaryMD() {
  const c = cfg, r = R; if (!r || r.invalid) return 'Invalid geometry';
  const g = r.g, T = r.trans, op = r.op;
  return [`# QDPAK heatsink study — r2 summary`, ``,
    `**Load** x = ${c.Px} W continuous, y = ${c.Py} W for ${c.tp} s · ${2 * c.nLegs} switches × ${c.nPar}∥ = ${r.Ndev} QDPAK · ${c.Vdc} V · δ = ${c.imb} % · ${c.Tamb} °C at ${c.alt} m · limit ${c.Tlim} °C`,
    `**Heatsink** ${g.type === 'plate' ? `plate fins N = ${g.N}, t_f = ${c.tf} mm, s = ${fmt(g.s * 1e3, 2)} mm` : `${g.stag ? 'staggered' : 'in-line'} pins D = ${c.pinD} mm, S_T = ${c.pinST}, S_L = ${c.pinSL} mm (${g.Np} pins)`}, L × W = ${c.L} × ${c.W} mm, base ${c.tb} mm, H = ${c.H} mm · ${g.mb.name}/${g.mf.name} · ${fmt(g.mass * 1e3, 0)} g`,
    `**TIM** option ${c.timMode}: gap ${fmt(r.tim.tEval * 1e3, 2)} mm @ ${c.timK} W/m·K${r.tim.iso ? ` + ${c.isoPreset} (${c.isoT} mm @ ${c.isoK} W/m·K)` : ''} → ${fmt(r.stack.Rtim, 3)} K/W · withstand ${fmt(r.tim.Vbd, 2)} kV (need ${c.Vreq}) · ${fmt(r.tim.Cdev * 1e12, 0)} pF/die · i_cm ${fmt(r.tim.icmPhase, 1)} A/phase`,
    `**Air** ${c.fanMode}${op ? `, ${c.fanN} × ${c.fanPreset} @ ${c.fanSpeed} % → ${fmt(op.Qfan / CFM, 1)} CFM, ${fmt(op.dpFan, 0)} Pa, fans ${fmt(r.fanPel, 1)} W` : ''}`, ``,
    `| Result | Value |`, `|---|---|`,
    `| R_sa (to inlet air) | ${fmt(r.Rsa * 1e3, 1)} mK/W (need ≤ ${fmt(r.RsaReqX * 1e3, 0)}) |`,
    `| T_j hottest, steady x | ${fmt(r.TjHot, 1)} °C (${r.hot.id}) |`,
    `| T_j peak, y for ${c.tp} s | ${fmt(T.TpeakY, 1)} °C |`,
    `| Allowed time at y | ${tfmt(T.tAllow)} |`,
    `| Allowed y for ${c.tp} s | ${fmt(T.yAllow, 0)} W |`,
    `| Fan failure to ${c.Tlim} °C | ${r.fail ? tfmt(r.fail.tFail) : 'n/a'} |`, ``,
    ...(r.warn.length ? ['**Checks**', ...r.warn.map(w => `- ${w.lvl.toUpperCase()}: ${w.msg}`)] : ['All checks pass.'])].join('\n');
}

/* ---------------- init ---------------- */
function init() {
  buildForm(); syncForm();
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { if (location.hash !== '#' + b.dataset.v) location.hash = b.dataset.v; else showView(b.dataset.v); }));
  window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
  $('#swK').addEventListener('change', () => { setSweepRange(); runSweep(); });
  $('#swRun').addEventListener('click', runSweep);
  $('#btnSummary').addEventListener('click', () => copyText(summaryMD(), 'Summary'));
  $('#btnCfg').addEventListener('click', () => copyText(JSON.stringify(cfg, null, 1), 'Config'));
  $('#btnLoad').addEventListener('click', () => openModal('Load configuration', '', true));
  $('#btnReset').addEventListener('click', () => { cfg = Object.assign({}, DEF); syncForm(); recompute(); toast('Defaults restored'); });
  $('#modalClose').addEventListener('click', () => $('#modal').classList.remove('open'));
  $('#modalCopy').addEventListener('click', () => { const t = $('#modalText'); t.select(); try { navigator.clipboard.writeText(t.value).then(() => toast('Copied')); } catch (e) { /* manual copy */ } });
  $('#modalApply').addEventListener('click', () => { try { const o = JSON.parse($('#modalText').value); cfg = Object.assign({}, DEF, normalize(o)); syncForm(); recompute(); $('#modal').classList.remove('open'); toast('Configuration loaded'); } catch (e) { $('#modalHint').textContent = 'Not valid JSON: ' + e.message; } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#modal').classList.remove('open'); });
  let rt = null; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(renderView, 150); });
  const mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', renderView);
  new MutationObserver(renderView).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  sweepOptions(); setSweepRange();
  recompute();
  showView(location.hash ? location.hash.slice(1) : 'map');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
