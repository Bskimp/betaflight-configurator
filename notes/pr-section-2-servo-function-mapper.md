# Section 2 Draft: Generic Servo Function Mapper

## Summary

Adds a reusable Servo tab Function -> Output Mapping panel for editing Betaflight `smix` rules without making the workflow wing-only, and aligns the per-servo color accents across all three Servo tab views (config table, live bars, mapper rows, resource rows).

## Changes

### Generic mapper

- Extract the reusable mapper model and component used by the Servo tab.
- Keep the `smix` table pure: `Output | Input | Rate | Speed | Min | Max | Box | Delete`.
- Support all 8 servo target slots and all 14 Betaflight input sources, including `GIMBAL_PITCH` and `GIMBAL_ROLL`.
- Preserve raw `smix` target IDs internally while showing mixer-aware friendly output names.
- Keep aircraft helper buttons as generic servo/aircraft shortcuts rather than `USE_WING`-only behavior.
- Save servo configs, mixer mode, and servo mixer rules from the Servo tab without requiring firmware changes.

### Cross-view color alignment

The Servo tab shows the same 8 outputs in four places, but the firmware
exposes them through **two different enumerations**:

- `MSP_SERVO`, `MSP_SERVO_CONFIGURATIONS`, and `MSP_SERVO_MIX_RULES` are
  indexed by `servoIndex_e` (the logical mixer slot: `SERVO_FLAPS = 2`,
  `SERVO_FLAPPERON_1 = 3`, `SERVO_RUDDER = 5`, etc.). The bars, the top
  servo configuration table, and the smix mapper rows all live on this
  side. They line up naturally: bar 4 = `servo[3]` = pink, smix
  `target=3` = pink.
- `MSP2_MOTOR_SERVO_RESOURCE` returns **PWM-output slots** in the order
  the firmware's `writeServos()` switch allocates them per mixer mode.
  On `MIXER_AIRPLANE`, slot 0 -> `servo[2]` (Flaps), slot 1 -> `servo[3]`
  (Aileron 1), and so on. Slot index != `servoIndex_e`.

Before this change the Resource Assignments panel colored row N by N,
so on an airplane mixer "Servo 1" rendered yellow even though that pin
physically drives S3 / Flaps / green. The same servo had three different
colors across the three views.

To fix that without changing labels or save logic:

- Add `pwmSlotToServoIndex(slotIndex, mixerMode)` in
  `src/js/utils/servoMixerModel.js`, mirroring the firmware
  `writeServos()` switch (`AIRPLANE -> [2, 3, 4, 5, 6, 7]`,
  `FLYING_WING -> [3, 4]`, `BICOPTER -> [4, 5]`, etc.). Unknown mixers
  fall back to slot index; out-of-range slots return `null`.
- Resource panel rows and dots now color by
  `pwmSlotToServoIndex(servo.index, mixerMode.value)`. Slots that
  aren't driven by the active mixer render muted gray
  (`.servo-resource-row--inactive`) instead of being mis-colored.
- Color the top servo configuration table rows by their
  `servoIndex_e`, matching the live bars 1:1 (Servo 1 = yellow,
  ..., Servo 8 = purple).
- Result: the same physical servo shows the same accent color in the
  config table row, the live bar, the smix rule, and the resource
  pin row. Labels stay `Servo 1-8` everywhere - this is a coloring /
  visual-alignment change only, no logic or save-path changes.

## Screenshots

- Add Servo tab screenshot showing the Function -> Output Mapping panel.
- Add screenshot showing color linkage across all four views (config
  table row, live bar, mapper row, resource row) for the same servo.
- Add screenshot showing the muted/inactive treatment for resource
  slots that aren't driven by the active mixer (e.g. slots 6-7 on an
  airplane build).

## Test Plan

- Mapper loads existing `FC.SERVO_RULES`.
- Mapper preserves raw `smix` fields on edit/save.
- All 14 input sources render correctly.
- Output labels adapt by mixer context.
- Bench: pick a non-trivial mixer (airplane / flying-wing) and confirm
  that the same servo is rendered with the same accent color in all
  four places (config row, live bar, mapper row, resource row).
- `pwmSlotToServoIndex` unit tests cover every supported mixer mode,
  out-of-range slots, and unknown-mixer fallback
  (`test/js/utils/servoMixerModel.test.js`).
- No resource/pin data is inserted into the `smix` row structure.

## Upstream Risk Notes

- Section 2 is configurator-only and should not require firmware changes.
- Pin/resource assignment remains a separate panel from `smix` editing.
- Aircraft helpers add convenience defaults, but the base mapper remains
  usable for every Betaflight servo mixer mode.
- The slot -> `servoIndex_e` table in `pwmSlotToServoIndex` mirrors the
  firmware `writeServos()` switch. If upstream firmware adds a new
  mixer mode, the configurator falls back to slot-index coloring (no
  crash, no broken rendering) until a one-line table entry is added.
