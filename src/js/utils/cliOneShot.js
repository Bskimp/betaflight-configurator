// Generic "send CLI command, capture output" helper + parsers for
// the three introspection commands we lean on: `resource show`,
// `timer show`, `dma show`. Wraps MSP.send_cli_command (msp.js) in
// a Promise so callers can await structured output.
//
// Use for READ-ONLY CLI introspection. Write operations (mmix,
// resource reassignment, save) keep going through wingMixerCli's
// raw-serial path since `save` / `reboot` mid-MSP-framed-CLI has
// edge cases.
//
// Format references below are from a bench-captured BF 4.6 session
// on SPEEDYBEEF405WING; formats have been stable across BF 4.x.

import MSP from "../msp";

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Run a single CLI command and resolve with its output.
 *
 * @param {string} command - CLI command (no trailing newline)
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=3000]
 * @returns {Promise<{lines: string[], raw: string}>}
 */
export function readCli(command, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            MSP.cli_callback = null;
            reject(new Error(`CLI command "${command}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        MSP.send_cli_command(command, (lines) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const snapshot = Array.isArray(lines) ? [...lines] : [];
            resolve({
                lines: snapshot.map((l) => l.replace(/\s+$/, "")),
                raw: snapshot.join("\n"),
            });
        });
    });
}

/**
 * Run multiple CLI commands sequentially. Stops on first failure.
 *
 * @param {string[]} commands
 * @returns {Promise<Array<{command: string, lines: string[], raw: string}>>}
 */
export async function readCliBatch(commands, opts = {}) {
    const results = [];
    for (const cmd of commands) {
        const out = await readCli(cmd, opts);
        results.push({ command: cmd, ...out });
    }
    return results;
}

// ─── parsers ─────────────────────────────────────────────────────

// Peripheral line body: "FREE" or "NAME" or "NAME INDEX".
// NAME is upper-case letters and underscores (GYRO_CS, SPI_SDI,
// LED_STRIP, USB, MOTOR, SERVO, SERIAL_TX, ADC_BATT, ...).
function parsePeripheralBody(body) {
    const trimmed = body.trim();
    if (!trimmed || trimmed === "FREE") {
        return { peripheral: "FREE", index: null };
    }
    const m = /^([A-Z][A-Z0-9_]*)(?:\s+(\d+))?$/.exec(trimmed);
    if (!m) return null;
    return {
        peripheral: m[1],
        index: m[2] ? Number(m[2]) : null,
    };
}

/**
 * Parse the body of `resource show`. Input is the output lines AFTER
 * the "(reboot to update)" header; we tolerate the header being
 * present by skipping any line that doesn't look like "PAD: BODY".
 *
 * Example line: "B07: MOTOR 1"
 * Example line: "A08: LED_STRIP"      (no index)
 * Example line: "A00: FREE"
 * Example line: "A11: USB"             (no index)
 *
 * @param {string[]|string} input - lines array or raw multi-line string
 * @returns {Array<{pad: string, peripheral: string, index: number|null}>}
 */
export function parseResourceShow(input) {
    const lines = Array.isArray(input) ? input : input.split(/\r?\n/);
    const out = [];
    for (const line of lines) {
        const m = /^\s*([A-Z]\d{2})\s*:\s*(.+?)\s*$/i.exec(line);
        if (!m) continue;
        const body = parsePeripheralBody(m[2]);
        if (!body) continue;
        out.push({ pad: m[1].toUpperCase(), ...body });
    }
    return out;
}

/**
 * Parse `timer show` — hierarchical TIMn / CH block format.
 *
 * Example input block:
 *   TIM4:
 *       CH1 : MOTOR 2
 *       CH2 : MOTOR 1
 *   TIM2: FREE
 *
 * A "TIM?: FREE" line stands on its own (no children).
 * A "TIM?:" line (no body) is followed by indented "CH? : X" lines
 * until the next TIM line or end of input.
 *
 * @param {string[]|string} input
 * @returns {Array<{timer: number, channel: number|null, peripheral: string, index: number|null}>}
 *   - For FREE timers with no channels declared: channel=null, peripheral="FREE"
 *   - For active timers: one entry per active channel
 */
export function parseTimerShow(input) {
    const lines = Array.isArray(input) ? input : input.split(/\r?\n/);
    const out = [];
    let currentTimer = null;
    for (const line of lines) {
        const timerHeader = /^\s*TIM(\d+)\s*:\s*(.*?)\s*$/i.exec(line);
        if (timerHeader) {
            currentTimer = Number(timerHeader[1]);
            const body = timerHeader[2];
            if (body.length > 0) {
                const parsed = parsePeripheralBody(body);
                if (parsed) {
                    out.push({ timer: currentTimer, channel: null, ...parsed });
                    currentTimer = null; // standalone entry, no children expected
                }
            }
            continue;
        }
        const chMatch = /^\s+CH(\d+)(N?)\s*:\s*(.+?)\s*$/i.exec(line);
        if (chMatch && currentTimer !== null) {
            const body = parsePeripheralBody(chMatch[3]);
            if (!body) continue;
            out.push({
                timer: currentTimer,
                channel: Number(chMatch[1]),
                complementary: chMatch[2] === "N",
                ...body,
            });
        }
    }
    return out;
}

/**
 * Parse `dma show`.
 *
 * Example lines:
 *   DMA1 Stream 0: SPI_SDI 3
 *   DMA1 Stream 6: TIMUP 4
 *   DMA2 Stream 0: ADC 1
 *   DMA1 Stream 1: FREE
 *
 * @param {string[]|string} input
 * @returns {Array<{controller: number, stream: number, peripheral: string, index: number|null}>}
 */
export function parseDmaShow(input) {
    const lines = Array.isArray(input) ? input : input.split(/\r?\n/);
    const out = [];
    for (const line of lines) {
        const m = /^\s*DMA(\d+)\s+Stream\s+(\d+)\s*:\s*(.+?)\s*$/i.exec(line);
        if (!m) continue;
        const body = parsePeripheralBody(m[3]);
        if (!body) continue;
        out.push({
            controller: Number(m[1]),
            stream: Number(m[2]),
            ...body,
        });
    }
    return out;
}

/**
 * Parse a single `resource <NAME> <INDEX> <PAD>` line from the
 * dump/write form (e.g. in `diff` output or `resource` listing).
 * Still useful for round-trip: we'll emit this same form when we
 * apply an auto-computed remap.
 *
 * @param {string} line
 * @returns {{kind: string, index: number, pad: string}|null}
 */
export function parseResourceDumpLine(line) {
    const m = /^\s*resource\s+([A-Z][A-Z0-9_]*)\s+(\d+)\s+(\S+)/i.exec(line);
    if (!m) return null;
    return {
        kind: m[1].toUpperCase(),
        index: Number(m[2]),
        pad: m[3].toUpperCase(),
    };
}
