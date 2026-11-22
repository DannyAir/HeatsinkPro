/* ==========================================================================
   QDPAK inverter heatsink study — physics engine  (rev r2)
   All internal units SI. cfg uses engineering units (mm, W, degC, CFM, Pa).
   ========================================================================== */
(function (root) {
'use strict';
const SIGMA = 5.670374419e-8, G0 = 9.80665, RHO_REF = 1.2041, CFM = 4.719474e-4;

/* ---------------- property libraries ---------------- */
const MATERIALS = {
  'Al 6063-T5':            { k: 209,  rho: 2700, cp: 900 },
  'Al 6061-T6':            { k: 167,  rho: 2700, cp: 896 },
  'Al 1050A':              { k: 229,  rho: 2705, cp: 900 },
  'Al 6082-T6':            { k: 180,  rho: 2700, cp: 894 },
  'Al A380 die-cast':      { k: 96,   rho: 2710, cp: 963 },
  'Al ADC12 die-cast':     { k: 96,   rho: 2700, cp: 963 },
  'Cu C110 (ETP)':         { k: 388,  rho: 8940, cp: 385 },
  'Cu C101 (OFHC)':        { k: 391,  rho: 8940, cp: 385 },
  'AlSiC-9':               { k: 200,  rho: 3010, cp: 741 },
  'Mg AZ31B':              { k: 96,   rho: 1770, cp: 1000 },
  'Vapor chamber (k_eff)': { k: 5000, rho: 5500, cp: 385, baseOnly: true },
  'Custom':                null
};
/* Gap materials (compliant layer that absorbs height tolerance). Class values — confirm on the supplier datasheet.
   E = dielectric strength credited for isolation (kV/mm, 0 = not credited), er = relative permittivity. */
const TIMS = {
  'Gap filler 6 W/m·K, insulating':        { k: 6,   E: 5, er: 6.0 },
  'Gap filler 8 W/m·K, insulating':        { k: 8,   E: 4, er: 7.0 },
  'Gap filler 3 W/m·K, insulating':        { k: 3,   E: 6, er: 5.5 },
  'Ultrasoft gap pad 5 W/m·K, insulating': { k: 5,   E: 8, er: 6.0 },
  'Gap pad 8 W/m·K, insulating':           { k: 8,   E: 6, er: 7.0 },
  'Thermal grease 3 W/m·K (not credited)': { k: 3,   E: 0, er: 4.0 },
  'Custom':                                null
};
/* Guaranteed isolation layer for option C (foil or ceramic plate). Typical values — confirm with supplier. */
const ISOS = {
  'Al₂O₃ 96 % plate 0.38 mm':          { k: 24,   t: 0.38, E: 15,  er: 9.8 },
  'AlN plate 0.38 mm':                  { k: 170,  t: 0.38, E: 15,  er: 8.8 },
  'Si₃N₄ plate 0.32 mm':                { k: 90,   t: 0.32, E: 20,  er: 8.0 },
  'Polyimide-based thermal film 0.15 mm': { k: 1.3, t: 0.15, E: 40, er: 3.7 },
  'Polyimide foil (MT type) 0.05 mm':   { k: 0.46, t: 0.05, E: 150, er: 4.2 },
  'Custom':                             null
};
/* IEC 60664-1 Table A.2 altitude correction factors for clearances (verify against the standard edition in use) */
const ALT_K = [[2000, 1.00], [3000, 1.14], [4000, 1.29], [5000, 1.48], [6000, 1.70], [7000, 1.95], [8000, 2.25], [9000, 2.62], [10000, 3.02]];
function altFactor(h) {
  if (h <= 2000) return 1;
  for (let i = 1; i < ALT_K.length; i++) if (h <= ALT_K[i][0]) { const a = ALT_K[i - 1], b = ALT_K[i]; return a[1] + (b[1] - a[1]) * (h - a[0]) / (b[0] - a[0]); }
  return ALT_K[ALT_K.length - 1][1];
}
/* Thermal + electrical model of the TIM / isolation stack (per device pad)
   A: insulating gap filler only · B: insulating gap pad · C: gap filler + isolation foil/ceramic (Infineon option C) */
function timStack(cfg, Apad) {
  const mode = cfg.timMode || 'A', iso = mode === 'C';
  const tmin = Math.max(cfg.timTmin, 0) / 1e3, dh = Math.max(cfg.timDh, 0) / 1e3;
  const tEval = tmin + (cfg.timCase === 'nominal' ? dh / 2 : dh), tMax = tmin + dh;
  const tIso = iso ? cfg.isoT / 1e3 : 0;
  const Rgap = tEval / cfg.timK, Riso = iso ? tIso / cfg.isoK : 0, Rc = cfg.timRc * 1e-6;
  const Rpp = Rgap + Riso + Rc;
  // withstand: only layers credited for isolation, at their thinnest point
  const Vgap = Math.max(cfg.timE, 0) * tmin * 1e3, Viso = iso ? Math.max(cfg.isoE, 0) * tIso * 1e3 : 0; // kV
  const Vbd = Vgap + Viso, tIns = (cfg.timE > 0 ? tmin : 0) + tIso;
  const tReq = (!iso && cfg.timE > 0) ? cfg.Vreq / cfg.timE : NaN;      // mm of gap material needed
  const Ework = tIns > 0 ? (cfg.Vdc / 1e3) / (tIns * 1e3) : Infinity; // kV/mm at DC-link voltage
  // drain-to-heatsink capacitance at the thinnest bond line (worst for CM current)
  const EPS0 = 8.854e-12, sumT = (tmin > 0 ? tmin / cfg.timEr : 0) + (iso ? tIso / cfg.isoEr : 0);
  const Cdev = sumT > 0 ? EPS0 * Apad / sumT : Infinity;
  return { mode, iso, tmin, dh, tEval, tMax, tIso, Rgap, Riso, Rc, Rpp, R: Rpp / Apad, Vgap, Viso, Vbd, tIns, tReq, Ework, Cdev,
    Rparts: { gap: Rgap / Apad, iso: Riso / Apad, c: Rc / Apad } };
}
/* generic class values — replace with the fan datasheet curve */
const FANS = {
  '40×40×28 high-speed axial':  { D: 40,  Qmax: 23,  Pmax: 900,  n: 1.3, Pel: 12 },
  '60×60×38 high-perf axial':   { D: 60,  Qmax: 64,  Pmax: 700,  n: 1.3, Pel: 18 },
  '80×80×38 high-perf axial':   { D: 80,  Qmax: 119, Pmax: 600,  n: 1.3, Pel: 24 },
  '92×92×38 high-perf axial':   { D: 92,  Qmax: 159, Pmax: 550,  n: 1.3, Pel: 26 },
  '120×120×38 high-perf axial': { D: 120, Qmax: 275, Pmax: 450,  n: 1.3, Pel: 30 },
  '120×120×25 standard axial':  { D: 120, Qmax: 117, Pmax: 90,   n: 1.2, Pel: 3 },
  '97×94×33 centrifugal blower':{ D: 97,  Qmax: 30,  Pmax: 1100, n: 2.0, Pel: 15 },
  'Custom':                     null
};

/* ---------------- helpers ---------------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtN = (v, d) => isFinite(v) ? v.toFixed(d) : '—';
function bisect(fn, lo, hi, it = 64) { // fn(lo) and fn(hi) opposite sign; returns root
  let flo = fn(lo);
  for (let i = 0; i < it; i++) {
    const m = 0.5 * (lo + hi), fm = fn(m);
    if ((fm > 0) === (flo > 0)) { lo = m; flo = fm; } else hi = m;
  }
  return 0.5 * (lo + hi);
}

/* ---------------- air ---------------- */
function air(Tc, alt) {
  const T = Tc + 273.15;
  const p = 101325 * Math.pow(Math.max(1 - 2.25577e-5 * alt, 0.05), 5.25588);
  const rho = p / (287.05 * T);
  const mu = 1.716e-5 * Math.pow(T / 273.15, 1.5) * (273.15 + 110.4) / (T + 110.4);
  const k = 0.0241 * Math.pow(T / 273.15, 1.5) * (273.15 + 194) / (T + 194);
  const cp = 1002.5 + 275e-6 * Math.pow(T - 200, 2);
  return { Tc, T, p, rho, mu, k, cp, Pr: mu * cp / k, nu: mu / rho, alpha: k / (rho * cp), beta: 1 / T };
}

/* ---------------- geometry ---------------- */
function mat(cfg, w) {
  const name = cfg['mat' + w];
  const m = MATERIALS[name];
  if (!m) return { name: 'Custom', k: +cfg['k' + w], rho: +cfg['rho' + w], cp: +cfg['cp' + w] };
  return Object.assign({ name }, m);
}
function geometry(cfg) {
  const g = { type: cfg.hsType, L: cfg.L / 1e3, W: cfg.W / 1e3, tb: cfg.tb / 1e3, H: cfg.H / 1e3, valid: true, why: '' };
  g.mb = mat(cfg, 'B'); g.mf = mat(cfg, 'F');
  g.Vbase = g.L * g.W * g.tb;
  if (g.type === 'plate') {
    g.tf = cfg.tf / 1e3;
    g.N = cfg.finBy === 'gap' ? Math.max(2, Math.floor((g.W + cfg.finGap / 1e3) / (g.tf + cfg.finGap / 1e3) + 1e-9)) : Math.max(2, Math.round(cfg.N));
    g.s = (g.W - g.N * g.tf) / (g.N - 1); g.nch = g.N - 1;
    if (!(g.s > 1e-5)) { g.valid = false; g.why = 'Fins do not fit: N·t_f ≥ W'; g.s = 1e-5; }
    g.Afin = g.N * (2 * g.H * g.L + g.tf * g.L + 2 * g.H * g.tf);
    g.Abase = Math.max(g.L * g.W - g.N * g.tf * g.L, 0);
    g.Vfin = g.N * g.tf * g.H * g.L;
    g.Aflow = g.nch * g.s * g.H; g.sigma = g.Aflow / (g.W * g.H);
    g.aspect = g.H / g.s;
    g.gap = g.s;
  } else {
    const D = cfg.pinD / 1e3, ST = cfg.pinST / 1e3, SL = cfg.pinSL / 1e3;
    Object.assign(g, { D, ST, SL, stag: g.type === 'pinSt' });
    g.SD = Math.sqrt(SL * SL + ST * ST / 4);
    if (!(ST > D)) { g.valid = false; g.why = 'Transverse pitch S_T must exceed D'; }
    if (!g.stag && !(SL > D)) { g.valid = false; g.why = 'Longitudinal pitch S_L must exceed D'; }
    if (g.stag && !(g.SD > D)) { g.valid = false; g.why = 'Diagonal pitch S_D must exceed D'; }
    g.NL = Math.max(1, Math.floor((g.L - D) / SL + 1e-9) + 1);
    g.NT = Math.max(1, Math.floor((g.W - D) / ST + 1e-9) + 1);
    g.NT2 = g.stag ? Math.max(0, Math.floor((g.W - D - ST / 2) / ST + 1e-9) + 1) : g.NT;
    g.Np = g.stag ? Math.ceil(g.NL / 2) * g.NT + Math.floor(g.NL / 2) * g.NT2 : g.NL * g.NT;
    const Ac = Math.PI * D * D / 4;
    g.Afin = g.Np * (Math.PI * D * g.H + Ac);
    g.Abase = Math.max(g.L * g.W - g.Np * Ac, 0);
    g.Vfin = g.Np * Ac * g.H;
    g.sigma = Math.max((ST - D) / ST, 1e-3); g.Aflow = g.W * g.H * g.sigma;
    g.gap = Math.max(ST - D, 1e-5); g.aspect = g.H / D;
  }
  g.At = g.Afin + g.Abase;
  g.mass = g.mb.rho * g.Vbase + g.mf.rho * g.Vfin;
  g.Chs = g.mb.rho * g.mb.cp * g.Vbase + g.mf.rho * g.mf.cp * g.Vfin;
  return g;
}

/* ---------------- fin-array core: pressure drop + heat transfer ---------------- */
function fanningTurb(Re) { return 0.25 * Math.pow(0.790 * Math.log(Re) - 1.64, -2); }
const C2_IN = [[1, .70], [2, .80], [3, .86], [4, .90], [5, .92], [7, .95], [10, .97], [13, .98], [16, .99], [20, 1]];
const C2_ST = [[1, .64], [2, .76], [3, .84], [4, .89], [5, .92], [7, .95], [10, .97], [13, .98], [16, .99], [20, 1]];
function interpTab(t, x) {
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (x <= t[i][0]) {
    const a = t[i - 1], b = t[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
  }
  return 1;
}
function core(g, Q, Ls, A) {
  const r = { Q, Ls, dp: 0, dpC: 0, dpF: 0, dpE: 0, V: 0, Re: 0, f: 0, Kc: 0, Ke: 0, h: 0, Nu: 0, regime: '—', mexp: 0.5 };
  const Qp = Math.max(Q, 1e-12);
  if (g.type === 'plate') {
    const s = g.s, H = g.H, V = Qp / (g.nch * s * H), Dh = 2 * s * H / (s + H);
    const Re = V * Dh / A.nu, lam = Math.min(s, H) / Math.max(s, H);
    const fRe = 24 * (1 - 1.3553 * lam + 1.9467 * lam ** 2 - 1.7012 * lam ** 3 + 0.9564 * lam ** 4 - 0.2537 * lam ** 5);
    const Lst = Ls / (Dh * Re);
    let f = Math.sqrt((3.44 / Math.sqrt(Lst)) ** 2 + fRe * fRe) / Re, regime = 'laminar';
    if (Re > 2300) { const ft = fanningTurb(Re); if (ft > f) f = ft; regime = Re < 4000 ? 'transitional' : 'turbulent'; }
    const Kc = 0.42 * (1 - g.sigma ** 2), Ke = (1 - g.sigma ** 2) ** 2, qd = 0.5 * A.rho * V * V;
    // heat transfer — Stephan (simultaneously developing, parallel plates, bulk-referenced)
    const Dhp = 2 * s, Rep = V * Dhp / A.nu, xs = Ls / (Dhp * Rep * A.Pr);
    let Nu = 7.55 + 0.024 * Math.pow(xs, -1.14) / (1 + 0.0358 * Math.pow(A.Pr, 0.17) * Math.pow(xs, -0.64));
    let h = Nu * A.k / Dhp, mexp = 0.5, corr = 'Stephan (laminar developing)';
    if (Re > 2300) {
      const fd = Math.pow(0.790 * Math.log(Re) - 1.64, -2);
      const NuG = (fd / 8) * (Re - 1000) * A.Pr / (1 + 12.7 * Math.sqrt(fd / 8) * (Math.pow(A.Pr, 2 / 3) - 1)) * (1 + Math.pow(Dh / Ls, 2 / 3));
      const hG = NuG * A.k / Dh; if (hG > h) { h = hG; Nu = NuG; mexp = 0.8; corr = 'Gnielinski (turbulent)'; }
    }
    // Teertstra composite (inlet-referenced) — cross-check only
    const Reb = V * s / A.nu, Rebs = Reb * s / Ls;
    const NuT = Math.pow(Math.pow(Rebs * A.Pr / 2, -3) + Math.pow(0.664 * Math.sqrt(Rebs) * Math.pow(A.Pr, 1 / 3) * Math.sqrt(1 + 3.65 / Math.sqrt(Rebs)), -3), -1 / 3);
    Object.assign(r, { V, Dh, Re, f, fRe, Lst, Kc, Ke, regime, h, Nu, mexp, corr, xs, Rep, Reb, Rebs, NuT, hT: NuT * A.k / s,
      dpC: Kc * qd, dpF: 4 * f * Ls / Dh * qd, dpE: Ke * qd });
  } else {
    const D = g.D, ST = g.ST, SL = g.SL, Vapp = Qp / (g.W * g.H);
    let Vmax;
    if (g.stag && 2 * (g.SD - D) < (ST - D)) Vmax = Vapp * ST / (2 * (g.SD - D)); else Vmax = Vapp * ST / (ST - D);
    const Re = Vmax * D / A.nu, NLs = Math.max(1, Math.round(g.NL * Ls / g.L));
    let C, m;
    if (Re < 100) { C = g.stag ? 0.90 : 0.80; m = 0.40; }
    else if (Re < 1000) { C = 0.51; m = 0.50; }
    else if (g.stag) { const r_ = ST / SL; C = r_ < 2 ? 0.35 * Math.pow(r_, 0.2) : 0.40; m = 0.60; }
    else { C = 0.27; m = 0.63; }
    const C2 = interpTab(g.stag ? C2_ST : C2_IN, NLs);
    const Nu = C2 * C * Math.pow(Re, m) * Math.pow(A.Pr, 0.36);
    const h = Nu * A.k / D;
    const St = ST / D, Sl = SL / D;
    let f, K1;
    if (!g.stag) { K1 = 1.009 * Math.pow((St - 1) / (Sl - 1), 1.09 / Math.pow(Re, 0.0553)); f = K1 * (0.233 + 45.78 / (Math.pow(St - 1, 1.1) * Re)); }
    else { K1 = 1.175 * (Sl / (St * Math.pow(Re, 0.3124))) + 0.5 * Math.pow(Re, 0.0807); f = K1 * (378.6 / Math.pow(St, 13.1 / St)) / Math.pow(Re, 0.68 / Math.pow(St, 1.29)); }
    const sg = (ST - D) / ST;
    const Kc = Math.max(0, -0.0311 * sg * sg - 0.3722 * sg + 1.0676), Ke = Math.max(0, 0.9301 * sg * sg - 2.5746 * sg + 0.973);
    const qd = 0.5 * A.rho * Vmax * Vmax;
    Object.assign(r, { V: Vmax, Vapp, Re, f, K1, Kc, Ke, h, Nu, C, m, C2, NLs, mexp: m, regime: Re < 1000 ? 'laminar-ish (tube bank)' : 'tube-bank turbulent',
      corr: 'Žukauskas tube bank', dpC: Kc * qd, dpF: f * NLs * qd, dpE: Ke * qd });
  }
  r.dp = r.dpC + r.dpF + r.dpE;
  return r;
}

/* bypass gap (tip + side clearances) treated as a parallel duct */
function bypassDP(g, Qb, Ls, A, ct, cs) {
  const Ab = g.W * ct + 2 * cs * (g.H + ct);
  if (Ab <= 1e-9) return { dp: Qb > 0 ? 1e15 * Qb : 0, Ab: 0, V: 0, Re: 0 };
  const Per = (ct > 0 ? 2 * g.W : 0) + (cs > 0 ? 4 * (g.H + ct) : 0);
  const Dh = 4 * Ab / Per, V = Math.max(Qb, 1e-12) / Ab, Re = V * Dh / A.nu;
  let f = Math.sqrt((3.44 / Math.sqrt(Ls / (Dh * Re))) ** 2 + 576) / Re;
  if (Re > 2300) f = Math.max(f, fanningTurb(Re));
  const sb = Ab / (Ab + g.W * g.H), Kc = 0.42 * (1 - sb * sb), Ke = (1 - sb * sb) ** 2;
  return { dp: (Kc + Ke + 4 * f * Ls / Dh) * 0.5 * A.rho * V * V, Ab, Dh, V, Re, f };
}

/* ---------------- fan and system ---------------- */
function fanDP(cfg, Af, Q) {
  const s = cfg.fanSpeed / 100, dr = Af.rho / RHO_REF;
  const Qm = cfg.fanQmax * CFM * s * cfg.fanN;
  if (Qm <= 0) return -1e9;
  const one = dr * s * s * cfg.fanPmax * (1 - Math.pow(Math.max(Q, 0) / Qm, cfg.fanShape));
  return cfg.fanMode === 'pushpull' ? 2 * one : one;
}
function fanQfree(cfg) { return cfg.fanQmax * CFM * (cfg.fanSpeed / 100) * cfg.fanN; }

function ductArea(cfg, g) {
  if (cfg.fanMode === 'impinge') return cfg.fanN * Math.PI / 4 * Math.pow(cfg.fanD / 1e3, 2);
  const ct = cfg.shroud ? 0 : cfg.cTip / 1e3, cs = cfg.shroud ? 0 : cfg.cSide / 1e3;
  return g.W * (g.H + ct) + 2 * cs * (g.H + ct);
}

/* returns flow split & sections for a given volumetric flow (at mean-air density) */
function systemAt(cfg, g, A, Qm) {
  const Kturn = 1.0;
  let secs, dpCore, Qh = Qm, Qb = 0, bp = null;
  if (cfg.fanMode === 'impinge') {
    const xf = clamp(cfg.fanX / 1e3, 0.1 * g.L, 0.9 * g.L), L1 = xf, L2 = g.L - xf;
    const dpS = (q, Ls) => { const c = core(g, q, Ls, A); return c.dp + Kturn * 0.5 * A.rho * c.V * c.V; };
    let Q1 = Qm * L2 / g.L; // initial guess
    if (Qm > 0) Q1 = bisect(q1 => dpS(q1, L1) - dpS(Qm - q1, L2), 0, Qm, 60);
    const c1 = core(g, Q1, L1, A), c2 = core(g, Qm - Q1, L2, A);
    dpCore = dpS(Q1, L1);
    secs = [{ x0: 0, x1: xf, dir: -1, Q: Q1, Ls: L1, c: c1 }, { x0: xf, x1: g.L, dir: 1, Q: Qm - Q1, Ls: L2, c: c2 }];
  } else {
    const ct = cfg.shroud ? 0 : cfg.cTip / 1e3, cs = cfg.shroud ? 0 : cfg.cSide / 1e3;
    if (ct > 0 || cs > 0) {
      Qh = Qm > 0 ? bisect(q => core(g, q, g.L, A).dp - bypassDP(g, Qm - q, g.L, A, ct, cs).dp, 0, Qm, 60) : 0;
      Qb = Qm - Qh; bp = bypassDP(g, Qb, g.L, A, ct, cs);
    }
    const c = core(g, Qh, g.L, A);
    dpCore = c.dp;
    secs = [{ x0: 0, x1: g.L, dir: 1, Q: Qh, Ls: g.L, c }];
  }
  const Ad = ductArea(cfg, g), Vd = Qm / Ad, dpSys = cfg.Ksys * 0.5 * A.rho * Vd * Vd;
  return { Q: Qm, Qh, Qb, bp, secs, dpCore, dpSys, dp: dpCore + dpSys, Ad, Vd };
}

function operatingPoint(cfg, g, Af, Am) {
  const rr = Af.rho / Am.rho; // volumetric flow at fan -> at mean air
  const Qf = fanQfree(cfg);
  const fn = Q => fanDP(cfg, Af, Q) - systemAt(cfg, g, Am, Q * rr).dp;
  const Q = Qf > 0 ? bisect(fn, 0, Qf, 70) : 0;
  const sys = systemAt(cfg, g, Am, Q * rr);
  sys.Qfan = Q; sys.dpFan = fanDP(cfg, Af, Q); sys.Qfree = Qf; sys.rr = rr;
  sys.fanFrac = Qf > 0 ? Q / Qf : 0;
  return sys;
}

/* ---------------- fin efficiency & section heat transfer ---------------- */
function finEff(g, h) {
  const kf = g.mf.k;
  let m, Hc;
  if (g.type === 'plate') { m = Math.sqrt(2 * h / (kf * g.tf)); Hc = g.H + g.tf / 2; }
  else { m = Math.sqrt(4 * h / (kf * g.D)); Hc = g.H + g.D / 4; }
  const x = m * Hc, eta = x > 1e-9 ? Math.tanh(x) / x : 1;
  const eta0 = 1 - (g.Afin / g.At) * (1 - eta);
  return { m, Hc, eta, eta0 };
}
function heatTransfer(cfg, g, Am, op) {
  const enh = cfg.fanMode === 'impinge' ? cfg.impEnh : 1;
  let G = 0, Gconv = 0, mdot = 0;
  const secs = op.secs.map(s => {
    const h = s.c.h * enh, fe = finEff(g, h), At = g.At * s.Ls / g.L, md = Am.rho * s.Q;
    const UA = fe.eta0 * h * At, NTU = md > 0 ? UA / (md * Am.cp) : 0, eps = 1 - Math.exp(-NTU);
    const Gs = md * Am.cp * eps;
    G += Gs; Gconv += UA; mdot += md;
    return Object.assign({}, s, { h, fe, At, md, UA, NTU, eps, G: Gs, hEff: UA / (g.W * s.Ls) });
  });
  const mdTot = Am.rho * op.Q; // includes bypass
  return { secs, G, Gconv, Rsa: G > 0 ? 1 / G : Infinity, Rconv: Gconv > 0 ? 1 / Gconv : Infinity, mdotHs: mdot, mdotTot: mdTot,
    h: secs.reduce((a, s) => a + s.h * s.At, 0) / g.At, eta0: secs.reduce((a, s) => a + s.fe.eta0 * s.At, 0) / g.At,
    eta: secs.reduce((a, s) => a + s.fe.eta * s.At, 0) / g.At, NTU: secs.reduce((a, s) => a + s.NTU * s.md, 0) / Math.max(mdot, 1e-12),
    eps: secs.reduce((a, s) => a + s.eps * s.md, 0) / Math.max(mdot, 1e-12) };
}

/* ---------------- natural convection + radiation (fan-off / passive) ---------------- */
function natural(cfg, g, Ta, P) {
  const s = g.gap, Lv = g.L, alt = cfg.alt;
  const Aenv = g.L * g.W + 2 * g.L * (g.H + g.tb) + 2 * g.W * (g.H + g.tb);
  let dT = 30, out = null;
  for (let i = 0; i < 80; i++) {
    const A = air(Ta + dT / 2, alt);
    const Ra = G0 * A.beta * Math.max(dT, 0.01) * s ** 3 / (A.nu * A.alpha), El = Ra * s / Lv;
    const Nu = Math.pow(576 / (El * El) + 2.873 / Math.sqrt(El), -0.5), h = Nu * A.k / s;
    const fe = finEff(g, h), Gc = fe.eta0 * h * g.At;
    const Ts = Ta + dT + 273.15, Tk = Ta + 273.15;
    const hr = cfg.emis * SIGMA * (Ts * Ts + Tk * Tk) * (Ts + Tk), Gr = hr * Aenv;
    const dTn = P / (Gc + Gr);
    out = { A, Ra, El, Nu, h, fe, Gc, hr, Gr, Aenv, R: 1 / (Gc + Gr), dT: dTn };
    if (Math.abs(dTn - dT) < 1e-4) break;
    dT = 0.5 * dT + 0.5 * dTn;
  }
  return out;
}

/* ---------------- spreading resistance (Lee, Song, Au & Moran 1995) ---------------- */
function leeSpreading(Apad, Acell, tb, k, hEff) {
  const a = Math.sqrt(Apad / Math.PI), b = Math.sqrt(Acell / Math.PI);
  const eps = Math.min(a / b, 0.999), tau = tb / b, Bi = Math.max(hEff * b / k, 1e-9);
  const lc = Math.PI + 1 / (Math.sqrt(Math.PI) * eps);
  const th = Math.tanh(lc * tau);
  const Phi = (th + lc / Bi) / (1 + (lc / Bi) * th);
  const psiAvg = eps * tau / Math.sqrt(Math.PI) + 0.5 * Math.pow(1 - eps, 1.5) * Phi;
  const psiMax = eps * tau / Math.sqrt(Math.PI) + (1 - eps) * Phi / Math.sqrt(Math.PI);
  const den = k * a * Math.sqrt(Math.PI);
  // psi above includes the 1-D term eps*tau/sqrt(pi); split it out for the breakdown
  const R1Dpart = eps * tau / Math.sqrt(Math.PI) / den;
  return { a, b, eps, tau, Bi, lc, Phi, psiAvg, psiMax, RspAvg: psiAvg / den - R1Dpart, RspMax: psiMax / den - R1Dpart, R1D: tb / (k * Acell) };
}

/* ---------------- device layout ---------------- */
/* N_par paralleled dies per switch position; 2·n_legs positions.
   Layouts — posRows: each switch position is a row of N_par along the airflow (rows stacked across W)
             posCols: each switch position is a row of N_par across the airflow (positions in series along L)
             along  : each leg (HS then LS, 2·N_par) is one row along the airflow
             across : each leg is one row across the airflow                                         */
function nParOf(cfg) { return Math.max(1, Math.round(cfg.nPar != null ? cfg.nPar : (cfg.perLeg || 2) / 2)); }
function devices(cfg, g) {
  const nL = Math.max(1, Math.round(cfg.nLegs)), Npar = nParOf(cfg), lay = cfg.layout || 'posRows';
  const pos = lay === 'posRows' || lay === 'posCols', rowAlongFlow = lay === 'along' || lay === 'posRows';
  const perRow = pos ? Npar : 2 * Npar, nRows = pos ? 2 * nL : nL;
  let ax = cfg.padL / 1e3, ay = cfg.padW / 1e3, px = cfg.pkgL / 1e3, py = cfg.pkgW / 1e3;
  if (!rowAlongFlow) { [ax, ay] = [ay, ax]; [px, py] = [py, px]; }   // long side follows the row
  if (cfg.rotate) { [ax, ay] = [ay, ax]; [px, py] = [py, px]; }
  const cx = g.L / 2 + cfg.offX / 1e3, cy = g.W / 2 + cfg.offY / 1e3, list = [];
  const d = cfg.imb / 100, gapLeg = pos ? (cfg.legGap || 0) / 1e3 : 0;
  const offs = []; for (let i = 0; i < nRows; i++) offs.push(i * cfg.pitchLeg / 1e3 + (pos ? Math.floor(i / 2) : i) * gapLeg);
  const mid = (offs[0] + offs[nRows - 1]) / 2;
  for (let i = 0; i < nRows; i++) for (let k = 0; k < perRow; k++) {
    const a = offs[i] - mid, b = (k - (perRow - 1) / 2) * cfg.pitchDev / 1e3;
    const x = rowAlongFlow ? cx + b : cx + a, y = rowAlongFlow ? cy + a : cy + b;
    const legI = pos ? Math.floor(i / 2) : i, sw = pos ? (i % 2 ? 'LS' : 'HS') : (k < Npar ? 'HS' : 'LS'), j = pos ? k : k % Npar;
    const fac = Npar > 1 ? 1 + d * (1 - 2 * j / (Npar - 1)) : 1;
    const leg = 'ABCDEF'.charAt(legI) || String(legI + 1);
    list.push({ id: leg + '-' + sw + (Npar > 1 ? (j + 1) : ''), leg, sw, x, y, ax, ay, px, py, fac });
  }
  return list;
}

/* fan-coverage flow weights across width (empirical, see notes) */
function flowWeights(cfg, g, ny) {
  const w = new Float64Array(ny).fill(1);
  if (cfg.fanMode === 'natural') return w;
  const D = cfg.fanD / 1e3, n = Math.max(1, Math.round(cfg.fanN)), gap = Math.max(cfg.fanGap / 1e3, 0), rh = cfg.fanHub * D / 2;
  const centers = []; for (let i = 0; i < n; i++) centers.push(g.W * (i + 0.5) / n + cfg.fanOffY / 1e3);
  const push = { hub: 0.35 + 0.65 * Math.min(1, gap / (0.5 * D)), out: 0.25 + 0.75 * Math.min(1, gap / D) };
  const pull = { hub: 0.80 + 0.20 * Math.min(1, gap / (0.25 * D)), out: 0.60 + 0.40 * Math.min(1, gap / (0.5 * D)) };
  let P = cfg.fanMode === 'pull' ? pull : cfg.fanMode === 'pushpull' ? { hub: (push.hub + pull.hub) / 2, out: (push.out + pull.out) / 2 } : push;
  if (cfg.fanMode === 'impinge') P = { hub: 0.55 + 0.45 * Math.min(1, gap / (0.5 * D)), out: 0.45 + 0.55 * Math.min(1, gap / D) };
  const ss = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  let sum = 0;
  for (let j = 0; j < ny; j++) {
    const y = g.W * (j + 0.5) / ny;
    let dmin = 1e9; for (const c of centers) dmin = Math.min(dmin, Math.abs(y - c));
    let v;
    if (dmin <= D / 2) v = P.hub + (1 - P.hub) * ss(0.6 * rh, 1.2 * rh, dmin);
    else v = P.out + (1 - P.out) * Math.exp(-(dmin - D / 2) / (0.15 * D));
    w[j] = v; sum += v;
  }
  for (let j = 0; j < ny; j++) w[j] *= ny / sum;
  return w;
}

/* ---------------- 2-D base-plate conduction with air marching ---------------- */
function solveMap(M) {
  const { nx, ny, L, W, kt, secs, natural: nat, Tin, wY, devs, cp, hubX } = M;
  const dx = L / nx, dy = W / ny, N = nx * ny;
  const aX = kt * dy / dx, aY = kt * dx / dy;
  const T = M.Tinit ? Float64Array.from(M.Tinit) : new Float64Array(N).fill(Tin + 10);
  const q = new Float64Array(N), geff = new Float64Array(N), mcp = new Float64Array(N), Tao = new Float64Array(N), Tai = new Float64Array(N);
  const sumW = wY.reduce((a, b) => a + b, 0);
  const secOf = new Int8Array(nx);
  for (let i = 0; i < nx; i++) { const x = (i + 0.5) * dx; let s = 0; for (let k = 0; k < secs.length; k++) if (x >= secs[k].x0 && x <= secs[k].x1) s = k; secOf[i] = s; }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, S = secs[secOf[i]], x = (i + 0.5) * dx;
    let phi = Math.pow(wY[j], S.mexp || 0.5);
    if (hubX) { const d = Math.abs(x - hubX.x); if (d < hubX.r) phi *= hubX.f + (1 - hubX.f) * (d / hubX.r) ** 2; }
    const gc = S.hEff * phi * dx * dy;
    if (nat) { geff[k] = gc; mcp[k] = 1; }
    else { const m = S.md * cp * wY[j] / sumW; mcp[k] = m; geff[k] = m > 0 ? m * (1 - Math.exp(-gc / m)) : 0; }
  }
  // sources
  const devCells = devs.map(d => {
    const x0 = d.x - d.ax / 2, x1 = d.x + d.ax / 2, y0 = d.y - d.ay / 2, y1 = d.y + d.ay / 2, cells = [];
    const i0 = clamp(Math.floor(x0 / dx), 0, nx - 1), i1 = clamp(Math.floor(x1 / dx), 0, nx - 1);
    const j0 = clamp(Math.floor(y0 / dy), 0, ny - 1), j1 = clamp(Math.floor(y1 / dy), 0, ny - 1);
    let wsum = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const ox = Math.max(0, Math.min(x1, (i + 1) * dx) - Math.max(x0, i * dx)), oy = Math.max(0, Math.min(y1, (j + 1) * dy) - Math.max(y0, j * dy));
      const a = ox * oy; if (a > 0) { cells.push([j * nx + i, a]); wsum += a; }
    }
    return { cells, wsum };
  });
  devs.forEach((d, n) => { const dc = devCells[n]; if (dc.wsum > 0) dc.cells.forEach(([k, a]) => { q[k] += d.Ptop * a / dc.wsum; }); });
  const Qin = q.reduce((a, b) => a + b, 0);
  // marching orders per section
  const orders = secs.map((S, s) => { const idx = []; for (let i = 0; i < nx; i++) if (secOf[i] === s) idx.push(i); if (S.dir < 0) idx.reverse(); return idx; });
  // DC-mode conductance (all wall temps + delta)
  function Gdc() {
    if (nat) return geff.reduce((a, b) => a + b, 0);
    let G = 0;
    for (let s = 0; s < secs.length; s++) for (let j = 0; j < ny; j++) {
      let prod = 1, m = 0; for (const i of orders[s]) { const k = j * nx + i; m = mcp[k]; if (m > 0) prod *= (1 - geff[k] / m); }
      G += m * (1 - prod);
    }
    return G;
  }
  const Gd = Gdc();
  if (!M.Tinit && Gd > 0) T.fill(Tin + Qin / Gd);
  const omega = M.omega || 2 / (1 + Math.sin(Math.PI / Math.max(nx, ny)));
  let it = 0, maxd = 0, Qout = 0;
  const maxIt = M.maxIt || 8000;
  for (it = 0; it < maxIt; it++) {
    maxd = 0;
    for (let s = 0; s < secs.length; s++) {
      const ord = orders[s];
      for (let j = 0; j < ny; j++) {
        let Ta = Tin;
        for (let n = 0; n < ord.length; n++) {
          const i = ord[n], k = j * nx + i;
          let sum = q[k] + geff[k] * Ta, diag = geff[k];
          if (i > 0) { sum += aX * T[k - 1]; diag += aX; }
          if (i < nx - 1) { sum += aX * T[k + 1]; diag += aX; }
          if (j > 0) { sum += aY * T[k - nx]; diag += aY; }
          if (j < ny - 1) { sum += aY * T[k + nx]; diag += aY; }
          const d = sum / diag - T[k];
          T[k] += omega * d;
          const ad = Math.abs(d); if (ad > maxd) maxd = ad;
          Tai[k] = Ta;
          if (!nat) { Ta = Ta + geff[k] * (T[k] - Ta) / mcp[k]; Tao[k] = Ta; } else Tao[k] = Tin;
        }
      }
    }
    if (it % 8 === 7 || maxd < 2e-5) {
      Qout = 0; for (let k = 0; k < N; k++) Qout += geff[k] * (T[k] - Tai[k]);
      const shift = Gd > 0 ? (Qin - Qout) / Gd : 0;
      if (Math.abs(shift) > 1e-6) for (let k = 0; k < N; k++) T[k] += shift;
      if (maxd < 2e-5 && Math.abs(Qin - Qout) < 1e-4 * Math.max(Qin, 1)) break;
    }
  }
  Qout = 0; for (let k = 0; k < N; k++) Qout += geff[k] * (T[k] - Tai[k]);
  const devT = devCells.map(dc => { let s = 0; dc.cells.forEach(([k, a]) => { s += T[k] * a; }); return dc.wsum > 0 ? s / dc.wsum : NaN; });
  const devCov = devCells.map((dc, n) => dc.wsum / (devs[n].ax * devs[n].ay));
  let Tmax = -1e9, Tmin = 1e9; for (let k = 0; k < N; k++) { if (T[k] > Tmax) Tmax = T[k]; if (T[k] < Tmin) Tmin = T[k]; }
  let TairOutMax = Tin, TairOutAvg = 0, mw = 0;
  if (!nat) for (let s = 0; s < secs.length; s++) { const last = orders[s][orders[s].length - 1]; if (last === undefined) continue;
    for (let j = 0; j < ny; j++) { const k = j * nx + last; TairOutMax = Math.max(TairOutMax, Tao[k]); TairOutAvg += Tao[k] * mcp[k]; mw += mcp[k]; } }
  return { T, Tao, nx, ny, dx, dy, devT, devCov, Tmax, Tmin, iters: it, maxd, Qin, Qout, balance: Qin > 0 ? (Qout - Qin) / Qin : 0,
    TairOutMax, TairOutAvg: mw > 0 ? TairOutAvg / mw : Tin };
}

/* ---------------- transient: Jacobi eigen + Cauer->Foster ---------------- */
function jacobiEig(Ain) {
  const n = Ain.length, A = Ain.map(r => r.slice()), V = A.map((r, i) => r.map((_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return { lam: A.map((r, i) => r[i]), V };
}
/* Cauer ladder (C[], G matrix incl. ground) -> Foster terms seen from node `inp`, observed at `obs` */
function cauerToFoster(C, Gm, inp = 0, obs = 0) {
  const n = C.length, sc = C.map(c => 1 / Math.sqrt(c));
  const M = Gm.map((r, i) => r.map((v, j) => v * sc[i] * sc[j]));
  const { lam, V } = jacobiEig(M);
  const terms = [];
  for (let k = 0; k < n; k++) {
    const R = V[inp][k] * V[obs][k] * sc[inp] * sc[obs] / lam[k];
    terms.push({ R, tau: 1 / lam[k] });
  }
  return terms.sort((a, b) => a.tau - b.tau);
}
const Zf = (terms, t) => t <= 0 ? 0 : terms.reduce((a, x) => a + x.R * (1 - Math.exp(-t / x.tau)), 0);

/* ---------------- main compute ---------------- */
function compute(cfg, opt = {}) {
  const warn = [], note = (lvl, msg) => warn.push({ lvl, msg });
  const g = geometry(cfg);
  if (!g.valid) note('bad', g.why);
  const devs = devices(cfg, g), Ndev = devs.length;
  const Tin = cfg.Tamb + cfg.preheat, alt = cfg.alt;
  const PdevX = cfg.Px / Ndev, PdevY = cfg.Py / Ndev;
  const nat = cfg.fanMode === 'natural';
  const R = { cfg, g, devs, Ndev, Tin, PdevX, PdevY, warn, nat };
  if (!g.valid) { R.invalid = true; return R; }

  /* ---- flow + convection ---- */
  let ht, op = null, Am, Af, natRes = null, dTair = 0;
  if (!nat) {
    for (let pass = 0; pass < 3; pass++) {
      const Tfan = cfg.fanMode === 'pull' ? Tin + dTair : cfg.fanMode === 'pushpull' ? Tin + dTair / 2 : Tin;
      Af = air(Tfan, alt); Am = air(Tin + dTair / 2, alt);
      op = operatingPoint(cfg, g, Af, Am);
      ht = heatTransfer(cfg, g, Am, op);
      dTair = ht.mdotHs > 0 ? cfg.Px / (ht.mdotHs * Am.cp) : 0;
    }
    R.op = op; R.ht = ht; R.Am = Am; R.Af = Af; R.dTair = dTair;
    R.Rsa = ht.Rsa;
    R.fanPel = cfg.fanN * (cfg.fanMode === 'pushpull' ? 2 : 1) * cfg.fanPel * Math.pow(cfg.fanSpeed / 100, 3);
    R.Paero = op.dpFan * op.Qfan;
    R.hEff = ht.Gconv / (g.L * g.W);
  } else {
    natRes = natural(cfg, g, Tin, cfg.Px); Am = air(Tin + natRes.dT / 2, alt);
    R.Am = Am; R.natRes = natRes; R.Rsa = natRes.R; R.fanPel = 0; R.Paero = 0; R.hEff = (natRes.Gc + natRes.Gr) / (g.L * g.W);
    if (g.type !== 'plate') note('warn', 'Natural convection for pin fins uses the plate-fin Bar-Cohen correlation with s = S_T − D (approximate).');
  }

  /* ---- device stack (analytic, average device) ---- */
  const Apad = (cfg.padL * cfg.padW) / 1e6, Acell = g.L * g.W / Ndev, kb = g.mb.k;
  const tim = timStack(cfg, Apad); R.tim = tim;
  const Rjc = cfg.Rjc, Rtim = tim.R;
  const sp = leeSpreading(Apad, Acell, g.tb, kb, R.hEff);
  const RsaShare = Ndev * R.Rsa, RconvShare = nat ? RsaShare : Ndev * ht.Rconv, RcalShare = Math.max(RsaShare - RconvShare, 0);
  const Rext = Rtim + sp.RspAvg + sp.R1D + RsaShare;
  const Rpcb = cfg.pcbOn ? cfg.Rpcb : Infinity;
  const RextPar = 1 / (1 / Rext + 1 / Rpcb);
  const RjaAvg = Rjc + RextPar;
  R.stack = { Apad, Acell, Rjc, Rtim, sp, RsaShare, RconvShare, RcalShare, Rext, RextPar, RjaAvg, Rpcb, topFrac: RextPar / Rext };
  R.TjAvg = Tin + PdevX * RjaAvg;

  /* ---- 2-D base map (hot device) ---- */
  const gridN = { coarse: 30, medium: 60, fine: 96 }[opt.grid || cfg.grid] || 60;
  const asp = g.L / g.W, nx = Math.max(8, Math.round(asp >= 1 ? gridN : gridN * asp)), ny = Math.max(8, Math.round(asp >= 1 ? gridN / asp : gridN));
  const wY = flowWeights(cfg, g, ny);
  const secsMap = nat ? [{ x0: 0, x1: g.L, dir: 1, hEff: R.hEff, md: 0, mexp: 0.25 }]
    : ht.secs.map(s => ({ x0: s.x0, x1: s.x1, dir: (cfg.flowRev && cfg.fanMode !== 'impinge') ? -s.dir : s.dir, hEff: s.hEff, md: s.md, mexp: s.c.mexp }));
  const hubX = (!nat && cfg.fanMode === 'impinge') ? { x: clamp(cfg.fanX / 1e3, 0.1 * g.L, 0.9 * g.L), r: cfg.fanHub * cfg.fanD / 2e3, f: 0.6 } : null;
  const Av = d => (d.ax + g.tb / 2) * (d.ay + g.tb / 2);
  devs.forEach(d => { d.P = PdevX * d.fac; d.Rv = (g.tb / 2) / (kb * Av(d)); d.Ptop = d.P * R.stack.topFrac; });
  let map = null;
  for (let pass = 0; pass < (cfg.pcbOn ? 4 : 1); pass++) {
    map = solveMap({ nx, ny, L: g.L, W: g.W, kt: kb * g.tb, secs: secsMap, natural: nat, Tin, wY, devs, cp: Am.cp, hubX, Tinit: map ? map.T : null });
    devs.forEach((d, n) => {
      d.Tbase = map.devT[n]; d.Tcase = d.Tbase + d.Ptop * (d.Rv + Rtim);
      if (cfg.pcbOn) { const Ppcb = clamp((d.Tcase - Tin) / Rpcb, 0, d.P); d.Ptop = d.P - Ppcb; d.Ppcb = Ppcb; } else d.Ppcb = 0;
    });
  }
  devs.forEach(d => { d.Tcase = d.Tbase + d.Ptop * (d.Rv + Rtim); d.Tj = d.Tcase + d.P * Rjc; });
  R.map = Object.assign(map, { wY, nx, ny });
  let hot = devs[0]; devs.forEach(d => { if (d.Tj > hot.Tj) hot = d; });
  R.hot = hot; R.TjHot = hot.Tj;
  devs.forEach(d => { if (map.devCov[devs.indexOf(d)] < 0.98) note('bad', `Device ${d.id} pad is partly outside the heatsink base.`); });
  for (let a = 0; a < Ndev; a++) for (let b = a + 1; b < Ndev; b++) {
    const A_ = devs[a], B_ = devs[b];
    if (Math.abs(A_.x - B_.x) < (A_.px + B_.px) / 2 - 1e-6 && Math.abs(A_.y - B_.y) < (A_.py + B_.py) / 2 - 1e-6) { note('bad', `Packages ${A_.id} and ${B_.id} overlap — increase pitch.`); a = Ndev; break; }
  }

  /* ---- transient network (average device share) ---- */
  const ccase = Math.max(cfg.Ccase, 1e-3);
  const AvAvg = Av(devs[0]);
  const C1 = g.mb.rho * g.mb.cp * Math.min(AvAvg, Acell) * g.tb;
  const C2 = g.mb.rho * g.mb.cp * Math.max(Acell - AvAvg, 0.05 * Acell) * g.tb;
  const C3 = Math.max(g.mf.rho * g.mf.cp * g.Vfin / Ndev, 1e-3);
  const G01 = 1 / Math.max(Rtim, 1e-6), G12 = 1 / Math.max(sp.RspAvg, 1e-5), G23 = 1 / Math.max(sp.R1D, 1e-5), G3a = 1 / RsaShare, G0a = cfg.pcbOn ? 1 / Rpcb : 0;
  const Cv = [ccase, C1, C2, C3];
  const Gm = [[G01 + G0a, -G01, 0, 0], [-G01, G01 + G12, -G12, 0], [0, -G12, G12 + G23, -G23], [0, 0, -G23, G23 + G3a]];
  const ext = cauerToFoster(Cv, Gm, 0, 0), extHs = cauerToFoster(Cv, Gm, 0, 3);
  const RextNet = ext.reduce((a, x) => a + x.R, 0);
  const fsum = [cfg.Fr1, cfg.Fr2, cfg.Fr3, cfg.Fr4].reduce((a, b) => a + Math.max(b, 0), 0) || 1;
  const jc = [1, 2, 3, 4].map(i => ({ R: Math.max(cfg['Fr' + i], 0) * Rjc / fsum, tau: Math.max(cfg['Ft' + i], 1e-9) })).filter(x => x.R > 0);
  const RextHot = (hot.Tcase - Tin) / hot.P;
  const kappa = RextHot / RextNet;
  const Zhot = t => Zf(jc, t) + kappa * Zf(ext, t);
  const Zavg = t => Zf(jc, t) + Zf(ext, t);
  const PhotX = hot.P, PhotY = PdevY * hot.fac, dP = PhotY - PhotX, tp = Math.max(cfg.tp, 1e-6);
  const Tss = hot.Tj;
  const Tpulse = t => t < 0 ? Tss : Tss + dP * (Zhot(t) - (t > tp ? Zhot(t - tp) : 0));
  const TpeakY = Tpulse(tp);
  const dTa = cfg.Tlim - Tss;
  let tAllow;
  if (dTa <= 0) tAllow = 0; else if (dP <= 0) tAllow = Infinity;
  else if (dP * Zhot(1e9) <= dTa) tAllow = Infinity;
  else { const lt = bisect(l => dP * Zhot(Math.pow(10, l)) - dTa, -8, 9, 80); tAllow = Math.pow(10, lt); }
  const yAllow = dTa <= 0 ? 0 : (PhotX + dTa / Zhot(tp)) * Ndev / hot.fac;
  const TssY = Tin + (Tss - Tin) * (PhotY / PhotX);
  R.trans = { jc, ext, extHs, RextNet, kappa, Zhot, Zavg, Tpulse, TpeakY, tAllow, yAllow, PhotX, PhotY, dP, tp, Tss, TssY, Cv, Gm,
    tauHs: R.Rsa * g.Chs, ZjcSS: Rjc, Ccells: { C0: ccase, C1, C2, C3 } };

  /* ---- fan failure (forced -> natural) ---- */
  if (!nat) {
    const nr = natural(cfg, g, Tin, cfg.Px);
    const Ths0 = Tin + cfg.Px * R.Rsa, Tnat = Tin + cfg.Px * nr.R, off = Tss - Ths0, tau = nr.R * g.Chs;
    const TjNat = Tnat + off;
    let tFail = Infinity;
    if (Tss >= cfg.Tlim) tFail = 0;
    else if (TjNat > cfg.Tlim) tFail = -tau * Math.log((Tnat + off - cfg.Tlim) / (Tnat - Ths0));
    R.fail = { nr, Ths0, Tnat, TjNat, tau, tFail, Tj: t => Tnat + off - (Tnat - Ths0) * Math.exp(-t / tau) };
  }

  /* ---- required heatsink resistance ---- */
  const devPart = Rjc + Rtim + sp.RspAvg + sp.R1D;
  R.RsaReqX = Math.max(((cfg.Tlim - Tin) / (PdevX * hot.fac) - devPart) / Ndev, 0);
  R.RsaReqY = Math.max(((cfg.Tlim - Tin) / (PdevY * hot.fac) - devPart) / Ndev, 0);

  /* ---- warnings ---- */
  if (!nat) {
    if (op.fanFrac < 0.35) note('warn', `Fan works at ${(op.fanFrac * 100).toFixed(0)} % of free-air flow — likely in the stall/saddle region of an axial fan. Check the real curve.`);
    if (op.Qb / Math.max(op.Q, 1e-12) > 0.3) note('warn', `Bypass is ${(op.Qb / op.Q * 100).toFixed(0)} % of fan flow — add a shroud or reduce clearance.`);
    const c0 = ht.secs[0].c;
    if (g.type !== 'plate' && (c0.Re < 10 || c0.Re > 2e5)) note('warn', `Pin Re_D = ${c0.Re.toFixed(0)} outside Žukauskas range 10–2·10⁵.`);
    if (c0.V > 20) note('warn', `Channel velocity ${c0.V.toFixed(1)} m/s — acoustic noise and fan power will be high.`);
    if (dTair > 30) note('warn', `Air temperature rise ${dTair.toFixed(1)} K — downstream devices see hot air.`);
    if (cfg.fanMode !== 'impinge' && cfg.fanD / 1e3 > 1.3 * (g.H + g.tb)) note('info', `Fan frame ${cfg.fanD} mm is taller than the fin face (${((g.H + g.tb) * 1e3).toFixed(0)} mm): a converging plenum is needed — include it in K_sys (≈ 0.3–0.5).`);
    if (cfg.fanMode !== 'impinge' && cfg.fanN * cfg.fanD / 1e3 > 1.08 * g.W) note('warn', `${cfg.fanN} × ${cfg.fanD} mm fans (${cfg.fanN * cfg.fanD} mm) do not fit across W = ${(g.W * 1e3).toFixed(0)} mm — needs a diverging plenum or fewer/smaller fans.`);
    if (cfg.fanMode === 'impinge' && cfg.fanN * cfg.fanD / 1e3 > 1.08 * g.W) note('warn', `${cfg.fanN} × ${cfg.fanD} mm fans do not fit across W = ${(g.W * 1e3).toFixed(0)} mm.`);
    if (cfg.fanMode !== 'impinge' && cfg.fanN * cfg.fanD / 1e3 < 0.7 * g.W) note('info', `Fans cover ${(cfg.fanN * cfg.fanD / 1e3 / g.W * 100).toFixed(0)} % of the heatsink width — outer channels are starved (see flow-weight profile).`);
  }
  if (g.type === 'plate') {
    if (g.s * 1e3 < 1.5) note('warn', `Fin gap ${(g.s * 1e3).toFixed(2)} mm < 1.5 mm: clogging and manufacturing risk.`);
    if (g.aspect > 15) note('info', `Fin aspect H/s = ${g.aspect.toFixed(1)}: beyond ~15 needs bonded, skived or folded fins (not extrusion).`);
  }
  const etaRef = nat ? natRes.fe.eta : ht.eta;
  if (etaRef < 0.6) note('warn', `Fin efficiency ${(etaRef * 100).toFixed(0)} % — fins too tall/thin for this h; use thicker fins or Cu.`);
  if (R.TjHot > cfg.Tlim) note('bad', `Steady T_j,hot ${R.TjHot.toFixed(1)} °C exceeds design limit ${cfg.Tlim} °C at x = ${cfg.Px} W.`);
  if (TpeakY > cfg.Tlim) note('bad', `Peak T_j ${TpeakY.toFixed(1)} °C exceeds ${cfg.Tlim} °C for y = ${cfg.Py} W over ${cfg.tp} s.`);
  if (TpeakY > cfg.TjMax) note('bad', `Peak exceeds absolute T_j,max ${cfg.TjMax} °C.`);
  /* ---- isolation / EMI (800 V class) ---- */
  const Npar = nParOf(cfg);
  tim.Vreq = cfg.Vreq; tim.margin = tim.Vbd / Math.max(cfg.Vreq, 1e-9);
  tim.icmPhase = Npar * (isFinite(tim.Cdev) ? tim.Cdev : 0) * cfg.dvdt * 1e9;   // A, LS drains = switch node
  tim.kAlt = altFactor(cfg.alt);
  if (!isFinite(tim.Cdev)) note('bad', 'No insulating layer between the live drain pad and the heatsink (zero bond line and no isolation layer).');
  else if (tim.Vbd < cfg.Vreq * (1 - 1e-9)) note('bad', `Insulation withstand ${tim.Vbd.toFixed(2)} kV < required ${cfg.Vreq} kV` + (tim.iso ? ' — thicker isolation layer or higher-strength material.' : ` — minimum bond line must be ≥ ${fmtN(tim.tReq, 2)} mm, or use option C (isolation foil/ceramic).`));
  if (!tim.iso && cfg.Vdc >= 600) note('info', 'For 800 V-class systems Infineon presents gap filler + isolation foil or ceramic plate (option C) as the guaranteed-isolation, highest-safety Q-DPAK assembly.');
  if (!tim.iso && cfg.timE <= 0) note('bad', 'Gap material is not credited for isolation (grease) and no isolation layer is fitted.');
  if (cfg.alt > 2000) note('info', `Altitude ${cfg.alt} m: IEC 60664-1 clearance factor ×${tim.kAlt.toFixed(2)}; partial-discharge inception falls with pressure — PD-test the TIM stack at minimum pressure.`);
  if (tim.Ework > 3) note('warn', `Working field ${tim.Ework.toFixed(1)} kV/mm across the insulation at ${cfg.Vdc} V — high for long-term PD-free operation; check the supplier's continuous rating.`);
  if (Math.abs(map.balance) > 0.01) note('info', `2-D map energy balance error ${(map.balance * 100).toFixed(2)} % (increase grid or iterations).`);
  return R;
}

/* quick evaluation for sweeps */
function evalPoint(cfg) {
  const R = compute(cfg, { grid: 'coarse' });
  return { TjHot: R.TjHot, TjAvg: R.TjAvg, Tpk: R.trans.TpeakY, Rsa: R.Rsa, dp: R.op ? R.op.dpFan : 0,
    Q: R.op ? R.op.Qfan / CFM : 0, mass: R.g.mass * 1e3, fanPel: R.fanPel, tAllow: R.trans.tAllow, valid: R.g.valid };
}

/* loss helper (SPWM, synchronous SiC MOSFET, linear E_sw(I)) */
function losses(h, perLeg, nLegs) {
  const Np = Math.max(1, Math.floor(perLeg / 2));
  const Pc = Math.pow(h.Irms / Np, 2) * (h.Rds / 1e3) / 2;
  const Psw = h.fsw * 1e3 * (h.Esw / 1e3) * (h.Vdc / h.Vref) * (Math.SQRT2 * h.Irms / (Math.PI * Np * h.Iref));
  const Pdev = Pc + Psw;
  return { Np, Pc, Psw, Pdev, Ptot: Pdev * Np * 2 * nLegs };
}

const API = { air, geometry, core, bypassDP, fanDP, fanQfree, systemAt, operatingPoint, heatTransfer, finEff, natural,
  leeSpreading, devices, nParOf, timStack, altFactor, flowWeights, solveMap, jacobiEig, cauerToFoster, Zf, compute, evalPoint, losses,
  MATERIALS, TIMS, ISOS, FANS, CFM, RHO_REF, SIGMA };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.HS = API;
})(this);
