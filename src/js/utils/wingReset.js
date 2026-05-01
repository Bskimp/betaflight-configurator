// Surgical wing-config reset utilities. Two flavors:
//
//   autoCleanCliLines() — prefix injected into every wing apply (wizard
//     and manual mixer Save). Clears stale mmix entries + SERVO/MOTOR
//     resource binds so a new preset's commits don't leak onto trailing
//     indices from a previous preset. Does NOT touch servo configs
//     (min/max/middle/rate) so user-tuned endpoints survive.
//
//     Smix is intentionally NOT reset here — wingApply writes new smix
//     rules via MSP_SET_SERVO_MIX_RULE BEFORE the CLI batch runs, and
//     a `smix reset` line in the batch would wipe the freshly-written
//     rules. Smix staleness (trailing rule indices not overwritten) is
//     handled at the JS layer by truncating FC.SERVO_RULES on apply.
//
//   fullWingResetCliLines() — explicit "Reset wing config" button at
//     the top of Wing Tuning. Adds smix reset + servo config defaults
//     to autoClean. No MSP write follows, so smix reset is safe here.
//     UART/RX/modes/battery cal/OSD/VTX/LED/failsafe stay untouched.
//
// CLI assumption: applyCliLines from wingMixerCli appends `save` if
// not present; BF reboots on save. So either function's output, run
// through applyCliLines, gives a clean reset + reboot.

const MAX_SERVO_INDEX = 8;
const MAX_MOTOR_INDEX = 8;
const MAX_SERVO_CONFIG_COUNT = 8;

// BF default servo config: min=1000 max=2000 middle=1500 rate=100
// forwardChannel=0 reverse=-1 (per servos CLI command help)
const DEFAULT_SERVO_LINE = "1000 2000 1500 100 0 -1";

// Auto-clean prefix for wingApply. Order matters: clear motor mix and
// resource binds before the user batch's mmix/resource writes populate
// fresh state. The `save` is appended by applyCliLines downstream.
export function autoCleanCliLines() {
    const lines = ["mmix reset"];
    for (let n = 1; n <= MAX_SERVO_INDEX; n += 1) {
        lines.push(`resource SERVO ${n} NONE`);
    }
    for (let n = 1; n <= MAX_MOTOR_INDEX; n += 1) {
        lines.push(`resource MOTOR ${n} NONE`);
    }
    return lines;
}

// Full surgical reset for the explicit reset button. Includes
// smix reset (safe — no MSP smix write follows this batch) and
// defaults each servo's per-channel config back to factory.
export function fullWingResetCliLines() {
    const lines = ["smix reset", ...autoCleanCliLines()];
    for (let n = 0; n < MAX_SERVO_CONFIG_COUNT; n += 1) {
        lines.push(`servo ${n} ${DEFAULT_SERVO_LINE}`);
    }
    return lines;
}
