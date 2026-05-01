// Pure direction-fix derivation for the Plane Setup Wizard's Direction
// step. Given the airframe's current smix rules + per-(surface, axis)
// observations from either Pilot Stick or Wizard Drives mode, computes
// the rate-sign flips needed to correct any "wrong direction" picks.
//
// Each surface can have rules driving multiple axes (e.g. an elevon has
// roll + pitch). User reports "match" or "wrong" per axis per surface.
// For each "wrong" observation we flip the corresponding rule's rate
// sign — that's a runtime MSP commit (MSP_SET_SERVO_MIX_RULE), no
// reboot needed.
//
// Pure function — no MSP, no Vue, no I/O. Fully unit-testable.

// Stabilized input source IDs from planePresets.INPUT_SOURCES — kept
// inline here so this utility doesn't import preset data.
const INPUT_STABILIZED_ROLL = 0;
const INPUT_STABILIZED_PITCH = 1;
const INPUT_STABILIZED_YAW = 2;

const AXIS_TO_INPUT = {
    roll: INPUT_STABILIZED_ROLL,
    pitch: INPUT_STABILIZED_PITCH,
    yaw: INPUT_STABILIZED_YAW,
};

export const OBS_MATCH = "match";
export const OBS_WRONG = "wrong";
export const OBS_NA = "na"; // axis has no rule on this surface — N/A

// Determine which axes a given surface actually drives (so the Direction
// walk only iterates relevant axes, not every axis on every surface).
//
// @param rules - FC.SERVO_RULES (array of {target, input, rate, ...})
// @param targetSlot - SLOT enum value (servoN + 1 by planePresets)
// @returns ["roll", "pitch", "yaw"] subset
export function axesForSurface(rules, targetSlot) {
    const axes = [];
    for (const axis of Object.keys(AXIS_TO_INPUT)) {
        const inputId = AXIS_TO_INPUT[axis];
        if (rules.some((r) => r.target === targetSlot && r.input === inputId)) {
            axes.push(axis);
        }
    }
    return axes;
}

// Look up the smix rule's signed rate for a given surface + axis.
// Returns null if no rule matches (treat as N/A in the wizard).
export function rateForSurfaceAxis(rules, targetSlot, axis) {
    const inputId = AXIS_TO_INPUT[axis];
    if (inputId === undefined) return null;
    const rule = rules.find((r) => r.target === targetSlot && r.input === inputId);
    return rule ? rule.rate : null;
}

// @param opts.rules               - FC.SERVO_RULES array
// @param opts.airframeSurfaces    - [{servoN, expectedSurface, label}]
//                                   servoN = SERVO N silkscreen number;
//                                   slot = servoN + 1 (planePresets).
// @param opts.observations        - {[servoN]: {[axis]: OBS_*}}
// @returns {
//   ruleFlips: [{ruleIdx, surface, axis, oldRate, newRate}],
//   needsApply: bool,
// }
export function computeDirectionFixes({ rules, airframeSurfaces, observations }) {
    const ruleFlips = [];

    for (const surface of airframeSurfaces) {
        const surfaceObs = observations[surface.servoN] ?? {};
        const targetSlot = surface.servoN + 1;

        for (const [axis, result] of Object.entries(surfaceObs)) {
            if (result !== OBS_WRONG) continue;
            const axisInput = AXIS_TO_INPUT[axis];
            if (axisInput === undefined) continue;

            // Flip rate sign on every rule with matching target + axis.
            // Multi-rule airframes (elevons targeting same slot with
            // different axes) only get the matching axis flipped.
            for (let i = 0; i < rules.length; i += 1) {
                const rule = rules[i];
                if (rule.target !== targetSlot) continue;
                if (rule.input !== axisInput) continue;
                ruleFlips.push({
                    ruleIdx: i,
                    surface: surface.expectedSurface,
                    axis,
                    oldRate: rule.rate,
                    newRate: -rule.rate,
                });
            }
        }
    }

    return {
        ruleFlips,
        needsApply: ruleFlips.length > 0,
    };
}
