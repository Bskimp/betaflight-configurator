import { candidatePadsForSlot } from "./padRecommender.js";

export const RESOURCE_NONE = "NONE";

function normalizePin(pin) {
    return typeof pin === "string" && pin.length > 0 ? pin.toUpperCase() : RESOURCE_NONE;
}

function addOption(options, seen, option) {
    const value = normalizePin(option.value ?? option.pin);
    if (!value || seen.has(value)) return;
    seen.add(value);
    options.push({
        value,
        label: option.label ?? value,
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
    if (candidate.source === "motor-release") {
        const line = candidate.requiresRelease?.[0] ?? "";
        const match = /^resource MOTOR (\d+) /i.exec(line);
        return match ? `releases MOTOR ${match[1]}` : "releases motor";
    }
    if (candidate.source === "servo-release") {
        const line = candidate.requiresRelease?.[0] ?? "";
        const match = /^resource SERVO (\d+) /i.exec(line);
        return match ? `releases SERVO ${match[1]}` : "releases servo";
    }
    if (candidate.source === "led-strip") return "releases LED_STRIP";
    if (candidate.source === "uart-release") {
        const line = candidate.requiresRelease?.[0] ?? "";
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

function addCurrentOption(options, seen, currentPin) {
    if (currentPin && currentPin !== RESOURCE_NONE) {
        addOption(options, seen, { value: currentPin, label: `${currentPin} - current`, source: "existing" });
    }
}

function addFallbackOptions(options, seen, fallbackPins) {
    for (const pin of fallbackPins ?? []) {
        addOption(options, seen, { value: pin });
    }
}

function genericOptions(currentPin, fallbackPins) {
    const options = [];
    const seen = new Set();
    addCurrentOption(options, seen, currentPin);
    addFallbackOptions(options, seen, fallbackPins);
    return options;
}

function motorOptions({ resource, hardwareAnalysis, fallbackPins }) {
    const currentPin = normalizePin(resource?.pin);
    const options = [];
    const seen = new Set();
    addCurrentOption(options, seen, currentPin);
    if (!hardwareAnalysis) return genericOptions(currentPin, fallbackPins);

    const existing = (hardwareAnalysis.motors ?? []).find((motor) => motor.index === resource.index + 1);
    if (existing?.pad) {
        addOption(options, seen, {
            value: existing.pad,
            label: labelForCandidate({ ...existing, source: "existing" }),
            source: "existing",
            timer: existing.timer,
            channel: existing.channel,
        });
    }
    for (const pad of hardwareAnalysis.pwmCapableFreePads ?? []) {
        addOption(options, seen, {
            value: pad.pad,
            label: labelForCandidate({ ...pad, source: "free-pwm" }),
            source: "free-pwm",
            timer: pad.timer,
            channel: pad.channel,
        });
    }
    addFallbackOptions(options, seen, fallbackPins);
    return options;
}

function servoOptions({ resource, motorResources, hardwareAnalysis, fallbackPins, allowLedStrip, allowUartRelease }) {
    const currentPin = normalizePin(resource?.pin);
    const options = [];
    const seen = new Set();
    addCurrentOption(options, seen, currentPin);
    if (!hardwareAnalysis) return genericOptions(currentPin, fallbackPins);

    const servoIndex = resource.index + 1;
    const candidates = candidatePadsForSlot(hardwareAnalysis, servoIndex, {
        motorIndicesInUse: motorIndicesInUse(motorResources),
        currentPad: currentPin === RESOURCE_NONE ? null : currentPin,
        allowLedStrip: allowLedStrip === true,
        allowUartRelease: Array.isArray(allowUartRelease) ? allowUartRelease : [],
    });

    for (const candidate of candidates) {
        addOption(options, seen, {
            value: candidate.pad,
            label: labelForCandidate(candidate),
            source: candidate.source,
            timer: candidate.timer,
            channel: candidate.channel,
            sharesTimerWithMotor: candidate.sharesTimerWithMotor,
            requiresRelease: candidate.requiresRelease,
        });
    }
    addFallbackOptions(options, seen, fallbackPins);
    return options;
}

export function resourceOptions({
    kind,
    resource,
    motorResources = [],
    hardwareAnalysis = null,
    fallbackPins = [],
    allowLedStrip = true,
    allowUartRelease = [],
}) {
    if (kind === "servo") {
        return servoOptions({
            resource,
            motorResources,
            hardwareAnalysis,
            fallbackPins,
            allowLedStrip,
            allowUartRelease,
        });
    }
    return motorOptions({ resource, hardwareAnalysis, fallbackPins });
}
