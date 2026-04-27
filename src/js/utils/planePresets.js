// Static plane airframe presets for the Wing Tuning tab's mixer section.
//
// BF servo-slot convention (MIXER_CUSTOM_AIRPLANE; see firmware
// servos.c:383-385 + BF Wiki "Custom Servo Mixing"):
//
//   slot  enum label        BF wiki convention   physical pad
//   ----  ----------------  -------------------  ------------
//    2    SERVO_FLAPS       Elevator / Pitch     SERVO 1
//    3    SERVO_FLAPPERON_1 Aileron L / Elevon L SERVO 2
//    4    SERVO_FLAPPERON_2 Aileron R / Elevon R SERVO 3
//    5    SERVO_RUDDER      Rudder / Yaw         SERVO 4
//    6    SERVO_ELEVATOR    (free / flaps)       SERVO 5
//    7    SERVO_THROTTLE    (free / flaps)       SERVO 6
//
// (The enum names are historical; the wiki labels describe what end-
// users wire up in practice, and that's what presets follow.)
//
// All presets write:
//   - mixerIndex 24 (MIXER_CUSTOM_AIRPLANE). Stock MIXER_FLYING_WING /
//     MIXER_AIRPLANE route through legacy internal slots and ignore
//     custom target channels.
//   - rules: servoMixer_t entries, target = internal slot (2..7).
//   - mmix: motor mix. BF has no MSP for mmix; applied via a narrow
//     CLI one-shot at preset-apply time (see wingMixerCli.js).
//   - yawType: the Wing Tuning yaw_type enum value this preset
//     assumes. RUDDER = rudder servo; DIFF_THRUST = twin-motor yaw.
//
// Rule fields (firmware: src/main/flight/servos.h):
//   target: internal slot index (2..7 for plane outputs).
//   input: INPUT_STABILIZED_* or INPUT_RC_*.
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

// Semantic names for the plane slot range. Each maps to a physical
// servo pad via BF convention (see header comment).
export const SLOT = {
    ELEVATOR: 2, // SERVO 1 pad
    FLAPPERON_L: 3, // SERVO 2 pad — aileron L or elevon L
    FLAPPERON_R: 4, // SERVO 3 pad — aileron R or elevon R
    RUDDER: 5, // SERVO 4 pad
    AUX_A: 6, // SERVO 5 pad — e.g. flap L
    AUX_B: 7, // SERVO 6 pad — e.g. flap R
};

export const PLANE_SLOT_MIN = 2;
export const PLANE_SLOT_MAX = 7;

// Physical pad mapping: physical SERVO pad number N = internal slot N+1.
// Exposed so the UI dropdown can render "S1..S6" labels while storing
// the underlying slot value.
export function physicalPadToSlot(pad) {
    return pad + 1;
}

export function slotToPhysicalPad(slot) {
    return slot - 1;
}

const CUSTOM_AIRPLANE = 24;

// Default mix range: full throw, always-on, no rate limit.
const FULL_THROW = { speed: 0, min: -100, max: 100, box: 0 };

function rule(target, input, rate, overrides = {}) {
    return { target, input, rate, ...FULL_THROW, ...overrides };
}

// Motor mix templates. Each entry: { throttle, roll, pitch, yaw } in
// firmware float units (0..1 for throttle, -1..+1 for axes).
const SINGLE_MOTOR = [{ throttle: 1.0, roll: 0, pitch: 0, yaw: 0 }];

// DIFF_THRUST_MOTORS removed 2026-04-20 along with the
// `flying_wing_diff_thrust` preset. The 2-motor toggle in WingTuningTab
// now synthesizes this mmix at apply time so every preset can opt into
// diff-thrust without a distinct preset entry.

// Per-preset wiring reference. Each entry: { pad, fn } — which
// physical FC pad the user should plug each control surface or motor
// signal wire into. Shown in the tab after a preset is applied.
//
// Pad names match BF silkscreen conventions: "SERVO 1" = first servo
// output pad, "MOTOR 1" = first motor output pad. If the board uses
// different silkscreen labels, the user's FC doc should still map to
// the same underlying pin order.

export const PLANE_PRESETS = {
    standard: {
        id: "standard",
        label: "Standard Plane",
        description: "Single motor. Elevator on S1, ailerons on S2/S3, rudder on S4.",
        mixerIndex: CUSTOM_AIRPLANE,
        yawType: "RUDDER",
        mmix: SINGLE_MOTOR,
        rules: [
            rule(SLOT.ELEVATOR, INPUT_SOURCES.STABILIZED_PITCH, +100),
            rule(SLOT.FLAPPERON_L, INPUT_SOURCES.STABILIZED_ROLL, +100),
            rule(SLOT.FLAPPERON_R, INPUT_SOURCES.STABILIZED_ROLL, -100),
            rule(SLOT.RUDDER, INPUT_SOURCES.STABILIZED_YAW, +100),
        ],
        wiring: [
            { pad: "SERVO 1", fn: "Elevator" },
            { pad: "SERVO 2", fn: "Aileron L" },
            { pad: "SERVO 3", fn: "Aileron R" },
            { pad: "SERVO 4", fn: "Rudder" },
            { pad: "MOTOR 1", fn: "Motor" },
        ],
    },

    flying_wing: {
        id: "flying_wing",
        label: "Flying Wing",
        description: "Single motor, two elevons on S2/S3 with 50/50 roll+pitch. No rudder.",
        mixerIndex: CUSTOM_AIRPLANE,
        yawType: "RUDDER",
        mmix: SINGLE_MOTOR,
        rules: [
            rule(SLOT.FLAPPERON_L, INPUT_SOURCES.STABILIZED_ROLL, +50),
            rule(SLOT.FLAPPERON_L, INPUT_SOURCES.STABILIZED_PITCH, +50),
            rule(SLOT.FLAPPERON_R, INPUT_SOURCES.STABILIZED_ROLL, -50),
            rule(SLOT.FLAPPERON_R, INPUT_SOURCES.STABILIZED_PITCH, +50),
        ],
        wiring: [
            { pad: "SERVO 2", fn: "Left Elevon" },
            { pad: "SERVO 3", fn: "Right Elevon" },
            { pad: "MOTOR 1", fn: "Motor" },
        ],
    },

    v_tail: {
        id: "v_tail",
        label: "V-Tail",
        description: "Single motor, ailerons on S2/S3, V-tail ruddervators on S1/S4 with 50/50 pitch+yaw.",
        mixerIndex: CUSTOM_AIRPLANE,
        yawType: "RUDDER",
        mmix: SINGLE_MOTOR,
        rules: [
            rule(SLOT.FLAPPERON_L, INPUT_SOURCES.STABILIZED_ROLL, +100),
            rule(SLOT.FLAPPERON_R, INPUT_SOURCES.STABILIZED_ROLL, -100),
            rule(SLOT.ELEVATOR, INPUT_SOURCES.STABILIZED_PITCH, +50),
            rule(SLOT.ELEVATOR, INPUT_SOURCES.STABILIZED_YAW, +50),
            rule(SLOT.RUDDER, INPUT_SOURCES.STABILIZED_PITCH, +50),
            rule(SLOT.RUDDER, INPUT_SOURCES.STABILIZED_YAW, -50),
        ],
        wiring: [
            { pad: "SERVO 1", fn: "Left V-Tail" },
            { pad: "SERVO 2", fn: "Aileron L" },
            { pad: "SERVO 3", fn: "Aileron R" },
            { pad: "SERVO 4", fn: "Right V-Tail" },
            { pad: "MOTOR 1", fn: "Motor" },
        ],
    },
};

export const PRESET_IDS = Object.keys(PLANE_PRESETS);
