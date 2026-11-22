# QDPAK Inverter Heatsink Study — Plan r3

**Date:** 2026-11-20 · **Artifact:** https://claude.ai/artifact/CYAHpEHjpdcWsVU9E6jF4v (r3 live; r1, r2 in version history) · **File:** `HeatsinkStudy_r3.html` · r1/r2 files unchanged.

## 1. Change in r3 — run control
| Item | Behaviour |
|---|---|
| **Recalculate** button | Sticky run bar (above tabs on phone, right of tabs on desktop). Forces a full solve; re-runs the sweep when on the Sweep tab. |
| **Auto** toggle | On (default): solve 120 ms after each edit. Off: edits only mark results *Changes pending* (results greyed) until Recalculate. Setting remembered in the browser. |
| Keyboard | Enter in any parameter field, or Ctrl/⌘ + Enter anywhere → recalculate. |
| **Progress bar** | 3 px bar under the nav + stage label + %. Real progress from the solver: operating point → device stack/TIM → 2-D map (per 16 SOR sweeps, log-residual) → transient → checks → rendering → sweep points. |
| Cancel/restart | A new edit or click aborts the running solve and restarts with the latest inputs. |
| Consistency | Results are rendered from the configuration they were solved with (`R.cfg`), so pending edits never mix into displayed numbers. |

## 2. Implementation
```
engine: compute()  = runGen(computeGen(cfg))      // same results, sync (sweeps, tests)
        computeGen → yield {stage, p}             // p: 0.02 flow · 0.12 stack · 0.16–0.80 map · 0.82 transient · 0.92 checks
        solveMapGen → yield {mapFrac = max(ln(r0/r)/ln(r0/2e-5), it/maxIt)} every 16 sweeps
UI:     async driver, time-sliced (yields to the browser every ≥14 ms), runId token for cancel
        body[data-state] = busy | idle | stale  (spinner on ↻ while busy)
```

## 3. Verification
- Engine: generator vs synchronous results bit-identical (T_j,hot 108.961 °C, peak 155.32 °C); 13 monotone progress steps; PCB 4-pass case OK.
- Browser (Chrome, 1300 px and 390 px): progress shows intermediate stages on fine grid (33 → 48 → 69 → 92 → 100 %); Auto off → stale + results unchanged → Recalculate applies; Enter and Ctrl+Enter; reload keeps Auto state and inputs; Sweep with pending edits → solve + sweep; rapid edits → last value wins; regression over fan modes, fin types, TIM A/C, layouts = r2 values; no script errors.

## 4. Unchanged from r2
Model, defaults and results (24 × QDPAK, 800 V option C stack). See Plan r2 for risks and r4 candidates (Monte-Carlo bond line, ceramic spreading, one-fan failure, mission profile, R_ds,on(T) coupling, optimizer).
