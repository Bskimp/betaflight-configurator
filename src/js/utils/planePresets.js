// Static plane airframe presets for the Wing Tuning tab's mixer section.
//
// All presets write:
//   - mixerIndex 24 (MIXER_CUSTOM_AIRPLANE). Stock MIXER_FLYING_WING /
//     MIXER_AIRPLANE ignore custom smix target channels and write servos
//     to legacy internal slots (SERVO_FLAPPERON_1=3, SERVO_FLAPPERON_2=4
//     — see servos.c:376-378). CUSTOM_AIRPLANE honors the custom smix
//     directly so our target=0..3 map to physical S1..S4.
//   - rules: servoMixer_t entries sent one at a time via
//     MSP_SET_SERVO_MIX_RULE.
//   - mmix: motor mix rules. BF has no MSP for mmix today, so these are
//     applied via a narrow CLI one-shot at preset-apply time (see
//     wingMixerCli.js). Presets that only need the firmware default
//     (single motor = full throttle, no axis mix) pass null to skip
//     the CLI round-trip.
//   - yawType: the Wing Tuning yaw_type enum value this preset assumes.
//     Clicking the preset also sets the Wing Tuning field so yaw
//     behavior matches the mmix.
//
// Rule field meanings (firmware: src/main/flight/servos.h):
//   target: servo index, 0 = SERVO1
//   input: INPUT_STABILIZED_* or INPUT_RC_* (see INPUT_SOURCES)
//   rate: signed int8, -125..125. Sign controls surface direction.
//         Shared-axis servos (elevons, ruddervators) use 50 to avoid
//         saturation when both axes hit full deflection.
//   speed: throttle-rate limiting, 0 = unlimited.
//   min/max: signed int8, typically -100/+100 for full throw.
//   box: 0 = always-on, 1..3 = BOXSERVO1..3 mode-gated.

export const INPUT_SOURCES = {
    STABILIZED_ROLL: 0,
    STABILIZED_PITCH: 1,
    STABILIZED_YAW: 2,
    STABILIZED_THROTTLE: 3,
    RC_ROLL: 4,
    RC_PITCH: 5,
    RC_YAW: 6,
    RC_THROTTLE: 7,
    RC_AUX1: 8,
    RC_AUX2: 9,
    RC_AUX3: 10,
    RC_AUX4: 11,
};

const CUSTOM_AIRPLANE = 24;

// Default mix range: full throw, always-on, no rate limit.
const FULL_THROW = { speed: 0, min: -100, max: 100, box: 0 };

function rule(target, input, rate, overrides = {}) {
    return { target, input, rate, ...FULL_THROW, ...overrides };
}

// Motor mix templates. Each entry: { throttle, roll, pitch, yaw } in
// firmware float units (0..1 for throttle, -1..+1 for axes).
const SINGLE_MOTOR = [{ throttle: 1.0, roll: 0, pitch: 0, yaw: 0 }];

const DIFF_THRUST_MOTORS = [
    { throttle: 1.0, roll: 0, pitch: 0, yaw: +0.4 },
    { throttle: 1.0, roll: 0, pitch: 0, yaw: -0.4 },
];

export const PLANE_PRESETS = {
    standard: {
        id: "standard",
        label: "Standard Plane",
        description: "Throttle on M1, aileron L/R + elevator + rudder on S1-S4. Rudder yaw.",
        mixerIndex: CUSTOM_AIRPLANE,
        yawType: "RUDDER",
        mmix: SINGLE_MOTOR,
        rules: [
            rule(0, INPUT_SOURCES.STABILIZED_ROLL, +100), // S1 aileron L
            rule(1, INPUT_SOURCES.STABILIZED_ROLL, -100), // S2 aileron R (reversed)
            rule(2, INPUT_SOURCES.STABILIZED_PITCH, +100), // S3 elevator
            rule(3, INPUT_SOURCES.STABILIZED_YAW, +100), // S4 rudder
        ],
    },

    flying_wing_rudder: {
        id: "flying_wing_rudder",
        label: "Flying Wing (rudder)",
        description:
            "Throttle on M1, elevons on S1/S2, rudder on S3. Elevons use 50/50 roll+pitch to prevent saturation.",
        mixerIndex: CUSTOM_AIRPLANE,
        yawType: "RUDDER",
        mmix: SINGLE_MOTOR,
        rules: [
            rule(0, INPUT_SOURCES.STABILIZED_ROLL, +50), // S1 L elevon — roll
            rule(0, INPUT_SOURCES.STABILIZED_PITCH, +50), // S1 L elevon — pitch
            rule(1, INPUT_SOURCES.STABILIZED_ROLL, -50), // S2 R elevon — roll reversed
            rule(1, INPUT_SOURCES.STABILIZED_PITCH, +50), // S2 R elevon — pitch
            rule(2, INPUT_SOURCES.STABILIZED_YAW, +100), // S3 rudder
        ],
    },

    flying_wing_diff_thrust: {
        id: "flying_wing_diff_thrust",
        label: "Flying Wing (diff thrust)",
        description: "Twin motors on M1/M2 driving yaw, elevons on S1/S2. No rudder servo.",
        mixerIndex: CUSTOM_AIRPLANE,
        yawType: "DIFF_THRUST",
        mmix: DIFF_THRUST_MOTORS,
        rules: [
            rule(0, INPUT_SOURCES.STABILIZED_ROLL, +50),
            rule(0, INPUT_SOURCES.STABILIZED_PITCH, +50),
            rule(1, INPUT_SOURCES.STABILIZED_ROLL, -50),
            rule(1, INPUT_SOURCES.STABILIZED_PITCH, +50),
        ],
    },

    v_tail: {
        id: "v_tail",
        label: "V-Tail",
        description: "Throttle + ailerons on S1/S2 at full throw. V-tail ruddervators on S3/S4 with 50/50 pitch+yaw.",
        mixerIndex: CUSTOM_AIRPLANE,
        yawType: "RUDDER",
        mmix: SINGLE_MOTOR,
        rules: [
            rule(0, INPUT_SOURCES.STABILIZED_ROLL, +100), // S1 aileron L
            rule(1, INPUT_SOURCES.STABILIZED_ROLL, -100), // S2 aileron R
            rule(2, INPUT_SOURCES.STABILIZED_PITCH, +50), // S3 ruddervator L — pitch
            rule(2, INPUT_SOURCES.STABILIZED_YAW, +50), // S3 ruddervator L — yaw
            rule(3, INPUT_SOURCES.STABILIZED_PITCH, +50), // S4 ruddervator R — pitch
            rule(3, INPUT_SOURCES.STABILIZED_YAW, -50), // S4 ruddervator R — yaw reversed
        ],
    },
};

export const PRESET_IDS = Object.keys(PLANE_PRESETS);
