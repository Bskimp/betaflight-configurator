// Compute a "wing-safe" resource remap recommendation from the
// analyzer's current-state view. Pure function: takes analysis in,
// returns { isNoOp, cliLines, ... } out. UI layer renders; CLI
// helper applies.
//
// Rule of thumb (based on the MATEKF405TE pattern the wing community
// already uses): keep M1 (and optionally M2 for diff-thrust) as
// motors, release every other motor slot to NONE, and reassign
// those freed pads to SERVO 1..N in motor-index order. Firmware-
// lazy init takes care of the rest — no timer/DMA surgery needed
// on F405/F722 boards, which is the Phase 1 scope anyway.

import { _internal } from "./wingResourceAnalyzer.js";

const DEFAULT_MOTOR_COUNT = 2;

/**
 * @param {object} analysis - output of analyzeWingResources()
 * @param {object} [options]
 * @param {number} [options.motorCount=2] - motors to keep (1 or 2)
 * @param {"discrete"|"aio"} [options.boardWiring="discrete"] -
 *   "discrete": motor pads route to servo headers, safe to reassign as servos.
 *   "aio": motor pads soldered to ESCs; released motors stay released, servos
 *   come from the pool of free PWM pads instead.
 * @param {boolean} [options.releaseLedStrip=false] - release LED_STRIP and
 *   add its pad to the servo candidate pool. In AIO mode the LED_STRIP pad
 *   gets PRIORITY (most likely to be physically broken out on AIOs).
 * @param {number[]} [options.releaseUarts=[]] - UART indices (1-based) to
 *   release. Each must be in analysis.spareUarts; their PWM-capable TX/RX
 *   pads join the servo candidate pool.
 * @param {number} [options.servoCount=0] - desired minimum number of SERVO
 *   resources to bind. When a preset needs more servos than released
 *   motors can supply, the recommender keeps pulling from pwmFreePads
 *   (declared-unclaimed PWM pads, plus any opt-in LED_STRIP / UART pads)
 *   until servoCount is met or the pool is exhausted.
 */
export function computeWingRemap(analysis, options = {}) {
    const motorCount = options.motorCount ?? DEFAULT_MOTOR_COUNT;
    const boardWiring = options.boardWiring === "aio" ? "aio" : "discrete";
    const releaseLedStrip = options.releaseLedStrip === true;
    const releaseUarts = Array.isArray(options.releaseUarts) ? options.releaseUarts : [];
    const servoCount = Math.max(0, options.servoCount ?? 0);

    if (!analysis || !Array.isArray(analysis.motors)) {
        return noOp("analyzer returned no motor data");
    }

    const motors = [...analysis.motors].sort((a, b) => a.index - b.index);

    // Keep lowest-indexed N motors. If the board has fewer declared
    // motors than we want to keep, there's nothing to release — not a
    // failure, just a no-op (users with 1-motor-declared boards can
    // only run single-motor airframes from this board anyway).
    const keep = motors.slice(0, motorCount);
    const release = motors.slice(motorCount);

    // If there are no motors to release AND no servo deficit (current
    // servos already meet the preset's demand), this is a true no-op.
    // Otherwise we still need to add servo resources from the free-pad
    // pool — fall through to the assign phase with an empty release list.
    const currentServoCount = Array.isArray(analysis.servos) ? analysis.servos.length : 0;
    const servoDeficit = Math.max(0, servoCount - currentServoCount);
    if (release.length === 0 && servoDeficit === 0) {
        return {
            ...noOp(
                `Board declares ${motors.length} motor${motors.length === 1 ? "" : "s"}; ` +
                    `keeping all as motors for a ${motorCount}-motor wing. No remap needed.`,
            ),
            boardWiring,
        };
    }

    // Pads we should never auto-reassign even if they're declared
    // as motors on the board (paranoia — board-wired peripherals
    // shouldn't be in a motor slot, but defensive anyway).
    const fixedPads = new Set(analysis.hardwareFixedPads.map((p) => p.pad));

    // Source of servo pad assignments.
    //   discrete: reuse the motor pads we're about to release
    //     (motor header routes to servo header on these boards)
    //   aio:      pick from PWM-capable pads that are currently FREE
    //     (motor pads stay bound to their ESC solder joints)
    // If analyzer didn't surface pwmCapableFreePads (older firmware,
    // no timer dump available), AIO mode falls back to the previous
    // "manual" behavior with a warning.
    // Priority-ordered candidate pool for servo assignment.
    //   AIO mode: [LED_STRIP, UART pads in requested order, declared-free PWM]
    //     LED_STRIP / UART pads are almost always broken out on AIO headers;
    //     declared-free pads (M5-M8 slot declarations) often aren't.
    //   Discrete mode: servos come from motor pads, so the "extras" (LED/UART)
    //     only get used if the motor pool is exhausted — appended at end.
    const priorityPads = [];
    const ledReleased = [];
    const uartsReleased = [];

    if (releaseLedStrip && Array.isArray(analysis.ledStrips)) {
        for (const ls of analysis.ledStrips) {
            priorityPads.push({ pad: ls.pad, timer: ls.timer, channel: ls.channel });
            ledReleased.push(ls.pad);
        }
    }
    if (releaseUarts.length > 0 && Array.isArray(analysis.spareUarts)) {
        for (const uartIndex of releaseUarts) {
            const spare = analysis.spareUarts.find((u) => u.index === uartIndex);
            if (!spare) continue;
            uartsReleased.push({ index: uartIndex, txPad: spare.txPad, rxPad: spare.rxPad });
            if (spare.txPad) priorityPads.push({ pad: spare.txPad, timer: null, channel: null, side: "tx" });
            if (spare.rxPad) priorityPads.push({ pad: spare.rxPad, timer: null, channel: null, side: "rx" });
        }
    }

    const declaredFreePwm = Array.isArray(analysis.pwmCapableFreePads) ? [...analysis.pwmCapableFreePads] : [];
    const pwmFreePads =
        boardWiring === "aio" ? [...priorityPads, ...declaredFreePwm] : [...declaredFreePwm, ...priorityPads];

    const servosToAssign = [];
    const skipWarnings = [];
    const cliLines = [];
    const motorsToRelease = [];

    // Release phase: strip MOTOR slots we don't need.
    for (const m of release) {
        cliLines.push(`resource MOTOR ${m.index} NONE`);
        motorsToRelease.push({ index: m.index, pad: m.pad });
    }

    // LED_STRIP release must happen before servo assignment, same
    // ordering rule as motors — BF rejects `resource SERVO X PAD`
    // while PAD is still bound elsewhere. Only one LED_STRIP resource
    // per board, so a single release line covers it regardless of
    // how many strip entries the analyzer captured.
    if (ledReleased.length > 0) {
        cliLines.push(`resource LED_STRIP 1 NONE`);
    }

    // UART releases follow the same ordering: free the SERIAL_TX/RX
    // resource(s) before binding the pad to a SERVO slot.
    for (const u of uartsReleased) {
        if (u.txPad) cliLines.push(`resource SERIAL_TX ${u.index} NONE`);
        if (u.rxPad) cliLines.push(`resource SERIAL_RX ${u.index} NONE`);
    }

    // Assign phase: wire servos to the appropriate pad source.
    // Start from the highest already-bound servo index so we don't collide
    // with existing SERVO resources (e.g. preset apply on a board that
    // already has S1+S2 from a previous remap).
    let nextServoSlot = currentServoCount + 1;
    if (boardWiring === "aio") {
        for (const m of release) {
            const candidate = pwmFreePads.shift();
            if (!candidate) {
                skipWarnings.push({
                    code: "aio_no_free_pwm_pad",
                    message: `No free PWM-capable pad available for SERVO ${nextServoSlot} (board has only ${servosToAssign.length} slot${servosToAssign.length === 1 ? "" : "s"} of PWM headroom). Remaining MOTOR ${m.index} slot released but no servo created.`,
                });
                continue;
            }
            cliLines.push(`resource SERVO ${nextServoSlot} ${candidate.pad}`);
            servosToAssign.push({
                slot: nextServoSlot,
                pad: candidate.pad,
                fromMotorIndex: m.index,
                fromFreePad: true,
            });
            nextServoSlot++;
        }
    } else {
        for (const m of release) {
            if (fixedPads.has(m.pad)) {
                skipWarnings.push({
                    code: "skipped_fixed_pad",
                    message: `Pad ${m.pad} (MOTOR ${m.index}) sits on a board-wired peripheral — released but not reassigned to a servo slot.`,
                });
                continue;
            }
            cliLines.push(`resource SERVO ${nextServoSlot} ${m.pad}`);
            servosToAssign.push({
                slot: nextServoSlot,
                pad: m.pad,
                fromMotorIndex: m.index,
                fromFreePad: false,
            });
            nextServoSlot++;
        }
    }

    // Top-up phase: if the caller declared a servoCount goal (preset apply
    // passes the preset's required servo count) and we haven't met it yet,
    // keep pulling from the free-pad pool in both modes. This is what
    // makes preset apply work correctly on a board already at e.g. 1M+2S
    // but picking a 4-servo plane preset.
    while (nextServoSlot <= servoCount && pwmFreePads.length > 0) {
        const candidate = pwmFreePads.shift();
        cliLines.push(`resource SERVO ${nextServoSlot} ${candidate.pad}`);
        servosToAssign.push({
            slot: nextServoSlot,
            pad: candidate.pad,
            fromMotorIndex: null,
            fromFreePad: true,
        });
        nextServoSlot++;
    }
    if (servoCount > 0 && nextServoSlot <= servoCount) {
        skipWarnings.push({
            code: "servo_count_shortfall",
            message: `Preset wants ${servoCount} servos but only ${nextServoSlot - 1} could be bound (no free PWM pads left). Rules targeting the missing slots will have no physical output.`,
        });
    }

    cliLines.push("save");

    if (releaseLedStrip && ledReleased.length === 0) {
        skipWarnings.push({
            code: "led_strip_not_present",
            message: "Release LED_STRIP option is on, but no LED_STRIP resource is currently bound. Nothing released.",
        });
    }
    for (const requestedIdx of releaseUarts) {
        if (!uartsReleased.find((u) => u.index === requestedIdx)) {
            skipWarnings.push({
                code: "uart_not_releasable",
                message: `UART${requestedIdx} requested for release but not in spareUarts (no PWM-capable pad, or has a function assigned). Nothing released.`,
            });
        }
    }

    const keepStr = keep.map((m) => `M${m.index}`).join(", ") || "(none)";
    const servoStr = servosToAssign.length > 0 ? servosToAssign.map((s) => `S${s.slot}=${s.pad}`).join(", ") : "(none)";
    const ledSuffix = ledReleased.length > 0 ? ` (LED_STRIP released from ${ledReleased[0]} to free a servo pad)` : "";
    const uartSuffix =
        uartsReleased.length > 0
            ? ` (released UART${uartsReleased.map((u) => u.index).join(", UART")} for extra servo pad${uartsReleased.length === 1 ? "" : "s"})`
            : "";
    let summary;
    if (boardWiring === "aio") {
        summary = `Keep ${keepStr} as motors (on their ESC-soldered pads); release ${motorsToRelease.length} unused motor slot${motorsToRelease.length === 1 ? "" : "s"} and assign servos to free PWM pads: ${servoStr}.${ledSuffix}${uartSuffix}`;
    } else {
        summary = `Keep ${keepStr} as motors; release ${motorsToRelease.length} motor slot${motorsToRelease.length === 1 ? "" : "s"} and reassign pads to servos: ${servoStr}.${ledSuffix}${uartSuffix}`;
    }

    return {
        isNoOp: false,
        boardWiring,
        motorsToRelease,
        servosToAssign,
        cliLines,
        summary,
        warnings: skipWarnings,
    };
}

function noOp(summary) {
    return {
        isNoOp: true,
        boardWiring: "discrete",
        motorsToRelease: [],
        servosToAssign: [],
        cliLines: [],
        summary,
        warnings: [],
    };
}

export const _internalRecommender = { DEFAULT_MOTOR_COUNT, fixedPeripherals: _internal.HARDWARE_FIXED_PERIPHERALS };
