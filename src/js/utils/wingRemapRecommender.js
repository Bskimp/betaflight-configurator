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
 * @param {boolean} [options.releaseLedStrip=false] - when true, the LED_STRIP
 *   pad is released and added to the servo candidate pool. Useful on AIOs
 *   where declared-but-unclaimed PWM pads aren't physically broken out but
 *   the LED_STRIP pad is.
 */
export function computeWingRemap(analysis, options = {}) {
    const motorCount = options.motorCount ?? DEFAULT_MOTOR_COUNT;
    const boardWiring = options.boardWiring === "aio" ? "aio" : "discrete";
    const releaseLedStrip = options.releaseLedStrip === true;

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

    if (release.length === 0) {
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
    const pwmFreePads = Array.isArray(analysis.pwmCapableFreePads) ? [...analysis.pwmCapableFreePads] : [];

    // Optional LED_STRIP release — on AIOs where declared-unclaimed PWM
    // pads aren't physically broken out, the LED_STRIP pad usually is.
    // Opt-in because most users want their RGB; flagging a warning if
    // there's no LED_STRIP on the board avoids silent no-ops.
    const ledReleased = [];
    if (releaseLedStrip && Array.isArray(analysis.ledStrips)) {
        for (const ls of analysis.ledStrips) {
            pwmFreePads.push({ pad: ls.pad, timer: ls.timer, channel: ls.channel });
            ledReleased.push(ls.pad);
        }
    }

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

    // Assign phase: wire servos to the appropriate pad source.
    let nextServoSlot = 1;
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

    cliLines.push("save");

    if (releaseLedStrip && ledReleased.length === 0) {
        skipWarnings.push({
            code: "led_strip_not_present",
            message: "Release LED_STRIP option is on, but no LED_STRIP resource is currently bound. Nothing released.",
        });
    }

    const keepStr = keep.map((m) => `M${m.index}`).join(", ") || "(none)";
    const servoStr = servosToAssign.length > 0 ? servosToAssign.map((s) => `S${s.slot}=${s.pad}`).join(", ") : "(none)";
    const ledSuffix = ledReleased.length > 0 ? ` (LED_STRIP released from ${ledReleased[0]} to free a servo pad)` : "";
    let summary;
    if (boardWiring === "aio") {
        summary = `Keep ${keepStr} as motors (on their ESC-soldered pads); release ${motorsToRelease.length} unused motor slot${motorsToRelease.length === 1 ? "" : "s"} and assign servos to free PWM pads: ${servoStr}.${ledSuffix}`;
    } else {
        summary = `Keep ${keepStr} as motors; release ${motorsToRelease.length} motor slot${motorsToRelease.length === 1 ? "" : "s"} and reassign pads to servos: ${servoStr}.${ledSuffix}`;
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
