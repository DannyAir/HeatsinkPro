/* default configuration — rev r1 */
(function (root) {
const DEFAULTS = {
  // losses & limits
  Px: 480, Py: 960, tp: 30, Tamb: 45, preheat: 0, alt: 1000, TjMax: 175, Tlim: 150, imb: 10,
  // devices & layout
  nLegs: 3, perLeg: 4, Rjc: 0.30, padL: 16, padW: 12, pkgL: 21, pkgW: 15,
  layout: 'along', pitchDev: 28, pitchLeg: 38, offX: 0, offY: 0, rotate: false,
  pcbOn: false, Rpcb: 15, Ccase: 0.3,
  Fr1: 0.020, Fr2: 0.060, Fr3: 0.140, Fr4: 0.080, Ft1: 3e-5, Ft2: 4e-4, Ft3: 3e-3, Ft4: 2e-2,
  // TIM
  timPreset: 'Gap filler 5 W/m·K, 0.25 mm', timK: 5, timT: 0.25, timRc: 10,
  // heatsink
  hsType: 'plate', L: 140, W: 120, tb: 6, H: 35, finBy: 'count', N: 30, finGap: 2.9, tf: 1.2, pinD: 3, pinST: 6, pinSL: 6,
  matB: 'Al 6063-T5', kB: 200, rhoB: 2700, cpB: 900, matF: 'Al 6063-T5', kF: 200, rhoF: 2700, cpF: 900, emis: 0.85,
  // flow path
  flowRev: false, shroud: true, cTip: 3, cSide: 0, Ksys: 0.6,
  // fans
  fanMode: 'push', fanPreset: '80×80×38 high-perf axial', fanN: 2, fanD: 80, fanQmax: 119, fanPmax: 600, fanShape: 1.3,
  fanSpeed: 100, fanPel: 24, fanGap: 10, fanHub: 0.45, fanOffY: 0, fanX: 70, impEnh: 1.15,
  // solver
  grid: 'medium'
};
if (typeof module !== 'undefined' && module.exports) module.exports = DEFAULTS; else root.HS_DEFAULTS = DEFAULTS;
})(this);
