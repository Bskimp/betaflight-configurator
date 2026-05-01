// Pure yaw-direction derivation for the Plane Setup Wizard's Motors
// step yaw sub-phase.
//
// Twin-motor wings use diff-thrust (mmix yaw weights) to yaw. The
// wizard's preset apply lays down a known shape:
//   mmix 0  1.000  0.000  0.000  +0.400   (M1 / left)
//   mmix 1  1.000  0.000  0.000  -0.400   (M2 / right)
//
// If the user reports the yaw command rotates the plane the wrong way
// (e.g. yaw-right input causes a left rotation), the fix is to negate
// the yaw column on every mmix entry.
//
// We can't reliably read mmix back from FC (no MSP path on wing fork),
// so we generate the FLIPPED preset values and re-emit. Users who
// hand-edited mmix will see this overwrite their custom values — the
// wizard's reviewing screen warns about that case.
//
// Pure function — no MSP, no Vue, no I/O. Fully unit-testable.

export const OBS_MATCH = "match"; // Plane yawed the way the stick commanded
export const OBS_WRONG = "wrong"; // Yaw was inverted

// Default diff-thrust yaw weights as set by the preset apply (see
// WingTuningTab.vue:2719 for the source). If the preset's defaults
// change, update here so the flip stays in sync.
const DEFAULT_YAW_WEIGHT = 0.4;

// @param opts.observation  - OBS_MATCH | OBS_WRONG
// @param opts.motorCount   - number of motors (only twin-motor flips here)
// @returns {
//   needsFlip: bool,
//   cliLines:  [string],
// }
export function computeYawFlipPlan({ observation, motorCount }) {
    if (observation !== OBS_WRONG || motorCount !== 2) {
        return { needsFlip: false, cliLines: [] };
    }
    // After the flip: M1 yaw = -default, M2 yaw = +default.
    const mmix0Yaw = -DEFAULT_YAW_WEIGHT;
    const mmix1Yaw = +DEFAULT_YAW_WEIGHT;
    const cliLines = [
        // mmix indices 0/1 carry the twin-motor pair — leave throttle/
        // roll/pitch alone (preset values), negate yaw.
        `mmix 0 1.000 0.000 0.000 ${mmix0Yaw.toFixed(3)}`,
        `mmix 1 1.000 0.000 0.000 ${mmix1Yaw.toFixed(3)}`,
    ];
    return { needsFlip: true, cliLines };
}
