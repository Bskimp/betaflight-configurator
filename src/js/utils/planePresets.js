// Static plane airframe presets for the Wing Tuning tab's mixer section.
//
// All presets write:
//   - mixerIndex 24 (MIXER_CUSTOM_AIRPLANE). Stock MIXER_FLYING_WING /
//     MIXER_AIRPLANE route servos through legacy slots (servos.c:376-378)
//     and ignore custom target channels. CUSTOM_AIRPLANE honors custom
//     smix targets via SERVO_PLANE_INDEX_MIN..MAX = slots 2..7
//     (servos.c:381-385, servos.h:75-76).
//   - rules: servoMixer_t entries sent one at a time via
//     MSP_SET_SERVO_MIX_RULE. Target channel is the INTERNAL SLOT
//     INDEX (2 = SERVO_FLAPS → physical S1, 3 = SERVO_FLAPPERON_1 →
//     physical S2, etc — NOT zero-based physical output).
//   - mmix: motor mix rules. BF has no MSP for mmix today, so these are
//     applied via a narrow CLI one-shot at preset-apply time (see
//     wingMixerCli.js).
//   - yawType: the Wing Tuning yaw_type enum value this preset assumes.
//
// Physical servo output ↔ slot mapping (MIXER_CUSTOM_AIRPLANE):
//   S1 pad ← slot 2 (SERVO_FLAPS)
//   S2 pad ← slot 3 (SERVO_FLAPPERON_1)
//   S3 pad ← slot 4 (SERVO_FLAPPERON_2)
//   S4 pad ← slot 5 (SERVO_RUDDER)
//   S5 pad ← slot 6 (SERVO_ELEVATOR)
//   S6 pad ← slot 7 (SERVO_THROTTLE)
//
// Rule field meanings (firmware: src/main/flight/servos.h):
//   target: internal slot index (2..7 for plane outputs).
//   input: INPUT_STABILIZED_* or INPUT_RC_* (see INPUT_SOURCES).
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

// Plane slot enum (firmware: src/main/flight/servos.h).
// target channels in preset rules must stay within this range so
// MIXER_CUSTOM_AIRPLANE routes them to physical servo pads.
export const PLANE_SLOTS = {
    S1: 2, // SERVO_FLAPS
    S2: 3, // SERVO_FLAPPERON_1
    S3: 4, // SERVO_FLAPPERON_2
    S4: 5, // SERVO_RUDDER
    S5: 6, // SERVO_ELEVATOR
    S6: 7, // SERVO_THROTTLE
};

export const PLANE_SLOT_MIN = 2;
export const PLANE_SLOT_MAX = 7;

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
        description: "Single motor + aileron L/R + elevator + rudder on S1-S4.",
        mixerIndex: CUSTOM_AIRPLANE,
        yawType: "RUDDER",
        mmix: SINGLE_MOTOR,
        rules: [
            rule(PLANE_SLOTS.S1, INPUT_SOURCES.STABILIZED_ROLL, +100), // aileron L
            rule(PLANE_SLOTS.S2, INPUT_SOURCES.STABILIZED_ROLL, -100), // aileron R (reversed)
            rule(PLANE_SLOTS.S3, INPUT_SOURCES.STABILIZED_PITCH, +100), // elevator
            rule(PLANE_SLOTS.S4, INPUT_SOURCES.STABILIZED_YAW, +100), // rudder
        ],
    },

    // Flying wing = elevons only, single motor, no rudder. Most common
    // delta/wing layout. Yaw control is effectively zero from pilot
    // inputs — typical for rudderless wings, which turn by rolling.
    flying_wing: {
        id: "flying_wing",
        label: "Flying Wing",
        description: "Single motor, two elevons on S1/S2 with 50/50 roll+pitch. No rudder.",
        mixerIndex: CUSTOM_AIRPLANE,
        yawType: "RUDDER",
        mmix: SINGLE_MOTOR,
        rules: [
            rule(PLANE_SLOTS.S1, INPUT_SOURCES.STABILIZED_ROLL, +50), // L elevon — roll
            rule(PLANE_SLOTS.S1, INPUT_SOURCES.STABILIZED_PITCH, +50), // L elevon — pitch
            rule(PLANE_SLOTS.S2, INPUT_SOURCES.STABILIZED_ROLL, -50), // R elevon — roll reversed
            rule(PLANE_SLOTS.S2, INPUT_SOURCES.STABILIZED_PITCH, +50), // R elevon — pitch
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
            rule(PLANE_SLOTS.S1, INPUT_SOURCES.STABILIZED_ROLL, +50),
            rule(PLANE_SLOTS.S1, INPUT_SOURCES.STABILIZED_PITCH, +50),
            rule(PLANE_SLOTS.S2, INPUT_SOURCES.STABILIZED_ROLL, -50),
            rule(PLANE_SLOTS.S2, INPUT_SOURCES.STABILIZED_PITCH, +50),
        ],
    },

    v_tail: {
        id: "v_tail",
        label: "V-Tail",
        description: "Single motor, aileron L/R on S1/S2, V-tail ruddervators on S3/S4 with 50/50 pitch+yaw.",
        mixerIndex: CUSTOM_AIRPLANE,
        yawType: "RUDDER",
        mmix: SINGLE_MOTOR,
        rules: [
            rule(PLANE_SLOTS.S1, INPUT_SOURCES.STABILIZED_ROLL, +100), // aileron L
            rule(PLANE_SLOTS.S2, INPUT_SOURCES.STABILIZED_ROLL, -100), // aileron R
            rule(PLANE_SLOTS.S3, INPUT_SOURCES.STABILIZED_PITCH, +50), // ruddervator L — pitch
            rule(PLANE_SLOTS.S3, INPUT_SOURCES.STABILIZED_YAW, +50), // ruddervator L — yaw
            rule(PLANE_SLOTS.S4, INPUT_SOURCES.STABILIZED_PITCH, +50), // ruddervator R — pitch
            rule(PLANE_SLOTS.S4, INPUT_SOURCES.STABILIZED_YAW, -50), // ruddervator R — yaw reversed
        ],
    },
};

export const PRESET_IDS = Object.keys(PLANE_PRESETS);
