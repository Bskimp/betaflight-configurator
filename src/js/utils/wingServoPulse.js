// Servo pulse primitive used by the Plane Setup Wizard. Dual-path:
//
//   Wing-fork: MSP2_SET_SERVO_OVERRIDE — firmware-side primitive that
//   drives a target servo to a PWM for a duration, then auto-clears.
//   Cleaner: no client-side lifecycle, no snapshot/restore timers.
//
//   Mainline: MSP_SET_SERVO_CONFIGURATION live-edit-middle — write the
//   pulse PWM as the servo's middle, sleep durationMs, restore. Same
//   MSP the Servos tab uses to nudge values live; in-memory only,
//   never persisted unless the user explicitly clicks Save (which
//   calls wizardServoPulseCleanup() first to swap the snapshot back
//   in before any EEPROM write).
//
// Path choice: gated on FC.CONFIG.wingCapabilities. The wing-fork
// firmware ACKs MSP2_GET_WING_CAPABILITIES and the MSP parser
// populates that field; mainline NACKs and the field stays undefined.
// Same flag that drives the sub-tab visibility — single source of
// truth across the configurator's fork-detection.
//
// Wire format for the override path (per firmware
// src/main/flight/servo_override.c, registered at
// MSP2_SET_SERVO_OVERRIDE = 0x301B):
//   u8  servoIdx      — slot number (slotN + 1 to skip wing-fork
//                       reserved SLOT 0+1)
//   u16 pwm           — target PWM in microseconds (1000-2000)
//   u16 durationMs    — auto-clear timeout
// = 5 bytes total. Firmware refuses if armed.

import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import { mspHelper } from "../msp/MSPHelper";
import FC from "../fc";

export const PULSE_PWM_MIN = 1000;
export const PULSE_PWM_MAX = 2000;
export const PULSE_MAX_DURATION_MS = 5000;

function validateArgs(slotN, pwm, durationMs) {
    if (!Number.isInteger(slotN) || slotN < 0 || slotN > 255) {
        throw new Error(`pulseServoMiddle: invalid slotN ${slotN}`);
    }
    if (!Number.isFinite(pwm) || pwm < PULSE_PWM_MIN || pwm > PULSE_PWM_MAX) {
        throw new Error(`pulseServoMiddle: invalid pwm ${pwm}`);
    }
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > PULSE_MAX_DURATION_MS) {
        throw new Error(`pulseServoMiddle: invalid durationMs ${durationMs}`);
    }
}

// Wing-fork SLOT enum reserves indices 0+1 (legacy SLOT_RESERVED_*);
// real servos start at SLOT_ELEVATOR = 2. Mainline BF's SERVO_CONFIG
// follows the same internal slot numbering for MIXER_CUSTOM_AIRPLANE
// (slots 2-7 hold the plane servo configs), so the +1 mapping works
// on both targets.
function configIdxFromSlot(slotN) {
    return slotN + 1;
}

// FC.CONFIG.wingCapabilities defaults to an all-false object (see
// fc.js so the wing-only sub-tab gates can read bits without null-
// guarding). On wing-fork firmware MSP2_GET_WING_CAPABILITIES ACKs
// and the parser flips bits to true; on mainline it NACKs and the
// default all-false object stays in place. So we can't use object
// existence as the fork signal — bench-confirmed mainline NACK still
// leaves wingCapabilities defined, which had the wizard incorrectly
// taking the override path and firing MSP2_SET_SERVO_OVERRIDE → NACK
// → silent servo. Check a specific capability bit instead. The
// `tuning` bit is always set on the wing-fork (per MSPCodes.js
// comment: "bit 0: WING_TUNING — always set when MSP2_WING_TUNING is
// supported") so it's the canonical fork-presence flag.
function isWingForkActive() {
    return FC.CONFIG?.wingCapabilities?.tuning === true;
}

// In-flight live-edit-middle snapshot. Map<configIdx, originalMiddle>.
// Cleared as each pulse restores. wizardServoPulseCleanup() reads this
// to bulk-restore on Save, so an in-flight pulse PWM never gets
// persisted to EEPROM. Null when no pulse is active or when running
// the override path (firmware owns the auto-clear there).
let inFlightSnapshot = null;

// Public: one-shot servo pulse. Picks the path based on firmware
// capabilities; resolves once the pulse + restore round-trip has
// finished (override path resolves on FC ACK; live-edit-middle
// resolves after durationMs + restore write).
export async function pulseServoMiddle(slotN, pwm, durationMs) {
    validateArgs(slotN, pwm, durationMs);
    if (isWingForkActive()) {
        await pulseViaOverride(slotN, pwm, durationMs);
    } else {
        await pulseViaLiveEditMiddle(slotN, pwm, durationMs);
    }
}

function pulseViaOverride(slotN, pwm, durationMs) {
    const servoIdx = configIdxFromSlot(slotN);
    const payload = [servoIdx & 0xff, pwm & 0xff, (pwm >> 8) & 0xff, durationMs & 0xff, (durationMs >> 8) & 0xff];
    return new Promise((resolve, reject) => {
        try {
            MSP.send_message(MSPCodes.MSP2_SET_SERVO_OVERRIDE, payload, false, resolve);
        } catch (err) {
            reject(err);
        }
    });
}

async function pulseViaLiveEditMiddle(slotN, pwm, durationMs) {
    const idx = configIdxFromSlot(slotN);
    const cfg = FC.SERVO_CONFIG?.[idx];
    if (!cfg) {
        throw new Error(`pulseServoMiddle: no FC.SERVO_CONFIG[${idx}]`);
    }
    const originalMiddle = cfg.middle;
    cfg.middle = pwm;
    if (!inFlightSnapshot) inFlightSnapshot = new Map();
    inFlightSnapshot.set(idx, originalMiddle);
    try {
        await sendServoConfigs();
        await sleep(durationMs);
    } finally {
        cfg.middle = originalMiddle;
        inFlightSnapshot?.delete(idx);
        if (inFlightSnapshot && inFlightSnapshot.size === 0) inFlightSnapshot = null;
        await sendServoConfigs();
    }
}

function sendServoConfigs() {
    return new Promise((resolve, reject) => {
        try {
            mspHelper.sendServoConfigurations(resolve);
        } catch (err) {
            reject(err);
        }
    });
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// Restore any in-flight pulse middles to their snapshot values. Called
// from WingTuningTab.save() before any EEPROM write so a Save during
// an active pulse persists the user-set middle, not the pulse PWM.
// No-op when no pulse is active or on the override path.
export async function wizardServoPulseCleanup() {
    if (!inFlightSnapshot || inFlightSnapshot.size === 0) return;
    for (const [idx, originalMiddle] of inFlightSnapshot) {
        const cfg = FC.SERVO_CONFIG?.[idx];
        if (cfg) cfg.middle = originalMiddle;
    }
    inFlightSnapshot = null;
    await sendServoConfigs();
}

// Returns a plain {[idx]: originalMiddle} object snapshot of the
// in-flight pulse state, or null if nothing is active. Kept for
// callers that want a non-mutating peek (e.g., diagnostics).
export function snapshotMiddles() {
    if (!inFlightSnapshot || inFlightSnapshot.size === 0) return null;
    return Object.fromEntries(inFlightSnapshot);
}

// Alias for wizardServoPulseCleanup — kept so the wizard's existing
// destructured-import surface still resolves.
export async function restoreMiddlesFromSnapshot() {
    return wizardServoPulseCleanup();
}

// No capability cache to reset on the new path — fork detection reads
// FC.CONFIG.wingCapabilities directly. Stub kept for the wizard's
// import surface so adding/removing the fallback path doesn't ripple
// into the wizard's import list.
export function resetCapabilityCache() {
    /* no-op */
}
