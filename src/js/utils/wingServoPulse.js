// Servo pulse primitive used by the Plane Setup Wizard. Sends
// MSP2_SET_SERVO_OVERRIDE — the wing-fork firmware primitive that
// drives a target servo to a PWM for a duration, then auto-clears.
//
// Why override instead of live-edit-middle: cleaner. No FC.SERVO_CONFIG
// snapshot lifecycle, no middle-restore timer races, no cleanup hooks
// fighting cross-tab Save. Firmware owns the auto-clear timer; if the
// configurator drops, RX times out, or wizard closes mid-pulse, the
// servo recenters on its own within `durationMs`.
//
// Wire format (per firmware src/main/flight/servo_override.c, registered
// at MSP2_SET_SERVO_OVERRIDE = 0x301B):
//   u8  servoIdx      — slot number; matches what the caller passes
//   u16 pwm           — target PWM in microseconds (1000-2000)
//   u16 durationMs    — auto-clear timeout
// = 5 bytes total. Firmware refuses if armed.
//
// Caller convention: pass `slotN` matching the wizard's surface.slot
// field (1-based, matches FC.SERVO_CONFIG index in wing-fork). If the
// firmware servoIdx convention turns out to be different (off-by-one
// or off-by-two), adjust the `servoIdxFromSlot()` helper below — that's
// the only place the convention is encoded.

import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";

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

// Maps the wizard's slotN (1-based, surface.slot) to the firmware's
// servoIdx byte. Wing-fork SLOT enum reserves indices 0 + 1 (legacy
// SLOT_RESERVED_*); real servos start at SLOT_ELEVATOR = 2. So CLI
// "SERVO 1" → firmware servoIdx 2.
//
// Bench-observed 2026-05-01:
//   slotN directly → SERVO 1 silent, 2-4 pulse  (idx 1 reserved hit)
//   slotN - 1      → SERVO 1+2 silent, 3-4 pulse (idx 0+1 reserved hit)
//   slotN + 1      → all 4 pulse on the right physical servo
//
// Single point of convention encoding; every pulse routes through here.
function servoIdxFromSlot(slotN) {
    return slotN + 1;
}

// Public: one-shot servo pulse. Sends MSP2_SET_SERVO_OVERRIDE and
// resolves once the firmware ACKs the request — NOT after the pulse
// completes. Caller should `await` then sleep for the durationMs if
// it needs to gate the UI on physical motion.
export async function pulseServoMiddle(slotN, pwm, durationMs) {
    validateArgs(slotN, pwm, durationMs);
    const servoIdx = servoIdxFromSlot(slotN);
    const payload = [servoIdx & 0xff, pwm & 0xff, (pwm >> 8) & 0xff, durationMs & 0xff, (durationMs >> 8) & 0xff];
    return new Promise((resolve, reject) => {
        try {
            MSP.send_message(MSPCodes.MSP2_SET_SERVO_OVERRIDE, payload, false, resolve);
        } catch (err) {
            reject(err);
        }
    });
}

// No-op stubs kept so PlaneSetupWizard's destructured import list still
// resolves. The override path doesn't need any of these — firmware
// auto-clears, no client-side state to snapshot or restore.
export async function wizardServoPulseCleanup() {
    /* no-op: firmware handles auto-clear via durationMs timeout */
}

export function snapshotMiddles() {
    return null;
}

export async function restoreMiddlesFromSnapshot() {
    /* no-op: nothing to restore on the override path */
}

export function resetCapabilityCache() {
    /* no-op: no capability cache on the override path */
}
