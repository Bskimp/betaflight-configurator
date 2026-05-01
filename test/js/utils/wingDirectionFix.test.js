import { describe, it, expect } from "vitest";
import {
    computeDirectionFixes,
    axesForSurface,
    rateForSurfaceAxis,
    OBS_MATCH,
    OBS_WRONG,
} from "../../../src/js/utils/wingDirectionFix";

// Standard plane: elevator + ailerons + rudder. Each surface has a
// SINGLE rule (target slot + one axis).
//   ELEVATOR  slot 2  pitch
//   FLAPPERON_L slot 3 roll +
//   FLAPPERON_R slot 4 roll -
//   RUDDER    slot 5  yaw
const STANDARD_RULES = [
    { target: 2, input: 1, rate: 100 }, // elevator: pitch
    { target: 3, input: 0, rate: 100 }, // flapperon L: roll
    { target: 4, input: 0, rate: -100 }, // flapperon R: roll (inverted)
    { target: 5, input: 2, rate: 100 }, // rudder: yaw
];
const STANDARD_AIRFRAME = [
    { servoN: 1, expectedSurface: "Elevator", label: "Elevator" },
    { servoN: 2, expectedSurface: "Aileron L", label: "Aileron L" },
    { servoN: 3, expectedSurface: "Aileron R", label: "Aileron R" },
    { servoN: 4, expectedSurface: "Rudder", label: "Rudder" },
];

// Flying wing: elevons drive BOTH roll + pitch on each side.
const FLYING_WING_RULES = [
    { target: 3, input: 0, rate: 50 }, // L elevon: roll +
    { target: 3, input: 1, rate: 50 }, // L elevon: pitch +
    { target: 4, input: 0, rate: -50 }, // R elevon: roll -
    { target: 4, input: 1, rate: 50 }, // R elevon: pitch +
];
const FLYING_WING_AIRFRAME = [
    { servoN: 2, expectedSurface: "Left Elevon", label: "Left Elevon" },
    { servoN: 3, expectedSurface: "Right Elevon", label: "Right Elevon" },
];

describe("axesForSurface", () => {
    it("single-axis surface (rudder) reports just that axis", () => {
        // RUDDER slot 5
        expect(axesForSurface(STANDARD_RULES, 5)).toEqual(["yaw"]);
    });

    it("multi-axis surface (elevon) reports both axes", () => {
        // L elevon slot 3 with roll + pitch rules
        expect(axesForSurface(FLYING_WING_RULES, 3).sort()).toEqual(["pitch", "roll"]);
    });

    it("surface with no rules reports no axes", () => {
        expect(axesForSurface(STANDARD_RULES, 99)).toEqual([]);
    });
});

describe("rateForSurfaceAxis", () => {
    it("returns the signed rate when rule exists", () => {
        expect(rateForSurfaceAxis(STANDARD_RULES, 4, "roll")).toBe(-100);
        expect(rateForSurfaceAxis(STANDARD_RULES, 5, "yaw")).toBe(100);
    });

    it("returns null when no rule matches", () => {
        expect(rateForSurfaceAxis(STANDARD_RULES, 5, "pitch")).toBeNull();
    });
});

describe("computeDirectionFixes", () => {
    it("no observations: no flips", () => {
        const result = computeDirectionFixes({
            rules: STANDARD_RULES,
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: {},
        });
        expect(result.needsApply).toBe(false);
        expect(result.ruleFlips).toEqual([]);
    });

    it("all match: no flips", () => {
        const result = computeDirectionFixes({
            rules: STANDARD_RULES,
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: {
                1: { pitch: OBS_MATCH },
                2: { roll: OBS_MATCH },
                3: { roll: OBS_MATCH },
                4: { yaw: OBS_MATCH },
            },
        });
        expect(result.needsApply).toBe(false);
    });

    it("rudder reversed: flips rudder rule sign", () => {
        const result = computeDirectionFixes({
            rules: STANDARD_RULES,
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: { 4: { yaw: OBS_WRONG } },
        });
        expect(result.needsApply).toBe(true);
        expect(result.ruleFlips).toHaveLength(1);
        expect(result.ruleFlips[0]).toEqual({
            ruleIdx: 3, // rudder rule index in STANDARD_RULES
            surface: "Rudder",
            axis: "yaw",
            oldRate: 100,
            newRate: -100,
        });
    });

    it("flying wing: pitch wrong on L elevon flips ONLY pitch rule, leaves roll", () => {
        const result = computeDirectionFixes({
            rules: FLYING_WING_RULES,
            airframeSurfaces: FLYING_WING_AIRFRAME,
            observations: { 2: { roll: OBS_MATCH, pitch: OBS_WRONG } },
        });
        expect(result.needsApply).toBe(true);
        expect(result.ruleFlips).toHaveLength(1);
        expect(result.ruleFlips[0]).toMatchObject({
            ruleIdx: 1, // L elevon pitch rule
            axis: "pitch",
            oldRate: 50,
            newRate: -50,
        });
    });

    it("flying wing: BOTH axes wrong on L elevon flips both rules (full surface reverse)", () => {
        const result = computeDirectionFixes({
            rules: FLYING_WING_RULES,
            airframeSurfaces: FLYING_WING_AIRFRAME,
            observations: { 2: { roll: OBS_WRONG, pitch: OBS_WRONG } },
        });
        expect(result.ruleFlips).toHaveLength(2);
        const flippedAxes = result.ruleFlips.map((f) => f.axis).sort();
        expect(flippedAxes).toEqual(["pitch", "roll"]);
    });

    it("flying wing: pitch wrong on BOTH elevons flips two pitch rules (axis-only fix)", () => {
        const result = computeDirectionFixes({
            rules: FLYING_WING_RULES,
            airframeSurfaces: FLYING_WING_AIRFRAME,
            observations: {
                2: { pitch: OBS_WRONG, roll: OBS_MATCH },
                3: { pitch: OBS_WRONG, roll: OBS_MATCH },
            },
        });
        expect(result.ruleFlips).toHaveLength(2);
        // Both flips are pitch only — roll rules untouched.
        expect(result.ruleFlips.every((f) => f.axis === "pitch")).toBe(true);
    });

    it("'wrong' on an axis with no matching rule: no flip emitted", () => {
        const result = computeDirectionFixes({
            rules: STANDARD_RULES,
            airframeSurfaces: STANDARD_AIRFRAME,
            // Rudder doesn't have a roll rule — observation for it is dropped.
            observations: { 4: { roll: OBS_WRONG, yaw: OBS_MATCH } },
        });
        expect(result.needsApply).toBe(false);
    });

    it("rate sign preservation: -100 → +100", () => {
        const result = computeDirectionFixes({
            rules: STANDARD_RULES,
            airframeSurfaces: STANDARD_AIRFRAME,
            observations: { 3: { roll: OBS_WRONG } }, // R aileron, rate=-100
        });
        expect(result.ruleFlips[0].oldRate).toBe(-100);
        expect(result.ruleFlips[0].newRate).toBe(100);
    });
});
