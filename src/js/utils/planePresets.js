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

const DIFF_THRUST_MOTORS = [
    { throttle: 1.0, roll: 0, pitch: 0, yaw: +0.4 },
    { throttle: 1.0, roll: 0, pitch: 0, yaw: -0.4 },
];

export const PLANE_PRESETS = {
    standard: {
        id: "standard",
        label: "Standard Plane",
        description: "Single motor. Elevator on S1, ailerons on S2/S3, rudder on S4.",
        mixerIndex: CUSTOM_AIRPLANE,
        yawType: "RUDDER",
        mmix: SINGLE_MOTOR,
        rules: [
            rule(SLOT.ELEVATOR, INPUT_SOURCES.STABILIZED_PITCH, +100), // S1 elevator
            rule(SLOT.FLAPPERON_L, INPUT_SOURCES.STABILIZED_ROLL, +100), // S2 aileron L
            rule(SLOT.FLAPPERON_R, INPUT_SOURCES.STABILIZED_ROLL, -100), // S3 aileron R
            rule(SLOT.RUDDER, INPUT_SOURCES.STABILIZED_YAW, +100), // S4 rudder
        ],
    },

    // Single-motor flying wing: two elevons, no rudder. Most common
    // wing setup. Yaw control is effectively zero from pilot inputs —
    // rudderless wings turn by rolling.
    flying_wing: {
        id: "flying_wing",
        label: "Flying Wing",
        description: "Single motor, two elevons on S2/S3 with 50/50 roll+pitch. No rudder.",
        mixerIndex: CUSTOM_AIRPLANE,
        yawType: "RUDDER",
        mmix: SINGLE_MOTOR,
        rules: [
            rule(SLOT.FLAPPERON_L, INPUT_SOURCES.STABILIZED_ROLL, +50), // S2 L elevon — roll
            rule(SLOT.FLAPPERON_L, INPUT_SOURCES.STABILIZED_PITCH, +50), // S2 L elevon — pitch
            rule(SLOT.FLAPPERON_R, INPUT_SOURCES.STABILIZED_ROLL, -50), // S3 R elevon — roll reversed
            rule(SLOT.FLAPPERON_R, INPUT_SOURCES.STABILIZED_PITCH, +50), // S3 R elevon — pitch
        ],
    },

    flying_wing_diff_thrust: {
        id: "flying_wing_diff_thrust",
        label: "Flying Wing (diff thrust)",
        description: "Twin motors on M1/M2 driving yaw, elevons on S2/S3. No rudder servo.",
        mixerIndex: CUSTOM_AIRPLANE,
        yawType: "DIFF_THRUST",
        mmix: DIFF_THRUST_MOTORS,
        rules: [
            rule(SLOT.FLAPPERON_L, INPUT_SOURCES.STABILIZED_ROLL, +50),
            rule(SLOT.FLAPPERON_L, INPUT_SOURCES.STABILIZED_PITCH, +50),
            rule(SLOT.FLAPPERON_R, INPUT_SOURCES.STABILIZED_ROLL, -50),
            rule(SLOT.FLAPPERON_R, INPUT_SOURCES.STABILIZED_PITCH, +50),
        ],
    },

    // V-tail plane: two ailerons (S2/S3) + V-tail ruddervators on the
    // ELEVATOR and RUDDER slots (S1/S4). Each V-tail surface mixes
    // pitch + yaw at 50/50.
    v_tail: {
        id: "v_tail",
        label: "V-Tail",
        description: "Single motor, ailerons on S2/S3, V-tail ruddervators on S1/S4 with 50/50 pitch+yaw.",
        mixerIndex: CUSTOM_AIRPLANE,
        yawType: "RUDDER",
        mmix: SINGLE_MOTOR,
        rules: [
            rule(SLOT.FLAPPERON_L, INPUT_SOURCES.STABILIZED_ROLL, +100), // S2 aileron L
            rule(SLOT.FLAPPERON_R, INPUT_SOURCES.STABILIZED_ROLL, -100), // S3 aileron R
            rule(SLOT.ELEVATOR, INPUT_SOURCES.STABILIZED_PITCH, +50), // S1 L ruddervator — pitch
            rule(SLOT.ELEVATOR, INPUT_SOURCES.STABILIZED_YAW, +50), // S1 L ruddervator — yaw
            rule(SLOT.RUDDER, INPUT_SOURCES.STABILIZED_PITCH, +50), // S4 R ruddervator — pitch
            rule(SLOT.RUDDER, INPUT_SOURCES.STABILIZED_YAW, -50), // S4 R ruddervator — yaw reversed
        ],
    },
};

export const PRESET_IDS = Object.keys(PLANE_PRESETS);
