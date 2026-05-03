# Wizard Mainline-Compatibility Plan

Make the Plane Setup Wizard work on stock Betaflight 2025.12.2 (mainline,
no wing fork) by gating one MSP call and leaning on the CLI fallback
infrastructure that already exists.

Date: 2026-05-03 · Branch: `wing-main` · Status: draft

---

## TL;DR

The wizard is already 94% mainline-compatible. Six of seven steps either
use standard MSP that mainline supports, or fire CLI batches. The single
blocker is `MSP2_SET_WING_TUNING` at [wingApply.js:42](src/js/utils/wingApply.js#L42).
Gate that call on `FC.CONFIG.wingCapabilities.tuning`; on mainline, skip
the MSP and rely on the CLI duplicate that [wingPlaneDefaults.js](src/js/utils/wingPlaneDefaults.js)
already emits. **Estimated change: ~10 lines in 1 file.**

---

## Wing-fork MSP inventory (firmware `#ifdef USE_WING`)

| # | MSP code | Hex | Used by | Wizard touches? | Mainline behavior |
|---|---|---|---|---|---|
| 1 | `MSP2_WING_TUNING` | 0x3012 | WingTuningTab read | No | NACK (caps=false) |
| 2 | `MSP2_SET_WING_TUNING` | 0x3013 | wingApply, WingTuningTab.save | **YES (blocker)** | NACK → throws in await |
| 3 | `MSP2_WING_LAUNCH` | 0x3014 | WingTuningTab read | No | NACK |
| 4 | `MSP2_SET_WING_LAUNCH` | 0x3015 | WingTuningTab.save | No | already gated by caps.launch |
| 5 | `MSP2_WING_GPS_RESCUE` | 0x3016 | WingTuningTab read | No | NACK |
| 6 | `MSP2_SET_WING_GPS_RESCUE` | 0x3017 | WingTuningTab.save | No | already gated by caps.gpsRescue |
| 7 | `MSP2_WING_AUTOLAND` | 0x3018 | WingTuningTab read | No | NACK |
| 8 | `MSP2_SET_WING_AUTOLAND` | 0x3019 | WingTuningTab.save | No | already gated by caps.autoland |
| 9 | `MSP2_WING_AUTOLAND_STATE` | 0x301a | (unwired) | No | n/a |
| 10 | `MSP2_PULSE_SERVO` | (~0x301b) | wizard servo pulse | YES | **already dual-pathed** ([wingServoPulse.js:63-80](src/js/utils/wingServoPulse.js#L63-L80)) |
| 11 | `MSP2_GET_WING_CAPABILITIES` | 0x301c | serial_backend on connect | n/a | NACK → caps stays all-false (graceful) |

**Net wizard-affecting wing MSPs: 2.** One already has a dual path (#10),
one needs the same treatment (#2). Everything else is either Tuning-tab
only and already capability-gated, or read-only metadata.

---

## Wizard step-by-step audit (already done — repeating for record)

| Step | Touches | Mainline-portable today? |
|---|---|---|
| 0 Safety | UI only | Yes |
| 1 Airframe | UI state | Yes |
| **2 Apply** | `wingApply()` → MSP2_SET_WING_TUNING + standard MSPs + CLI batch + reboot | **No (this plan fixes it)** |
| 3 Discovery | MSP_SET_SERVO_OVERRIDE, CLI resource swap | Yes |
| 4 Direction | MSP_RC poll, MSP_SET_SERVO_OVERRIDE pulse, MSP_SET_SERVO_MIX_RULE commit | Yes |
| 5 Endpoints | MSP_SET_SERVO_CONFIGURATION, dual-path servo pulse | Yes |
| 6 Motors | MSP_SET_MOTOR pulse, CLI mmix batches, CLI yaw flip | Yes |
| 7 Done | UI only | Yes |

---

## The change

### File 1: [src/js/utils/wingApply.js](src/js/utils/wingApply.js) — gate the wing-tuning MSP

Current (line 42):

```js
if (writeWingTuning) {
    await MSP.promise(MSPCodes.MSP2_SET_WING_TUNING, mspHelper.crunch(MSPCodes.MSP2_SET_WING_TUNING));
}
```

Proposed:

```js
import FC from "../fc";

const wingTuningSupported = FC.CONFIG?.wingCapabilities?.tuning === true;

if (writeWingTuning && wingTuningSupported) {
    await MSP.promise(MSPCodes.MSP2_SET_WING_TUNING, mspHelper.crunch(MSPCodes.MSP2_SET_WING_TUNING));
}
// On mainline: caller's cliBatch already includes wingPlaneDefaults +
// preset-specific `set` lines that cover s_pitch, s_roll, s_yaw,
// rates, pids — the same values the MSP would have written. CLI
// duplicate is documented at wingPlaneDefaults.js:73-76.
```

That's the load-bearing change. Two lines deleted, three added.

### File 2: [src/js/fc.js:63-68](src/js/fc.js#L63-L68) — verify capability default

Already correct:

```js
wingCapabilities: {
    tuning: false,
    launch: false,
    gpsRescue: false,
    autoland: false,
    combinedYaw: false,
}
```

`MSP2_GET_WING_CAPABILITIES` NACKs on mainline → object stays at defaults
→ `wingTuningSupported` is `false` → MSP skipped. No change needed.

### File 3: [src/components/tabs/WingTuningTab.vue:3099](src/components/tabs/WingTuningTab.vue#L3099) — same gate in `save()`

WingTuningTab also fires `MSP2_SET_WING_TUNING` directly in its `save()`
path. Same fix:

```js
if (FC.CONFIG?.wingCapabilities?.tuning === true) {
    await MSP.promise(MSPCodes.MSP2_SET_WING_TUNING, mspHelper.crunch(MSPCodes.MSP2_SET_WING_TUNING));
}
```

This isn't strictly needed for the wizard, but completes the
"mainline-safe" guarantee for the Wing Setup tab path the wizard
returns to on success.

---

## Verification plan

### Unit tests
1. `wingApply.test.js` — add cases for `wingCapabilities.tuning=false` →
   verify MSP2_SET_WING_TUNING is **not** called, but MSP_SET_MIXER_CONFIG,
   MSP_SET_SERVO_MIX_RULE, MSP_EEPROM_WRITE, and CLI batch all are.
2. `wingApply.test.js` — `wingCapabilities.tuning=true` → existing
   behavior unchanged (regression guard).

### Bench tests
1. **Wing-fork firmware** (FLYWOOF405NANO with `Bskimp/betaflight:wing-main`):
   wizard end-to-end should be byte-identical to today.
2. **Mainline firmware** (same FC re-flashed with stock 4.6.x):
   - Connect → caps stays all-false (verify in DevTools console)
   - Wizard Step 2 Apply → no error, mmix + planeDefaults CLI batch
     fires, FC reboots, comes back with correct preset values
   - Step 3-7 walk-through normal
   - `get s_pitch` over CLI returns 50, `get s_roll` returns 50,
     `get yaw_type` returns RUDDER (or DIFF_THRUST for flying wing)
3. Switch back to wing-fork: same wizard run produces same end state.

### What can't be tested without firmware fork builds
- Capability bit propagation timing (covered by existing connect flow)
- COMBINED yaw selection on mainline (already gated at [WingTuningTab.vue:2879-2881](src/components/tabs/WingTuningTab.vue#L2879-L2881) — preset auto-pick falls back to RUDDER, [1c9a5c51](src/components/tabs/WingTuningTab.vue#L3271))

---

## What this rework does NOT remove

The wing-fork MSP codes themselves stay — they're load-bearing for
actual wing-fork users who want fast, atomic, dirty-tracked writes
of wing tuning. CLI is the **fallback** for mainline, not a replacement.

Specifically:
- `MSP2_WING_TUNING` (read) — still used for Tuning tab dirty-detect.
  Mainline never had it; gracefully NACKs.
- `MSP2_SET_WING_LAUNCH` / `MSP2_SET_WING_GPS_RESCUE` /
  `MSP2_SET_WING_AUTOLAND` — wing-fork-only firmware features. Mainline
  doesn't have the firmware code paths *at all*, so CLI substitution
  isn't a question — those features simply don't exist on mainline.
  Already gated behind their respective capability bits.
- `MSP2_PULSE_SERVO` — already dual-pathed.
- `MSP2_GET_WING_CAPABILITIES` — needed for the gate itself.

**Bottom line: nothing can be safely removed.** Every wing MSP that
exists serves a wing-fork-only purpose that has no mainline equivalent.
The rework is purely additive (skip on mainline), not subtractive.

---

## What this rework DOES enable

1. **Wizard works on any board** running 2025.12.2 stock Betaflight,
   without flashing the wing fork first.
2. **Cleaner failure mode** — currently the wizard's Step 2 Apply will
   throw on mainline because `MSP.promise` rejects on NACK. After the
   change: skip → CLI batch → reboot → done.
3. **Future-proofs the wizard** for the eventual upstream merge. If/when
   the wing tuning fields land in mainline (PR #15124-style), the
   capability bit will flip true and the MSP path activates without
   any code change.

---

## Risks & open questions

1. **CLI parity check**: does `wingPlaneDefaults.js` cover *every* field
   that `MSP2_SET_WING_TUNING` would have written? The schema has 13
   fields (41 bytes V2). Verify by:
   - Cross-referencing [wingTuningSchema.js](src/js/msp/wingTuningSchema.js)
     against the `set X = Y` lines in
     [wingPlaneDefaults.js](src/js/utils/wingPlaneDefaults.js) and
     [planePresets.js](src/js/utils/planePresets.js).
   - Anything in the schema NOT covered by CLI is a wing-fork-only field
     mainline can't accept anyway → safe to skip silently.
2. **Reboot timing**: CLI `save` triggers reboot. Wizard already expects
   reboot at Apply. No change.
3. **Error reporting**: today, MSP NACK throws → wizard shows blocker.
   After change, mainline never errors at the MSP step → silent success.
   Acceptable since the CLI batch is the source of truth on mainline.
4. **Bench-only feature drift**: if Step 2 ever adds a wing-tuning field
   that *isn't* in `wingPlaneDefaults`, mainline users silently won't
   get that field's value. Mitigation: document in
   `wingPlaneDefaults.js` that **every** wing-tuning field with a
   mainline CLI equivalent must be CLI-duplicated. (Comment already
   suggests this discipline at lines 73-76.)

---

## Effort estimate

- Code change: 10 minutes (one file, ~5 lines)
- Tests: 30 minutes (two cases in existing wingApply.test.js)
- Bench validation: 1-2 hours (flash mainline, run wizard, verify CLI dump)
- WingTuningTab.vue:3099 mirror gate: 5 minutes
- Documentation: this file + a CLAUDE.md note under § Invariants

**Total: half-day if benches go clean. Full day if mainline reveals a
schema field that wingPlaneDefaults doesn't cover.**

---

## Suggested commit sequence

1. `feat(wing): gate MSP2_SET_WING_TUNING on capability bit`
   — `wingApply.js` change + unit tests
2. `feat(wing): mirror MSP2_SET_WING_TUNING gate in WingTuningTab.save`
   — `WingTuningTab.vue` change
3. `docs(wing): document mainline CLI fallback contract`
   — comment expansions in `wingPlaneDefaults.js`,
   CLAUDE.md § Invariants new section "Wizard mainline compatibility"
4. (Optional) `test(wing): bench validation for mainline wizard run`
   — only if we add an automated mainline bench

Each commit is independently revertable and benches in isolation.
