import { describe, it, expect } from "vitest";
import { computeYawFlipPlan, OBS_MATCH, OBS_WRONG } from "../../../src/js/utils/wingYawDirection";

describe("computeYawFlipPlan", () => {
    it("OBS_MATCH: no flip needed", () => {
        const r = computeYawFlipPlan({ observation: OBS_MATCH, motorCount: 2 });
        expect(r.needsFlip).toBe(false);
        expect(r.cliLines).toEqual([]);
    });

    it("OBS_WRONG + twin motor: emits flipped mmix CLI lines", () => {
        const r = computeYawFlipPlan({ observation: OBS_WRONG, motorCount: 2 });
        expect(r.needsFlip).toBe(true);
        expect(r.cliLines).toEqual(["mmix 0 1.000 0.000 0.000 -0.400", "mmix 1 1.000 0.000 0.000 0.400"]);
    });

    it("OBS_WRONG + single motor: no flip (single-motor wings don't have diff-thrust)", () => {
        const r = computeYawFlipPlan({ observation: OBS_WRONG, motorCount: 1 });
        expect(r.needsFlip).toBe(false);
    });
});
