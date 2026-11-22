# QDPAK Inverter Heatsink Study — Plan r2

**Date:** 2026-11-20 · **Artifact:** https://claude.ai/artifact/CYAHpEHjpdcWsVU9E6jF4v (r2 live; r1 kept in version history) · **File:** `HeatsinkStudy_r2.html` · r1 files unchanged.

## 1. Changes from r1
| # | Change | Reason |
|---|---|---|
| 1 | Topology: **6 switch positions × N∥ = 24 QDPAK** (N∥ = 1…6, default 4) | User correction ("4 per leg" = 6 × 4) |
| 2 | Layouts: `posRows` (switch rows along flow, default), `posCols` (positions in series), `along`, `across`; row pitch + extra leg gap | 24-die arrangement study |
| 3 | TIM → **insulation stack**: A gap filler · B gap pad · **C gap filler + isolation foil/ceramic (default)** | 800 V bus, live drain pad; Infineon Q-DPAK guidance |
| 4 | Bond line from tolerance: t_gap = t_min + Δh (worst) or + Δh/2 (mean) | Height differences of paralleled dies |
| 5 | Isolation checks: V_bd vs V_req, E_work, C_pad, i_cm per phase, IEC 60664-1 altitude factor | 800 V, eVTOL altitude |
| 6 | New KPI tile (isolation), TIM/isolation table, front section shows gap + isolation layer | Visibility |
| 7 | Fan-fit check: n·D > 1.08·W → warning | 24-die sinks need wider fan rows |
| 8 | Default sized for 24 dies: x = 960 W, y = 1920 W/30 s (40 → 80 W/die, same as r1) | Keep per-die load comparable |

## 2. Isolation stack model
```
R_TIM = (t_gap/k_gap + t_iso/k_iso + R″_c)/A_pad      t_gap = t_min + Δh  (worst)
V_bd  = E_gap·t_min + E_iso·t_iso  ≥ V_req              (credited layers, thinnest point)
C_die = ε0·A_pad / (t_min/εr_gap + t_iso/εr_iso)        i_cm,phase = N∥·C_die·dv/dt
```
Infineon Q-DPAK guidance used: options A/B need guaranteed minimum thickness for isolation; option C (filler + foil/ceramic) = guaranteed isolation, highest safety for 800 V; TIM k ≈ 5–8 W/m·K; Δh < 300 µm demonstrated with 5 Q-DPAKs; ~100 N per package; standoff 0…150 µm, drawing tolerance ±50 µm; gap pad example needed > 1 mm for isolation; filler/ultrasoft pad must fill the creepage groove (> 4.75 mm).

## 3. Default case r2 (placeholders — replace with real data)
Plate fin Al 6063, L 200 × W 184 mm, base 8, H 45, N 48 × 1.2 (s 2.69) · 2 × 92 mm fans push · posRows, pitch 40/25 mm, leg gap 6 · option C: gap filler 6 W/m·K (0…0.3 mm) + Al₂O₃ 0.38 mm · 45 °C, 1000 m, T_lim 150 °C.

| Result | Value |
|---|---|
| Q / Δp | 170 CFM / 251 Pa |
| R_sa | 27.5 mK/W |
| T_j hottest, steady x | 109.0 °C (A-LS2) |
| T_j peak, y for 30 s | **155.3 °C → FAIL by 5 K** |
| Allowed t at y / allowed y for 30 s | 15.5 s / 1810 W |
| Isolation | 5.7 kV vs 3 kV (×1.9), 44 pF/die, i_cm 8.8 A/phase @ 50 V/ns |
| Fan failure → 150 °C | 97 s |
| Mass / fan power | 2.20 kg / 52 W |

TIM comparison (same sink): A filler 0.6 mm → R_TIM 0.83 K/W, peak 184 °C · B pad 1.0 mm → 1.41 K/W, 225 °C · **C Al₂O₃ → 0.40 K/W, 155 °C** · C AlN → 0.32 K/W, 149 °C (PASS).
→ For 24 × QDPAK at 800 V, **option C with ceramic is the only workable thermal path**; gap thickness Δh is the dominant TIM term (10.8 K of 16.3 K).

## 4. Verification
Engine: Foster sum = G⁻¹₀₀; map balance < 1e-6; grid-independent. Browser: 5 fan modes, 3 fin types, TIM A/B/C, AlN, grease (not credited), N∥ = 3, posCols, bypass, PCB path, custom material, reversed flow, sweep, config load (r1 configs mapped), loss helper, reset, dark theme, 390 px — no script errors.

## 5. Risks / open points
- Insulation presets are class values; need supplier withstand, PD inception at min. pressure (altitude), long-term field rating.
- Required withstand V_req = 3 kV is a placeholder → set from insulation coordination (IEC 60664-1 / DO-160 / customer).
- Ceramic plate: one plate vs per-die tiles — cracking under 100 N/package; flatness → contact R″.
- i_cm ≈ 9 A/phase peak into chassis → EMI filter / Y-cap sizing input.
- Pad 16 × 12 mm, R_jc 0.30 K/W, Foster terms, fan curves still placeholders.

## 6. Next steps (r3 candidates)
1. Real device data (R_jc, Z_jc, pad drawing) and TIM/ceramic datasheets.
2. Per-die bond-line distribution (Monte-Carlo Δh) instead of all-worst.
3. Ceramic-plate lateral spreading (AlN acts as a spreader).
4. One-fan-failure case; mission profile (hover/cruise/hover).
5. R_ds,on(T_j) loss coupling; mass optimizer under T_j and fan-power caps.
