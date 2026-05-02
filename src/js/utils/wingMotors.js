// Pure motor-identity derivation for the Plane Setup Wizard's Motors
// step. Given the airframe's expected motor assignments + per-pad
// observations from the wizard's pulse walk, computes the CLI batch
// to swap motor pad bindings so each silkscreen-named motor maps to
// the physical motor the user identified.
//
// Walking pool: all pads currently bound as MOTOR (M1..Mn) plus any
// silkscreen-MOTOR pads NOT now bound as servo. Each pulse fires the
// motor on that pad; user picks which physical motor spun.
//
// Derivation:
//   - "match" picks (expected motor on its expected pad) → no fix
//   - "swap" picks (motor X reported on pad currently bound to motor Y)
//      → fix is `resource MOTOR X <Y's pad>; resource MOTOR Y <X's pad>`
//   - "none" + free pads exist → caller offers a scan sub-phase
//
// Pure function — no MSP, no Vue, no I/O. Fully unit-testable.

export const OBS_MATCH = "match"; // User picked the expected motor
export const OBS_SWAP = "swap"; // User picked a different motor; swap target encoded in `swapWith`
export const OBS_NONE = "none"; // Nothing moved on this pad

// Shape of an observation in the input map:
//   { result: OBS_*, swapWith?: number }
//   swapWith is required when result === OBS_SWAP. It's the motorIdx
//   the user identified as having moved instead.

// @param opts.expectedMotors  - [{motorIdx, label, pad}] expected motor
//                                bindings derived from the airframe
//                                preset. motorIdx is 1-indexed.
// @param opts.observations    - {[motorIdx]: {result: OBS_*, swapWith?}}
// @returns {
//   needsApply:   bool,
//   swaps:        [{a: motorIdx, b: motorIdx, padA, padB}],   // pad-swap pairs
//   missing:      [motorIdx],                                  // motors with OBS_NONE
//   cliLines:     [string],                                    // full apply batch
// }
export function computeMotorIdentity({ expectedMotors, observations }) {
    const swaps = [];
    const missing = [];
    const seenSwapPair = new Set(); // dedupe: swap A↔B reported from both sides

    for (const motor of expectedMotors) {
        const obs = observations[motor.motorIdx];
        if (!obs || obs.result === OBS_MATCH) continue;
        if (obs.result === OBS_NONE) {
            missing.push(motor.motorIdx);
            continue;
        }
        if (obs.result === OBS_SWAP && obs.swapWith != null) {
            const a = motor.motorIdx;
            const b = obs.swapWith;
            const key = a < b ? `${a}-${b}` : `${b}-${a}`;
            if (seenSwapPair.has(key)) continue;
            seenSwapPair.add(key);
            const otherMotor = expectedMotors.find((m) => m.motorIdx === b);
            if (!otherMotor) continue; // unknown swap target — skip
            swaps.push({
                a,
                b,
                padA: motor.pad,
                padB: otherMotor.pad,
            });
        }
    }

    const cliLines = [];
    for (const s of swaps) {
        // Swap requires releasing both pads first to avoid the firmware
        // rejecting the second `resource MOTOR x <pad>` because that pad
        // is still claimed by motor `a`.
        cliLines.push(`resource MOTOR ${s.a} NONE`);
        cliLines.push(`resource MOTOR ${s.b} NONE`);
        cliLines.push(`resource MOTOR ${s.a} ${s.padB}`);
        cliLines.push(`resource MOTOR ${s.b} ${s.padA}`);
    }

    return {
        needsApply: cliLines.length > 0,
        swaps,
        missing,
        cliLines,
    };
}

// Build the wizard's walking pool: every motor that has a current pad
// binding gets a stop. Order is by motorIdx (M1 → Mn).
//
// @param expectedMotors - [{motorIdx, label, pad}]
// @returns               - [{motorIdx, label, pad}] same shape
export function buildMotorWalkPool(expectedMotors) {
    return [...expectedMotors].sort((a, b) => a.motorIdx - b.motorIdx);
}

// Scan plan: when motors report OBS_NONE during the walk, free silk-
// screen-MOTOR pads (not currently bound to anything) are bound to
// scratch motor slots so the wizard can pulse them post-reboot. This
// catches the case where a user wired a motor to a pad the recommender
// didn't pick.
//
// Strategy:
//   1. Release each missing motor's current pad (it's empty anyway)
//   2. Bind each free pad to a scratch motor slot starting at
//      motorScratchStart (default: missing motor's index, or one past
//      the highest known motor)
//   3. Walking the scratch slots after reboot identifies which physical
//      motor lives on each free pad
//
// @param opts.missingMotors    - [motorIdx] (from computeMotorIdentity.missing)
// @param opts.currentBindings  - [{motorIdx, pad}] currently-bound motors
// @param opts.padDefaults      - { motors: [{index, pad}], ledStrips: [{pad}] }
// @param opts.servoBoundPads   - [pad] OR Set<pad> currently bound as
//                                SERVOS. Excluded from the scan candidate
//                                pool so we never overwrite a working
//                                servo binding with `resource MOTOR N
//                                <thatPad>`. Optional — defaults to empty;
//                                pre-Discovery callers (no servo binds
//                                yet) can omit it.
// @returns {
//   cliLines:   [string],
//   scanSlots:  [{scratchIdx, pad}],   // where each free pad got bound
//   scratchStart: number,              // first scratch motorIdx used
// }
export function computeMotorScanPlan({ missingMotors, currentBindings, padDefaults, servoBoundPads = [] }) {
    const cliLines = [];
    const scanSlots = [];
    const boundPads = new Set(currentBindings.map((b) => b.pad));
    const servoPadSet = servoBoundPads instanceof Set ? servoBoundPads : new Set(servoBoundPads);
    // Free silkscreen-MOTOR pads — those NOT already bound to a motor
    // AND NOT bound as a servo. Sort by silkscreen index so scratch
    // slots walk in M-N order.
    const freePads = (padDefaults?.motors ?? [])
        .filter((m) => !boundPads.has(m.pad) && !servoPadSet.has(m.pad))
        .sort((a, b) => a.index - b.index);

    if (missingMotors.length === 0 || freePads.length === 0) {
        return { cliLines, scanSlots, scratchStart: 0 };
    }

    // Release each missing motor's current binding (the C09-was-empty
    // case — releasing it frees the pad and frees the motor slot for
    // a later final-bind).
    for (const idx of missingMotors) {
        cliLines.push(`resource MOTOR ${idx} NONE`);
    }

    // Pick scratch slot start: one past the highest currently-bound
    // motor, OR the missing-motor's idx itself if higher. This avoids
    // colliding with currently-bound motors.
    const highestBound = currentBindings.reduce((m, b) => Math.max(m, b.motorIdx), 0);
    const scratchStart = Math.max(highestBound + 1, ...missingMotors) + 0;

    // Bind each free pad to a scratch motor slot. BF supports MOTOR 1-8.
    for (let i = 0; i < freePads.length && scratchStart + i <= 8; i += 1) {
        const scratchIdx = scratchStart + i;
        const pad = freePads[i].pad;
        cliLines.push(`resource MOTOR ${scratchIdx} ${pad}`);
        scanSlots.push({ scratchIdx, pad });
    }

    return { cliLines, scanSlots, scratchStart };
}

// Final commit: after the scan walk, derive the CLI batch that:
//   1. Releases scratch slots that didn't identify a real motor
//   2. Binds the originally-missing motor(s) to the pad(s) where they
//      were identified (via scan observations)
//   3. Releases scratch slots whose motor was identified
//
// @param opts.scanSlots         - [{scratchIdx, pad}] from prep plan
// @param opts.scanObservations  - {[scratchIdx]: {result, swapWith?}}
//                                  where result = OBS_MATCH | OBS_NONE
//                                  and swapWith = the originally-missing
//                                  motorIdx the user identified.
// @param opts.missingMotors     - [motorIdx] (still pending assignment)
// @returns { cliLines: [string], assignedMotors: [{motorIdx, pad}] }
export function computeMotorScanFinal({ scanSlots, scanObservations, missingMotors }) {
    const cliLines = [];
    const assignedMotors = [];
    const stillMissing = new Set(missingMotors);

    for (const slot of scanSlots) {
        const obs = scanObservations[slot.scratchIdx];
        if (obs && obs.result === OBS_SWAP && obs.swapWith != null && stillMissing.has(obs.swapWith)) {
            // User identified the missing motor on this scratch pad.
            // Release the scratch slot and bind the real motor to it.
            cliLines.push(`resource MOTOR ${slot.scratchIdx} NONE`);
            cliLines.push(`resource MOTOR ${obs.swapWith} ${slot.pad}`);
            assignedMotors.push({ motorIdx: obs.swapWith, pad: slot.pad });
            stillMissing.delete(obs.swapWith);
        } else {
            // Scratch slot didn't help — release it.
            cliLines.push(`resource MOTOR ${slot.scratchIdx} NONE`);
        }
    }

    return { cliLines, assignedMotors };
}
