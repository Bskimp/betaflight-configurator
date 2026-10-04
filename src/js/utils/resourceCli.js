// Parsers for the CLI output the Servos tab reads through the MSP CLI
// path (useMspCliSession.send): `resource show` and the `timer` dump.
// Fixtures in the tests are bench captures; formats have been stable
// across BF 4.x.

// Peripheral line body: "FREE" or "NAME" or "NAME INDEX".
// NAME is upper-case letters and underscores (GYRO_CS, SPI_SDI,
// LED_STRIP, USB, MOTOR, SERVO, SERIAL_TX, ADC_BATT, ...).
// Special case: `dma show` emits UART DMA names with the index embedded
// in the token (e.g. "USART2_TX", "UART6_RX") rather than space-separated.
// Without unwrapping that, the analyzer drops null-index UART entries and
// UART DMA disappears for boards that print this form.
function parsePeripheralBody(body) {
    const trimmed = body.trim();
    if (!trimmed || trimmed === "FREE") {
        return { peripheral: "FREE", index: null };
    }
    const m = /^([A-Z][A-Z0-9_]*)(?:\s+(\d+))?$/.exec(trimmed);
    if (!m) {
        return null;
    }
    const peripheral = m[1];
    let index = m[2] ? Number(m[2]) : null;
    if (index === null) {
        const uartMatch = /^(?:USART|UART)(\d+)_(?:TX|RX)$/.exec(peripheral);
        if (uartMatch) {
            index = Number(uartMatch[1]);
        }
    }
    return { peripheral, index };
}

/**
 * Parse the body of `resource show`. Handles both BF output formats:
 *
 *   1. "PAD: NAME INDEX"                e.g. "B07: MOTOR 1"
 *      (classic `resource show` layout - used on older + stock BF builds)
 *
 *   2. "resource NAME INDEX PAD"        e.g. "resource MOTOR 1 B07"
 *      (dump-style `resource show` output - some BF forks emit this;
 *      also matches `diff all` / `dump` output verbatim)
 *
 * Lines that match neither (headers, blanks, comments) are skipped.
 * "resource NAME INDEX NONE" is treated as a released/empty binding and
 * filtered out (same as if the pad weren't listed at all), so downstream
 * analysis sees only currently-bound resources.
 *
 * Examples:
 *   "B07: MOTOR 1"          -> { pad: "B07", peripheral: "MOTOR", index: 1 }
 *   "A00: FREE"             -> { pad: "A00", peripheral: "FREE", index: null }
 *   "resource LED_STRIP 1 A00" -> { pad: "A00", peripheral: "LED_STRIP", index: 1 }
 *   "resource MOTOR 5 NONE" -> skipped (empty binding)
 *
 * @param {string[]|string} input - lines array or raw multi-line string
 * @returns {Array<{pad: string, peripheral: string, index: number|null}>}
 */
const PAD_RE = /^[A-Z]\d{2}$/i;
const PERIPHERAL_NAME_RE = /^[A-Z][A-Z0-9_]*$/i;
const DIGITS_RE = /^\d+$/;

// Classic PAD:BODY format. Split on the first ":" with indexOf rather
// than regex backtracking against `\s*:\s*`. Returns the parsed entry
// or null when the line isn't this shape.
function parseClassicResourceLine(line) {
    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) {
        return null;
    }
    const head = line.slice(0, colonIdx).trim();
    if (!PAD_RE.test(head)) {
        return null;
    }
    const body = parsePeripheralBody(line.slice(colonIdx + 1).trim());
    if (!body) {
        return null;
    }
    return { pad: head.toUpperCase(), ...body };
}

// Dump-style `resource NAME INDEX PAD` format. Tokenise by whitespace
// and validate each piece; cheaper to reason about than a single multi-
// group anchored regex. Returns null for unrecognised shapes and for
// the explicit "NONE" pad (skipping released entries).
function parseDumpResourceLine(line) {
    if (!line.toLowerCase().startsWith("resource ")) {
        return null;
    }
    const tokens = line.split(/\s+/);
    if (
        tokens.length !== 4 ||
        !PERIPHERAL_NAME_RE.test(tokens[1]) ||
        !DIGITS_RE.test(tokens[2]) ||
        !(tokens[3].toUpperCase() === "NONE" || PAD_RE.test(tokens[3]))
    ) {
        return null;
    }
    const pad = tokens[3].toUpperCase();
    if (pad === "NONE") {
        return null;
    }
    return {
        pad,
        peripheral: tokens[1].toUpperCase(),
        index: Number(tokens[2]),
    };
}

export function parseResourceShow(input) {
    const lines = Array.isArray(input) ? input : input.split(/\r?\n/);
    const out = [];
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }
        const entry = parseClassicResourceLine(line) ?? parseDumpResourceLine(line);
        if (entry) {
            out.push(entry);
        }
    }
    return out;
}

/**
 * Parse the full `timer` dump output (NOT `timer show`). Returns
 * the set of pads that have a timer AF declared - these are the
 * PWM-capable pads on the board, whether currently claimed or not.
 *
 * Example input lines:
 *   timer B07 AF2
 *   # pin B07: TIM4 CH2 (AF2)
 *   timer B06 AF2
 *   # pin B06: TIM4 CH1 (AF2)
 *
 * Comment lines starting with "#" carry the human-readable
 * TIM/CH mapping; we parse them too so the caller can get timer/
 * channel info per pad without needing a second dump.
 *
 * @param {string[]|string} input
 * @returns {Array<{pad: string, af: number, timer: number|null, channel: number|null}>}
 */
export function parseTimerDump(input) {
    const lines = Array.isArray(input) ? input : input.split(/\r?\n/);
    const out = [];
    let pending = null;
    for (const line of lines) {
        const ti = /^\s*timer\s+(\S+)\s+AF(\d+)/i.exec(line);
        if (ti) {
            if (pending) {
                out.push(pending);
            }
            pending = { pad: ti[1].toUpperCase(), af: Number(ti[2]), timer: null, channel: null };
            continue;
        }
        if (pending) {
            const pm = /^\s*#\s*pin\s+(\S+)\s*:\s*TIM(\d+)\s+CH(\d+)N?/i.exec(line);
            if (pm?.[1].toUpperCase() === pending.pad) {
                pending.timer = Number(pm[2]);
                pending.channel = Number(pm[3]);
            }
        }
    }
    if (pending) {
        out.push(pending);
    }
    return out;
}
