// Motor pulse helper for the Plane Setup Wizard's Motors step.
//
// Mirrors the safety pattern from `useMotorTesting.js`:
//   - Sets BF's arming-disabled flag while test mode is active so the
//     RC can't accidentally arm the craft mid-pulse.
//   - Installs a keyboard kill switch — any non-whitelisted keypress
//     stops all motors immediately.
//   - Always sends a stop command before disabling test mode so motors
//     don't latch at their last commanded value.
//
// Usage:
//   await enableMotorTest();
//   pulseMotor(0, 1100, 1000);  // motor 0 (M1) at ~10% for 1s
//   ...
//   await disableMotorTest();
//
// Caller is responsible for not pulsing while another pulse is active
// — pulseMotor cancels the previous auto-stop timer when called again,
// so back-to-back walks are safe.

import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import { mspHelper } from "../msp/MSPHelper";
import FC from "../fc";
import EscProtocols from "./EscProtocols";
import DshotCommand from "./DshotCommand";

const NUM_MOTOR_SLOTS = 8;
const MOTOR_OFF = 1000; // PWM-equivalent; firmware translates per protocol.

// DShot ESCs ignore MSP_SET_MOTOR commands until they receive an
// explicit "enable extended dshot telemetry" handshake (CMD 13). This
// matches what useMotorTesting.js does for the regular Motors tab —
// without it, the wizard's pulse buttons silently no-op on every
// modern (DShot) wing build. Analog protocols don't need the handshake.
function isDigitalProtocol() {
    const apiVersion = FC.CONFIG?.apiVersion;
    const protocolIndex = FC.MOTOR_CONFIG?.motor_pwm_protocol;
    if (apiVersion == null || protocolIndex == null) return false;
    return EscProtocols.IsProtocolDshot(apiVersion, protocolIndex);
}

function sendDshotCommand(commandCode) {
    const buffer = [DshotCommand.dshotCommandType_e.DSHOT_CMD_TYPE_BLOCKING, DshotCommand.ALL_MOTORS, 1, commandCode];
    MSP.send_message(MSPCodes.MSP2_SEND_DSHOT_COMMAND, buffer);
}

// Same ignore set as useMotorTesting.js — keys the user is likely to
// press accidentally while operating the wizard (Tab to focus, etc).
const IGNORE_KEYS = new Set([
    "PageUp",
    "PageDown",
    "End",
    "Home",
    "ArrowUp",
    "ArrowDown",
    "AltLeft",
    "AltRight",
    "Tab",
]);

let testEnabled = false;
let activeStopTimer = null;

function buildMotorBuffer(values) {
    const buffer = [];
    for (let i = 0; i < NUM_MOTOR_SLOTS; i += 1) {
        const v = values[i] ?? MOTOR_OFF;
        buffer.push(v & 0xff, (v >> 8) & 0xff);
    }
    return buffer;
}

export function stopMotors() {
    if (activeStopTimer) {
        clearTimeout(activeStopTimer);
        activeStopTimer = null;
    }
    const stops = new Array(NUM_MOTOR_SLOTS).fill(MOTOR_OFF);
    MSP.send_message(MSPCodes.MSP_SET_MOTOR, buildMotorBuffer(stops));
}

function safeKeyHandler(e) {
    if (!IGNORE_KEYS.has(e.code)) stopMotors();
}

export async function enableMotorTest() {
    if (testEnabled) return;
    testEnabled = true;
    // DShot handshake first: CMD 13 enables extended dshot telemetry,
    // which is what unlocks ESCs to accept MSP_SET_MOTOR while the
    // craft is disarmed. Without this every pulseMotor call silently
    // no-ops on digital wings. Analog protocols skip the handshake.
    if (isDigitalProtocol()) {
        sendDshotCommand(13);
    }
    // setArmingEnabled(disabled, persist): true/true sets the BF arming-
    // disabled flag and persists it for the duration of the session.
    await new Promise((resolve) => {
        mspHelper.setArmingEnabled(true, true, resolve);
    });
    document.addEventListener("keydown", safeKeyHandler);
}

export async function disableMotorTest() {
    if (!testEnabled) return;
    testEnabled = false;
    document.removeEventListener("keydown", safeKeyHandler);
    stopMotors();
    // DShot teardown: explicit MOTOR_STOP so ESCs latch off cleanly
    // instead of holding the last commanded value across a reboot.
    if (isDigitalProtocol()) {
        sendDshotCommand(DshotCommand.dshotCommands_e.DSHOT_CMD_MOTOR_STOP);
    }
    await new Promise((resolve) => {
        mspHelper.setArmingEnabled(false, false, resolve);
    });
}

// Pulse two motors simultaneously at different throttles to test yaw
// direction (diff-thrust). Both motors auto-stop after `durationMs`.
// idxA and idxB are 0-indexed (M1 = 0).
export function pulseMotorPair(idxA, throttleA, idxB, throttleB, durationMs) {
    if (!testEnabled) {
        throw new Error("pulseMotorPair: motor test not enabled");
    }
    if (idxA < 0 || idxA >= NUM_MOTOR_SLOTS || idxB < 0 || idxB >= NUM_MOTOR_SLOTS) {
        throw new Error(`pulseMotorPair: motor index out of range`);
    }
    const values = new Array(NUM_MOTOR_SLOTS).fill(MOTOR_OFF);
    values[idxA] = throttleA;
    values[idxB] = throttleB;
    MSP.send_message(MSPCodes.MSP_SET_MOTOR, buildMotorBuffer(values));
    if (activeStopTimer) clearTimeout(activeStopTimer);
    activeStopTimer = setTimeout(() => {
        stopMotors();
        activeStopTimer = null;
    }, durationMs);
}

// Pulse a single motor at `throttle` PWM-equivalent for `durationMs`,
// then auto-stop. motorIdx is 0-indexed (M1 = 0).
export function pulseMotor(motorIdx, throttle, durationMs) {
    if (!testEnabled) {
        throw new Error("pulseMotor: motor test not enabled");
    }
    if (motorIdx < 0 || motorIdx >= NUM_MOTOR_SLOTS) {
        throw new Error(`pulseMotor: motorIdx out of range: ${motorIdx}`);
    }
    const values = new Array(NUM_MOTOR_SLOTS).fill(MOTOR_OFF);
    values[motorIdx] = throttle;
    MSP.send_message(MSPCodes.MSP_SET_MOTOR, buildMotorBuffer(values));
    if (activeStopTimer) clearTimeout(activeStopTimer);
    activeStopTimer = setTimeout(() => {
        stopMotors();
        activeStopTimer = null;
    }, durationMs);
}

export function isMotorTestEnabled() {
    return testEnabled;
}
