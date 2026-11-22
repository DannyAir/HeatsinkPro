#!/usr/bin/env node
/* Engine regression checks — run: node tests/engine_check.js  (exit code 1 on failure) */
'use strict';
const HS = require('../src/engine.js'), D = require('../src/defaults.js');
let fails = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const R = HS.compute(D);
check(!R.invalid && R.Ndev === 24, `default topology: ${R.Ndev} dies (6 switches × ${D.nPar}∥)`);

// 1. exact Cauer -> Foster: sum of Foster R equals (G^-1)_00
const G = R.trans.Gm.map(r => r.slice()), n = G.length, I = G.map((r, i) => r.map((_, j) => (i === j ? 1 : 0)));
for (let i = 0; i < n; i++) { const p = G[i][i]; for (let j = 0; j < n; j++) { G[i][j] /= p; I[i][j] /= p; }
  for (let k = 0; k < n; k++) if (k !== i) { const q = G[k][i]; for (let j = 0; j < n; j++) { G[k][j] -= q * G[i][j]; I[k][j] -= q * I[i][j]; } } }
check(near(R.trans.RextNet, I[0][0], 1e-9), `Foster ΣR = G⁻¹₀₀ (${R.trans.RextNet.toFixed(6)} K/W)`);

// 2. 2-D map energy balance
check(Math.abs(R.map.balance) < 1e-4, `map energy balance ${(R.map.balance * 100).toExponential(2)} %`);

// 3. grid independence
const tc = HS.compute(Object.assign({}, D, { grid: 'coarse' })).TjHot, tf = HS.compute(Object.assign({}, D, { grid: 'fine' })).TjHot;
check(near(tc, tf, 0.5) && near(R.TjHot, tf, 0.5), `grid independence: coarse ${tc.toFixed(2)} / medium ${R.TjHot.toFixed(2)} / fine ${tf.toFixed(2)} °C`);

// 4. step-wise generator equals synchronous compute, progress monotone
const gen = HS.computeGen(D); let st, last = 0, mono = true, steps = 0;
while (!(st = gen.next()).done) { steps++; if (st.value.p < last) mono = false; last = st.value.p; }
check(st.value.TjHot === R.TjHot && mono && steps > 3, `computeGen = compute (${steps} monotone progress steps)`);

// 5. laminar cross-check: Stephan + eps-NTU (inlet-referenced) vs Teertstra composite
//    r1 geometry (140×120, H35, N30): agreement < 5 %.
//    24-die default (200×184, H45, N48, longer channels): ~14 % spread — model uncertainty, flagged in README.
function lamCheck(over, tol, label) {
  const RL = HS.compute(Object.assign({}, D, over)), s0 = RL.ht.secs[0];
  const hin = s0.eps * s0.md * RL.Am.cp / (s0.fe.eta0 * s0.At), dev = hin / s0.c.hT - 1;
  check(s0.c.Re < 2300 && Math.abs(dev) <= tol, `laminar ${label}, Re ${s0.c.Re.toFixed(0)}: Stephan ${hin.toFixed(1)} vs Teertstra ${s0.c.hT.toFixed(1)} W/m²K (${(dev * 100).toFixed(1)} %, limit ±${tol * 100} %)`);
}
lamCheck({ L: 140, W: 120, H: 35, N: 30, tf: 1.2, tb: 6, fanSpeed: 35, fanN: 2, fanD: 80, fanQmax: 119, fanPmax: 600, pitchDev: 28, pitchLeg: 16, legGap: 0, nPar: 2 }, 0.05, 'r1 geometry');
lamCheck({ fanSpeed: 30 }, 0.20, '24-die default');

// 6. isolation stack (option C, Al2O3 0.38 mm @ 15 kV/mm)
check(near(R.tim.Vbd, 5.7, 1e-6) && R.tim.Vbd >= D.Vreq, `isolation withstand ${R.tim.Vbd.toFixed(2)} kV ≥ ${D.Vreq} kV`);
check(near(R.tim.Cdev * 1e12, 43.8, 0.5), `drain-heatsink capacitance ${(R.tim.Cdev * 1e12).toFixed(1)} pF/die`);

// 7. physical sanity: options A/B hotter than C, AlN cooler than Al2O3, altitude hotter
const pk = o => HS.compute(Object.assign({}, D, o)).trans.TpeakY;
const pC = R.trans.TpeakY, pA = pk({ timMode: 'A', timTmin: 0.6 }), pN = pk({ isoK: 170, isoEr: 8.8 }), pH = pk({ alt: 4000 });
check(pA > pC && pN < pC && pH > pC, `ordering: A ${pA.toFixed(1)} > C ${pC.toFixed(1)} > C-AlN ${pN.toFixed(1)} °C; 4000 m ${pH.toFixed(1)} °C`);

// 8. every fan mode and fin type solves
for (const o of [{ fanMode: 'pull' }, { fanMode: 'pushpull' }, { fanMode: 'impinge' }, { fanMode: 'natural' }, { hsType: 'pinIn' }, { hsType: 'pinSt' }, { layout: 'posCols' }, { pcbOn: true }]) {
  const r = HS.compute(Object.assign({}, D, o));
  check(!r.invalid && isFinite(r.TjHot) && isFinite(r.trans.TpeakY), `${JSON.stringify(o)} → T_j ${r.TjHot.toFixed(1)} °C`);
}
console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll engine checks passed');
process.exit(fails ? 1 : 0);
