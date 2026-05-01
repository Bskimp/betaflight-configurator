import { describe, it, expect } from "vitest";
import {
    computeMotorIdentity,
    buildMotorWalkPool,
    computeMotorScanPlan,
    computeMotorScanFinal,
    OBS_MATCH,
    OBS_SWAP,
    OBS_NONE,
} from "../../../src/js/utils/wingMotors";

// Standard twin-motor wing: M1 left on C06, M2 right on C07.
const TWIN_MOTORS = [
    { motorIdx: 1, label: "Left motor", pad: "C06" },
    { motorIdx: 2, label: "Right motor", pad: "C07" },
];

describe("buildMotorWalkPool", () => {
    it("orders motors by motorIdx", () => {
        const pool = buildMotorWalkPool([
            { motorIdx: 2, label: "Right motor", pad: "C07" },
            { motorIdx: 1, label: "Left motor", pad: "C06" },
        ]);
        expect(pool.map((m) => m.motorIdx)).toEqual([1, 2]);
    });
});

describe("computeMotorIdentity", () => {
    it("no observations: no fixes", () => {
        const r = computeMotorIdentity({ expectedMotors: TWIN_MOTORS, observations: {} });
        expect(r.needsApply).toBe(false);
        expect(r.swaps).toEqual([]);
    });

    it("all match: no fixes", () => {
        const r = computeMotorIdentity({
            expectedMotors: TWIN_MOTORS,
            observations: {
                1: { result: OBS_MATCH },
                2: { result: OBS_MATCH },
            },
        });
        expect(r.needsApply).toBe(false);
    });

    it("M1↔M2 swap: emits one swap entry, dedupes the reciprocal", () => {
        const r = computeMotorIdentity({
            expectedMotors: TWIN_MOTORS,
            observations: {
                1: { result: OBS_SWAP, swapWith: 2 },
                2: { result: OBS_SWAP, swapWith: 1 },
            },
        });
        expect(r.swaps).toHaveLength(1);
        expect(r.swaps[0]).toEqual({ a: 1, b: 2, padA: "C06", padB: "C07" });
        expect(r.cliLines).toEqual([
            "resource MOTOR 1 NONE",
            "resource MOTOR 2 NONE",
            "resource MOTOR 1 C07",
            "resource MOTOR 2 C06",
        ]);
        expect(r.needsApply).toBe(true);
    });

    it("only one side reports swap: still emits the pair", () => {
        // User pulses M1 first, sees right motor spin → reports swap.
        // Doesn't bother walking M2 because the conclusion is already
        // clear. Wizard should still be able to apply the swap.
        const r = computeMotorIdentity({
            expectedMotors: TWIN_MOTORS,
            observations: {
                1: { result: OBS_SWAP, swapWith: 2 },
            },
        });
        expect(r.swaps).toHaveLength(1);
        expect(r.swaps[0]).toMatchObject({ a: 1, b: 2 });
    });

    it("swap with unknown motorIdx: silently dropped", () => {
        const r = computeMotorIdentity({
            expectedMotors: TWIN_MOTORS,
            observations: {
                1: { result: OBS_SWAP, swapWith: 99 },
            },
        });
        expect(r.swaps).toEqual([]);
        expect(r.needsApply).toBe(false);
    });

    it("OBS_NONE collected into `missing`", () => {
        const r = computeMotorIdentity({
            expectedMotors: TWIN_MOTORS,
            observations: {
                1: { result: OBS_NONE },
                2: { result: OBS_MATCH },
            },
        });
        expect(r.missing).toEqual([1]);
        expect(r.needsApply).toBe(false); // missing isn't a fix-able state by itself
    });

    it("CLI batch releases both pads BEFORE rebinding to avoid pad-claimed conflicts", () => {
        const r = computeMotorIdentity({
            expectedMotors: TWIN_MOTORS,
            observations: { 1: { result: OBS_SWAP, swapWith: 2 } },
        });
        // First two lines must be NONE releases, then the rebinds.
        expect(r.cliLines[0]).toMatch(/resource MOTOR \d+ NONE/);
        expect(r.cliLines[1]).toMatch(/resource MOTOR \d+ NONE/);
        expect(r.cliLines[2]).toMatch(/resource MOTOR \d+ C\d+/);
        expect(r.cliLines[3]).toMatch(/resource MOTOR \d+ C\d+/);
    });
});

describe("computeMotorScanPlan", () => {
    const PAD_DEFAULTS = {
        motors: [
            { index: 1, pad: "B06" }, // currently bound (M1)
            { index: 2, pad: "B08" }, // free (the wired-but-unfound motor)
            { index: 3, pad: "C08" }, // free
            { index: 4, pad: "C09" }, // currently bound (M2, but empty)
        ],
        ledStrips: [{ pad: "A08" }],
    };
    const CURRENT_BINDINGS = [
        { motorIdx: 1, pad: "B06" },
        { motorIdx: 2, pad: "C09" },
    ];

    it("no missing motors: empty plan", () => {
        const r = computeMotorScanPlan({
            missingMotors: [],
            currentBindings: CURRENT_BINDINGS,
            padDefaults: PAD_DEFAULTS,
        });
        expect(r.cliLines).toEqual([]);
        expect(r.scanSlots).toEqual([]);
    });

    it("missing M2 + free pads: releases M2, binds free pads to scratch slots", () => {
        const r = computeMotorScanPlan({
            missingMotors: [2],
            currentBindings: CURRENT_BINDINGS,
            padDefaults: PAD_DEFAULTS,
        });
        // Release M2 first
        expect(r.cliLines[0]).toBe("resource MOTOR 2 NONE");
        // Then bind free pads (B08, C08) to scratch slots starting after
        // highest bound motor (2). Highest is 2; missing has 2 → start 3.
        expect(r.scanSlots).toEqual([
            { scratchIdx: 3, pad: "B08" },
            { scratchIdx: 4, pad: "C08" },
        ]);
        expect(r.cliLines).toContain("resource MOTOR 3 B08");
        expect(r.cliLines).toContain("resource MOTOR 4 C08");
    });

    it("no free pads: empty plan even when motor missing", () => {
        const tightPad = {
            motors: [
                { index: 1, pad: "B06" },
                { index: 2, pad: "C09" },
            ],
            ledStrips: [],
        };
        const r = computeMotorScanPlan({
            missingMotors: [2],
            currentBindings: CURRENT_BINDINGS,
            padDefaults: tightPad,
        });
        expect(r.cliLines).toEqual([]);
        expect(r.scanSlots).toEqual([]);
    });
});

describe("computeMotorScanFinal", () => {
    const SCAN_SLOTS = [
        { scratchIdx: 3, pad: "B08" },
        { scratchIdx: 4, pad: "C08" },
    ];

    it("user identifies M2 on B08 (scratch 3): binds M2, releases scratch 4", () => {
        const r = computeMotorScanFinal({
            scanSlots: SCAN_SLOTS,
            scanObservations: {
                3: { result: OBS_SWAP, swapWith: 2 }, // "Right motor (M2) spun"
                4: { result: OBS_NONE }, // nothing on C08
            },
            missingMotors: [2],
        });
        expect(r.assignedMotors).toEqual([{ motorIdx: 2, pad: "B08" }]);
        expect(r.cliLines).toContain("resource MOTOR 3 NONE");
        expect(r.cliLines).toContain("resource MOTOR 2 B08");
        expect(r.cliLines).toContain("resource MOTOR 4 NONE");
    });

    it("no observations: releases all scratch slots", () => {
        const r = computeMotorScanFinal({
            scanSlots: SCAN_SLOTS,
            scanObservations: {},
            missingMotors: [2],
        });
        expect(r.assignedMotors).toEqual([]);
        expect(r.cliLines).toEqual(["resource MOTOR 3 NONE", "resource MOTOR 4 NONE"]);
    });
});
