// Wing-specific interpretation of the raw output from cliOneShot's
// three show-command parsers. Feeds the Hardware sub-tab.
//
// Pure function — no CLI I/O, no DOM. Feed parsed objects in, get a
// structured report out. Golden-fixture-testable.
//
// The three inputs don't have pad info in common: resource-show is
// keyed on pad, timer-show and dma-show are keyed on (peripheral,
// index). We join on (peripheral, index) to resolve a given pad's
// timer + DMA stream.

// Pads whose role is physical / board-wired and should NEVER be
// auto-remapped. Everything else (MOTOR, SERVO, LED_STRIP) is fair
// game for the recommender.
const HARDWARE_FIXED_PERIPHERALS = new Set([
    "USB",
    "SPI_SCK",
    "SPI_SDI",
    "SPI_SDO",
    "I2C_SCL",
    "I2C_SDA",
    "ADC_BATT",
    "ADC_CURR",
    "ADC_RSSI",
    "SDCARD_CS",
    "GYRO_CS",
    "OSD_CS",
    "BEEPER",
    "LED", // status LED (distinct from LED_STRIP)
    "PINIO",
    "PREINIT",
    "CAMERA_CONTROL",
]);

function key(peripheral, index) {
    return `${peripheral}:${index ?? ""}`;
}

function buildTimerLookup(timerShow) {
    const m = new Map();
    for (const e of timerShow) {
        if (e.channel === null || e.peripheral === "FREE") continue;
        m.set(key(e.peripheral, e.index), {
            timer: e.timer,
            channel: e.channel,
            complementary: !!e.complementary,
        });
    }
    return m;
}

function buildDmaLookup(dmaShow) {
    const m = new Map();
    for (const e of dmaShow) {
        if (e.peripheral === "FREE" || e.peripheral === "TIMUP") continue;
        m.set(key(e.peripheral, e.index), {
            controller: e.controller,
            stream: e.stream,
        });
    }
    return m;
}

function collectTimupStreams(dmaShow) {
    const s = new Set();
    for (const e of dmaShow) {
        if (e.peripheral === "TIMUP" && e.index !== null) s.add(e.index);
    }
    return s;
}

function collectSerials(txMap, rxMap) {
    const indices = new Set([...txMap.keys(), ...rxMap.keys()]);
    const out = [];
    for (const idx of indices) {
        out.push({
            index: idx,
            txPad: txMap.get(idx) ?? null,
            rxPad: rxMap.get(idx) ?? null,
        });
    }
    out.sort((a, b) => a.index - b.index);
    return out;
}

function deriveWarnings({ motors, servos, ledStrips, freeDmaStreams }) {
    const w = [];

    for (const m of motors) {
        if (!m.bidirBurst && !m.dmaStream) {
            w.push({
                severity: "warn",
                code: "motor_no_dma",
                message: `MOTOR ${m.index} on ${m.pad} has no DMA stream or TIMUP burst — bidir DSHOT may fall back to bit-bang`,
            });
        }
    }

    const motorTimers = new Set(motors.map((m) => m.timer).filter((t) => t !== null));
    for (const s of servos) {
        if (s.timer !== null && motorTimers.has(s.timer)) {
            w.push({
                severity: "error",
                code: "servo_on_motor_timer",
                message: `SERVO ${s.index} on ${s.pad} shares TIM${s.timer} with a motor — servo PWM frequency will fight DSHOT timing`,
            });
        }
    }

    if (freeDmaStreams.length < 3) {
        w.push({
            severity: "info",
            code: "dma_tight",
            message: `Only ${freeDmaStreams.length} free DMA stream${freeDmaStreams.length === 1 ? "" : "s"} remaining — future peripherals may fail to allocate`,
        });
    }

    for (const ls of ledStrips) {
        w.push({
            severity: "info",
            code: "led_strip_cost",
            message: `LED_STRIP on ${ls.pad} claims TIM${ls.timer ?? "?"} + DMA${ls.dmaStream ? `${ls.dmaStream.controller}/S${ls.dmaStream.stream}` : "?"}. Release it if you need headroom.`,
        });
    }

    return w;
}

/**
 * @param {object} input
 * @param {Array} input.resourceShow
 * @param {Array} input.timerShow
 * @param {Array} input.dmaShow
 */
export function analyzeWingResources({ resourceShow, timerShow, dmaShow }) {
    const timerByKey = buildTimerLookup(timerShow);
    const dmaByKey = buildDmaLookup(dmaShow);
    const timupStreams = collectTimupStreams(dmaShow);

    const motors = [];
    const servos = [];
    const ledStrips = [];
    const serialTx = new Map();
    const serialRx = new Map();
    const hardwareFixedPads = [];
    let freePadsCount = 0;

    for (const entry of resourceShow) {
        if (entry.peripheral === "FREE") {
            freePadsCount++;
            continue;
        }
        const p = entry.peripheral;
        const timerHit = timerByKey.get(key(p, entry.index)) || null;
        const dmaHit = dmaByKey.get(key(p, entry.index)) || null;

        if (p === "MOTOR") {
            const bidirBurst = timerHit?.timer != null && timupStreams.has(timerHit.timer);
            motors.push({
                index: entry.index ?? 0,
                pad: entry.pad,
                timer: timerHit?.timer ?? null,
                channel: timerHit?.channel ?? null,
                dmaStream: dmaHit,
                bidirBurst,
            });
        } else if (p === "SERVO") {
            servos.push({
                index: entry.index ?? 0,
                pad: entry.pad,
                timer: timerHit?.timer ?? null,
                channel: timerHit?.channel ?? null,
            });
        } else if (p === "LED_STRIP") {
            ledStrips.push({
                pad: entry.pad,
                timer: timerHit?.timer ?? null,
                channel: timerHit?.channel ?? null,
                dmaStream: dmaHit,
            });
        } else if (p === "SERIAL_TX") {
            if (entry.index !== null) serialTx.set(entry.index, entry.pad);
        } else if (p === "SERIAL_RX") {
            if (entry.index !== null) serialRx.set(entry.index, entry.pad);
        } else if (HARDWARE_FIXED_PERIPHERALS.has(p)) {
            hardwareFixedPads.push({
                pad: entry.pad,
                peripheral: p,
                index: entry.index,
            });
        }
    }

    const serials = collectSerials(serialTx, serialRx);
    const freeDmaStreams = dmaShow
        .filter((e) => e.peripheral === "FREE")
        .map(({ controller, stream }) => ({ controller, stream }));

    motors.sort((a, b) => a.index - b.index);
    servos.sort((a, b) => a.index - b.index);

    const warnings = deriveWarnings({ motors, servos, ledStrips, freeDmaStreams });

    return {
        motors,
        servos,
        ledStrips,
        serials,
        freePadsCount,
        freeDmaStreams,
        hardwareFixedPads,
        warnings,
    };
}

export const _internal = { HARDWARE_FIXED_PERIPHERALS };
