// Static plane airframe presets for the Wing Tuning tab's mixer section.
//
// Each preset fills in:
//   - mixerIndex: 1-based FC.MIXER_CONFIG.mixer value (matches model.js:mixerList pos + 1)
//   - rules: array of servoMixer_t entries written via MSP_SET_SERVO_MIX_RULE.
//
// Rule field meanings (matches firmware src/main/flight/servos.h:servoMixer_s):
//   target: servo index, 0 = SERVO1
//   input: INPUT_STABILIZED_* or INPUT_RC_*, see INPUT_SOURCES below
//   rate: signed int8, -125..125, sign controls surface direction
//   speed: throttle-rate limiting, 0 = unlimited
//   min/max: signed int8, typically -100/+100 for full throw
//   box: 0 = always-on mixer, 1..3 = BOXSERVO1..3 mode-gated
//
// Mixer types are chosen so the FC's internal airplane/wing mixer does the
// right base thing; these custom rules layer on top. A maintainer can add
// more presets without touching any other file.

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

const FULL_THROW_RULE = { rate: 100, speed: 0, min: -100, max: 100, box: 0 };

function rule(target, input, override = {}) {
    return { target, input, ...FULL_THROW_RULE, ...override };
}

export const PLANE_PRESETS = {
    standard: {
        id: "standard",
        label: "Standard Plane",
        description: "Throttle + aileron L/R + elevator + rudder on M1, S1-S4.",
        mixerIndex: 14, // AIRPLANE (model.js:mixerList pos 13, 1-indexed)
        rules: [
            rule(0, INPUT_SOURCES.STABILIZED_ROLL, { rate: 100 }), // aileron L
            rule(1, INPUT_SOURCES.STABILIZED_ROLL, { rate: -100 }), // aileron R (reversed)
            rule(2, INPUT_SOURCES.STABILIZED_PITCH, { rate: 100 }), // elevator
            rule(3, INPUT_SOURCES.STABILIZED_YAW, { rate: 100 }), // rudder
        ],
    },

    flying_wing: {
        id: "flying_wing",
        label: "Flying Wing",
        description: "Throttle + two elevons. Pitch/roll mixed onto S1/S2.",
        mixerIndex: 8, // Flying Wing (model.js:mixerList pos 7)
        rules: [
            rule(0, INPUT_SOURCES.STABILIZED_ROLL, { rate: 100 }), // left elevon — roll
            rule(0, INPUT_SOURCES.STABILIZED_PITCH, { rate: 100 }), // left elevon — pitch
            rule(1, INPUT_SOURCES.STABILIZED_ROLL, { rate: -100 }), // right elevon — roll reversed
            rule(1, INPUT_SOURCES.STABILIZED_PITCH, { rate: 100 }), // right elevon — pitch
        ],
    },

    v_tail: {
        id: "v_tail",
        label: "V-Tail",
        description: "Throttle + aileron L/R + V-tail ruddervators on S3/S4.",
        mixerIndex: 14, // AIRPLANE (base mixer)
        rules: [
            rule(0, INPUT_SOURCES.STABILIZED_ROLL, { rate: 100 }), // aileron L
            rule(1, INPUT_SOURCES.STABILIZED_ROLL, { rate: -100 }), // aileron R
            rule(2, INPUT_SOURCES.STABILIZED_PITCH, { rate: 100 }), // ruddervator L — pitch
            rule(2, INPUT_SOURCES.STABILIZED_YAW, { rate: 100 }), // ruddervator L — yaw
            rule(3, INPUT_SOURCES.STABILIZED_PITCH, { rate: 100 }), // ruddervator R — pitch
            rule(3, INPUT_SOURCES.STABILIZED_YAW, { rate: -100 }), // ruddervator R — yaw reversed
        ],
    },

    delta: {
        id: "delta",
        label: "Delta",
        description: "Throttle + elevons + optional rudder. Same mix as flying wing.",
        mixerIndex: 8, // Flying Wing (delta is flying-wing-like electrically)
        rules: [
            rule(0, INPUT_SOURCES.STABILIZED_ROLL, { rate: 100 }), // left elevon
            rule(0, INPUT_SOURCES.STABILIZED_PITCH, { rate: 100 }),
            rule(1, INPUT_SOURCES.STABILIZED_ROLL, { rate: -100 }), // right elevon
            rule(1, INPUT_SOURCES.STABILIZED_PITCH, { rate: 100 }),
            rule(2, INPUT_SOURCES.STABILIZED_YAW, { rate: 100 }), // optional rudder on S3
        ],
    },
};

export const PRESET_IDS = Object.keys(PLANE_PRESETS);
