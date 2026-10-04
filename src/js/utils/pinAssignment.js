// Motor and servo pin assignment for the Servos tab. Pins are read from the
// CLI (the `resource` and `timer` dumps and `timer <pad> list`, see
// resourceCli.js), edited locally, and written back on Save as `timer` and
// `resource` lines followed by `save`.
//
// Assignments are keyed by the CLI resource name, e.g. "MOTOR 1" or
// "SERVO 2" (1-based, as the CLI prints them), and map to a pad such as
// "B00", or PIN_NONE. A pad's timer is picked by its alternate function
// (AF); a servo may move a pad to another AF ("B00/AF1"). Motors always use
// the board's default AF and DMA option, since DShot DMA needs both: a
// `timer` change clears the pad's DMA option, so it is restored with them.
//
// The LED strip and UART pins are tracked the same way ("LED_STRIP 1",
// "SERIAL_TX 3"), so an output can take their pad: the LED strip is released
// like any other output; a UART only when the caller allows it (spare UARTs,
// opt-in), and always with both its pins.

/**
 * @typedef {{hard: boolean, timer: number, channel: number, with: string}} PinConflict
 * @typedef {{timer: number, channel: number, complementary?: boolean}} PadTimer
 * @typedef {{assignments: Map<string, string>, afs: Map<string, number>}} PinState
 */

export const PIN_NONE = "NONE";

const ASSIGNABLE = new Set(["MOTOR", "SERVO", "LED_STRIP", "SERIAL_TX", "SERIAL_RX"]);
const OUTPUT_KINDS = new Set(["MOTOR", "SERVO"]);
const UART_KINDS = new Set(["SERIAL_TX", "SERIAL_RX"]);

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
 * @param {{timerAfs?: Map<string, number>, dmaPins?: Map<string, string>, currentDma?: Map<string, string>, ledStripEnabled?: boolean}} [hardware]
 *   default AFs and DMA options of changed pads (parseTimerDefaults / parseDmaPinDefaults of
 *   `diff hardware defaults`), the current DMA options (parseDmaPins of `dma`), and whether
 *   the LED strip feature runs (only then does its pad hold a timer)
 */
export function buildPinModel(resources, timers, padTimerOptions = new Map(), hardware = {}) {
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
    /** @type {Map<string, number>} */
    const defaultAfs = new Map();
    /** @type {Map<string, string>} */
    const defaultDma = new Map();
    for (const pad of afs.keys()) {
        defaultAfs.set(pad, hardware.timerAfs?.get(pad) ?? afs.get(pad));
        defaultDma.set(pad, hardware.dmaPins?.get(pad) ?? hardware.currentDma?.get(pad) ?? PIN_NONE);
    }
    const dmaChanged = new Set(hardware.dmaPins?.keys() ?? []);
    const ledStripEnabled = hardware.ledStripEnabled ?? true;
    return {
        assignments,
        afs,
        otherOwners,
        padTimers,
        padTimerOptions,
        defaultAfs,
        defaultDma,
        dmaChanged,
        ledStripEnabled,
    };
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

// Which outputs hold a timer: servos, the LED strip while its feature runs,
// and motors up to the mixer's motor count (later ones are never started;
// 0 = count unknown, treat every motor as running). UART pins hold none.
function claimsTimer(model, key, motorCount) {
    const { kind, index } = parsePinKey(key);
    if (kind === "MOTOR") {
        return !motorCount || index <= motorCount;
    }
    if (kind === "LED_STRIP") {
        return model.ledStripEnabled;
    }
    return kind === "SERVO";
}

/**
 * UART number of a "SERIAL_TX 3" / "SERIAL_RX 3" key, else null.
 */
export function uartOfKey(key) {
    const { kind, index } = parsePinKey(key);
    return UART_KINDS.has(kind) ? index : null;
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
        if (other === key || other === displaced || otherPad === PIN_NONE || !claimsTimer(model, other, motorCount)) {
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
    if (!pad || pad === PIN_NONE || !claimsTimer(model, key, motorCount)) {
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

// The timer choices of `pad` for `kind`: motors get the board's default AF;
// servos the configured AF plus every other AF that reaches a different
// timer channel.
function padChoices(model, pad, kind) {
    if (kind === "MOTOR") {
        if (!model.defaultAfs.has(pad)) {
            return [];
        }
        const af = model.defaultAfs.get(pad);
        return [{ af, timer: padTimerAt(model, pad, af), alt: false }];
    }
    // A pad without a timer yet (a UART pin) only has its timer options.
    const configured = model.padTimers.get(pad);
    const choices = configured ? [{ af: model.afs.get(pad) ?? null, timer: configured, alt: false }] : [];
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
 * Pins `key` can move to: pads with a timer that no other peripheral owns,
 * for servos each pad's other timers, and for servos the pins of the UARTs in
 * `releasableUarts`. A pad held by another output or the LED strip is offered
 * and moves that owner to NONE. Choices that would share a timer channel are
 * dropped; outputs of different kinds sharing a timer only show in expert
 * mode. The current pin is always listed.
 * @param {{model: object, state: PinState, key: string, motorCount?: number, expertMode?: boolean, releasableUarts?: Set<number>}} args
 * @returns {Array<{value: string, pad: string|null, timer: PadTimer|null, alt: boolean, owner: string|null, conflict: PinConflict|null}>}
 */
export function pinOptions({ model, state, key, motorCount = 0, expertMode = false, releasableUarts = new Set() }) {
    const kind = parsePinKey(key).kind;
    const currentValue = currentPinValue(model, state, key);
    const currentPad = state.assignments.get(key) ?? PIN_NONE;
    const options = [{ value: PIN_NONE, pad: null, timer: null, alt: false, owner: null, conflict: null }];
    const padSet = new Set(model.padTimers.keys());
    if (kind === "SERVO") {
        for (const [owner, pad] of model.assignments) {
            if (releasableUarts.has(uartOfKey(owner)) && model.padTimerOptions.get(pad)?.length) {
                padSet.add(pad);
            }
        }
    }
    if (currentPad !== PIN_NONE) {
        padSet.add(currentPad);
    }
    const pads = [...padSet].sort((a, b) => a.localeCompare(b));
    for (const pad of pads) {
        if (model.otherOwners.has(pad) && pad !== currentPad) {
            continue;
        }
        const owner = ownerOfPad(state.assignments, pad);
        const ownerUart = owner ? uartOfKey(owner) : null;
        if (ownerUart != null && (kind !== "SERVO" || !releasableUarts.has(ownerUart))) {
            continue;
        }
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
 * other owner of that pad moves to NONE, as the firmware would leave both
 * claiming it otherwise; a UART loses both its pins. The LED strip and UARTs
 * get their pins back once nothing uses them, and pads left without an
 * output return to their configured AF.
 * @returns {PinState}
 */
export function selectPin(model, state, key, value) {
    const assignments = new Map(state.assignments);
    const afs = new Map(state.afs);
    const { pad, af } = decodePinValue(model, value);
    if (pad !== PIN_NONE) {
        for (const [other, assigned] of assignments) {
            if (other !== key && assigned === pad) {
                releaseOwner(assignments, other);
            }
        }
        if (af != null) {
            afs.set(pad, af);
        }
    }
    assignments.set(key, pad);
    restorePeripherals(model, assignments);
    // Only motors and servos keep a pad on a chosen timer.
    const used = new Set(
        [...assignments].filter(([owner]) => OUTPUT_KINDS.has(parsePinKey(owner).kind)).map(([, p]) => p),
    );
    for (const p of afs.keys()) {
        if (used.has(p)) {
            continue;
        }
        if (model.afs.has(p)) {
            afs.set(p, model.afs.get(p));
        } else {
            afs.delete(p);
        }
    }
    return { assignments, afs };
}

// Move `owner` to NONE; a UART pin takes its partner with it.
function releaseOwner(assignments, owner) {
    assignments.set(owner, PIN_NONE);
    const uart = uartOfKey(owner);
    if (uart != null) {
        for (const kind of UART_KINDS) {
            if (assignments.has(`${kind} ${uart}`)) {
                assignments.set(`${kind} ${uart}`, PIN_NONE);
            }
        }
    }
}

// Give the LED strip and UARTs back their configured pins once no output
// uses them; a UART only when both its pins are free.
function restorePeripherals(model, assignments) {
    const used = new Set(assignments.values());
    const groups = new Map();
    for (const [key, pad] of model.assignments) {
        if (OUTPUT_KINDS.has(parsePinKey(key).kind)) {
            continue;
        }
        const uart = uartOfKey(key);
        const group = uart == null ? key : `UART ${uart}`;
        if (!groups.has(group)) {
            groups.set(group, []);
        }
        groups.get(group).push([key, pad]);
    }
    for (const members of groups.values()) {
        const released = members.some(([key]) => assignments.get(key) !== model.assignments.get(key));
        if (released && members.every(([, pad]) => !used.has(pad))) {
            for (const [key, pad] of members) {
                assignments.set(key, pad);
            }
        }
    }
}

function compareKeys(a, b) {
    const ka = parsePinKey(a);
    const kb = parsePinKey(b);
    return ka.kind === kb.kind ? ka.index - kb.index : ka.kind.localeCompare(kb.kind);
}

// `dma pin` lines putting motor pads back on their default DMA option. A
// `timer` change clears the option, and a pad a servo left on another AF
// lost it, so restore it whenever a motor lands on a pad that needs it.
function motorDmaLines(model, state, timerChanged) {
    const lines = [];
    for (const [key, pad] of state.assignments) {
        if (pad === PIN_NONE || parsePinKey(key).kind !== "MOTOR") {
            continue;
        }
        const movedHere = model.assignments.get(key) !== pad;
        const needsRestore = timerChanged.has(pad) || (movedHere && model.dmaChanged.has(pad));
        const option = model.defaultDma.get(pad) ?? PIN_NONE;
        if (needsRestore && option !== PIN_NONE && state.afs.get(pad) === model.defaultAfs.get(pad)) {
            lines.push(`dma pin ${pad} ${option}`);
        }
    }
    return lines.sort();
}

/**
 * CLI lines that turn the model's pins into `state`: AF changes, motor DMA
 * restores, then every changed output released, then the new pins.
 * Releasing first matters:
 * `resource` only clears a pad's previous owner when both are the same
 * kind, so a motor taking a servo's pad would otherwise leave both claiming
 * it.
 * @returns {string[]}
 */
export function pinChangeLines(model, state) {
    const initial = model.assignments;
    const staged = state.assignments;
    const timerChanges = [...state.afs]
        .filter(([pad, af]) => af !== model.afs.get(pad))
        .sort(([a], [b]) => a.localeCompare(b));
    const timerLines = timerChanges.map(([pad, af]) => `timer ${pad} AF${af}`);
    const dmaLines = motorDmaLines(model, state, new Set(timerChanges.map(([pad]) => pad)));
    const keys = [...new Set([...initial.keys(), ...staged.keys()])].sort(compareKeys);
    const changed = keys.filter((key) => (initial.get(key) ?? PIN_NONE) !== (staged.get(key) ?? PIN_NONE));
    const release = changed.filter((key) => (initial.get(key) ?? PIN_NONE) !== PIN_NONE);
    const assign = changed.filter((key) => (staged.get(key) ?? PIN_NONE) !== PIN_NONE);
    return [
        ...timerLines,
        ...dmaLines,
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
