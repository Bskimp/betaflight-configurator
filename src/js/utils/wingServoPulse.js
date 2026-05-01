// Servo pulse primitive used by the Plane Setup Wizard. Live-edits
// servo `middle` via MSP_SET_SERVO_CONFIGURATION (RAM-only; same path
// ServosTab.vue's "Live mode" uses). Schedule a restore via setTimeout.
// Cleanup hooks force-restore on wizard exit / disconnect / tab
// background / cross-tab Save.
//
// Why not the wing-fork MSP2_SET_SERVO_OVERRIDE override path?
// Try-then-fallback capability detection doesn't work — when an FC
// receives an unsupported MSP code, the configurator's MSP layer
// just logs "FC reports unsupported message error" and silently
// resolves the promise. There's no error to catch, so the override
// "succeeds" silently and all subsequent pulses no-op.
//
// Working around this needs either a static buildOptions probe (the
// wing-fork firmware would need to advertise USE_WING_SERVO_OVERRIDE
// — it doesn't today) or some other readback. Until that exists,
// fallback-only is the only reliable path. Wing-fork users lose the
// firmware-enforced arm-time auto-clear, but the wizard's existing
// armed-state UI gate covers safety, and the cleanup hooks bound the
// stuck-pulse risk.
//
// Wire format for the fallback path (per MSPHelper.sendServoConfigurations
// at MSPHelper.js:2673):
//   u8  servoIndex (0-based into FC.SERVO_CONFIG)
//   i16 min
//   i16 max
//   i16 middle      ← what we mutate
//   i8  rate
//   u8  indexOfChannelToForward (255 = disabled)
//   u32 reversedInputSources
// = 12 bytes per servo.
//
// Caller-side note: callers pass `slotN` (BF SLOT enum, e.g.
// SLOT.ELEVATOR = 2, SLOT.FLAPPERON_L = 3) — same arg shape as the
// legacy sendServoOverride. Override path uses slotN directly.
// Fallback path converts to FC.SERVO_CONFIG index via `slotN - 2`
// (BF convention: physical pad N = SLOT N+1 = SERVO_CONFIG[N-1]).

import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import FC from "../fc";

export const PULSE_PWM_MIN = 1000;
export const PULSE_PWM_MAX = 2000;
export const PULSE_MAX_DURATION_MS = 5000;

// Per-servo restore tracking:
// Map<slotIdx, { originalMiddle, restoreTimer, generation }>
const pulseState = new Map();
let generationCounter = 0;

// Wizard-session safety-net snapshot of every middle at wizard open.
// On clean close (restoreMiddlesFromSnapshot), re-issue the snapshotted
// values unconditionally — catches any drift the pulseState cleanup
// missed.
let wizardSnapshot = null;

function validateArgs(slotN, pwm, durationMs) {
    if (slotN < 0 || slotN > 0xff) {
        throw new Error(`slotN out of range: ${slotN}`);
    }
    if (pwm < PULSE_PWM_MIN || pwm > PULSE_PWM_MAX) {
        throw new Error(`pwm out of range: ${pwm} (need ${PULSE_PWM_MIN}..${PULSE_PWM_MAX})`);
    }
    if (durationMs <= 0 || durationMs > PULSE_MAX_DURATION_MS) {
        throw new Error(`durationMs out of range: ${durationMs} (need 1..${PULSE_MAX_DURATION_MS})`);
    }
}

function buildServoConfigBuffer(slotIdx, cfg) {
    const buffer = [];
    buffer
        .push8(slotIdx)
        .push16(cfg.min)
        .push16(cfg.max)
        .push16(cfg.middle)
        .push8(cfg.rate ?? 100)
        .push8(cfg.indexOfChannelToForward ?? 255)
        .push32(cfg.reversedInputSources ?? 0);
    return buffer;
}

function sendOneServoConfig(slotIdx, cfg) {
    return new Promise((resolve, reject) => {
        try {
            MSP.send_message(
                MSPCodes.MSP_SET_SERVO_CONFIGURATION,
                buildServoConfigBuffer(slotIdx, cfg),
                false,
                resolve,
            );
            // MSP.send_message swallows errors via callback; the
            // resolve fires on completion. Wrap in setTimeout watchdog
            // if needed in the future.

            void reject;
        } catch (err) {
            reject(err);
        }
    });
}

async function ensureServoConfigLoaded() {
    if ((FC.SERVO_CONFIG?.length ?? 0) > 0) return;
    // The Wing Tuning tab doesn't request MSP_SERVO_CONFIGURATIONS at
    // connect (only the Servos tab does). The wizard's Endpoints step
    // fetches it explicitly; Discovery / Direction / Motors don't.
    // Lazy-fetch here so the live-edit-middle path always has FC state.
    await new Promise((resolve, reject) => {
        try {
            MSP.send_message(MSPCodes.MSP_SERVO_CONFIGURATIONS, false, false, resolve);
        } catch (err) {
            reject(err);
        }
    });
}

async function pulseViaConfigEdit(slotN, pwm, durationMs) {
    await ensureServoConfigLoaded();
    // SLOT enum maps directly to FC.SERVO_CONFIG index (firmware
    // servoParams[] is indexed by SLOT enum values 0..7; the MSP
    // servoIndex byte addresses servoParams[] directly).
    const slotIdx = slotN;
    if (slotIdx < 0 || slotIdx >= (FC.SERVO_CONFIG?.length ?? 0)) {
        throw new Error(`slotN ${slotN} out of range for FC.SERVO_CONFIG length ${FC.SERVO_CONFIG?.length ?? 0}.`);
    }
    const cfg = FC.SERVO_CONFIG[slotIdx];
    let state = pulseState.get(slotIdx);

    // First pulse on this servo: snapshot the resting middle so we
    // can always restore, even if a follow-up pulse is in flight.
    if (!state) {
        state = { originalMiddle: cfg.middle, restoreTimer: null, generation: 0 };
        pulseState.set(slotIdx, state);
    }

    if (state.restoreTimer) {
        clearTimeout(state.restoreTimer);
        state.restoreTimer = null;
    }

    const myGen = ++generationCounter;
    state.generation = myGen;

    await sendOneServoConfig(slotIdx, { ...cfg, middle: pwm });

    state.restoreTimer = setTimeout(() => {
        if (state.generation !== myGen) return;
        state.restoreTimer = null;
        const current = FC.SERVO_CONFIG[slotIdx];
        if (!current) {
            pulseState.delete(slotIdx);
            return;
        }
        sendOneServoConfig(slotIdx, { ...current, middle: state.originalMiddle })
            .then(() => {
                FC.SERVO_CONFIG[slotIdx].middle = state.originalMiddle;
                pulseState.delete(slotIdx);
            })
            .catch(() => {
                // Cleanup will retry on wizard close.
            });
    }, durationMs);
}

// Public: capability-detecting one-shot servo pulse. Same arg shape as
// the legacy sendServoOverride.
export async function pulseServoMiddle(slotN, pwm, durationMs) {
    validateArgs(slotN, pwm, durationMs);
    return pulseViaConfigEdit(slotN, pwm, durationMs);
}

// Public: in-flight cleanup. Cancels pending restore timers, force-
// restores every servo we mutated. Call on step transitions /
// visibility hide / connection drop.
export async function wizardServoPulseCleanup() {
    const tasks = [];
    for (const [slotIdx, state] of pulseState.entries()) {
        if (state.restoreTimer) {
            clearTimeout(state.restoreTimer);
            state.restoreTimer = null;
        }
        const current = FC.SERVO_CONFIG?.[slotIdx];
        if (!current) continue;
        tasks.push(
            sendOneServoConfig(slotIdx, { ...current, middle: state.originalMiddle })
                .then(() => {
                    FC.SERVO_CONFIG[slotIdx].middle = state.originalMiddle;
                })
                .catch(() => {}),
        );
    }
    pulseState.clear();
    await Promise.all(tasks);
}

// Public: snapshot ALL current middles. Call on wizard open before any
// pulses fire. Pairs with restoreMiddlesFromSnapshot.
export function snapshotMiddles() {
    wizardSnapshot = (FC.SERVO_CONFIG ?? []).map((cfg) => cfg.middle);
}

// Public: restore from snapshot. Call on wizard close. Safety net —
// catches drift the pulseState cleanup might have missed.
export async function restoreMiddlesFromSnapshot() {
    if (!wizardSnapshot) return;
    const tasks = [];
    for (let i = 0; i < wizardSnapshot.length; i += 1) {
        const current = FC.SERVO_CONFIG?.[i];
        if (!current) continue;
        if (current.middle === wizardSnapshot[i]) continue;
        const middle = wizardSnapshot[i];
        tasks.push(
            sendOneServoConfig(i, { ...current, middle })
                .then(() => {
                    FC.SERVO_CONFIG[i].middle = middle;
                })
                .catch(() => {}),
        );
    }
    wizardSnapshot = null;
    await Promise.all(tasks);
}

// Public: no-op stub kept for future re-introduction of buildOptions-
// based capability detection (would re-enable the wing-fork override
// path). Currently always uses live-edit-middle. Wizard calls this on
// mount as a hook for the future feature.
export function resetCapabilityCache() {
    // No-op (see header comment about why capability detection isn't
    // viable today).
}

// Test-only: inspect internal state.
export const _internals = {
    getPulseState: () => pulseState,
    getSnapshot: () => wizardSnapshot,
};
