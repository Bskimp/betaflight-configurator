// Narrow CLI facade for applying motor mix rules at preset-apply time.
//
// BF firmware has no MSP for `mmix` (motor mix rules). This is a one-shot
// write-and-reboot helper — NOT a live editor. Usage is limited to the
// preset-apply flow in WingTuningTab, behind an "Applying preset — FC will
// reboot" modal so user interaction is blocked during the CLI session.
//
// Scope deliberately tight:
//   - single exported function, single use-case
//   - no response parsing (BF's `save` command auto-reboots; we don't need
//     to read back the output)
//   - no interactive buffer / backspace handling
//
// When BF adds MSP for motor mix rules (planned PR-D), delete this file
// and the preset-apply path in WingTuningTab switches to MSP only.

import { serial } from "../serial";
import CONFIGURATOR from "../data_storage";

const CLI_ENTER_BYTE = 0x23; // '#'
const CLI_ENTRY_DELAY_MS = 500; // BF prints banner + prompt before accepting input
// 30 ms was enough for `mmix` + `resource` writes but bench tests on
// FURYF4OSD showed smix rules occasionally dropping — BF seems to need
// more time between lines when the batch gets longer (preset apply
// hits ~15 lines: resource remap + mmix + smix). 100 ms is still
// fast enough that a full apply finishes inside the modal window.
const CLI_LINE_DELAY_MS = 100;
// 200 ms wasn't always enough for the final `save` to fully commit
// before the FC reboot yanked the USB. Bumping to 500 ms gives BF
// comfortable headroom to flush EEPROM for the last in-batch commands
// (the smix rules in particular were getting lost at the tail).
const CLI_SETTLE_MS = 500;

function sendString(str) {
    const buf = new ArrayBuffer(str.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < str.length; i++) {
        view[i] = str.charCodeAt(i);
    }
    return new Promise((resolve) => serial.send(buf, resolve));
}

function sendByte(byte) {
    const buf = new ArrayBuffer(1);
    new Uint8Array(buf)[0] = byte;
    return new Promise((resolve) => serial.send(buf, resolve));
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Format firmware float into the representation `mmix` expects: three
// decimal places, sign prefix implicit. Matches BF CLI dump format.
function fmt(n) {
    return n.toFixed(3);
}

/**
 * Apply a motor mix template via CLI and trigger a save+reboot.
 *
 * @param {Array<{throttle:number,roll:number,pitch:number,yaw:number}>} motors
 *        Motor mix rules. Length determines motor count (1 for single,
 *        2+ for multi-motor with axis weights).
 * @returns {Promise<void>} Resolves after `save` has been sent. The FC
 *        will reboot shortly after; callers should expect disconnect.
 */
export async function applyMotorMix(motors) {
    if (!Array.isArray(motors) || motors.length === 0) {
        throw new Error("applyMotorMix: motors must be a non-empty array");
    }

    CONFIGURATOR.cliActive = true;
    try {
        await sendByte(CLI_ENTER_BYTE);
        await wait(CLI_ENTRY_DELAY_MS);

        await sendString("mmix reset\n");
        await wait(CLI_LINE_DELAY_MS);

        for (let i = 0; i < motors.length; i++) {
            const m = motors[i];
            const line = `mmix ${i} ${fmt(m.throttle)} ${fmt(m.roll)} ${fmt(m.pitch)} ${fmt(m.yaw)}\n`;
            await sendString(line);
            await wait(CLI_LINE_DELAY_MS);
        }

        // `save` persists to EEPROM AND reboots the FC in BF. No explicit
        // MSP_REBOOT needed. The active USB connection will drop; the
        // configurator's reconnect flow picks up from there.
        await sendString("save\n");
        await wait(CLI_SETTLE_MS);
    } finally {
        CONFIGURATOR.cliActive = false;
    }
}

/**
 * Apply an arbitrary batch of CLI command lines and trigger save+reboot.
 * Used by the Wing Hardware sub-tab's "apply wing remap" flow to issue
 * `resource MOTOR N NONE` / `resource SERVO M PAD` sequences.
 *
 * The input SHOULD end with a "save" line (the recommender emits one).
 * If it doesn't, we append one ourselves so the caller can't accidentally
 * leave the FC in an un-persisted state between commands and reboot.
 *
 * @param {string[]} lines - CLI commands (no trailing newlines)
 * @returns {Promise<void>} Resolves after `save` is sent; FC reboots shortly after.
 */
export async function applyCliLines(lines) {
    if (!Array.isArray(lines) || lines.length === 0) {
        throw new Error("applyCliLines: lines must be a non-empty array");
    }
    const normalized = [...lines];
    if (normalized[normalized.length - 1].trim().toLowerCase() !== "save") {
        normalized.push("save");
    }

    CONFIGURATOR.cliActive = true;
    try {
        await sendByte(CLI_ENTER_BYTE);
        await wait(CLI_ENTRY_DELAY_MS);

        for (const line of normalized) {
            await sendString(`${line}\n`);
            await wait(CLI_LINE_DELAY_MS);
        }

        await wait(CLI_SETTLE_MS);
    } finally {
        CONFIGURATOR.cliActive = false;
    }
}
