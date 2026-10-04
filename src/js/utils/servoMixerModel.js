// Servo mixer (smix) model for the Servos tab. Mirrors firmware
// src/main/flight/servos.c so the tab can show which physical output each
// rule drives and what a preset mixer does without a custom rule list.

/**
 * @typedef {{target: number, input: number, rate: number, speed: number, min: number, max: number, box: number}} ServoMixRule
 */

export const SERVO_MIX_INPUT_LABELS = [
    "STABILIZED_ROLL",
    "STABILIZED_PITCH",
    "STABILIZED_YAW",
    "STABILIZED_THROTTLE",
    "RC_ROLL",
    "RC_PITCH",
    "RC_YAW",
    "RC_THROTTLE",
    "RC_AUX1",
    "RC_AUX2",
    "RC_AUX3",
    "RC_AUX4",
    "GIMBAL_PITCH",
    "GIMBAL_ROLL",
];

export const SERVO_MIX_BOX_LABELS = ["Always", "BOXSERVO1", "BOXSERVO2", "BOXSERVO3"];
export const MAX_SERVO_RULES = 16;

export const MIXER_IDS = {
    TRI: 1,
    BICOPTER: 4,
    GIMBAL: 5,
    FLYING_WING: 8,
    AIRPLANE: 14,
    HELI_120_CCPM: 15,
    HELI_90_DEG: 16,
    PPM_TO_SERVO: 19,
    DUALCOPTER: 20,
    SINGLECOPTER: 21,
    CUSTOM_AIRPLANE: 24,
    CUSTOM_TRI: 25,
};

// Firmware servoIndex_e names per mixer family (enum in
// src/main/flight/servos.h). The same index means different things on
// different mixers (e.g. 4 = FLAPPERON_2 on airplane, BICOPTER_LEFT on
// bicopter). The plane names are the default; other mixers override only
// the entries that differ.
const SERVO_ENUM_NAMES_PLANE = {
    0: "GIMBAL_PITCH",
    1: "GIMBAL_ROLL",
    2: "FLAPS",
    3: "FLAPPERON_1",
    4: "FLAPPERON_2",
    5: "RUDDER",
    6: "ELEVATOR",
    7: "THROTTLE",
};

const SERVO_ENUM_NAMES_BY_MIXER = {
    [MIXER_IDS.TRI]: { 5: "RUDDER" },
    [MIXER_IDS.CUSTOM_TRI]: { 5: "RUDDER" },
    [MIXER_IDS.BICOPTER]: { 4: "BICOPTER_LEFT", 5: "BICOPTER_RIGHT" },
    [MIXER_IDS.DUALCOPTER]: { 4: "DUALCOPTER_LEFT", 5: "DUALCOPTER_RIGHT" },
    [MIXER_IDS.SINGLECOPTER]: {
        3: "SINGLECOPTER_1",
        4: "SINGLECOPTER_2",
        5: "SINGLECOPTER_3",
        6: "SINGLECOPTER_4",
    },
    [MIXER_IDS.GIMBAL]: { 0: "GIMBAL_PITCH", 1: "GIMBAL_ROLL" },
    [MIXER_IDS.HELI_120_CCPM]: { 0: "HELI_LEFT", 1: "HELI_RIGHT", 2: "HELI_TOP", 3: "HELI_RUD" },
    [MIXER_IDS.HELI_90_DEG]: { 0: "HELI_LEFT", 1: "HELI_RIGHT", 2: "HELI_TOP", 3: "HELI_RUD" },
};

/**
 * Firmware servoIndex_e name (e.g. "FLAPPERON_1") of `target` under
 * `mixerMode`, or null when the target is out of range.
 * @param {number} target
 * @param {number|null} mixerMode
 * @returns {string|null}
 */
export function servoMixOutputEnumName(target, mixerMode) {
    const targetId = Number(target);
    if (!Number.isInteger(targetId) || targetId < 0 || targetId > 7) {
        return null;
    }
    const overrides = SERVO_ENUM_NAMES_BY_MIXER[mixerMode];
    if (overrides?.[targetId] != null) {
        return overrides[targetId];
    }
    return SERVO_ENUM_NAMES_PLANE[targetId] ?? null;
}

// Fixed slots written by the mixer-specific switch in firmware writeServos().
// MIXER_GIMBAL is absent on purpose: firmware drives it through the same
// gimbal branch as FEATURE_SERVO_TILT (see servoSlotLayout).
const SERVO_PWM_SLOT_TO_INDEX = {
    [MIXER_IDS.TRI]: [5],
    [MIXER_IDS.CUSTOM_TRI]: [5],
    [MIXER_IDS.BICOPTER]: [4, 5],
    [MIXER_IDS.FLYING_WING]: [3, 4],
    [MIXER_IDS.AIRPLANE]: [2, 3, 4, 5, 6, 7],
    [MIXER_IDS.CUSTOM_AIRPLANE]: [2, 3, 4, 5, 6, 7],
    [MIXER_IDS.HELI_120_CCPM]: [0, 1, 2, 3],
    [MIXER_IDS.DUALCOPTER]: [4, 5],
    [MIXER_IDS.SINGLECOPTER]: [3, 4, 5, 6],
};

const SERVO_GIMBAL_PITCH = 0;
const SERVO_GIMBAL_ROLL = 1;
const MAX_SUPPORTED_SERVOS = 8;

/**
 * Firmware servo index (servoIndex_e) driven by each physical servo output,
 * in output order. Mirrors firmware writeServos() (src/main/flight/servos.c):
 *   1. the mixer's fixed slots (default frames write none),
 *   2. the gimbal pair when SERVO_TILT is on or the mixer is GIMBAL,
 *   3. every servo with channel forwarding not already written, in index order,
 *   4. AUX channel forwarding (CHANNEL_FORWARDING), which drives raw RC
 *      channels rather than a servo -- those outputs are not listed.
 * @param {number} mixerMode
 * @param {object} [options]
 * @param {boolean} [options.servoTilt] - FEATURE_SERVO_TILT enabled
 * @param {number[]} [options.forwardedServos] - servo indices whose
 *   indexOfChannelToForward is set (not 255)
 * @returns {number[]}
 */
export function servoSlotLayout(mixerMode, { servoTilt = false, forwardedServos = [] } = {}) {
    const layout = [...(SERVO_PWM_SLOT_TO_INDEX[mixerMode] ?? [])];
    if (servoTilt || mixerMode === MIXER_IDS.GIMBAL) {
        layout.push(SERVO_GIMBAL_PITCH, SERVO_GIMBAL_ROLL);
    }
    const written = new Set(layout);
    const forwarded = new Set(forwardedServos);
    for (let i = 0; i < MAX_SUPPORTED_SERVOS; i++) {
        if (forwarded.has(i) && !written.has(i)) {
            layout.push(i);
        }
    }
    return layout;
}

/**
 * Firmware servo index carried by physical output `slotIndex` (0-based), or
 * null when that output isn't driven. Identity while the mixer is unknown.
 * @param {number} slotIndex
 * @param {number|null} mixerMode
 * @param {{servoTilt?: boolean, forwardedServos?: number[]}} [options]
 * @returns {number|null}
 */
export function pwmSlotToServoIndex(slotIndex, mixerMode, options = {}) {
    if (mixerMode == null) {
        return slotIndex;
    }
    const layout = servoSlotLayout(mixerMode, options);
    if (slotIndex < 0 || slotIndex >= layout.length) {
        return null;
    }
    return layout[slotIndex];
}

/**
 * Physical output (0-based) carrying firmware servo `target`, or null when
 * the mixer doesn't drive it. Identity while the mixer is unknown.
 * @param {number} target
 * @param {number|null} mixerMode
 * @param {{servoTilt?: boolean, forwardedServos?: number[]}} [options]
 * @returns {number|null}
 */
export function servoTargetToSlot(target, mixerMode, options = {}) {
    if (mixerMode == null) {
        return target;
    }
    const slot = servoSlotLayout(mixerMode, options).indexOf(target);
    return slot < 0 ? null : slot;
}

/**
 * Every firmware servo target with the physical output carrying it: driven
 * targets first in output order, then the undriven ones (slot null).
 * @param {number|null} mixerMode
 * @param {{servoTilt?: boolean, forwardedServos?: number[]}} [options]
 * @returns {Array<{target: number, slot: number|null}>}
 */
export function servoOutputItems(mixerMode, options = {}) {
    const items = [];
    for (let target = 0; target < MAX_SUPPORTED_SERVOS; target++) {
        items.push({ target, slot: servoTargetToSlot(target, mixerMode, options) });
    }
    const driven = items.filter((item) => item.slot != null).sort((a, b) => a.slot - b.slot);
    return [...driven, ...items.filter((item) => item.slot == null)];
}

// --- Built-in (preset) servo mixer rules ----------------------------------
//
// Mirrors servoMixers[] in firmware src/main/flight/servos.c. Preset mixers
// drive servos from these hard-coded rules; the custom smix list (what
// MSP_SERVO_MIX_RULES returns) is only read on CUSTOM_AIRPLANE / CUSTOM_TRI.
// BICOPTER, DUALCOPTER, SINGLECOPTER and HELI_120_CCPM only exist on builds
// with USE_UNCOMMON_MIXERS.
const IN_ROLL = 0;
const IN_PITCH = 1;
const IN_YAW = 2;
const IN_THROTTLE = 3;
const IN_RC_AUX1 = 8;
const IN_GIMBAL_PITCH = 12;
const IN_GIMBAL_ROLL = 13;

export const SERVO_MIX_INPUT_STABILIZED_THROTTLE = IN_THROTTLE;

function builtinRule(target, input, rate) {
    return { target, input, rate, speed: 0, min: 0, max: 100, box: 0 };
}

const BUILTIN_SERVO_MIX_RULES = {
    [MIXER_IDS.TRI]: [builtinRule(5, IN_YAW, 100)],
    [MIXER_IDS.BICOPTER]: [
        builtinRule(4, IN_YAW, 100),
        builtinRule(4, IN_PITCH, -100),
        builtinRule(5, IN_YAW, 100),
        builtinRule(5, IN_PITCH, 100),
    ],
    [MIXER_IDS.GIMBAL]: [builtinRule(0, IN_GIMBAL_PITCH, 125), builtinRule(1, IN_GIMBAL_ROLL, 125)],
    [MIXER_IDS.FLYING_WING]: [
        builtinRule(3, IN_ROLL, 100),
        builtinRule(3, IN_PITCH, 100),
        builtinRule(4, IN_ROLL, -100),
        builtinRule(4, IN_PITCH, 100),
        builtinRule(7, IN_THROTTLE, 100),
    ],
    [MIXER_IDS.AIRPLANE]: [
        builtinRule(3, IN_ROLL, 100),
        builtinRule(4, IN_ROLL, 100),
        builtinRule(5, IN_YAW, 100),
        builtinRule(6, IN_PITCH, 100),
        builtinRule(7, IN_THROTTLE, 100),
    ],
    [MIXER_IDS.HELI_120_CCPM]: [
        builtinRule(0, IN_PITCH, -50),
        builtinRule(0, IN_ROLL, -87),
        builtinRule(0, IN_RC_AUX1, 100),
        builtinRule(1, IN_PITCH, -50),
        builtinRule(1, IN_ROLL, 87),
        builtinRule(1, IN_RC_AUX1, 100),
        builtinRule(2, IN_PITCH, 100),
        builtinRule(2, IN_RC_AUX1, 100),
        builtinRule(3, IN_YAW, 100),
    ],
    [MIXER_IDS.DUALCOPTER]: [builtinRule(4, IN_PITCH, 100), builtinRule(5, IN_ROLL, 100)],
    [MIXER_IDS.SINGLECOPTER]: [
        builtinRule(3, IN_YAW, 100),
        builtinRule(3, IN_PITCH, 100),
        builtinRule(4, IN_YAW, 100),
        builtinRule(4, IN_PITCH, 100),
        builtinRule(5, IN_YAW, 100),
        builtinRule(5, IN_ROLL, 100),
        builtinRule(6, IN_YAW, 100),
        builtinRule(6, IN_ROLL, 100),
    ],
};

/**
 * The hard-coded servo rules a preset mixer runs, or null when the mixer has
 * none (multirotors) or reads the custom smix list instead.
 * @param {number} mixerMode
 * @returns {Array<{target: number, input: number, rate: number, speed: number, min: number, max: number, box: number}>|null}
 */
export function builtinServoMixRules(mixerMode) {
    const rules = BUILTIN_SERVO_MIX_RULES[mixerMode];
    return rules ? rules.map((r) => ({ ...r })) : null;
}

/**
 * True for the mixers whose servos follow the custom smix list.
 * @param {number|null} mixerMode
 * @returns {boolean}
 */
export function usesCustomServoRules(mixerMode) {
    return mixerMode === MIXER_IDS.CUSTOM_AIRPLANE || mixerMode === MIXER_IDS.CUSTOM_TRI;
}

// --- Custom rule list ------------------------------------------------------

// min/max are percentages of servo travel, 0..100 (firmware servoMixer_t is
// uint8_t and the CLI rejects anything else); 0/100 = full travel.
export const SERVO_MIX_MIN = 0;
export const SERVO_MIX_MAX = 100;
// rate is int8_t; the CLI accepts -125..125.
export const SERVO_MIX_RATE_MIN = -125;
export const SERVO_MIX_RATE_MAX = 125;

const EMPTY_RULE = { target: 0, input: 0, rate: 0, speed: 0, min: 0, max: 0, box: 0 };

/**
 * A new rule with full travel and no speed limit.
 * @param {number} target
 * @param {number} input
 * @param {number} rate
 */
export function makeServoMixRule(target, input, rate) {
    return { target, input, rate, speed: 0, min: SERVO_MIX_MIN, max: SERVO_MIX_MAX, box: 0 };
}

/**
 * The rules the firmware actually runs: loadCustomServoMixer() stops at the
 * first rule with rate 0, so anything stored after it is ignored.
 * @template {{rate: number}} T
 * @param {T[]} rules
 * @returns {T[]}
 */
export function activeServoMixRules(rules) {
    const active = [];
    for (const rule of rules ?? []) {
        if (rule.rate === 0) {
            break;
        }
        active.push({ ...rule });
    }
    return active;
}

/**
 * `rules` followed by empty rules up to `maxRules`, so a save also clears
 * slots left over from a longer list.
 */
export function padServoMixRulesToMax(rules, maxRules = MAX_SERVO_RULES) {
    const padded = (rules ?? []).slice(0, maxRules).map((rule) => ({ ...rule }));
    while (padded.length < maxRules) {
        padded.push({ ...EMPTY_RULE });
    }
    return padded;
}

/**
 * Indices of rules the firmware would not run as shown: rate 0 (ends the
 * rule list, dropping every rule after it) or outside -125..125, and
 * min/max outside 0..100 or min >= max (the CLI rejects these, but
 * MSP_SET_SERVO_MIX_RULE stores them as-is, so a -100 min becomes 156).
 * @returns {number[]}
 */
export function invalidServoMixRules(rules) {
    const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    const bad = [];
    (rules ?? []).forEach((rule, i) => {
        const rateOk = rule.rate !== 0 && inRange(rule.rate, SERVO_MIX_RATE_MIN, SERVO_MIX_RATE_MAX);
        const rangeOk =
            inRange(rule.min, SERVO_MIX_MIN, SERVO_MIX_MAX) &&
            inRange(rule.max, SERVO_MIX_MIN, SERVO_MIX_MAX) &&
            rule.min < rule.max;
        if (!rateOk || !rangeOk) {
            bad.push(i);
        }
    });
    return bad;
}

// --- Roles -----------------------------------------------------------------

// Input source -> control axis (stabilized and RC variants of an axis match).
function inputAxis(input) {
    if (input === IN_ROLL || input === 4) {
        return "roll";
    }
    if (input === IN_PITCH || input === 5) {
        return "pitch";
    }
    if (input === IN_YAW || input === 6) {
        return "yaw";
    }
    if (input === IN_THROTTLE || input === 7) {
        return "throttle";
    }
    if (input >= IN_RC_AUX1 && input <= 11) {
        return "aux";
    }
    return "gimbal";
}

const SINGLE_AXIS_ROLE = {
    roll: "aileron",
    pitch: "elevator",
    yaw: "rudder",
    throttle: "throttle",
    aux: "aux",
    gimbal: "gimbal",
};

/**
 * What an output does, from the inputs of every non-zero rule targeting it:
 * aileron / elevator / rudder / throttle / aux / gimbal for one axis,
 * elevon (roll + pitch), vtail (pitch + yaw), mixed otherwise; null if unused.
 * @param {Array<{target: number, input: number, rate: number}>} rules
 * @param {number} target
 * @returns {string|null}
 */
export function servoOutputRole(rules, target) {
    const axes = new Set(
        (rules ?? []).filter((rule) => rule.target === target && rule.rate !== 0).map((rule) => inputAxis(rule.input)),
    );
    if (axes.size === 0) {
        return null;
    }
    if (axes.size === 1) {
        return SINGLE_AXIS_ROLE[[...axes][0]];
    }
    if (axes.size === 2 && axes.has("pitch") && axes.has("roll")) {
        return "elevon";
    }
    if (axes.size === 2 && axes.has("pitch") && axes.has("yaw")) {
        return "vtail";
    }
    return "mixed";
}

// --- Quick-add templates ---------------------------------------------------
//
// Each template lists the outputs it needs, each as the rules driving it.
// Outputs are placed on the first free physical outputs in order, so a
// template never depends on the firmware servo names. Rates follow the
// firmware presets (e.g. FLYING_WING elevons are +/-100).

export const SERVO_MIX_TEMPLATES = [
    {
        id: "ailerons",
        labelKey: "servosMixerTemplateAilerons",
        outputs: [[{ input: IN_ROLL, rate: 100 }], [{ input: IN_ROLL, rate: 100 }]],
    },
    {
        id: "elevator",
        labelKey: "servosMixerTemplateElevator",
        outputs: [[{ input: IN_PITCH, rate: 100 }]],
    },
    {
        id: "rudder",
        labelKey: "servosMixerTemplateRudder",
        outputs: [[{ input: IN_YAW, rate: 100 }]],
    },
    {
        id: "elevons",
        labelKey: "servosMixerTemplateElevons",
        outputs: [
            [
                { input: IN_ROLL, rate: 100 },
                { input: IN_PITCH, rate: 100 },
            ],
            [
                { input: IN_ROLL, rate: -100 },
                { input: IN_PITCH, rate: 100 },
            ],
        ],
    },
    {
        id: "vtail",
        labelKey: "servosMixerTemplateVTail",
        outputs: [
            [
                { input: IN_PITCH, rate: 100 },
                { input: IN_YAW, rate: 100 },
            ],
            [
                { input: IN_PITCH, rate: 100 },
                { input: IN_YAW, rate: -100 },
            ],
        ],
    },
];

/**
 * Firmware servo targets the mixer drives that no rule uses yet, in
 * physical output order.
 */
function freeServoTargets(rules, mixerMode, options) {
    const used = new Set((rules ?? []).map((rule) => rule.target));
    return servoOutputItems(mixerMode, options)
        .filter((item) => item.slot != null && !used.has(item.target))
        .map((item) => item.target);
}

/**
 * Rules for template `templateId`, placed on the first free outputs, or the
 * reason it can't be added.
 * @returns {{ok: true, rules: ServoMixRule[]} | {ok: false, errorKey: string, errorParams: Record<string, string | number>}}
 */
export function planServoMixTemplate(rules, templateId, mixerMode, options = {}) {
    const template = SERVO_MIX_TEMPLATES.find((tpl) => tpl.id === templateId);
    if (!template) {
        return { ok: false, errorKey: "servosMixerTemplateUnknown", errorParams: { id: templateId } };
    }
    const newRuleCount = template.outputs.flat().length;
    if ((rules ?? []).length + newRuleCount > MAX_SERVO_RULES) {
        return { ok: false, errorKey: "servosMixerTemplateTooManyRules", errorParams: { max: MAX_SERVO_RULES } };
    }
    const free = freeServoTargets(rules, mixerMode, options);
    if (free.length < template.outputs.length) {
        return {
            ok: false,
            errorKey: "servosMixerTemplateNoFreeOutputs",
            errorParams: { needed: template.outputs.length, free: free.length },
        };
    }
    const planned = template.outputs.flatMap((outputRules, i) =>
        outputRules.map((rule) => makeServoMixRule(free[i], rule.input, rule.rate)),
    );
    return { ok: true, rules: planned };
}

// --- Copy a preset into a custom mixer ------------------------------------

// Presets whose rules a custom mixer can start from.
const PRESETS_FOR_CUSTOM_MIXER = {
    [MIXER_IDS.CUSTOM_AIRPLANE]: [MIXER_IDS.AIRPLANE, MIXER_IDS.FLYING_WING],
    [MIXER_IDS.CUSTOM_TRI]: [MIXER_IDS.TRI],
};

/**
 * @param {number|null} mixerMode
 * @returns {number[]} preset mixers whose rules `mixerMode` can start from
 */
export function presetsForCustomMixer(mixerMode) {
    return PRESETS_FOR_CUSTOM_MIXER[mixerMode] ?? [];
}

/**
 * The built-in rules of `presetMixer`, re-targeted for `customMixer` so each
 * rule stays on the same physical output (Flying Wing's first servo output
 * is target 3, Custom Airplane's is target 2). The stabilized-throttle rule
 * is left out, as on the read-only built-in table.
 * @returns {ServoMixRule[]}
 */
export function presetRulesForCustomMixer(presetMixer, customMixer, options = {}) {
    const rules = [];
    for (const rule of builtinServoMixRules(presetMixer) ?? []) {
        if (rule.input === IN_THROTTLE) {
            continue;
        }
        const slot = servoTargetToSlot(rule.target, presetMixer, options);
        const target = slot == null ? null : pwmSlotToServoIndex(slot, customMixer, options);
        if (target != null) {
            rules.push({ ...rule, target });
        }
    }
    return rules;
}
