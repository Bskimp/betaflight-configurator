// Phase 2.5 wing resource helpers. Two exports:
//
//   - candidatePadsForSlot(analysis, servoIndex, options)
//     Pure: ranks candidate pads for binding a single SERVO N. Feeds
//     the Mixer-tab Pin Assignment dropdowns.
//
//   - computePresetResourcePlan(analysis, preset, options)
//     Pure: returns the exact CLI batch (MOTOR/SERVO releases + binds)
//     to make the FC's resource claims match a preset's actual
//     usedMotorIndices / usedServoIndices. Used by WingTuningTab's
//     preset-apply and the Pin Assignment panel's direct-apply flow.
//
// Predecessor `computeWingRemap` (servoCount-based auto-picker) deleted
// 2026-04-19 after Phase 2.5 took over. See the plan file's Phase 2.5
// section for why that model was replaced.

// ─── Phase 2.5: per-slot candidate helper ─────────────────────────
//
// Ranking (motor-release ahead of free-PWM so the silkscreen-label
// expectation holds — picking SERVO 1 lands on the pad silkscreened
// MOTOR 2 / SERVO N lands on MOTOR (motorCount + N), which matches
// what most quad-FC users intuit when wiring an elevon to "M3"):
//   1. `currentPad` (zero-churn) — if the slot is already bound and the
//      existing pad is still safe.
//   2. Motor-release candidate — pad currently backs a MOTOR not in use
//      by the mixer; iterated in motor-index order so SERVO 1 → MOTOR 2's
//      pad on a 1-motor wing, etc. `requiresRelease` carries the CLI line
//      to free the motor before binding.
//   3. Free PWM pad, no timer conflict with in-use motors.
//   4. Free PWM pad sharing a timer with an in-use motor
//      (usable but flagged with sharesTimerWithMotor=true).
//   5. LED_STRIP pad (only if `allowLedStrip`).
//   6. UART TX/RX pad (only if its UART index is in `allowUartRelease`).
//
// Collision defense: any pad currently claimed by something we aren't
// releasing in this batch (another SERVO N, a hardware-fixed peripheral,
// a non-opted-in UART/LED_STRIP, or an in-use motor) is filtered out.
/**
 * @param {object} analysis - analyzer output (`analyzeWingResources`).
 * @param {number} servoIndex - 1-based SERVO N (e.g. 2 for SERVO 2).
 * @param {object} [options]
 * @param {number[]} [options.motorIndicesInUse] - motor indices backing
 *   live outputs in the target mixer (their pads are off-limits).
 *   Defaults to every motor index currently in analysis.motors.
 * @param {string|null} [options.currentPad] - pad this SERVO N is already
 *   bound to, if any. Gets a zero-churn bias.
 * @param {boolean} [options.allowLedStrip=false] - include LED_STRIP pad
 *   as a candidate (requires release).
 * @param {number[]} [options.allowUartRelease=[]] - UART indices whose
 *   TX/RX pads should be candidates (each requires release of that UART).
 * @returns {Array<{pad: string, timer: number|null, channel: number|null,
 *   dmaStream: object|null, source: string,
 *   requiresRelease: string[], sharesTimerWithMotor: boolean}>}
 */
export function candidatePadsForSlot(analysis, servoIndex, options = {}) {
    if (!analysis || typeof servoIndex !== "number") return [];

    const motorIndicesInUse = new Set(
        Array.isArray(options.motorIndicesInUse)
            ? options.motorIndicesInUse
            : (analysis.motors ?? []).map((m) => m.index),
    );
    const currentPad = options.currentPad ?? null;
    const allowLedStrip = options.allowLedStrip === true;
    const allowUartRelease = Array.isArray(options.allowUartRelease) ? options.allowUartRelease : [];
    // motorRebinds: motorIndex → newPad. Lets the caller signal that an
    // in-use motor is moving to a different pad as part of the same plan
    // (its CURRENT pad becomes releasable; its NEW pad becomes claimed).
    // Without this, a SERVO override targeting the moved-from pad would
    // be rejected as "not a valid candidate" and the plan would silently
    // fall back to a different pad. Bench-observed 2026-04-22 on TMOTORF7
    // when staging MOTOR 1 → A08 + SERVO 1 → C06 in the same Pin
    // Assignment edit.
    const motorRebinds = options.motorRebinds instanceof Map ? options.motorRebinds : null;

    // Partition motors: in-use (pads off-limits) vs. releasable. A motor
    // that's "in use but moving" (motorRebinds entry differs from current
    // pad) gets BOTH treatments: its old pad is releasable, its new pad
    // is claimed.
    const inUseMotorPads = new Set();
    const releasableMotors = [];
    for (const m of analysis.motors ?? []) {
        if (motorIndicesInUse.has(m.index)) {
            const rebindPad = motorRebinds?.get(m.index) ?? null;
            if (rebindPad && rebindPad !== m.pad) {
                releasableMotors.push(m);
                inUseMotorPads.add(rebindPad);
            } else {
                inUseMotorPads.add(m.pad);
            }
        } else {
            releasableMotors.push(m);
        }
    }

    // Timers used by in-use motors — for sharesTimerWithMotor flag.
    const motorTimers = new Set(
        (analysis.motors ?? [])
            .filter((m) => motorIndicesInUse.has(m.index))
            .map((m) => m.timer)
            .filter((t) => t !== null && t !== undefined),
    );

    // Claimed-pad set: everything off-limits without a release step.
    const claimedPads = new Set();
    for (const f of analysis.hardwareFixedPads ?? []) claimedPads.add(f.pad);
    for (const s of analysis.servos ?? []) {
        if (s.index !== servoIndex) claimedPads.add(s.pad);
    }
    for (const pad of inUseMotorPads) claimedPads.add(pad);
    if (!allowLedStrip) {
        for (const ls of analysis.ledStrips ?? []) claimedPads.add(ls.pad);
    }
    for (const srl of analysis.serials ?? []) {
        if (allowUartRelease.includes(srl.index)) continue;
        if (srl.txPad) claimedPads.add(srl.txPad);
        if (srl.rxPad) claimedPads.add(srl.rxPad);
    }

    const results = [];
    const seen = new Set();
    const push = (entry) => {
        if (seen.has(entry.pad)) return;
        seen.add(entry.pad);
        results.push(entry);
    };

    // 1. Existing binding — zero-churn.
    if (currentPad && !claimedPads.has(currentPad)) {
        const existing = (analysis.servos ?? []).find((s) => s.index === servoIndex);
        const timer = existing?.timer ?? null;
        push({
            pad: currentPad,
            timer,
            channel: existing?.channel ?? null,
            dmaStream: null,
            source: "existing",
            requiresRelease: [],
            sharesTimerWithMotor: timer !== null && motorTimers.has(timer),
        });
    }

    // 2. Motor-release candidates — preferred so silkscreen labels stay
    //    intuitive (S1 → MOTOR 2 pad → silkscreen "M2" on the board).
    //    Iterated in motor-index order from the analyzer's sorted list.
    //
    //    Timer/channel fallback: on some targets (observed on TMOTORF7X2)
    //    the `timer show` output doesn't surface entries for currently-
    //    bound but not-in-use motors, so `m.timer` / `m.channel` arrive
    //    null. Falling back to `analysis.padTimers` (the full timer_dump)
    //    keeps the dropdown's "— TIMn CHn" suffix present regardless of
    //    which CLI view gave us the pad.
    const padTimers = analysis.padTimers instanceof Map ? analysis.padTimers : null;
    for (const m of releasableMotors) {
        if (claimedPads.has(m.pad)) continue;
        const fallback = padTimers?.get(m.pad);
        push({
            pad: m.pad,
            timer: m.timer ?? fallback?.timer ?? null,
            channel: m.channel ?? fallback?.channel ?? null,
            dmaStream: m.dmaStream ?? null,
            source: "motor-release",
            requiresRelease: [`resource MOTOR ${m.index} NONE`],
            sharesTimerWithMotor: m.timer !== null && m.timer !== undefined && motorTimers.has(m.timer),
        });
    }

    // 3 + 4. Free PWM pads — partition by timer conflict.
    const freePwm = Array.isArray(analysis.pwmCapableFreePads) ? analysis.pwmCapableFreePads : [];
    const freeNonConflict = [];
    const freeConflict = [];
    for (const p of freePwm) {
        if (claimedPads.has(p.pad)) continue;
        if (p.timer !== null && p.timer !== undefined && motorTimers.has(p.timer)) {
            freeConflict.push(p);
        } else {
            freeNonConflict.push(p);
        }
    }
    for (const p of freeNonConflict) {
        push({
            pad: p.pad,
            timer: p.timer ?? null,
            channel: p.channel ?? null,
            dmaStream: null,
            source: "free-pwm",
            requiresRelease: [],
            sharesTimerWithMotor: false,
        });
    }
    for (const p of freeConflict) {
        push({
            pad: p.pad,
            timer: p.timer ?? null,
            channel: p.channel ?? null,
            dmaStream: null,
            source: "free-pwm",
            requiresRelease: [],
            sharesTimerWithMotor: true,
        });
    }

    // 5. LED_STRIP pad (opt-in). Same padTimers fallback as the motor-
    // release tier — `timer show` may not emit a CH line for LED_STRIP
    // (it's in WS2812 DMA mode, not PWM), but the pad is still in the
    // timer_dump and we want the dropdown to label it with TIMn.
    if (allowLedStrip) {
        for (const ls of analysis.ledStrips ?? []) {
            if (claimedPads.has(ls.pad)) continue;
            const fallback = padTimers?.get(ls.pad);
            push({
                pad: ls.pad,
                timer: ls.timer ?? fallback?.timer ?? null,
                channel: ls.channel ?? fallback?.channel ?? null,
                dmaStream: ls.dmaStream ?? null,
                source: "led-strip",
                requiresRelease: ["resource LED_STRIP 1 NONE"],
                sharesTimerWithMotor: ls.timer !== null && ls.timer !== undefined && motorTimers.has(ls.timer),
            });
        }
    }

    // 6. UART TX/RX pads (opt-in per UART).
    for (const uartIndex of allowUartRelease) {
        const spare = (analysis.spareUarts ?? []).find((u) => u.index === uartIndex);
        if (!spare) continue;
        if (spare.txPad && !claimedPads.has(spare.txPad)) {
            push({
                pad: spare.txPad,
                timer: null,
                channel: null,
                dmaStream: null,
                source: "uart-release",
                requiresRelease: [`resource SERIAL_TX ${uartIndex} NONE`],
                sharesTimerWithMotor: false,
            });
        }
        if (spare.rxPad && !claimedPads.has(spare.rxPad)) {
            push({
                pad: spare.rxPad,
                timer: null,
                channel: null,
                dmaStream: null,
                source: "uart-release",
                requiresRelease: [`resource SERIAL_RX ${uartIndex} NONE`],
                sharesTimerWithMotor: false,
            });
        }
    }

    return results;
}

// ─── Joint motor+servo pad optimizer ─────────────────────────────
//
// Picks the best assignment of (motorCount) motor pads + (servoCount)
// servo pads from the silkscreen pool — padDefaults.motors (M1..M8)
// plus padDefaults.ledStrips when allowLedStrip is true. Replaces the
// old silkscreen-first heuristic (M1 always on silkscreen M1 → causes
// TIM3 overclaim on quad boards like FLYWOOF405NANO) with a joint
// search over the entire pool.
//
// Scoring (high-to-low priority):
//   1. Servos placed on motor-disjoint timers (+100 each). Servos on
//      motor-shared timers are a hard conflict — BF can't run DSHOT
//      and 50Hz servo PWM on the same timer, so these layouts drop.
//   2. Silkscreen convention preserved (+10 per motor on its natural
//      silkscreen index). Keeps the default case visually clean while
//      letting the scorer override it when needed.
//   3. Low average motor silkscreen index (-0.01 * avg). Pure
//      tiebreaker so identical-score layouts resolve deterministically.
//
// Returns null when:
//   - padDefaults or analysis.padTimers missing (analyzer wasn't given
//     timerDump, or cached-snapshot source doesn't have motor defaults)
//   - Pool too small for motorCount + servoCount
//   - No motor placement leaves enough timer-disjoint pads for servos
// Callers fall back to the silkscreen-first logic in those cases.
function enumerateCombinations(arr, k) {
    const result = [];
    if (k === 0) return [[]];
    if (k > arr.length) return result;
    const indices = Array.from({ length: k }, (_, i) => i);
    // Classic increment-rightmost-expandable pattern. Small n only —
    // pool is <=9 on every target, motorCount <=2 on wings → <=36 combos.
    while (true) {
        result.push(indices.map((i) => arr[i]));
        let i = k - 1;
        while (i >= 0 && indices[i] === arr.length - k + i) i--;
        if (i < 0) break;
        indices[i]++;
        for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
    }
    return result;
}

/**
 * @param {object} analysis - analyzer output. Requires `padTimers` Map.
 * @param {number} motorCount - motor slots to place (1..n).
 * @param {number[]} usedServoIndices - servo slot indices to place.
 * @param {object} options
 * @param {object} options.padDefaults - `{ motors: [{index, pad}], ledStrips: [{pad}] }`
 * @param {boolean} [options.allowLedStrip=false] - include LED_STRIP pad in pool.
 * @returns {{motors: Map<number,string>, servos: Map<number,string>, score: number} | null}
 */
export function pickOptimalPadLayout(analysis, motorCount, usedServoIndices, options = {}) {
    const padDefaults = options.padDefaults;
    if (!padDefaults || !Array.isArray(padDefaults.motors) || padDefaults.motors.length === 0) return null;
    const padTimers = analysis?.padTimers;
    if (!(padTimers instanceof Map) || padTimers.size === 0) return null;

    const allowLedStrip = options.allowLedStrip === true;

    // Build pool. silkscreenIndex lets the scorer reward "MOTOR N on
    // silkscreen M N"; LED gets a sentinel index (99) that never matches
    // a motor index, so LED never earns the silkscreen-preservation bonus.
    const pool = [];
    for (const m of padDefaults.motors) {
        const t = padTimers.get(m.pad);
        if (!t || t.timer == null) continue;
        pool.push({ pad: m.pad, silkscreenKind: "MOTOR", silkscreenIndex: m.index, timer: t.timer });
    }
    if (allowLedStrip && Array.isArray(padDefaults.ledStrips)) {
        for (const ls of padDefaults.ledStrips) {
            const t = padTimers.get(ls.pad);
            if (!t || t.timer == null) continue;
            pool.push({ pad: ls.pad, silkscreenKind: "LED_STRIP", silkscreenIndex: 99, timer: t.timer });
        }
    }
    if (pool.length === 0) return null;

    const servoCount = usedServoIndices.length;
    if (pool.length < motorCount + servoCount) return null;

    // Zero-churn reference: current motor/servo pads already bound on the
    // FC. The scorer weights "motor/servo stays on its existing pad"
    // HIGHER than silkscreen-preservation, so a valid current layout wins
    // over aesthetically-preferred re-shuffling. Without this the
    // optimizer would force MOTOR 1/2 onto silkscreen M1/M2 (B00/B01)
    // even when the user's already got motors on silkscreen M3/M4
    // (A03/A02) working with zero timer conflicts — observed on bench
    // 2026-04-22: user had configured TIM2 motors + TIM3/TIM8 servos,
    // optimizer kept offering to move everything to silkscreen-first.
    const currentMotorPads = new Set((analysis.motors ?? []).map((m) => m.pad));
    const currentServoPads = new Set((analysis.servos ?? []).map((s) => s.pad));

    const motorCombos = enumerateCombinations(pool, motorCount);
    let best = null;
    for (const motorSet of motorCombos) {
        const motorTimers = new Set(motorSet.map((p) => p.timer));
        const servoCandidates = pool.filter((p) => !motorSet.includes(p) && !motorTimers.has(p.timer));
        if (servoCandidates.length < servoCount) continue;

        // Servo pick: prefer pads currently bound to servos (zero-churn),
        // then fill with lowest-silkscreen-index candidates. Keeps the
        // user's existing servo wiring untouched whenever the motor
        // placement leaves those pads timer-safe.
        const currentInCands = servoCandidates.filter((p) => currentServoPads.has(p.pad));
        const nonCurrent = servoCandidates
            .filter((p) => !currentServoPads.has(p.pad))
            .sort((a, b) => a.silkscreenIndex - b.silkscreenIndex);
        const servoSet = currentInCands.concat(nonCurrent).slice(0, servoCount);

        let score = servoSet.length * 100;
        // Silkscreen-convention bonus (motor N naturally on silkscreen M N).
        for (const m of motorSet) {
            if (m.silkscreenKind === "MOTOR" && m.silkscreenIndex >= 1 && m.silkscreenIndex <= motorCount) {
                score += 10;
            }
        }
        // Zero-churn bonuses — weighted HIGHER than silkscreen so a
        // currently-valid layout wins even if motors aren't on silkscreen
        // M1/M2. Applied to both motor + servo sets so neither side gets
        // force-moved when the current FC state is already a good fit.
        for (const m of motorSet) {
            if (currentMotorPads.has(m.pad)) score += 15;
        }
        for (const s of servoSet) {
            if (currentServoPads.has(s.pad)) score += 15;
        }
        // Deterministic tiebreaker among equally-scored layouts: prefer
        // low avg motor silkscreen index.
        const avgMotorIdx = motorSet.reduce((s, m) => s + m.silkscreenIndex, 0) / motorSet.length;
        score -= avgMotorIdx * 0.01;

        if (!best || score > best.score) best = { motorSet, servoSet, score };
    }

    if (!best) return null;

    // Motor index assignment (three passes, each preserving earlier
    // assignments):
    //   Pass 0 — zero-churn: motor index N keeps its current pad when
    //            that pad is in motorSet.
    //   Pass 1 — silkscreen: remaining pads land on their natural
    //            silkscreen motor index.
    //   Pass 2 — fill: leftover motor indices get leftover pads in
    //            ascending silkscreen order.
    const motors = new Map();
    const assignedIdx = new Set();
    const takenPads = new Set();
    // Pass 0: zero-churn.
    for (const m of analysis.motors ?? []) {
        if (m.index < 1 || m.index > motorCount) continue;
        const match = best.motorSet.find((p) => p.pad === m.pad);
        if (match && !assignedIdx.has(m.index) && !takenPads.has(match.pad)) {
            motors.set(m.index, match.pad);
            assignedIdx.add(m.index);
            takenPads.add(match.pad);
        }
    }
    // Pass 1: silkscreen convention for remaining pads.
    const motorSetSorted = best.motorSet.slice().sort((a, b) => a.silkscreenIndex - b.silkscreenIndex);
    const leftoverPads = [];
    for (const p of motorSetSorted) {
        if (takenPads.has(p.pad)) continue;
        if (
            p.silkscreenKind === "MOTOR" &&
            p.silkscreenIndex >= 1 &&
            p.silkscreenIndex <= motorCount &&
            !assignedIdx.has(p.silkscreenIndex)
        ) {
            motors.set(p.silkscreenIndex, p.pad);
            assignedIdx.add(p.silkscreenIndex);
            takenPads.add(p.pad);
        } else {
            leftoverPads.push(p);
        }
    }
    // Pass 2: fill remaining motor indices.
    let nextIdx = 1;
    for (const p of leftoverPads) {
        if (takenPads.has(p.pad)) continue;
        while (nextIdx <= motorCount && assignedIdx.has(nextIdx)) nextIdx++;
        if (nextIdx > motorCount) break;
        motors.set(nextIdx, p.pad);
        assignedIdx.add(nextIdx);
        takenPads.add(p.pad);
        nextIdx++;
    }

    // Servo index assignment — same zero-churn-first logic as motors.
    // Pass 0: servo index N keeps its current pad when that pad is in
    //         servoSet.
    // Pass 1: remaining servo indices pair with remaining servo pads in
    //         ascending order (silkscreen pad → ascending servo index).
    const servos = new Map();
    const assignedServoIdx = new Set();
    const takenServoPads = new Set();
    for (const s of analysis.servos ?? []) {
        if (!usedServoIndices.includes(s.index)) continue;
        const match = best.servoSet.find((p) => p.pad === s.pad);
        if (match && !takenServoPads.has(match.pad)) {
            servos.set(s.index, match.pad);
            assignedServoIdx.add(s.index);
            takenServoPads.add(match.pad);
        }
    }
    const sortedServoIndicesLeft = [...usedServoIndices].filter((i) => !assignedServoIdx.has(i)).sort((a, b) => a - b);
    const sortedServoPadsLeft = best.servoSet
        .filter((p) => !takenServoPads.has(p.pad))
        .sort((a, b) => a.silkscreenIndex - b.silkscreenIndex);
    for (let i = 0; i < sortedServoIndicesLeft.length && i < sortedServoPadsLeft.length; i++) {
        servos.set(sortedServoIndicesLeft[i], sortedServoPadsLeft[i].pad);
    }

    return { motors, servos, score: best.score };
}

// ─── Preset-level resource plan (surgical, no-count) ──────────────
//
// Given a preset and the current analyzer state, compute the exact CLI
// batch to make the FC's resource claims match what the preset actually
// uses — no orphan SERVO 1 bound just because servoCount said so, no
// extra motors released into free pads unless the preset needs them.
//
// Consumers pass optional `picks` (user overrides from the Mixer-tab
// Pin Assignment dropdowns). Anything not in `picks` uses the
// top-ranked `candidatePadsForSlot` result.

/**
 * @param {object} analysis - analyzer output.
 * @param {{mmix: Array, rules: Array}} preset - plane preset.
 * @param {object} [options]
 * @param {Object<number,string>} [options.picks] - servoIndex → pad
 *   overrides.
 * @param {Object<number,string>} [options.motorPicks] - motorIndex → pad
 *   overrides (for motors that need a new binding).
 * @param {boolean} [options.allowLedStrip=false]
 * @param {number[]} [options.allowUartRelease=[]]
 * @param {Array} [options.effectiveRules] - overrides `preset.rules` for
 *   deriving `usedServoIndices`. Lets the Pin Assignment panel track
 *   rules the user has added/removed via the Function→Output editor.
 *   Falls through to preset.rules when not passed.
 * @param {number} [options.motorCount] - overrides `preset.mmix.length`
 *   for deriving `usedMotorIndices`. 1 = single motor, 2 = differential
 *   thrust. Defaults to preset.mmix.length so the standard preset-apply
 *   path keeps its old behavior.
 * @returns {{cliLines: string[], picks: Map, motorPicks: Map,
 *   usedMotorIndices: number[], usedServoIndices: number[],
 *   motorsToRelease: Array, servosToRelease: Array, warnings: Array}}
 */
export function computePresetResourcePlan(analysis, preset, options = {}) {
    const warnings = [];
    if (!analysis || !preset || !Array.isArray(preset.rules) || !Array.isArray(preset.mmix)) {
        return {
            cliLines: [],
            picks: new Map(),
            motorPicks: new Map(),
            usedMotorIndices: [],
            usedServoIndices: [],
            motorsToRelease: [],
            servosToRelease: [],
            warnings: [{ code: "invalid_input", message: "missing analysis or preset data" }],
        };
    }

    // usedMotorIndices: 1..motorCount (BF CLI uses 1-based MOTOR N).
    // motorCount defaults to preset.mmix.length; override lets the
    // diff-thrust toggle bump a single-motor preset up to 2 motors without
    // editing the preset itself.
    const motorCount =
        typeof options.motorCount === "number" && options.motorCount > 0 ? options.motorCount : preset.mmix.length;
    const usedMotorIndices = Array.from({ length: motorCount }, (_, i) => i + 1);

    // usedServoIndices: unique {rule.target - 1 : rule in rules}.
    // BF airplane slot → SERVO resource index: slot - 1 (slot 3 = SERVO 2).
    // effectiveRules override lets the Pin Assignment panel track the live
    // Function→Output Mapping state, including rules the user has added /
    // removed post-preset-apply. rate=0 rules are placeholders / deletions
    // in the editor; filter them out before computing indices.
    const rulesSource = Array.isArray(options.effectiveRules) ? options.effectiveRules : preset.rules;
    const usedServoIndicesSet = new Set();
    for (const rule of rulesSource) {
        if (typeof rule.target !== "number") continue;
        if (typeof rule.rate === "number" && rule.rate === 0) continue;
        const servoIndex = rule.target - 1;
        if (servoIndex >= 1) usedServoIndicesSet.add(servoIndex);
    }
    const usedServoIndices = [...usedServoIndicesSet].sort((a, b) => a - b);

    // Picks: pad per needed SERVO N, honoring overrides + zero-churn.
    const userPicks = options.picks ?? {};
    const motorUserPicks = options.motorPicks ?? {};
    const allowLedStrip = options.allowLedStrip === true;
    const allowUartRelease = Array.isArray(options.allowUartRelease) ? options.allowUartRelease : [];

    // Joint motor+servo optimizer runs first. When it produces a layout,
    // its picks feed the same priority-1 "user override" slot the picker
    // already respects — that way the motor + servo binding passes below
    // stay untouched. Optimizer output is merged beneath any real user
    // override so a hand-tweaked dropdown still wins.
    const optimized = pickOptimalPadLayout(analysis, motorCount, usedServoIndices, {
        padDefaults: options.padDefaults,
        allowLedStrip,
    });
    const effectiveMotorPicks = { ...motorUserPicks };
    const effectiveServoPicks = { ...userPicks };
    if (optimized) {
        for (const [idx, pad] of optimized.motors) {
            if (effectiveMotorPicks[idx] == null) effectiveMotorPicks[idx] = pad;
        }
        for (const [idx, pad] of optimized.servos) {
            if (effectiveServoPicks[idx] == null) effectiveServoPicks[idx] = pad;
        }
    }

    const picks = new Map();
    const motorPicks = new Map(); // motorIndex → {pad, timer, channel, source}
    const alreadyPicked = new Set();
    const extraReleaseLines = new Set(); // LED_STRIP / SERIAL_TX / SERIAL_RX

    // ---- Motor binding pass (for ALL motors in usedMotorIndices) ----
    // Targets each used motor toward its silkscreen-default pad (from the
    // optional `padDefaults` snapshot) when that pad is free. Falls back to
    // existing binding (zero-churn) and finally to a free-PWM first-fit.
    // Handles both "motor never bound" (post-Flying-Wing-then-Diff-thrust)
    // and "motor bound but at wrong pad" (user wants M2 back at silkscreen
    // M2 even though it currently sits at B05).
    const padDefaultsMotors = Array.isArray(options.padDefaults?.motors) ? options.padDefaults.motors : [];
    const defaultPadForMotor = (idx) => padDefaultsMotors.find((m) => m.index === idx)?.pad ?? null;
    const existingMotorByIndex = new Map();
    for (const m of analysis.motors ?? []) existingMotorByIndex.set(m.index, m);

    // Pads off-limits for motor binding. Computed per-motor below so we can
    // exclude the current motor's own pad from its own claim set (that's
    // zero-churn territory, not a collision).
    function buildMotorClaimedPads(forMotorIndex) {
        const claimed = new Set();
        for (const f of analysis.hardwareFixedPads ?? []) claimed.add(f.pad);
        for (const s of analysis.servos ?? []) {
            if (usedServoIndices.includes(s.index)) claimed.add(s.pad);
        }
        for (const m of analysis.motors ?? []) {
            if (m.index !== forMotorIndex && usedMotorIndices.includes(m.index)) {
                claimed.add(m.pad);
            }
        }
        if (!allowLedStrip) {
            for (const ls of analysis.ledStrips ?? []) claimed.add(ls.pad);
        }
        for (const srl of analysis.serials ?? []) {
            if (allowUartRelease.includes(srl.index)) continue;
            if (srl.txPad) claimed.add(srl.txPad);
            if (srl.rxPad) claimed.add(srl.rxPad);
        }
        return claimed;
    }

    // First-fit free-PWM pool, sorted "shared timer with already-bound kept
    // motor first" so bidir DSHOT stays grouped.
    const keptMotorTimers = new Set(
        (analysis.motors ?? [])
            .filter((m) => usedMotorIndices.includes(m.index))
            .map((m) => m.timer)
            .filter((t) => t !== null && t !== undefined),
    );
    const freePoolForFallback = (analysis.pwmCapableFreePads ?? []).slice().sort((a, b) => {
        const aShared = keptMotorTimers.has(a.timer) ? 0 : 1;
        const bShared = keptMotorTimers.has(b.timer) ? 0 : 1;
        return aShared - bShared;
    });

    // Track which pads each motor will end up using so subsequent motor +
    // servo picks don't collide.
    const motorTargets = new Map(); // motorIndex -> pad

    for (const motorIndex of usedMotorIndices) {
        const claimedForThis = buildMotorClaimedPads(motorIndex);
        const existing = existingMotorByIndex.get(motorIndex) ?? null;
        const padIsAvailable = (pad) => {
            if (!pad) return false;
            if (alreadyPicked.has(pad)) return false;
            if (claimedForThis.has(pad)) return false;
            return true;
        };

        let target = null;

        // 1. User override (optimizer picks folded in here too — the
        //    effective map merges user overrides atop optimizer output).
        const override = effectiveMotorPicks[motorIndex];
        if (override && padIsAvailable(override)) {
            target = override;
        } else if (override) {
            warnings.push({
                code: "motor_override_unavailable",
                message: `User picked ${override} for MOTOR ${motorIndex} but it isn't safe (claimed by another resource).`,
            });
        }

        // 2. Silkscreen default — strongly preferred so MOTOR N lands on
        //    the pad labeled "M N" on the board.
        if (!target) {
            const def = defaultPadForMotor(motorIndex);
            if (def && padIsAvailable(def)) target = def;
        }

        // 3. Existing binding — zero-churn fallback.
        if (!target && existing && padIsAvailable(existing.pad)) {
            target = existing.pad;
        }

        // 4. First-fit from free-PWM pool.
        if (!target) {
            for (const p of freePoolForFallback) {
                if (padIsAvailable(p.pad)) {
                    target = p.pad;
                    break;
                }
            }
        }

        if (!target) {
            warnings.push({
                code: "no_pad_for_motor",
                message: `No free PWM pad available for MOTOR ${motorIndex}. Preset's motor count exceeds what this board can bind — the user must pick a pad in the Mixer tab's Pin Assignment panel or reset resources first.`,
            });
            continue;
        }

        motorTargets.set(motorIndex, target);
        alreadyPicked.add(target);
        // Optimizer may park a motor on the LED_STRIP pad (allowLedStrip
        // case). Servo-side LED releases come from candidatePadsForSlot's
        // requiresRelease bubbling into extraReleaseLines; motor side has
        // no candidate helper, so detect the collision here explicitly.
        if ((analysis.ledStrips ?? []).some((ls) => ls.pad === target)) {
            extraReleaseLines.add("resource LED_STRIP 1 NONE");
        }
        // motorPicks stays scoped to motors that need an explicit bind line
        // (i.e. either no current binding or a different one than the target).
        if (!existing || existing.pad !== target) {
            motorPicks.set(motorIndex, { pad: target });
        }
    }

    // Distill motor rebinds (motorIndex → newPad) from the motor pass
    // above. Threaded into candidatePadsForSlot so SERVO overrides
    // targeting a moved-from motor pad pass the validity check (the
    // pad's current motor is releasing it, so it IS a valid candidate).
    const motorRebindsForServos = new Map();
    for (const [motorIndex, pick] of motorPicks) {
        motorRebindsForServos.set(motorIndex, pick.pad);
    }

    for (const servoIndex of usedServoIndices) {
        const existing = (analysis.servos ?? []).find((s) => s.index === servoIndex);
        const currentPad = existing?.pad ?? null;

        const cands = candidatePadsForSlot(analysis, servoIndex, {
            motorIndicesInUse: usedMotorIndices,
            currentPad,
            allowLedStrip,
            allowUartRelease,
            motorRebinds: motorRebindsForServos,
        });

        let pick = null;

        // User-supplied override (optimizer picks also merge in via
        // effectiveServoPicks) takes priority if it's a valid candidate.
        const override = effectiveServoPicks[servoIndex];
        if (override) {
            pick = cands.find((c) => c.pad === override && !alreadyPicked.has(c.pad));
            if (!pick) {
                warnings.push({
                    code: "override_unavailable",
                    message: `User picked ${override} for SERVO ${servoIndex} but it isn't a valid candidate — falling back to default.`,
                });
            }
        }
        // Default: top-ranked candidate not already taken by another slot.
        if (!pick) pick = cands.find((c) => !alreadyPicked.has(c.pad));

        if (!pick) {
            warnings.push({
                code: "no_pad_for_slot",
                message: `No candidate pad available for SERVO ${servoIndex}. Preset rules targeting this slot will have no physical output.`,
            });
            continue;
        }

        alreadyPicked.add(pick.pad);
        picks.set(servoIndex, pick);
        // Any non-motor release hints (LED_STRIP / UART) fold into the batch
        // ahead of the servo bind. Motor releases are handled by
        // motorsToRelease below (so we don't double-emit).
        for (const line of pick.requiresRelease) {
            if (/^resource MOTOR /.test(line)) continue;
            extraReleaseLines.add(line);
        }
    }

    // motorsToRelease: any currently-bound motor not in usedMotorIndices.
    const motorsToRelease = (analysis.motors ?? []).filter((m) => !usedMotorIndices.includes(m.index));

    // servosToRelease: currently-bound SERVO N not in usedServoIndices (orphan cleanup).
    const servosToRelease = (analysis.servos ?? []).filter((s) => !usedServoIndices.includes(s.index));

    // Defensive release set: every MOTOR/SERVO slot 1..MAX not in used
    // indices gets a `resource ... NONE` line, even if the analyzer didn't
    // see it bound. BF keeps a silkscreen default pad map per target, and
    // slots that *weren't* shown in `resource show` can still hold a pad
    // claim (seen on FLYWOOF405NANO where MOTOR 5–8 default to B05/C09/
    // B04/C08 but don't always surface in `resource show`). Without the
    // defensive release, binding SERVO 3 → B05 silently conflicts with
    // the phantom MOTOR 5 → B05 claim and the servo bind no-ops, leaving
    // the user with duplicate pad claims in `dump`.
    //
    // BF treats `resource MOTOR N NONE` against an already-empty slot as
    // a harmless no-op, so over-emitting is cheap.
    const MAX_MOTOR_SLOTS = 8;
    const MAX_SERVO_SLOTS = 8;
    const observedMotorReleaseIdx = new Set(motorsToRelease.map((m) => m.index));
    const observedServoReleaseIdx = new Set(servosToRelease.map((s) => s.index));
    const defensiveMotorReleases = [];
    for (let i = 1; i <= MAX_MOTOR_SLOTS; i++) {
        if (usedMotorIndices.includes(i)) continue;
        if (observedMotorReleaseIdx.has(i)) continue;
        defensiveMotorReleases.push(i);
    }
    const defensiveServoReleases = [];
    for (let i = 1; i <= MAX_SERVO_SLOTS; i++) {
        if (usedServoIndices.includes(i)) continue;
        if (observedServoReleaseIdx.has(i)) continue;
        defensiveServoReleases.push(i);
    }

    // Build CLI batch. Order matters: BF rejects `resource X N PAD`
    // while PAD is still claimed elsewhere, so all releases precede all binds.
    //
    // Two-phase construction:
    //   (1) "real work" lines: observed releases + LED/UART extras + motor/
    //       servo rebinds. If this list is empty, the plan is a true no-op
    //       and we return an empty cliLines (preserves the zero-churn case).
    //   (2) Defensive-release prefix: only prepended when real work exists.
    //       Clears phantom MOTOR/SERVO claims the analyzer missed before
    //       any new bind line lands on their pads.
    const realWork = [];
    for (const m of motorsToRelease) realWork.push(`resource MOTOR ${m.index} NONE`);
    for (const s of servosToRelease) realWork.push(`resource SERVO ${s.index} NONE`);
    for (const line of extraReleaseLines) realWork.push(line);

    // Rebind pre-release: any USED motor whose current pad differs from the
    // chosen target needs to be released first so its old pad becomes free
    // (for whichever resource is moving in there next, often a SERVO).
    const motorRebindReleases = [];
    for (const [motorIndex] of motorPicks) {
        const existing = existingMotorByIndex.get(motorIndex);
        if (existing) motorRebindReleases.push(`resource MOTOR ${motorIndex} NONE`);
    }

    // Bind phase. Motors first so their timer groupings are set before any
    // servo lands on a shared timer.
    const bindLines = [];
    for (const [motorIndex, pick] of motorPicks) {
        bindLines.push(`resource MOTOR ${motorIndex} ${pick.pad}`);
    }
    for (const [servoIndex, pick] of picks) {
        const existing = (analysis.servos ?? []).find((s) => s.index === servoIndex);
        if (existing && existing.pad === pick.pad) continue;
        bindLines.push(`resource SERVO ${servoIndex} ${pick.pad}`);
    }

    const cliLines = [];
    const hasRealWork = realWork.length > 0 || motorRebindReleases.length > 0 || bindLines.length > 0;
    if (hasRealWork) {
        // Defensive prefix goes first so phantom slot claims are cleared
        // before any observed release / rebind / bind line runs.
        for (const i of defensiveMotorReleases) cliLines.push(`resource MOTOR ${i} NONE`);
        for (const i of defensiveServoReleases) cliLines.push(`resource SERVO ${i} NONE`);
        cliLines.push(...realWork);
        cliLines.push(...motorRebindReleases);
        cliLines.push(...bindLines);
    }

    return {
        cliLines,
        picks,
        motorPicks,
        usedMotorIndices,
        usedServoIndices,
        motorsToRelease,
        servosToRelease,
        warnings,
    };
}
