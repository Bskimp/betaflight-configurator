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

    // Partition motors: in-use (pads off-limits) vs. releasable.
    const inUseMotorPads = new Set();
    const releasableMotors = [];
    for (const m of analysis.motors ?? []) {
        if (motorIndicesInUse.has(m.index)) {
            inUseMotorPads.add(m.pad);
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
    for (const m of releasableMotors) {
        if (claimedPads.has(m.pad)) continue;
        push({
            pad: m.pad,
            timer: m.timer ?? null,
            channel: m.channel ?? null,
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

    // 5. LED_STRIP pad (opt-in).
    if (allowLedStrip) {
        for (const ls of analysis.ledStrips ?? []) {
            if (claimedPads.has(ls.pad)) continue;
            push({
                pad: ls.pad,
                timer: ls.timer ?? null,
                channel: ls.channel ?? null,
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

    // usedMotorIndices: 1..preset.mmix.length (BF CLI uses 1-based MOTOR N)
    const usedMotorIndices = preset.mmix.map((_, i) => i + 1);

    // usedServoIndices: unique {rule.target - 1 : rule in rules}
    // BF airplane slot → SERVO resource index: slot - 1 (slot 3 = SERVO 2, etc.)
    const usedServoIndicesSet = new Set();
    for (const rule of preset.rules) {
        if (typeof rule.target !== "number") continue;
        const servoIndex = rule.target - 1;
        if (servoIndex >= 1) usedServoIndicesSet.add(servoIndex);
    }
    const usedServoIndices = [...usedServoIndicesSet].sort((a, b) => a - b);

    // Picks: pad per needed SERVO N, honoring overrides + zero-churn.
    const userPicks = options.picks ?? {};
    const motorUserPicks = options.motorPicks ?? {};
    const allowLedStrip = options.allowLedStrip === true;
    const allowUartRelease = Array.isArray(options.allowUartRelease) ? options.allowUartRelease : [];

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

        // 1. User override first.
        const override = motorUserPicks[motorIndex];
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
        // motorPicks stays scoped to motors that need an explicit bind line
        // (i.e. either no current binding or a different one than the target).
        if (!existing || existing.pad !== target) {
            motorPicks.set(motorIndex, { pad: target });
        }
    }

    for (const servoIndex of usedServoIndices) {
        const existing = (analysis.servos ?? []).find((s) => s.index === servoIndex);
        const currentPad = existing?.pad ?? null;

        const cands = candidatePadsForSlot(analysis, servoIndex, {
            motorIndicesInUse: usedMotorIndices,
            currentPad,
            allowLedStrip,
            allowUartRelease,
        });

        let pick = null;

        // User-supplied override takes priority if it's a valid candidate.
        const override = userPicks[servoIndex];
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

    // Build CLI batch. Order matters: BF rejects `resource X N PAD`
    // while PAD is still claimed elsewhere, so all releases precede all binds.
    const cliLines = [];
    for (const m of motorsToRelease) cliLines.push(`resource MOTOR ${m.index} NONE`);
    for (const s of servosToRelease) cliLines.push(`resource SERVO ${s.index} NONE`);
    for (const line of extraReleaseLines) cliLines.push(line);

    // Rebind pre-release: any USED motor whose current pad differs from the
    // chosen target needs to be released first so its old pad becomes free
    // (for whichever resource is moving in there next, often a SERVO).
    for (const [motorIndex] of motorPicks) {
        const existing = existingMotorByIndex.get(motorIndex);
        if (existing) cliLines.push(`resource MOTOR ${motorIndex} NONE`);
    }

    // Bind phase. Motors first so their timer groupings are set before any
    // servo lands on a shared timer.
    for (const [motorIndex, pick] of motorPicks) {
        cliLines.push(`resource MOTOR ${motorIndex} ${pick.pad}`);
    }
    for (const [servoIndex, pick] of picks) {
        const existing = (analysis.servos ?? []).find((s) => s.index === servoIndex);
        if (existing && existing.pad === pick.pad) continue;
        cliLines.push(`resource SERVO ${servoIndex} ${pick.pad}`);
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
