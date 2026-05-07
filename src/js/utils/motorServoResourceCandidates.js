import { candidatePadsForSlot } from "./padRecommender.js";

export const RESOURCE_NONE = "NONE";

// Encode (pin, af) into a string the HTML <select> can carry as its value.
// Default AF is the bare pin (`"B00"`); alternate AFs append the suffix
// (`"B00@AF2"`). Caller decodes via `parseResourceOptionValue` before
// emitting MSP / CLI writes.
export function encodeResourceOptionValue(pin, af) {
    const normalizedPin = typeof pin === "string" ? pin.toUpperCase() : pin;
    if (af == null || !Number.isFinite(Number(af))) return normalizedPin;
    return `${normalizedPin}@AF${Number(af)}`;
}

export function parseResourceOptionValue(value) {
    if (typeof value !== "string") return { pin: RESOURCE_NONE, af: null };
    const match = /^([A-Z0-9]+)(?:@AF(\d+))?$/i.exec(value);
    if (!match) return { pin: value.toUpperCase(), af: null };
    return {
        pin: match[1].toUpperCase(),
        af: match[2] != null ? Number(match[2]) : null,
    };
}

function normalizePin(pin) {
    return typeof pin === "string" && pin.length > 0 ? pin.toUpperCase() : RESOURCE_NONE;
}

function addOption(options, seen, option) {
    const pin = normalizePin(option.pin ?? option.value);
    if (!pin) return;
    const af = option.af != null && Number.isFinite(Number(option.af)) ? Number(option.af) : null;
    // Dedup by pin+af so default-AF and each alt-AF entry for the same
    // pad each get their own dropdown row.
    const dedupKey = `${pin}|${af == null ? "default" : `af${af}`}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    options.push({
        value: encodeResourceOptionValue(pin, af),
        pin,
        af,
        label: option.label ?? pin,
        source: option.source ?? "generic",
        timer: option.timer ?? null,
        channel: option.channel ?? null,
        sharesTimerWithMotor: option.sharesTimerWithMotor === true,
        requiresRelease: Array.isArray(option.requiresRelease) ? option.requiresRelease : [],
    });
}

export function stableResourcePins(motorResources = [], servoResources = [], initialPins = []) {
    const pins = new Set((Array.isArray(initialPins) ? initialPins : []).map(normalizePin));
    for (const resource of [...(motorResources ?? []), ...(servoResources ?? [])]) {
        const pin = normalizePin(resource?.pin);
        if (pin !== RESOURCE_NONE && pin !== "INVALID") {
            pins.add(pin);
        }
    }
    return [...pins].filter((pin) => pin !== RESOURCE_NONE && pin !== "INVALID").sort();
}

export function motorIndicesInUse(motorResources = []) {
    return (motorResources ?? [])
        .filter((resource) => normalizePin(resource?.pin) !== RESOURCE_NONE)
        .map((resource) => resource.index + 1);
}

export function candidateSourceLabel(candidate) {
    if (!candidate) return "";
    if (candidate.source === "existing") return "current";
    if (candidate.source === "free-pwm") return "free";
    if (candidate.source === "alt-af") return "alt AF";
    if (candidate.source === "motor-release") {
        const line = (candidate.requiresRelease ?? []).find((c) => /^resource MOTOR /i.test(c)) ?? "";
        const match = /^resource MOTOR (\d+) /i.exec(line);
        return match ? `releases MOTOR ${match[1]}` : "releases motor";
    }
    if (candidate.source === "servo-release") {
        const line = (candidate.requiresRelease ?? []).find((c) => /^resource SERVO /i.test(c)) ?? "";
        const match = /^resource SERVO (\d+) /i.exec(line);
        return match ? `releases SERVO ${match[1]}` : "releases servo";
    }
    if (candidate.source === "led-strip") return "releases LED_STRIP";
    if (candidate.source === "uart-release") {
        const line = (candidate.requiresRelease ?? []).find((c) => /^resource SERIAL_/i.test(c)) ?? "";
        const match = /^resource SERIAL_(TX|RX) (\d+) /i.exec(line);
        return match ? `releases UART${match[2]} ${match[1]}` : "UART pad";
    }
    return "";
}

function labelForCandidate(candidate) {
    const parts = [candidate.pad];
    if (candidate.timer != null) {
        parts.push(`TIM${candidate.timer}${candidate.channel != null ? ` CH${candidate.channel}` : ""}`);
    }
    const source = candidateSourceLabel(candidate);
    if (source) {
        parts.push(source);
    }
    if (candidate.sharesTimerWithMotor) {
        parts.push("shares motor timer");
    }
    return parts.join(" - ");
}

function addCurrentOption(options, seen, currentPin, padTimers) {
    if (currentPin && currentPin !== RESOURCE_NONE) {
        const timer = timerSuffixForPin(currentPin, padTimers);
        const label = timer ? `${currentPin} - ${timer} - current` : `${currentPin} - current`;
        addOption(options, seen, { pin: currentPin, label, source: "existing" });
    }
}

// Returns "MOTOR N" / "SERVO N" if `pin` is currently bound to one of those
// resources (excluding the resource being edited so we don't shadow the
// "- current" label). Used to annotate bare fallback options so pilots see
// what they'd be releasing if they pick that pad.
function describeCurrentAssignment(pin, kind, resource, motorResources, servoResources) {
    const editingMotor = kind === "motor";
    for (const m of motorResources ?? []) {
        if (normalizePin(m?.pin) === pin && !(editingMotor && m.index === resource?.index)) {
            return `MOTOR ${m.index + 1}`;
        }
    }
    for (const s of servoResources ?? []) {
        if (normalizePin(s?.pin) === pin && !(!editingMotor && s.index === resource?.index)) {
            return `SERVO ${s.index + 1}`;
        }
    }
    return null;
}

// Returns "TIMx CHy" if the pad is in the analyzer's per-pad timer lookup,
// else null. Used to surface timer correlation on labels for current /
// already-assigned pads (we already show it for free PWM pads via
// labelForCandidate).
function timerSuffixForPin(pin, padTimers) {
    if (!(padTimers instanceof Map)) return null;
    const entry = padTimers.get(pin);
    if (!entry || entry.timer == null) return null;
    return entry.channel != null ? `TIM${entry.timer} CH${entry.channel}` : `TIM${entry.timer}`;
}

function addFallbackOptions(options, seen, fallbackPins, ctx) {
    for (const pin of fallbackPins ?? []) {
        const normalized = normalizePin(pin);
        const assignment = ctx
            ? describeCurrentAssignment(normalized, ctx.kind, ctx.resource, ctx.motorResources, ctx.servoResources)
            : null;
        const timer = timerSuffixForPin(normalized, ctx?.padTimers);
        const parts = [normalized];
        if (timer) parts.push(timer);
        if (assignment) parts.push(assignment);
        addOption(options, seen, {
            pin: normalized,
            label: parts.join(" - "),
        });
    }
}

function genericOptions(currentPin, fallbackPins, ctx) {
    const options = [];
    const seen = new Set();
    addCurrentOption(options, seen, currentPin, ctx?.padTimers);
    addFallbackOptions(options, seen, fallbackPins, ctx);
    return options;
}

function motorOptions({ resource, motorResources, servoResources, hardwareAnalysis, fallbackPins }) {
    const currentPin = normalizePin(resource?.pin);
    const padTimers = hardwareAnalysis?.padTimers instanceof Map ? hardwareAnalysis.padTimers : null;
    const ctx = { kind: "motor", resource, motorResources, servoResources, padTimers };
    const options = [];
    const seen = new Set();
    addCurrentOption(options, seen, currentPin, padTimers);
    if (!hardwareAnalysis) return genericOptions(currentPin, fallbackPins, ctx);

    const existing = (hardwareAnalysis.motors ?? []).find((motor) => motor.index === resource.index + 1);
    if (existing?.pad) {
        addOption(options, seen, {
            pin: existing.pad,
            label: labelForCandidate({ ...existing, source: "existing" }),
            source: "existing",
            timer: existing.timer,
            channel: existing.channel,
        });
    }
    for (const pad of hardwareAnalysis.pwmCapableFreePads ?? []) {
        addOption(options, seen, {
            pin: pad.pad,
            label: labelForCandidate({ ...pad, source: "free-pwm" }),
            source: "free-pwm",
            timer: pad.timer,
            channel: pad.channel,
        });
    }
    addFallbackOptions(options, seen, fallbackPins, ctx);
    return options;
}

function servoOptions({
    resource,
    motorResources,
    servoResources,
    hardwareAnalysis,
    fallbackPins,
    allowLedStrip,
    allowUartRelease,
}) {
    const currentPin = normalizePin(resource?.pin);
    const padTimers = hardwareAnalysis?.padTimers instanceof Map ? hardwareAnalysis.padTimers : null;
    const ctx = { kind: "servo", resource, motorResources, servoResources, padTimers };
    const options = [];
    const seen = new Set();
    addCurrentOption(options, seen, currentPin, padTimers);
    if (!hardwareAnalysis) return genericOptions(currentPin, fallbackPins, ctx);

    const servoIndex = resource.index + 1;
    const candidates = candidatePadsForSlot(hardwareAnalysis, servoIndex, {
        motorIndicesInUse: motorIndicesInUse(motorResources),
        currentPad: currentPin === RESOURCE_NONE ? null : currentPin,
        allowLedStrip: allowLedStrip === true,
        allowUartRelease: Array.isArray(allowUartRelease) ? allowUartRelease : [],
    });

    for (const candidate of candidates) {
        addOption(options, seen, {
            pin: candidate.pad,
            af: candidate.af,
            label: labelForCandidate(candidate),
            source: candidate.source,
            timer: candidate.timer,
            channel: candidate.channel,
            sharesTimerWithMotor: candidate.sharesTimerWithMotor,
            requiresRelease: candidate.requiresRelease,
        });
    }
    addFallbackOptions(options, seen, fallbackPins, ctx);
    return options;
}

export function resourceOptions({
    kind,
    resource,
    motorResources = [],
    servoResources = [],
    hardwareAnalysis = null,
    fallbackPins = [],
    allowLedStrip = true,
    allowUartRelease = [],
}) {
    if (kind === "servo") {
        return servoOptions({
            resource,
            motorResources,
            servoResources,
            hardwareAnalysis,
            fallbackPins,
            allowLedStrip,
            allowUartRelease,
        });
    }
    return motorOptions({ resource, motorResources, servoResources, hardwareAnalysis, fallbackPins });
}
