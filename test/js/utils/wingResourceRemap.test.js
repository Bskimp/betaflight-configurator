import { describe, it, expect } from "vitest";
import {
    computeRemap,
    computeScanPlan,
    computeFinalRemap,
    OBS_NOTHING,
    OBS_MULTIPLE,
    OBS_NO_SERVO,
} from "../../../src/js/utils/wingResourceRemap";

// Standard-plane airframe used by most tests. SERVO 1=elevator,
// 2=aileron L, 3=aileron R, 4=rudder.
const STANDARD_AIRFRAME = [
    { servoN: 1, expectedSurface: "Elevator" },
    { servoN: 2, expectedSurface: "Aileron L" },
    { servoN: 3, expectedSurface: "Aileron R" },
    { servoN: 4, expectedSurface: "Rudder" },
];

describe("computeRemap", () => {
    it("no-op when every slot already drives its expected surface", () => {
        const result = computeRemap({
            currentResources: { 1: "B05", 2: "B00", 3: "B01", 4: "B02" },
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: {
                1: "Elevator",
                2: "Aileron L",
                3: "Aileron R",
                4: "Rudder",
            },
        });
        expect(result.needsRemap).toBe(false);
        expect(result.cliLines).toEqual([]);
        expect(result.swaps).toEqual([]);
    });

    it("pairwise swap: SERVO 1 has aileron L, SERVO 2 has elevator", () => {
        // Brian's actual default-FLYWOO scenario.
        const result = computeRemap({
            currentResources: { 1: "B05", 2: "B00", 3: "B01", 4: "B02" },
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: {
                1: "Aileron L", // user reports left aileron deflected for SERVO 1
                2: "Elevator", // user reports elevator deflected for SERVO 2
                3: "Aileron R",
                4: "Rudder",
            },
        });
        expect(result.needsRemap).toBe(true);
        expect(result.cliLines).toContain("resource SERVO 1 B00");
        expect(result.cliLines).toContain("resource SERVO 2 B05");
        expect(result.cliLines).toHaveLength(2);
        expect(result.swaps).toHaveLength(2);
    });

    it("3-way rotation: SERVO 1→aileron R, 2→elevator, 3→aileron L", () => {
        const result = computeRemap({
            currentResources: { 1: "B05", 2: "B00", 3: "B01", 4: "B02" },
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: {
                1: "Aileron R",
                2: "Elevator",
                3: "Aileron L",
                4: "Rudder",
            },
        });
        expect(result.needsRemap).toBe(true);
        expect(result.cliLines).toContain("resource SERVO 1 B00"); // elevator now on B00
        expect(result.cliLines).toContain("resource SERVO 2 B01"); // aileron L on B01
        expect(result.cliLines).toContain("resource SERVO 3 B05"); // aileron R on B05
        expect(result.cliLines).toHaveLength(3);
    });

    it("Multiple moved on a slot: skips it from remap, surfaces in unresolvedMultiple", () => {
        const result = computeRemap({
            currentResources: { 1: "B05", 2: "B00", 3: "B01", 4: "B02" },
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: {
                1: "Elevator",
                2: OBS_MULTIPLE, // user can't tell what moved
                3: "Aileron R",
                4: "Rudder",
            },
        });
        expect(result.unresolvedMultiple).toEqual([2]);
        expect(result.skippedSlots).toContain(2);
        // SERVO 2 stays as-is; no CLI line generated for it.
        expect(result.cliLines.find((l) => l.startsWith("resource SERVO 2"))).toBeUndefined();
    });

    it("Nothing moved on a slot: skipped, no remap derived for that slot", () => {
        const result = computeRemap({
            currentResources: { 1: "B05", 2: "B00", 3: "B01", 4: "B02" },
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: {
                1: "Elevator",
                2: "Aileron L",
                3: OBS_NOTHING, // user has no servo on SERVO 3 pad
                4: "Rudder",
            },
        });
        expect(result.skippedSlots).toContain(3);
        expect(result.needsRemap).toBe(false);
    });

    it("Not-on-this-plane: skipped (rudderless build of standard preset)", () => {
        const result = computeRemap({
            currentResources: { 1: "B05", 2: "B00", 3: "B01", 4: "B02" },
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: {
                1: "Elevator",
                2: "Aileron L",
                3: "Aileron R",
                4: OBS_NO_SERVO, // no rudder on this build
            },
        });
        expect(result.skippedSlots).toContain(4);
        expect(result.needsRemap).toBe(false);
    });

    it("flying wing 2-surface swap", () => {
        const flyingWing = [
            { servoN: 2, expectedSurface: "Left Elevon" },
            { servoN: 3, expectedSurface: "Right Elevon" },
        ];
        const result = computeRemap({
            currentResources: { 2: "B00", 3: "B01" },
            airframeSurfaces: flyingWing,
            observations: { 2: "Right Elevon", 3: "Left Elevon" },
        });
        expect(result.needsRemap).toBe(true);
        expect(result.cliLines).toContain("resource SERVO 2 B01");
        expect(result.cliLines).toContain("resource SERVO 3 B00");
    });

    it("duplicate surface report (user reported elevator on two slots): skips ambiguous", () => {
        const result = computeRemap({
            currentResources: { 1: "B05", 2: "B00", 3: "B01", 4: "B02" },
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: {
                1: "Elevator",
                2: "Elevator", // duplicate
                3: "Aileron R",
                4: "Rudder",
            },
        });
        expect(result.duplicateSurfaces).toContain("Elevator");
        // Slot whose expectedSurface is "Elevator" gets skipped because
        // the surface→pad map is ambiguous.
        expect(result.skippedSlots).toContain(1);
    });

    it("missing pad for a slot: slot is skipped silently", () => {
        const result = computeRemap({
            currentResources: { 1: "B05", 2: "B00" }, // no SERVO 3 or 4 pads
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: {
                1: "Elevator",
                2: "Aileron L",
                3: "Aileron R",
                4: "Rudder",
            },
        });
        expect(result.skippedSlots).toContain(3);
        expect(result.skippedSlots).toContain(4);
    });

    it("partial fix: some slots fixable, others Multiple — fix what we can", () => {
        const result = computeRemap({
            currentResources: { 1: "B05", 2: "B00", 3: "B01", 4: "B02" },
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: {
                1: "Aileron L", // swap target identifiable
                2: "Elevator",
                3: OBS_MULTIPLE, // can't fix
                4: "Rudder",
            },
        });
        expect(result.needsRemap).toBe(true);
        expect(result.cliLines).toContain("resource SERVO 1 B00");
        expect(result.cliLines).toContain("resource SERVO 2 B05");
        expect(result.unresolvedMultiple).toEqual([3]);
        expect(result.skippedSlots).toContain(3);
    });

    it("no observations at all: skips everything, no remap", () => {
        const result = computeRemap({
            currentResources: { 1: "B05", 2: "B00", 3: "B01", 4: "B02" },
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: {},
        });
        expect(result.needsRemap).toBe(false);
        expect(result.skippedSlots.sort()).toEqual([1, 2, 3, 4]);
    });
});

// padDefaults is the board's silkscreen MOTOR/LED pad list — stable
// across the wizard's Apply (which releases unused motors but doesn't
// remove them from the silkscreen pool).
function makePadDefaults(motorBindings) {
    return { motors: motorBindings, ledStrips: [] };
}

describe("computeScanPlan", () => {
    it("eligible when surfaces report Nothing AND unused motor pads exist", () => {
        const result = computeScanPlan({
            padDefaults: makePadDefaults([
                { index: 1, pad: "C06" },
                { index: 2, pad: "C07" },
                { index: 3, pad: "B00" },
                { index: 4, pad: "B01" },
            ]),
            motorCount: 2,
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: { 1: "Elevator", 2: "Aileron L", 3: "Aileron R", 4: OBS_NOTHING },
        });
        expect(result.eligible).toBe(true);
        expect(result.scanSlots).toHaveLength(2);
        expect(result.scanSlots).toEqual([
            { servoN: 5, pad: "B00", fromMotorN: 3 },
            { servoN: 6, pad: "B01", fromMotorN: 4 },
        ]);
        expect(result.cliLines).toEqual([
            "resource MOTOR 3 NONE",
            "resource SERVO 5 B00",
            "resource MOTOR 4 NONE",
            "resource SERVO 6 B01",
        ]);
        expect(result.missingSurfaces).toEqual(["Rudder"]);
    });

    it("not eligible when no surfaces reported Nothing", () => {
        const result = computeScanPlan({
            padDefaults: makePadDefaults([
                { index: 1, pad: "C06" },
                { index: 2, pad: "C07" },
                { index: 3, pad: "B00" },
                { index: 4, pad: "B01" },
            ]),
            motorCount: 2,
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: { 1: "Elevator", 2: "Aileron L", 3: "Aileron R", 4: "Rudder" },
        });
        expect(result.eligible).toBe(false);
        expect(result.scanSlots).toHaveLength(0);
    });

    it("not eligible when no unused motor pads available", () => {
        const result = computeScanPlan({
            padDefaults: makePadDefaults([
                { index: 1, pad: "C06" },
                { index: 2, pad: "C07" },
            ]),
            motorCount: 2,
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: { 1: "Elevator", 2: "Aileron L", 3: "Aileron R", 4: OBS_NOTHING },
        });
        expect(result.eligible).toBe(false);
        expect(result.missingSurfaces).toEqual(["Rudder"]);
    });

    it("multiple Nothing-moved entries: scan all unused motor pads", () => {
        const result = computeScanPlan({
            padDefaults: makePadDefaults([
                { index: 1, pad: "C06" },
                { index: 2, pad: "C07" },
                { index: 3, pad: "B00" },
                { index: 4, pad: "B01" },
                { index: 5, pad: "B06" },
                { index: 6, pad: "B08" },
            ]),
            motorCount: 2,
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: { 1: "Elevator", 2: OBS_NOTHING, 3: OBS_NOTHING, 4: OBS_NOTHING },
        });
        expect(result.eligible).toBe(true);
        expect(result.scanSlots).toHaveLength(4);
        expect(result.missingSurfaces.sort()).toEqual(["Aileron L", "Aileron R", "Rudder"]);
    });

    it("Tier A sufficient: never evicts LED even when LED-bound pads exist", () => {
        // 2 unused MOTOR pads (M5, M6); only 2 surfaces report Nothing.
        // M5 is LED-bound, M6 is truly free. Tier A has 1 candidate
        // (M6), missingSurfaces is 2 — wait, that'd trigger Tier B.
        // Adjust: report only 1 Nothing so Tier A's 1 candidate is enough.
        const result = computeScanPlan({
            padDefaults: makePadDefaults([
                { index: 1, pad: "C06" },
                { index: 2, pad: "C07" },
                { index: 3, pad: "B00" },
                { index: 4, pad: "B01" },
                { index: 5, pad: "B06" }, // LED-bound, but Tier A sufficient → not evicted
                { index: 6, pad: "B07" }, // truly free
            ]),
            motorCount: 4,
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: { 1: "Elevator", 2: "Aileron L", 3: "Aileron R", 4: OBS_NOTHING },
            ledStripBoundPads: ["B06"],
            freePadSet: new Set(["B07"]),
        });
        expect(result.evictedLedPads).toEqual([]);
        expect(result.cliLines).not.toContain("resource LED_STRIP 1 NONE");
        // Scratch should land on B07 only, not B06.
        expect(result.scanSlots.map((s) => s.pad)).toEqual(["B07"]);
    });

    it("Tier B fallback: evicts LED when Tier A short of missingSurfaces", () => {
        // 2 surfaces report Nothing, but Tier A has only 1 truly-free
        // pad. M5 is LED-bound. Tier B includes M5 → 2 candidates fit.
        // CLI batch leads with `resource LED_STRIP 1 NONE`.
        const result = computeScanPlan({
            padDefaults: makePadDefaults([
                { index: 1, pad: "C06" },
                { index: 2, pad: "C07" },
                { index: 3, pad: "B00" },
                { index: 4, pad: "B01" },
                { index: 5, pad: "B06" }, // LED-bound
                { index: 6, pad: "B07" }, // truly free
            ]),
            motorCount: 4,
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: { 1: "Elevator", 2: "Aileron L", 3: OBS_NOTHING, 4: OBS_NOTHING },
            ledStripBoundPads: ["B06"],
            freePadSet: new Set(["B07"]),
        });
        expect(result.evictedLedPads).toEqual(["B06"]);
        expect(result.cliLines[0]).toBe("resource LED_STRIP 1 NONE");
        expect(result.scanSlots.map((s) => s.pad).sort()).toEqual(["B06", "B07"]);
    });

    it("freePadSet excludes silkscreen-MOTOR pads currently bound as MOTOR (recommender override case)", () => {
        // Bench-found bug: Apply's recommender can place MOTOR 1 on a
        // silkscreen pad with index > motorCount (e.g. M3's pad). The
        // legacy index-only filter would still consider that pad
        // "unused" by silkscreen index and try to scratch-bind a SERVO
        // there → resource conflict on save (FC silently un-binds
        // either motor or servo). With freePadSet, motor-bound pads
        // are excluded regardless of silkscreen index.
        const result = computeScanPlan({
            padDefaults: makePadDefaults([
                { index: 1, pad: "C09" }, // silkscreen M1
                { index: 2, pad: "A08" }, // silkscreen M2
                { index: 3, pad: "B06" }, // silkscreen M3 — recommender put MOTOR 1 here
                { index: 4, pad: "B08" }, // silkscreen M4 — recommender put MOTOR 2 here
                { index: 5, pad: "B07" }, // truly free
                { index: 6, pad: "C09b" }, // truly free (placeholder distinct pad)
            ]),
            motorCount: 2,
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: { 1: "Elevator", 2: "Aileron L", 3: OBS_NOTHING, 4: OBS_NOTHING },
            // Analyzer reports only B07 and C09b as truly FREE; B06 and
            // B08 are bound by the recommender's motor placement.
            freePadSet: new Set(["B07", "C09b"]),
        });
        const scratchPads = result.scanSlots.map((s) => s.pad);
        expect(scratchPads).not.toContain("B06");
        expect(scratchPads).not.toContain("B08");
        expect(scratchPads.sort()).toEqual(["B07", "C09b"]);
    });
});

describe("computeFinalRemap", () => {
    // After Apply: SERVO 1=C06, 2=C07, 3=B00, 4=B01 (default-board layout).
    // Scan added SERVO 5=B06, SERVO 6=B08 from released motor pads.
    const POST_SCAN_RESOURCES = { 1: "C06", 2: "C07", 3: "B00", 4: "B01", 5: "B06", 6: "B08" };
    const SCAN_SLOTS = [
        { servoN: 5, pad: "B06", fromMotorN: 3 },
        { servoN: 6, pad: "B08", fromMotorN: 4 },
    ];

    it("missing surface found via scan: reassigns SERVO N to the scanned pad", () => {
        const result = computeFinalRemap({
            currentResources: POST_SCAN_RESOURCES,
            airframeSurfaces: STANDARD_AIRFRAME,
            originalObservations: {
                1: "Elevator",
                2: "Aileron L",
                3: "Aileron R",
                4: OBS_NOTHING, // Rudder went missing
            },
            scanSlots: SCAN_SLOTS,
            scanObservations: { 5: "Rudder", 6: OBS_NOTHING },
        });
        expect(result.needsRemap).toBe(true);
        // Rudder should be remapped to where it was found (B06).
        expect(result.cliLines).toContain("resource SERVO 4 B06");
        // Scan slots get released regardless.
        expect(result.cliLines).toContain("resource SERVO 5 NONE");
        expect(result.cliLines).toContain("resource SERVO 6 NONE");
        expect(result.swaps).toContainEqual({
            servoN: 4,
            fromPad: "B01",
            toPad: "B06",
            surface: "Rudder",
        });
        expect(result.stillMissing).toEqual([]);
    });

    it("scan finds nothing matching: surface stays missing, scan slots still released", () => {
        const result = computeFinalRemap({
            currentResources: POST_SCAN_RESOURCES,
            airframeSurfaces: STANDARD_AIRFRAME,
            originalObservations: {
                1: "Elevator",
                2: "Aileron L",
                3: "Aileron R",
                4: OBS_NOTHING,
            },
            scanSlots: SCAN_SLOTS,
            scanObservations: { 5: OBS_NOTHING, 6: OBS_NOTHING },
        });
        expect(result.stillMissing).toContain("Rudder");
        // Scan slots still released even though no surface found.
        expect(result.cliLines).toContain("resource SERVO 5 NONE");
        expect(result.cliLines).toContain("resource SERVO 6 NONE");
    });

    it("multiple missing surfaces, all found via scan", () => {
        const result = computeFinalRemap({
            currentResources: POST_SCAN_RESOURCES,
            airframeSurfaces: STANDARD_AIRFRAME,
            originalObservations: {
                1: "Elevator",
                2: OBS_NOTHING,
                3: OBS_NOTHING,
                4: OBS_NOTHING,
            },
            scanSlots: [
                { servoN: 5, pad: "B06", fromMotorN: 3 },
                { servoN: 6, pad: "B08", fromMotorN: 4 },
                { servoN: 7, pad: "B07", fromMotorN: 5 },
            ],
            scanObservations: { 5: "Aileron L", 6: "Aileron R", 7: "Rudder" },
        });
        expect(result.cliLines).toContain("resource SERVO 2 B06");
        expect(result.cliLines).toContain("resource SERVO 3 B08");
        expect(result.cliLines).toContain("resource SERVO 4 B07");
        expect(result.stillMissing).toEqual([]);
    });

    it("scan reports duplicate surface (already mapped in original): first-report wins", () => {
        const result = computeFinalRemap({
            currentResources: POST_SCAN_RESOURCES,
            airframeSurfaces: STANDARD_AIRFRAME,
            originalObservations: {
                1: "Elevator",
                2: "Aileron L", // already on C07
                3: "Aileron R",
                4: OBS_NOTHING,
            },
            scanSlots: SCAN_SLOTS,
            // User confused: claims B06 also moved Aileron L. Original
            // walk's report (C07) wins; scan's "Aileron L" is dropped.
            scanObservations: { 5: "Aileron L", 6: "Rudder" },
        });
        // SERVO 2 stays on its original pad C07 (no swap line emitted).
        expect(result.cliLines.find((l) => l.startsWith("resource SERVO 2"))).toBeUndefined();
        // SERVO 4 still gets mapped to where Rudder was scanned.
        expect(result.cliLines).toContain("resource SERVO 4 B08");
    });

    it("no missing surfaces and no scan needed: returns empty cliLines except scan releases", () => {
        const result = computeFinalRemap({
            currentResources: POST_SCAN_RESOURCES,
            airframeSurfaces: STANDARD_AIRFRAME,
            originalObservations: {
                1: "Elevator",
                2: "Aileron L",
                3: "Aileron R",
                4: "Rudder",
            },
            scanSlots: [],
            scanObservations: {},
        });
        expect(result.cliLines).toEqual([]);
        expect(result.needsRemap).toBe(false);
    });
});
