// Motor and servo pin assignment for the Servos tab. Pins are read from the
// CLI (`resource show` and the `timer` dump, see resourceCli.js), edited
// locally, and written back on Save as `resource` lines followed by `save`.
//
// Assignments are keyed by the CLI resource name, e.g. "MOTOR 1" or
// "SERVO 2" (1-based, as the CLI prints them), and map to a pad such as
// "B00", or PIN_NONE.

/**
 * @typedef {{hard: boolean, timer: number, channel: number, with: string}} PinConflict
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
 * @param {Array<{pad: string, peripheral: string, index: number|null}>} resources - parseResourceShow()
 * @param {Array<{pad: string, timer: number|null, channel: number|null}>} timers - parseTimerDump()
 * @returns {{assignments: Map<string, string>, otherOwners: Map<string, string>, padTimers: Map<string, {timer: number, channel: number}>}}
 */
export function buildPinModel(resources, timers) {
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
    const padTimers = new Map();
    for (const entry of timers ?? []) {
        if (entry.timer != null && entry.channel != null) {
            padTimers.set(entry.pad, { timer: entry.timer, channel: entry.channel });
        }
    }
    return { assignments, otherOwners, padTimers };
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
 * Timer conflict of putting `key` on `pad`, against every other running
 * output except `displaced` (the output that picking `pad` moves off it).
 *   - same timer and channel: never works (hard);
 *   - a motor and a servo on one timer: the timer runs at one rate, so one
 *     of them is wrong (soft; offered only in expert mode).
 * @returns {PinConflict|null}
 */
export function pinTimerConflict({ model, assignments, key, pad, motorCount = 0, displaced = null }) {
    const own = model.padTimers.get(pad);
    if (!own) {
        return null;
    }
    const kind = parsePinKey(key).kind;
    let soft = null;
    for (const [other, otherPad] of assignments) {
        if (other === key || other === displaced || otherPad === PIN_NONE || !claimsTimer(other, motorCount)) {
            continue;
        }
        const theirs = model.padTimers.get(otherPad);
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
export function rowPinConflict({ model, assignments, key, motorCount = 0 }) {
    const pad = assignments.get(key);
    if (!pad || pad === PIN_NONE || !claimsTimer(key, motorCount)) {
        return null;
    }
    return pinTimerConflict({ model, assignments, key, pad, motorCount });
}

/**
 * Pins `key` can move to: pads with a timer that no other peripheral
 * (UART, LED strip, ...) owns. A pad held by another motor or servo is
 * offered and moves that output to NONE. Pads that would share a timer
 * channel are dropped; a motor/servo timer share only shows in expert mode.
 * The current pin is always listed.
 * @returns {Array<{value: string, pad: string|null, timer: number|null, channel: number|null, owner: string|null, conflict: PinConflict|null}>}
 */
export function pinOptions({ model, assignments, key, motorCount = 0, expertMode = false }) {
    const current = assignments.get(key) ?? PIN_NONE;
    const options = [{ value: PIN_NONE, pad: null, timer: null, channel: null, owner: null, conflict: null }];
    const pads = [...model.padTimers.keys()].sort((a, b) => a.localeCompare(b));
    if (current !== PIN_NONE && !model.padTimers.has(current)) {
        pads.push(current);
    }
    for (const pad of pads) {
        if (model.otherOwners.has(pad) && pad !== current) {
            continue;
        }
        const owner = ownerOfPad(assignments, pad);
        const conflict = pinTimerConflict({ model, assignments, key, pad, motorCount, displaced: owner });
        const isCurrent = pad === current;
        if (!isCurrent && conflict && (conflict.hard || !expertMode)) {
            continue;
        }
        const timer = model.padTimers.get(pad);
        options.push({
            value: pad,
            pad,
            timer: timer?.timer ?? null,
            channel: timer?.channel ?? null,
            owner: owner === key ? null : owner,
            conflict,
        });
    }
    return options;
}

/**
 * `assignments` with `key` on `pad`; any other output on that pad moves to
 * NONE, as the firmware would leave both claiming it otherwise.
 * @returns {Map<string, string>}
 */
export function assignPin(assignments, key, pad) {
    const next = new Map(assignments);
    if (pad !== PIN_NONE) {
        for (const [other, assigned] of next) {
            if (other !== key && assigned === pad) {
                next.set(other, PIN_NONE);
            }
        }
    }
    next.set(key, pad);
    return next;
}

function compareKeys(a, b) {
    const ka = parsePinKey(a);
    const kb = parsePinKey(b);
    return ka.kind === kb.kind ? ka.index - kb.index : ka.kind.localeCompare(kb.kind);
}

/**
 * CLI lines that turn `initial` into `staged`. Every changed output is
 * released first: `resource` only clears a pad's previous owner when both
 * are the same kind, so a motor taking a servo's pad would otherwise leave
 * both claiming it.
 * @param {Map<string, string>} initial
 * @param {Map<string, string>} staged
 * @returns {string[]}
 */
export function pinChangeLines(initial, staged) {
    const keys = [...new Set([...initial.keys(), ...staged.keys()])].sort(compareKeys);
    const changed = keys.filter((key) => (initial.get(key) ?? PIN_NONE) !== (staged.get(key) ?? PIN_NONE));
    const release = changed.filter((key) => (initial.get(key) ?? PIN_NONE) !== PIN_NONE);
    const assign = changed.filter((key) => (staged.get(key) ?? PIN_NONE) !== PIN_NONE);
    return [
        ...release.map((key) => `resource ${key} ${PIN_NONE}`),
        ...assign.map((key) => `resource ${key} ${staged.get(key)}`),
    ];
}
