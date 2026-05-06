import { describe, expect, it } from "vitest";
import {
    candidateSourceLabel,
    motorIndicesInUse,
    resourceOptions,
    stableResourcePins,
} from "../../../src/js/utils/motorServoResourceCandidates.js";

function analysis(extras = {}) {
    return {
        motors: [],
        servos: [],
        ledStrips: [],
        serials: [],
        freePadsCount: 0,
        freeDmaStreams: [],
        hardwareFixedPads: [],
        pwmCapableFreePads: [],
        warnings: [],
        ...extras,
    };
}

describe("motor/servo resource candidates", () => {
    it("keeps a stable selectable pin set across resource edits", () => {
        const motorResources = [{ index: 0, pin: "NONE" }];
        const servoResources = [{ index: 0, pin: "B03" }];

        expect(stableResourcePins(motorResources, servoResources, ["A08"])).toEqual(["A08", "B03"]);
    });

    it("derives in-use motor indices from assigned motor resources", () => {
        expect(
            motorIndicesInUse([
                { index: 0, pin: "A08" },
                { index: 1, pin: "NONE" },
                { index: 2, pin: "B03" },
            ]),
        ).toEqual([1, 3]);
    });

    it("adds timer-aware free PWM candidates for servo resources", () => {
        const options = resourceOptions({
            kind: "servo",
            resource: { index: 1, pin: "NONE" },
            motorResources: [{ index: 0, pin: "B00" }],
            hardwareAnalysis: analysis({
                motors: [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }],
                pwmCapableFreePads: [{ pad: "A03", timer: 2, channel: 4 }],
            }),
            fallbackPins: ["B00"],
        });

        expect(options.map((option) => option.value)).toEqual(["A03", "B00"]);
        expect(options[0].label).toBe("A03 - TIM2 CH4 - free");
    });

    it("labels releasable resources for dropdown hints", () => {
        expect(candidateSourceLabel({ source: "motor-release", requiresRelease: ["resource MOTOR 3 NONE"] })).toBe(
            "releases MOTOR 3",
        );
        expect(candidateSourceLabel({ source: "led-strip", requiresRelease: ["resource LED_STRIP 1 NONE"] })).toBe(
            "releases LED_STRIP",
        );
    });
});
