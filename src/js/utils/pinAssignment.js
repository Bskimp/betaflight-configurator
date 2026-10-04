// Motor and servo pin assignment for the Servos tab. Pins are read from the
// CLI (the `resource` and `timer` dumps and `timer <pad> list`, see
// resourceCli.js), edited locally, and written back on Save as `timer` and
// `resource` lines followed by `save`.
//
// Assignments are keyed by the CLI resource name, e.g. "MOTOR 1" or
// "SERVO 2" (1-based, as the CLI prints them), and map to a pad such as
// "B00", or PIN_NONE. A pad's timer is picked by its alternate function
// (AF); a servo may move a pad to another AF ("B00/AF1"), motors keep the
// configured one because their DShot DMA follows it.

/**
 * @typedef {{hard: boolean, timer: number, channel: number, with: string}} PinConflict
 * @typedef {{timer: number, channel: number, complementary?: boolean}} PadTimer
 * @typedef {{assignments: Map<string, string>, afs: Map<string, number>}} PinState
 */

export const PIN_NONE = "NONE";

const ASSIGNABLE = new Set(["MOTOR", "SERVO"]);

/**
 * @param {string} key - "MOTOR 1"
 * @returns {{kind: string, index: number}}
 */
export function parsePinKey(key) {
    const [kind, index] = key.split(" ");
    return { kind, index: Number(index) };
}

/**
 * Dropdown value for `pad` on `af`; the configured AF is just the pad.
 */
export function encodePinValue(model, pad, af) {
    return pad === PIN_NONE || af == null || af === model.afs.get(pad) ? pad : `${pad}/AF${af}`;
}

function decodePinValue(model, value) {
    const [pad, afPart] = value.split("/AF");
    return { pad, af: afPart == null ? (model.afs.get(pad) ?? null) : Number(afPart) };
}

/**
 * @param {Array<{pad: string, peripheral: string, index: number|null}>} resources - parseResourceShow() of `resource`
 * @param {Array<{pad: string, af: number, timer: number|null, channel: number|null}>} timers - parseTimerDump()
 * @param {Map<string, Array<{af: number, timer: number, channel: number, complementary: boolean}>>} [padTimerOptions] - parseTimerOptions() per pad
 */
export function buildPinModel(resources, timers, padTimerOptions = new Map()) {
    const assignments = new Map();
    const otherOwners = new Map();
    for (const entry of resources ?? []) {
        if (entry.peripheral === "FREE") {
            continue;
        }
        if (ASSIGNABLE.has(entry.peripheral) && entry.index != null) {
            assignments.set(`${entry.peripheral} ${entry.index}`, entry.pad);
        } else {
            otherOwners.set(entry.pad, entry.index == null ? entry.peripheral : `${entry.peripheral} ${entry.index}`);
        }
    }
    /** @type {Map<string, PadTimer>} */
    const padTimers = new Map();
    /** @type {Map<string, number>} */
    const afs = new Map();
    for (const entry of timers ?? []) {
        if (entry.timer != null && entry.channel != null) {
            padTimers.set(entry.pad, { timer: entry.timer, channel: entry.channel });
            afs.set(entry.pad, entry.af);
        }
    }
    return { assignments, afs, otherOwners, padTimers, padTimerOptions };
}

/**
 * @returns {PinState}
 */
export function initialPinState(model) {
    return { assignments: new Map(model.assignments), afs: new Map(model.afs) };
}

/**
 * Timer and channel of `pad` on `af` (its configured AF when omitted).
 * @returns {PadTimer|null}
 */
function padTimerAt(model, pad, af) {
    if (af == null || af === model.afs.get(pad)) {
        return model.padTimers.get(pad) ?? null;
    }
    const option = model.padTimerOptions.get(pad)?.find((o) => o.af === af);
    return option ? { timer: option.timer, channel: option.channel, complementary: option.complementary } : null;
}

// Motors past the mixer's motor count are never started, so their pads hold
// no timer. 0 = count unknown: treat every motor as running.
function claimsTimer(key, motorCount) {
    const { kind, index } = parsePinKey(key);
    return kind !== "MOTOR" || !motorCount || index <= motorCount;
}

function ownerOfPad(assignments, pad) {
    for (const [key, assigned] of assignments) {
        if (assigned === pad) {
            return key;
        }
    }
    return null;
}

/**
 * Timer conflict of putting `key` on `pad` with `af`, against every other
 * running output except `displaced` (the output that picking `pad` moves
 * off it).
 *   - same timer and channel: never works (hard);
 *   - a motor and a servo on one timer: the timer runs at one rate, so one
 *     of them is wrong (soft; offered only in expert mode).
 * @returns {PinConflict|null}
 */
export function pinTimerConflict({ model, state, key, pad, af = null, motorCount = 0, displaced = null }) {
    const own = padTimerAt(model, pad, af);
    if (!own) {
        return null;
    }
    const kind = parsePinKey(key).kind;
    let soft = null;
    for (const [other, otherPad] of state.assignments) {
        if (other === key || other === displaced || otherPad === PIN_NONE || !claimsTimer(other, motorCount)) {
            continue;
        }
        const theirs = padTimerAt(model, otherPad, state.afs.get(otherPad));
        if (theirs?.timer !== own.timer) {
            continue;
        }
        if (theirs.channel === own.channel) {
            return { hard: true, timer: own.timer, channel: own.channel, with: other };
        }
        if (!soft && parsePinKey(other).kind !== kind) {
            soft = { hard: false, timer: own.timer, channel: own.channel, with: other };
        }
    }
    return soft;
}

/**
 * Conflict of the pin `key` currently holds, for the row warning.
 */
export function rowPinConflict({ model, state, key, motorCount = 0 }) {
    const pad = state.assignments.get(key);
    if (!pad || pad === PIN_NONE || !claimsTimer(key, motorCount)) {
        return null;
    }
    return pinTimerConflict({ model, state, key, pad, af: state.afs.get(pad), motorCount });
}

/**
 * Dropdown value of the pin `key` holds.
 */
export function currentPinValue(model, state, key) {
    const pad = state.assignments.get(key) ?? PIN_NONE;
    return encodePinValue(model, pad, state.afs.get(pad));
}

// The timer choices of `pad` for `kind`: the configured AF, plus for servos
// every other AF that reaches a different timer channel.
function padChoices(model, pad, kind) {
    const configured = model.padTimers.get(pad);
    const choices = [{ af: model.afs.get(pad) ?? null, timer: configured ?? null, alt: false }];
    if (kind !== "SERVO") {
        return choices;
    }
    const seen = new Set(configured ? [`${configured.timer}:${configured.channel}`] : []);
    for (const option of model.padTimerOptions.get(pad) ?? []) {
        const id = `${option.timer}:${option.channel}`;
        if (!seen.has(id)) {
            seen.add(id);
            choices.push({ af: option.af, timer: padTimerAt(model, pad, option.af), alt: true });
        }
    }
    return choices;
}

/**
 * Pins `key` can move to: pads with a timer that no other peripheral
 * (UART, LED strip, ...) owns, and for servos each pad's other timers. A pad
 * held by another motor or servo is offered and moves that output to NONE.
 * Choices that would share a timer channel are dropped; a motor/servo timer
 * share only shows in expert mode. The current pin is always listed.
 * @returns {Array<{value: string, pad: string|null, timer: PadTimer|null, alt: boolean, owner: string|null, conflict: PinConflict|null}>}
 */
export function pinOptions({ model, state, key, motorCount = 0, expertMode = false }) {
    const kind = parsePinKey(key).kind;
    const currentValue = currentPinValue(model, state, key);
    const currentPad = state.assignments.get(key) ?? PIN_NONE;
    const options = [{ value: PIN_NONE, pad: null, timer: null, alt: false, owner: null, conflict: null }];
    const pads = [...model.padTimers.keys()].sort((a, b) => a.localeCompare(b));
    if (currentPad !== PIN_NONE && !model.padTimers.has(currentPad)) {
        pads.push(currentPad);
    }
    for (const pad of pads) {
        if (model.otherOwners.has(pad) && pad !== currentPad) {
            continue;
        }
        const owner = ownerOfPad(state.assignments, pad);
        for (const choice of padChoices(model, pad, kind)) {
            const value = encodePinValue(model, pad, choice.af);
            const conflict = pinTimerConflict({ model, state, key, pad, af: choice.af, motorCount, displaced: owner });
            const isCurrent = value === currentValue;
            if (!isCurrent && conflict && (conflict.hard || !expertMode)) {
                continue;
            }
            options.push({
                value,
                pad,
                timer: choice.timer,
                alt: choice.alt,
                owner: owner === key ? null : owner,
                conflict,
            });
        }
    }
    if (!options.some((option) => option.value === currentValue)) {
        // A servo on an alternate AF that the scan didn't report: keep it listed.
        options.push({ value: currentValue, pad: currentPad, timer: null, alt: true, owner: null, conflict: null });
    }
    return options;
}

/**
 * `state` with `key` on the pin `value` (a pad, "B00/AF1", or PIN_NONE). Any
 * other output on that pad moves to NONE, as the firmware would leave both
 * claiming it otherwise; pads left without an output return to their
 * configured AF.
 * @returns {PinState}
 */
export function selectPin(model, state, key, value) {
    const assignments = new Map(state.assignments);
    const afs = new Map(state.afs);
    const { pad, af } = decodePinValue(model, value);
    if (pad !== PIN_NONE) {
        for (const [other, assigned] of assignments) {
            if (other !== key && assigned === pad) {
                assignments.set(other, PIN_NONE);
            }
        }
        if (af != null) {
            afs.set(pad, af);
        }
    }
    assignments.set(key, pad);
    const used = new Set(assignments.values());
    for (const [p, configured] of model.afs) {
        if (!used.has(p)) {
            afs.set(p, configured);
        }
    }
    return { assignments, afs };
}

function compareKeys(a, b) {
    const ka = parsePinKey(a);
    const kb = parsePinKey(b);
    return ka.kind === kb.kind ? ka.index - kb.index : ka.kind.localeCompare(kb.kind);
}

/**
 * CLI lines that turn the model's pins into `state`: AF changes, then every
 * changed output released, then the new pins. Releasing first matters:
 * `resource` only clears a pad's previous owner when both are the same
 * kind, so a motor taking a servo's pad would otherwise leave both claiming
 * it.
 * @returns {string[]}
 */
export function pinChangeLines(model, state) {
    const initial = model.assignments;
    const staged = state.assignments;
    const timerLines = [...state.afs]
        .filter(([pad, af]) => af !== model.afs.get(pad))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([pad, af]) => `timer ${pad} AF${af}`);
    const keys = [...new Set([...initial.keys(), ...staged.keys()])].sort(compareKeys);
    const changed = keys.filter((key) => (initial.get(key) ?? PIN_NONE) !== (staged.get(key) ?? PIN_NONE));
    const release = changed.filter((key) => (initial.get(key) ?? PIN_NONE) !== PIN_NONE);
    const assign = changed.filter((key) => (staged.get(key) ?? PIN_NONE) !== PIN_NONE);
    return [
        ...timerLines,
        ...release.map((key) => `resource ${key} ${PIN_NONE}`),
        ...assign.map((key) => `resource ${key} ${staged.get(key)}`),
    ];
}

/**
 * The resource each pad belongs to on the board's defaults, e.g. B04 ->
 * "MOTOR 3". Taken from the target config, so it usually matches the
 * silkscreen, and stays known after the pins have been changed or cleared.
 * @param {Array<{pad: string, peripheral: string, index: number|null}>} resources - parsed `resource` dump
 * @param {Map<string, string>} defaults - parseResourceDefaults()
 * @returns {Map<string, string>} pad -> "MOTOR 3"
 */
export function buildPadDefaults(resources, defaults) {
    const byKey = new Map();
    for (const entry of resources ?? []) {
        if (entry.peripheral !== "FREE") {
            byKey.set(entry.index == null ? entry.peripheral : `${entry.peripheral} ${entry.index}`, entry.pad);
        }
    }
    for (const [key, pad] of defaults ?? []) {
        byKey.set(key, pad);
    }
    const padDefaults = new Map();
    for (const [key, pad] of byKey) {
        if (pad !== PIN_NONE && !padDefaults.has(pad)) {
            padDefaults.set(pad, key);
        }
    }
    return padDefaults;
}
