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

    it("maxServoN cap: skips scratch slots beyond firmware SERVO_CONFIG capacity", () => {
        // Bench-found regression: Standard Plane has 4 surfaces (servoN
        // 1-4), nextServoN starts at 5. With 4 unused motor pads
        // (M5-M8), scratch SERVOs 5-8 were generated. But the live-edit
        // pulse path's configIdx = servoN + 1 → 9 max → out-of-bounds
        // throw on FC.SERVO_CONFIG[9]. With maxServoN=6 (configIdx max
        // 7, fits in 8-entry array), only 5 and 6 fit; 7 and 8 land
        // in skippedForCapacity.
        const result = computeScanPlan({
            padDefaults: makePadDefaults([
                { index: 1, pad: "C06" },
                { index: 2, pad: "C07" },
                { index: 3, pad: "B00" },
                { index: 4, pad: "B01" },
                { index: 5, pad: "B06" },
                { index: 6, pad: "B07" },
                { index: 7, pad: "B08" },
                { index: 8, pad: "C09" },
            ]),
            motorCount: 4,
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: { 1: OBS_NOTHING, 2: OBS_NOTHING, 3: OBS_NOTHING, 4: OBS_NOTHING },
            maxServoN: 6,
        });
        // M1-M4 are motors (motorCount=4), M5-M8 are scan candidates.
        // With cap=6: scratch SERVO 5,6 fit; 7,8 → skipped.
        expect(result.scanSlots).toHaveLength(2);
        expect(result.scanSlots.map((s) => s.servoN)).toEqual([5, 6]);
        expect(result.skippedForCapacity).toEqual(["B08", "C09"]);
    });

    it("Tier B (LED eviction): falls back when Tier A short of missingSurfaces", () => {
        // motorCount=4 (M1-M4 are motors), so M5/M6/M7 are candidates.
        // M5 + M7 are LED-bound; only M6 is truly free → Tier A has 1
        // candidate, missingSurfaces has 4. Falls back to Tier B which
        // includes both LED-bound pads. CLI batch leads with
        // `resource LED_STRIP 1 NONE` so the scratch-SERVO bind doesn't
        // collide on save.
        const result = computeScanPlan({
            padDefaults: makePadDefaults([
                { index: 1, pad: "C06" },
                { index: 2, pad: "C07" },
                { index: 3, pad: "B00" },
                { index: 4, pad: "B01" },
                { index: 5, pad: "B06" }, // LED-bound
                { index: 6, pad: "B07" }, // truly free
                { index: 7, pad: "B08" }, // LED-bound
            ]),
            motorCount: 4,
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: { 1: OBS_NOTHING, 2: OBS_NOTHING, 3: OBS_NOTHING, 4: OBS_NOTHING },
            ledStripBoundPads: ["B06", "B08"],
            maxServoN: 8,
        });
        expect(result.evictedLedPads.sort()).toEqual(["B06", "B08"]);
        expect(result.cliLines[0]).toBe("resource LED_STRIP 1 NONE");
        expect(result.scanSlots.map((s) => s.pad).sort()).toEqual(["B06", "B07", "B08"]);
    });

    it("Tier A sufficient: never evicts LED even when LED-bound pads exist", () => {
        // motorCount=4 leaves M5-M8 as candidates. M5 is LED-bound but
        // M6/M7/M8 (3 pads) are enough to cover missingSurfaces (4) —
        // wait, 3 < 4 would force Tier B. Use missingSurfaces=2 case
        // by reporting only 2 NOTHINGs. Then Tier A's 3 truly-free
        // pads suffice and LED is left alone.
        const result = computeScanPlan({
            padDefaults: makePadDefaults([
                { index: 1, pad: "C06" },
                { index: 2, pad: "C07" },
                { index: 3, pad: "B00" },
                { index: 4, pad: "B01" },
                { index: 5, pad: "B06" }, // LED-bound but not needed
                { index: 6, pad: "B07" },
                { index: 7, pad: "B08" },
                { index: 8, pad: "C09" },
            ]),
            motorCount: 4,
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: { 1: "Elevator", 2: "Aileron L", 3: OBS_NOTHING, 4: OBS_NOTHING },
            ledStripBoundPads: ["B06"],
            maxServoN: 8,
        });
        expect(result.evictedLedPads).toEqual([]);
        expect(result.cliLines).not.toContain("resource LED_STRIP 1 NONE");
        // LED-held B06 NOT in scan slots (Tier A excluded it).
        expect(result.scanSlots.map((s) => s.pad)).not.toContain("B06");
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
