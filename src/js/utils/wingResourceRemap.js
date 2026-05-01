// Pure swap-detection logic for the Plane Setup Wizard's Discovery step.
//
// Given:
//   currentResources  — which physical pad each SERVO N drives RIGHT NOW
//                       (read from FC after the wizard's Apply commit)
//   airframeSurfaces  — the airframe's expected surface for each SERVO N
//                       (derived from preset.wiring at airframe-pick time)
//   observations      — what physically moved when each SERVO N was pulsed
//                       (collected during the Discovery walk)
// Compute:
//   cliLines          — `resource SERVO N <PAD>` lines that, when applied
//                       and rebooted, make each SERVO N drive its expected
//                       surface
//   swaps             — human-readable summary for the wizard's Remap step UI
//   skippedSlots      — slots where we couldn't infer a swap (Nothing,
//                       Not-on-this-plane, Multiple moved, or duplicate
//                       surface reports)
//   unresolvedMultiple — slots the user reported as "Multiple moved"; we
//                        can't auto-fix and surface as a warning
//   needsRemap        — true iff at least one SERVO N's pad will change
//
// Pure function — no MSP, no Vue, no I/O. Fully unit-testable.
//
// Surface identifiers are STRINGS that match between airframeSurfaces[].
// expectedSurface and observations[servoN]. The wizard uses preset.wiring
// `fn` strings ("Elevator", "Aileron L", "Left Elevon", etc.) for these
// because they're stable per-airframe and match the dropdown labels the
// user sees. Special outcome strings are reserved:
//
//   "__nothing__"   — nothing moved on this pulse
//   "__multiple__"  — multiple surfaces moved (Y-cable / shared pad)
//   "__no_servo__"  — slot not populated on this airframe build
//
// These three skip the slot from any remap derivation.

export const OBS_NOTHING = "__nothing__";
export const OBS_MULTIPLE = "__multiple__";
export const OBS_NO_SERVO = "__no_servo__";

const SKIP_OUTCOMES = new Set([OBS_NOTHING, OBS_MULTIPLE, OBS_NO_SERVO, undefined, null, ""]);

export function computeRemap({ currentResources, airframeSurfaces, observations }) {
    const skippedSlots = [];
    const unresolvedMultiple = [];

    // Pass 1: build surface→pad and pad→surface from observations. A user
    // report of "SERVO N moved <surface>" tells us pad-of-SERVO-N is wired
    // to <surface> physically.
    const surfaceToPad = new Map();
    const duplicateSurfaces = new Set();

    for (const surface of airframeSurfaces) {
        const obs = observations[surface.servoN];
        const pad = currentResources[surface.servoN];

        if (!pad) {
            // No pad assigned for this slot — nothing to map.
            skippedSlots.push(surface.servoN);
            continue;
        }
        if (obs === OBS_MULTIPLE) {
            unresolvedMultiple.push(surface.servoN);
            skippedSlots.push(surface.servoN);
            continue;
        }
        if (SKIP_OUTCOMES.has(obs)) {
            skippedSlots.push(surface.servoN);
            continue;
        }
        // obs is a real surface identifier
        if (surfaceToPad.has(obs)) {
            // Two slots reported the same physical surface — Y-cable,
            // user confusion, or pad-collision. Can't auto-resolve.
            duplicateSurfaces.add(obs);
        }
        surfaceToPad.set(obs, pad);
    }

    // Pass 2: derive the desired pad for each SERVO N. SERVO N wants to
    // drive its expectedSurface; the pad physically connected to that
    // surface is whatever the user reported on whichever slot had it.
    const cliLines = [];
    const swaps = [];
    let needsRemap = false;

    for (const surface of airframeSurfaces) {
        if (skippedSlots.includes(surface.servoN)) continue;
        const desiredPad = surfaceToPad.get(surface.expectedSurface);

        if (!desiredPad) {
            // No pulse reported this expected surface as physically present
            // (e.g. user said "Nothing moved" on the slot we'd have
            // remapped FROM, or duplicate-surface ambiguity made us drop
            // it). Can't infer the right pad.
            skippedSlots.push(surface.servoN);
            continue;
        }
        if (duplicateSurfaces.has(surface.expectedSurface)) {
            // Multiple slots claimed this surface — ambiguous, skip rather
            // than picking arbitrarily.
            skippedSlots.push(surface.servoN);
            continue;
        }

        const currentPad = currentResources[surface.servoN];
        if (desiredPad !== currentPad) {
            cliLines.push(`resource SERVO ${surface.servoN} ${desiredPad}`);
            swaps.push({
                servoN: surface.servoN,
                fromPad: currentPad,
                toPad: desiredPad,
                surface: surface.expectedSurface,
            });
            needsRemap = true;
        }
    }

    return {
        cliLines,
        swaps,
        skippedSlots: [...new Set(skippedSlots)].sort((a, b) => a - b),
        unresolvedMultiple,
        duplicateSurfaces: [...duplicateSurfaces],
        needsRemap,
    };
}

// ─── Phase 3.5: scan unused motor pads when a surface reports Nothing ───
//
// Most non-wing FCs ship without dedicated SERVO silkscreen pads — users
// wire servos to the MOTOR pads and remap to SERVO at config time. When
// the wizard's airframe preset claims fewer motors than the FC has motor
// pads (e.g., 2-motor wing on a 4-motor target), the leftover motor pads
// can host servos. If Discovery's walking phase reports "Nothing moved"
// for one or more SERVO N, the missing servo is probably wired to one of
// those leftover motor pads.
//
// computeScanPlan generates the CLI batch to:
//   1. Release each unused motor resource (resource MOTOR <idx> NONE)
//   2. Reassign the freed pad to a new SERVO slot beyond the airframe's
//      existing surfaces (resource SERVO <newN> <pad>)
//
// After the FC reboots with this batch applied, the wizard walks the new
// SERVO slots in a "scanning" phase. The user picks which physical
// surface moved on each. computeFinalRemap then derives the final
// resource map from BOTH the original observations and the scan
// observations.
//
// @param opts.padDefaults         — board's silkscreen-default pads:
//                                   { motors: [{index, pad}], ledStrips: [{pad}] }
//                                   Source of candidate pads to repurpose
//                                   as scan slots. Stable across the
//                                   wizard's Apply (which RELEASES motors
//                                   in Option 2 mode but doesn't remove
//                                   them from the silkscreen pool).
// @param opts.motorCount          — wing's expected motor count
// @param opts.airframeSurfaces    — [{servoN, expectedSurface}, ...]
// @param opts.observations        — {servoN: surface_or_OBS_*}
//                                   from the original Discovery walk
// @param opts.currentResources   — current SERVO N → pad map (the
//                                   wizard's view of what's bound).
//                                   Used to exclude pads already
//                                   committed as servos so we don't
//                                   double-assign them to a scan slot.
// @returns {
//   eligible: bool,                — true if scan would help
//   cliLines: string[],            — batch to release motors + assign as SERVO
//   scanSlots: [{servoN, pad, fromMotorN}, ...] — new SERVO slots to walk
//   missingSurfaces: [...],        — surfaces that reported Nothing
// }
export function computeScanPlan({ padDefaults, motorCount, airframeSurfaces, observations, currentResources = {} }) {
    // Find surfaces that reported Nothing in the original walk.
    const missingSurfaces = [];
    for (const s of airframeSurfaces) {
        if (observations[s.servoN] === OBS_NOTHING) {
            missingSurfaces.push(s.expectedSurface);
        }
    }
    if (missingSurfaces.length === 0) {
        return { eligible: false, cliLines: [], scanSlots: [], missingSurfaces: [] };
    }

    // Pads already bound as servos — exclude from scan candidates so we
    // don't generate `resource SERVO N+ <pad>` lines that conflict with
    // existing `resource SERVO M <pad>` bindings on the same physical
    // pad. Brian, 2026-04-29: SERVO 1-4 land on M1-M4 silkscreen pads
    // after Apply; without this exclusion, scan tried to claim the
    // same pads at a different SERVO index.
    const padsBoundAsServo = new Set(Object.values(currentResources).filter(Boolean));

    // Find silkscreen-motor pads that are NOT used by the wing's
    // motorCount AND aren't already bound as servos.
    const motorPads = Array.isArray(padDefaults?.motors) ? padDefaults.motors : [];
    const unused = motorPads.filter((m) => m.index > motorCount && m.pad && !padsBoundAsServo.has(m.pad));
    if (unused.length === 0) {
        return { eligible: false, cliLines: [], scanSlots: [], missingSurfaces };
    }

    // Pick a starting SERVO N for the new slots — continue past the
    // airframe's existing servo numbers.
    const maxExistingServoN = airframeSurfaces.reduce((m, s) => Math.max(m, s.servoN), 0);
    let nextServoN = maxExistingServoN + 1;

    const cliLines = [];
    const scanSlots = [];
    for (const m of unused) {
        cliLines.push(`resource MOTOR ${m.index} NONE`);
        cliLines.push(`resource SERVO ${nextServoN} ${m.pad}`);
        scanSlots.push({ servoN: nextServoN, pad: m.pad, fromMotorN: m.index });
        nextServoN += 1;
    }

    return {
        eligible: scanSlots.length > 0,
        cliLines,
        scanSlots,
        missingSurfaces,
    };
}

// Combine original Discovery observations with scan observations to
// derive the final resource map. Each missing surface (from original
// Nothing-moved entries) is rewritten to point at whichever scan slot
// the user reported as moving that surface. Scan slots that weren't
// claimed by any missing surface (or that reported Nothing/Multiple)
// are released — their pads return to free.
//
// Also handles the swap-fix case: if the original walk had legit swaps,
// computeRemap's output is folded in here so the final cliLines cover
// BOTH swap fixes AND the scan-derived missing-surface assignments.
//
// @param opts.currentResources    — SERVO N → pad map AFTER scan setup
//                                   (i.e., now includes the new scan slots)
// @param opts.airframeSurfaces
// @param opts.originalObservations — first-walk observations
// @param opts.scanSlots            — [{servoN, pad, fromMotorN}]
// @param opts.scanObservations     — {servoN: surface_or_OBS_*} for scan slots
// @param opts.padDefaults          — board silkscreen pad list. Used to
//                                    pick motor pads from whatever's
//                                    LEFT after servo assignments are
//                                    derived. Optional — pass null to
//                                    skip motor binding (back-compat).
// @param opts.motorCount           — wing's expected motor count.
// @param opts.padTimers            — Map<pad, {timer}>. Used by motor
//                                    picker to enforce timer isolation
//                                    from servo timers.
// @returns {
//   cliLines, swaps, releasedScanSlots, stillMissing, needsRemap,
//   motorBindings: [{motorN, pad}]   — motors that get committed
// }
export function computeFinalRemap({
    currentResources,
    airframeSurfaces,
    originalObservations,
    scanSlots,
    scanObservations,
    padDefaults = null,
    motorCount = 0,
    padTimers = null,
}) {
    // Build surfaceToPad from BOTH original and scan observations.
    const surfaceToPad = new Map();

    // Original walk: each non-skip observation tells us pad-of-SERVO-N
    // is physically wired to <surface>.
    for (const s of airframeSurfaces) {
        const obs = originalObservations[s.servoN];
        const pad = currentResources[s.servoN];
        if (!pad) continue;
        if (SKIP_OUTCOMES.has(obs)) continue;
        if (!surfaceToPad.has(obs)) surfaceToPad.set(obs, pad);
    }

    // Scan walk: similar, but the slots are the temporary SERVO N+ ones.
    for (const slot of scanSlots) {
        const obs = scanObservations[slot.servoN];
        if (SKIP_OUTCOMES.has(obs)) continue;
        // Don't overwrite a pad already claimed by the original walk —
        // first-report wins (avoids letting a duplicate report knock out
        // a confirmed mapping).
        if (!surfaceToPad.has(obs)) surfaceToPad.set(obs, slot.pad);
    }

    const cliLines = [];
    const swaps = [];
    const stillMissing = [];

    // For each airframe surface, point its SERVO N at the pad we
    // discovered (whether from original walk or scan).
    for (const s of airframeSurfaces) {
        const desiredPad = surfaceToPad.get(s.expectedSurface);
        const currentPad = currentResources[s.servoN];

        if (!desiredPad) {
            stillMissing.push(s.expectedSurface);
            continue;
        }
        if (desiredPad === currentPad) continue;
        cliLines.push(`resource SERVO ${s.servoN} ${desiredPad}`);
        swaps.push({
            servoN: s.servoN,
            fromPad: currentPad ?? "—",
            toPad: desiredPad,
            surface: s.expectedSurface,
        });
    }

    // Release each scan slot — those temporary SERVO N+ assignments are
    // no longer needed once the real airframe surfaces have been
    // remapped onto the discovered pads. The freed pads return to a
    // released state; available for the motor picker below.
    const releasedScanSlots = [];
    for (const slot of scanSlots) {
        cliLines.push(`resource SERVO ${slot.servoN} NONE`);
        releasedScanSlots.push(slot.servoN);
    }

    // Build the set of pads that will be SERVO-bound after this commit.
    // Anything in this set can't be a motor.
    const servoBoundPads = new Set();
    for (const s of airframeSurfaces) {
        const desiredPad = surfaceToPad.get(s.expectedSurface);
        if (desiredPad) {
            servoBoundPads.add(desiredPad);
        } else if (currentResources[s.servoN]) {
            // No swap fired for this slot; whatever's currently bound stays.
            servoBoundPads.add(currentResources[s.servoN]);
        }
    }
    // Servo timers — motor pads must be on a DIFFERENT timer to avoid
    // BF's servo-vs-motor timer-isolation requirement.
    const servoTimers = new Set();
    if (padTimers) {
        for (const pad of servoBoundPads) {
            const t = padTimers.get?.(pad);
            if (t?.timer != null) servoTimers.add(t.timer);
        }
    }

    // Motor binding pass. Two-tier candidate pool:
    //   1. silkscreen-motor pads (preferred — preserves LED capability)
    //   2. LED pad (fallback — used only when motor demand can't be
    //      met from motor pads alone, e.g., 2-motor wing on a board
    //      where servos have eaten both the TIM3 + TIM4 motor timers
    //      and only the LED's solo timer is left)
    // Either way: NOT already bound as servos, NOT on a servo timer
    // (BF requires motor/servo timer isolation).
    const motorBindings = [];
    if (padDefaults && motorCount > 0) {
        const filterPad = (entry) => {
            if (!entry.pad) return false;
            if (servoBoundPads.has(entry.pad)) return false;
            if (padTimers) {
                const t = padTimers.get?.(entry.pad);
                if (t?.timer != null && servoTimers.has(t.timer)) return false;
            }
            return true;
        };
        const motorCandidates = (padDefaults.motors ?? []).filter(filterPad).sort((a, b) => a.index - b.index);
        const ledCandidates = (padDefaults.ledStrips ?? [])
            .filter(filterPad)
            // LED entries don't have a silkscreen index — synthesize a
            // sentinel so the merged pool sorts predictably.
            .map((l) => ({ ...l, index: 99 }));

        // Build the picking pool: motor pads first, then LED. LED gets
        // tapped only after every motor pad has been considered.
        const pool = [...motorCandidates, ...ledCandidates];

        // Bind motors in silkscreen order — N candidates → first N picks.
        // Earlier versions tried to spread motors across DIFFERENT timers,
        // but that breaks bidir DSHOT: TIMUP burst (the wing-correct mode)
        // REQUIRES motors on a shared timer for the RPM filter to work.
        // Spreading them apart was actively harmful AND surprising (M2
        // landing on a far-away pad like C09 when B08 was free and right
        // next to M1). Same-timer is a feature, not a conflict.
        for (const cand of pool) {
            if (motorBindings.length >= motorCount) break;
            const motorN = motorBindings.length + 1;
            motorBindings.push({ motorN, pad: cand.pad });
            cliLines.push(`resource MOTOR ${motorN} ${cand.pad}`);
        }

        // If we used the LED pad, emit an explicit LED_STRIP release so
        // the FC knows the LED resource is gone.
        const ledPadsUsed = motorBindings.filter((b) => (padDefaults.ledStrips ?? []).some((l) => l.pad === b.pad));
        for (const used of ledPadsUsed) {
            cliLines.push(`resource LED_STRIP 1 NONE`);
            // Only emit one release even if (somehow) multiple LED
            // pads got grabbed.
            void used;
            break;
        }
    }

    return {
        cliLines,
        swaps,
        releasedScanSlots,
        stillMissing,
        motorBindings,
        needsRemap: cliLines.length > 0,
    };
}
