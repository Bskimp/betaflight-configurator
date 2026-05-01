# Wing Tuning — User Guide

Configurator-side tooling for fixed-wing builds running Betaflight's
wing fork. This guide covers the Wing Tuning tab, its Plane Setup
Wizard, manual Mixer flow, and the recovery / reset path.

For firmware-level details (smix / mmix / resource), see the Betaflight
docs at <https://betaflight.com/docs>. For tuning theory, the canonical
draft is the BF discussion #14032
(<https://github.com/betaflight/betaflight/discussions/14032>).

---

## Tab anatomy

The **Wing Tuning** tab in the left sidebar is the consolidated home
for everything wing-specific:
(Some tabs hidden without branched TEST firmware, please dont consider branched firmware as safe if you do use it)
```
┌─ Status ─────────────────────────────────┐
│ Live sync state with FC                  │
└──────────────────────────────────────────┘
┌─ Plane Setup Wizard ─────────────────────┐
│ [ Start Wizard ]   [ Reset wing config ] │
└──────────────────────────────────────────┘
┌─ Sub-tabs ───────────────────────────────┐
│ Tuning · Mixer · Launch · GPS Rescue ·   │
│ Autoland · Hardware                      │
└──────────────────────────────────────────┘
```

The launcher card at the top is always visible regardless of which
sub-tab is active.

---

## Plane Setup Wizard

The wizard is a **modal, step-by-step setup** for new wing builds. It
walks pad allocation, servo identity, direction verification, endpoint
calibration, and motor identity in a single guided flow.

### When to use it

- **First-time setup** of a wing on a freshly-flashed FC
- **After major rewiring** (different servo pads, motor swap, ESC change)
- **Switching airframe types** (e.g. Standard → V-Tail)
- **Recovery after the explicit "Reset wing config" button** below

For tweaking one parameter on a working wing, skip the wizard and
edit directly in the relevant sub-tab — the wizard's Apply step
will reset rates / PIDs / DMax / FF to plane-safe baselines, which
overwrites manual tuning.

### The 8 steps

| # | Step | What it does |
|---|---|---|
| 1 | **Safety** | Confirm props removed; refuses to proceed if FC is armed |
| 2 | **Airframe** | Pick Standard / Flying Wing / V-Tail; choose 1 or 2 motors; pick battery cell count (2S–6S) |
| 3 | **Apply** | Commits the preset (mmix / smix / resources / plane defaults) and reboots the FC |
| 4 | **Discovery** | Pulses each servo output one at a time; user reports which physical surface moved. Auto-detects pad swaps and offers a one-click remap |
| 5 | **Direction** | Walks each (surface, axis) pair; user verifies deflection direction. Wrong picks auto-flip the smix rate sign |
| 6 | **Endpoints** | Holds each servo at MIN/MAX so the user can adjust travel limits per surface |
| 7 | **Motors** | Pulses each motor; user identifies physical position. Optional "Scan free pads" sub-flow for motors wired to non-default pads |
| 8 | **Done** | Summary of what was committed |

### Discovery's "Scan free pads" sub-flow

If the user reports "Nothing moved" during Discovery and unused
silkscreen-MOTOR pads exist on the board, the wizard offers to:

1. Reassign each unused MOTOR pad as a temporary SERVO slot
2. Reboot
3. Walk each scratch slot — pulse + ask "What moved?"
4. Rebuild the resource map placing servos on whichever pads
   actually move
5. Reboot again

This catches the case where a servo is wired to a pad the wizard's
recommender didn't expect.

### Motors step's "Scan free pads" sub-flow

Same shape but for motors — fires when the regular Motor identity
walk reports a missing motor AND silkscreen-MOTOR pads are free:

1. Release the missing motor's prior binding
2. Bind each free silkscreen-MOTOR pad as a temporary scratch motor
3. Reboot
4. Walk each scratch slot — user picks "Motor X spun on this pad"
   or "Nothing moved" (defaults to Nothing)
5. Rebuild motor bindings on the identified pads
6. Reboot

### Auto-resume across reboots

The wizard persists its phase + state to `localStorage` before each
reboot-triggering commit. After the FC reboots and the configurator
reconnects, the wizard re-opens to the right step without user action.

Resume markers expire after 5 minutes or if the configurator connects
to a different target (i.e. you flashed a different board mid-flow).

---

## Manual Mixer-tab flow

For users who already understand BF mixer config, the **Mixer**
sub-tab supports direct preset apply without the wizard:

### Preset cards

Three buttons: **Standard Plane** / **Flying Wing** / **V-Tail**.
Clicking stages the preset's:
- mmix entries
- smix rules
- airframe = MIXER_CUSTOM_AIRPLANE
- yaw_type (auto-derived from preset + motor count)
- pin assignment plan (recommender pads)

**Nothing commits yet** — Save is the sole commit point.

### Twin-motor toggle

Below the preset cards: "Use 2 motors (differential thrust)". When
on, the next Save adds MOTOR 2 to the mmix with ±0.4 yaw weight and
switches yaw_type to DIFF_THRUST. Off for single-motor wings.

### Yaw type dropdown

- **RUDDER** — yaw via rudder servo only (single-motor + optional
  rudder)
- **DIFF_THRUST** — yaw via motor differential only (twin-motor, no
  rudder). Auto-zeroes `s_yaw` to avoid servo/motor conflict
- **COMBINED** Only on branched firmware, still in testing phases — airspeed-weighted blend of the two (twin-motor +
  rudder; rudder takes over at cruise, motors at slow flight)

Auto-picked by the preset cards based on motor count + whether the
preset has a STABILIZED_YAW rule. Mainline always defaults to thrust diff for 2 motors or rudder for 1

### Save behavior

Save commits everything dirty in one EEPROM_WRITE + CLI batch +
reboot. The CLI batch prefix (applied on every Save, wizard or
manual) clears stale state so a new preset doesn't leak old
indices:

| Prefix line | Effect |
|---|---|
| `mmix reset` | Wipe all motor mix entries |
| `resource SERVO 1-8 NONE` | Release all servo pad bindings |
| `resource MOTOR 1-8 NONE` | Release all motor pad bindings |

After the prefix, the new preset's `mmix` and `resource` lines
populate, plus universal plane defaults and tuning starting points
(see "Plane defaults" below).

**Servo configs (min/max/middle/rate) and smix rules are NOT in
the auto-clean prefix** — smix is handled by JS-side `padRulesToMax`
which truncates trailing rules with sentinels; servo configs are
explicitly preserved across preset switches.

---

## Plane defaults applied on every Save

Sourced from BF discussion #14032. Universal across airframes; apply
on every preset Save (wizard or mixer-tab):

### Wing tuning (MSP)

| Field | Value | Notes |
|---|---|---|
| `s_pitch` | 50 | S-term feedforward pitch |
| `s_roll` | 50 | S-term feedforward roll |
| `s_yaw` | 50 (RUDDER) / 0 (DIFF_THRUST) | Auto-zeroed on DIFF_THRUST |
| `angle_earth_ref` | 0 | Craft-relative angle reference |
| `tpa_mode` | PD | PDS deferred until plane flies well |
| `tpa_speed_max_voltage` | cells × 4.20V × 100 | From battery cells picker |

### Feature toggles (CLI)

| Setting | Value | Why |
|---|---|---|
| `set anti_gravity_gain` | 0 | Quad-only feature |
| `set iterm_relax_cutoff` | 5 | Plane-friendly stick response |
| `set servo_pwm_rate` | 50 | Universal-safe rate; bump to 150/333 in Tuning tab if servos support it |
| `set gps_use_3d_speed` | ON | Records 3D speed in blackbox |

### Tuning starting points (CLI)

Rates use ACTUAL mode; CLI values are stored ÷10 (so 50 displays
as 500 deg/s in the Rates tab).

| Setting | Value | Display |
|---|---|---|
| `rates_type` | ACTUAL | — |
| `roll_srate` | 50 | 500 deg/s |
| `pitch_srate` | 25 | 250 deg/s |
| `yaw_srate` | 15 | 150 deg/s |
| `p/i/d_(roll/pitch/yaw)` | 10 / 10 / 5 | Per axis |
| `i_yaw` | 0 (when DIFF_THRUST) | Avoids I-buildup at high airspeed |
| `d_max_(roll/pitch/yaw)` | 0 | Quad defaults are noisy for planes |
| `f_(roll/pitch/yaw)` | 0 | Tune up from clean zero in PID tab |

These ARE destructive of prior tuning — applying a preset is treated
as a major airframe change where prior tunings wouldn't transfer
correctly anyway.

---

## Reset wing config

The secondary button on the launcher card. Runs a deeper surgical
reset for the "everything is broken, start over" case.

Wipes:
- All servo mixer rules (`smix reset`)
- All motor mixer entries (`mmix reset`)
- All SERVO and MOTOR resource pad bindings
- Servo endpoints (min / max / middle / rate) defaulted

**Preserves:**
- UART / serial config
- RX / receiver setup
- Modes / aux channels
- Battery calibration
- OSD layout
- VTX settings
- LED colors
- Failsafe config

The FC reboots after the reset. The wizard does NOT auto-launch —
user clicks Start Wizard themselves once the configurator
reconnects to the clean state.

---

## Troubleshooting

### Wizard opens to wrong step on resume

Usually caused by the configurator's MSP queue overflowing during
a CLI session — `loadHardware()` times out before the resume marker
is consumed, and the wizard falls back to the default step.

Fix: hard-refresh the configurator. If it persists, check the MSP
debug dashboard (see below) for stuck callbacks.

### MSP debug dashboard

Open via `MSPDebug.show()` typed into the DevTools console. (The
keyboard shortcut Ctrl+Shift+M conflicts with Chrome's profile
switcher — use the console command instead.)

Shows queue depth, in-flight requests, callback counts, and per-MSP-code
breakdown. Useful when the configurator gets into a stuck-queue
state.

### Wizard says "no motors identified" after motor scan

Caused by an upstream bug where the configurator's expected-motor
list rebuilt from the FC's current resource map (which has scratch
slots, not the original missing motors). Fixed in the wizard now
— the missing list derives from the persisted observations directly.

If you hit this on an old build, hard-refresh and re-run the wizard
fresh on the current build.

### Stale timer assignments after re-running wizard

The auto-clean prefix on every Save clears mmix + resource bindings
before the preset's lines populate. If you still see weirdness, hit
**Reset wing config** for the full surgical reset.

---

## Where to look in code

- `src/components/tabs/WingTuningTab.vue` — the tab itself, all
  sub-tabs and Save flow
- `src/components/wing/PlaneSetupWizard.vue` — the modal wizard
- `src/js/utils/planePresets.js` — Standard / Flying Wing / V-Tail
  preset definitions
- `src/js/utils/wingApply.js` — extracted commit utility (currently
  reserved for future consolidation; the inline `save()` in
  WingTuningTab is the active path)
- `src/js/utils/wingReset.js` — auto-clean + full-reset CLI batch
  generators
- `src/js/utils/wingPlaneDefaults.js` — plane defaults + tuning
  starting points CLI batches
- `src/js/utils/wingResourceRemap.js` — Discovery's swap-detection +
  scan-plan logic
- `src/js/utils/wingDirectionFix.js` — Direction's rate-sign flip
  derivation
- `src/js/utils/wingEndpoints.js` — Endpoints walker state machine
- `src/js/utils/wingMotors.js` — Motors identity / scan-plan / scan-
  final logic
- `src/js/utils/wingRemapRecommender.js` — pad allocator (silkscreen-
  order picker for the wizard, joint optimizer for legacy callers)
