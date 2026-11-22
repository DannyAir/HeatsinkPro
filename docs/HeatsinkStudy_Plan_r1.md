# QDPAK Inverter Heatsink Study — Plan r1

**Date:** 2026-11-20 · **Artifact:** https://claude.ai/artifact/CYAHpEHjpdcWsVU9E6jF4v · **File:** `HeatsinkStudy_r1.html` (self-contained, opens offline)

## 1. Scope
Air-cooled heatsink for a 3-phase inverter: 3 legs × 4 top-side-cooled QDPAK (2∥ HS + 2∥ LS) = 12 devices.
Requirement: continuous **x W**, peak **y W for t s**, all parameters selectable (size, fin shape, fin pitch/"spread", base spreader, materials, TIM, fans, fan placement, altitude).

## 2. Model chain (all equations in the page's Equations tab, live values)
```
P_dev ─ R_jc(Foster) ─ case ─ R_TIM ─ R_v / R_sp(Lee) ─ base 2-D FD ─ η0·h·A_t ─ air (ε-NTU marching) ─ T_in
                          └─ R_pcb (optional parallel path)
fan curve (fan laws, ρ at altitude) ⨯ system curve (core + bypass + K_sys) → Q, Δp
```
| Block | Correlation / method |
|---|---|
| Air | ISA p(h), ideal gas, Sutherland μ,k |
| Fan | Δp = (ρ/ρ0)s²Δp_max[1−(Q/(n_p s Q_max))ⁿ]; push / pull / push-pull (series) / impingement / natural |
| Plate-fin Δp | Shah-London fRe + Muzychka-Yovanovich developing, Petukhov turbulent, Kays-London K_c,K_e |
| Plate-fin h | Stephan (bulk-ref, laminar developing), Gnielinski (turbulent); Teertstra cross-check |
| Pin fins | Žukauskas Nu (+row factor C₂), Khan-Culham-Yovanovich f, K_c/K_e |
| Bypass | parallel duct, equal Δp split (tip + side clearance) |
| Fins | η_f = tanh(mH_c)/(mH_c), η0, NTU, ε = 1−e^−NTU, R_sa = 1/(ṁc_pε) |
| Spreading | Lee-Song-Au-Moran ψ_avg, ψ_max; 2-D SOR base map with air marching + fan-coverage weights w(y) |
| Transient | datasheet Z_jc Foster + exact Cauer→Foster (Jacobi eigen) of case-to-air ladder; κ scaling to hottest die; pulse superposition; t_allow, y_allow |
| Fan failure | Bar-Cohen–Rohsenow natural convection + radiation, τ = R_nat·C_hs |
| Losses (helper) | P_c = ½(I_rms/N_p)²R_ds; P_sw = f_sw E_ref (V/V_ref)(√2 I_rms/(πN_p I_ref)) |

## 3. Default case (example inputs — replace with real values)
x = 480 W, y = 960 W / 30 s, 45 °C at 1000 m, δ = 10 %, T_lim 150 °C · Al 6063 plate fin 140 × 120, base 6, H 35, N 30 × 1.2 mm (s 2.9 mm) · TIM 5 W/m·K 0.25 mm · 2 × 80 mm high-perf fans, push.

| Result | Value |
|---|---|
| Operating point | 112 CFM, 305 Pa (47 % of free flow) |
| R_sa | 53.6 mK/W (needed ≤ 138 at x) |
| T_j hottest, steady x | 106.7 °C (C-LS1, 3rd device downstream, +δ die) |
| T_j peak, y for 30 s | **154.9 °C → FAIL by 4.9 K** |
| Allowed time at y / allowed y for 30 s | 18.5 s / 911 W |
| Fan failure at x | 69.9 s to 150 °C |
| Mass / fan power | 748 g / 48 W |

Stack at hottest die (K): R_jc 13.2 · R_TIM 13.8 · spreading ≈2 · base+fins+air 32.5 → TIM ≈ R_jc: **TIM is the first lever**.
Quick what-ifs (engine): Cu base → 146.7 °C peak (PASS, +630 g) · vapor-chamber base → 140.2 °C · push-pull → 148.7 °C · 4000 m → 168.5 °C.

## 4. Verification done
- Foster sum ΣR_k = (G⁻¹)₀₀ exactly (1.07449 K/W both).
- Laminar cross-check: Stephan + ε-NTU (inlet-referenced) 29.7 vs Teertstra 29.3 W/m²K (1.4 %).
- Grid independence: coarse/medium/fine T_j,hot within 0.1 K; map energy balance < 1e-6.
- Hand check: η_f 0.769 (hand 0.768), R_sa ≈ 0.052 hand vs 0.054 model.
- UI: 5 fan modes × 3 fin types, bypass, PCB path, custom materials, reversed flow, invalid geometry, sweep, config load, loss helper, light/dark, 390 px & 1400 px — no script errors.

## 5. Decisions
- Single self-contained HTML (no CDN libs; fonts only); canvas charts.
- Inlet-referenced R_sa via ε-NTU so caloric resistance is explicit.
- Hot device from the 2-D map, transient scaled by κ (not a full 2-D transient).
- Fan curves are class approximations, flagged in UI → user enters datasheet values.

## 6. Risks / limitations
- w(y) fan-coverage and impingement factor are empirical → calibrate with CFD or a velocity traverse.
- Axial-fan stall saddle not modelled; warning below 35 % of free flow (pin fins with axial fans hit this).
- Losses not iterated with T_j (R_ds,on(T)).
- QDPAK pad 16 × 12 mm assumed; drain-live pad → TIM must insulate; confirm pad drawing and TIM bond line incl. height tolerance.
- Fan failure assumes vertical fins and no stalled-fan blockage.

## 7. Next steps (r2 candidates)
1. Enter real device data: R_jc, Z_jc Foster, pad size; real fan curve points (multi-point fit).
2. Single-fan-failure case (n−1 fans + leakage through stalled fan).
3. Repetitive mission profile (hover/cruise/hover) instead of a single pulse.
4. Loss–temperature coupling (R_ds,on(T_j) iteration).
5. Optimizer: minimize mass subject to T_j,peak ≤ T_lim and fan power cap.
6. Calibrate w(y) and K_sys against CFD / test; export to Excel if required.
