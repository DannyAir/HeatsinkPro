/* default configuration — rev r2 (6 switch positions × 4 paralleled QDPAK = 24 devices) */
(function (root) {
const DEFAULTS = {
  // losses & limits
  Px: 960, Py: 1920, tp: 30, Tamb: 45, preheat: 0, alt: 1000, TjMax: 175, Tlim: 150, imb: 10,
  // devices & layout
  nLegs: 3, nPar: 4, Rjc: 0.30, padL: 16, padW: 12, pkgL: 21, pkgW: 15,
  layout: 'posRows', pitchDev: 40, pitchLeg: 25, legGap: 6, offX: 0, offY: 0, rotate: false,
  pcbOn: false, Rpcb: 15, Ccase: 0.3,
  Fr1: 0.020, Fr2: 0.060, Fr3: 0.140, Fr4: 0.080, Ft1: 3e-5, Ft2: 4e-4, Ft3: 3e-3, Ft4: 2e-2,
  // TIM
  timMode: 'C', timPreset: 'Gap filler 6 W/m·K, insulating', timK: 6, timE: 5, timEr: 6.0, timTmin: 0, timDh: 0.30, timCase: 'worst', timRc: 10,
  isoPreset: 'Al₂O₃ 96 % plate 0.38 mm', isoK: 24, isoT: 0.38, isoE: 15, isoEr: 9.8,
  Vdc: 800, Vreq: 3.0, dvdt: 50,
  // heatsink
  hsType: 'plate', L: 200, W: 184, tb: 8, H: 45, finBy: 'count', N: 48, finGap: 2.7, tf: 1.2, pinD: 3, pinST: 6, pinSL: 6,
  matB: 'Al 6063-T5', kB: 200, rhoB: 2700, cpB: 900, matF: 'Al 6063-T5', kF: 200, rhoF: 2700, cpF: 900, emis: 0.85,
  // flow path
  flowRev: false, shroud: true, cTip: 3, cSide: 0, Ksys: 0.6,
  // fans
  fanMode: 'push', fanPreset: '92×92×38 high-perf axial', fanN: 2, fanD: 92, fanQmax: 159, fanPmax: 550, fanShape: 1.3,
  fanSpeed: 100, fanPel: 26, fanGap: 10, fanHub: 0.45, fanOffY: 0, fanX: 100, impEnh: 1.15,
  // solver
  grid: 'medium'
};
if (typeof module !== 'undefined' && module.exports) module.exports = DEFAULTS; else root.HS_DEFAULTS = DEFAULTS;
})(this);
