import { describe, it, expect } from "vitest";
import { computeWingRemap } from "../../../src/js/utils/wingRemapRecommender.js";

// Minimal shape the recommender needs — same shape analyzer returns.
function analysis(motors = [], extras = {}) {
    return {
        motors,
        servos: [],
        ledStrips: [],
        serials: [],
        freePadsCount: 0,
        freeDmaStreams: [],
        hardwareFixedPads: [],
        warnings: [],
        ...extras,
    };
}

describe("computeWingRemap", () => {
    it("is a no-op when board already has exactly N motors declared", () => {
        // SPEEDYBEEF405WING: 2 motors declared, no extras. Wing config already correct.
        const r = computeWingRemap(
            analysis([
                { index: 1, pad: "B07", timer: 4, channel: 2, dmaStream: null, bidirBurst: true },
                { index: 2, pad: "B06", timer: 4, channel: 1, dmaStream: null, bidirBurst: true },
            ]),
            { motorCount: 2 },
        );
        expect(r.isNoOp).toBe(true);
        expect(r.cliLines).toEqual([]);
        expect(r.summary).toMatch(/No remap needed/i);
    });

    it("converts a MATEKF405TE-style quad declaration to 2M + servos", () => {
        // 8 motors declared. Keep M1/M2, release M3-M8, assign as SERVO 1-6.
        const motors = [];
        const pads = ["B07", "B06", "B15", "A08", "B11", "B10", "C08", "C09"];
        pads.forEach((pad, i) => {
            motors.push({
                index: i + 1,
                pad,
                timer: null,
                channel: null,
                dmaStream: null,
                bidirBurst: false,
            });
        });
        const r = computeWingRemap(analysis(motors), { motorCount: 2 });
        expect(r.isNoOp).toBe(false);
        expect(r.motorsToRelease.map((m) => m.index)).toEqual([3, 4, 5, 6, 7, 8]);
        expect(r.servosToAssign).toEqual([
            { slot: 1, pad: "B15", fromMotorIndex: 3 },
            { slot: 2, pad: "A08", fromMotorIndex: 4 },
            { slot: 3, pad: "B11", fromMotorIndex: 5 },
            { slot: 4, pad: "B10", fromMotorIndex: 6 },
            { slot: 5, pad: "C08", fromMotorIndex: 7 },
            { slot: 6, pad: "C09", fromMotorIndex: 8 },
        ]);
    });

    it("emits CLI lines that end with save", () => {
        const motors = [
            { index: 1, pad: "B07", timer: null, channel: null, dmaStream: null, bidirBurst: false },
            { index: 2, pad: "B06", timer: null, channel: null, dmaStream: null, bidirBurst: false },
            { index: 3, pad: "B15", timer: null, channel: null, dmaStream: null, bidirBurst: false },
            { index: 4, pad: "A08", timer: null, channel: null, dmaStream: null, bidirBurst: false },
        ];
        const r = computeWingRemap(analysis(motors), { motorCount: 2 });
        expect(r.cliLines).toEqual([
            "resource MOTOR 3 NONE",
            "resource SERVO 1 B15",
            "resource MOTOR 4 NONE",
            "resource SERVO 2 A08",
            "save",
        ]);
    });

    it("defaults to 2 motors when motorCount is unspecified", () => {
        const motors = [
            { index: 1, pad: "B07", timer: null, channel: null, dmaStream: null, bidirBurst: false },
            { index: 2, pad: "B06", timer: null, channel: null, dmaStream: null, bidirBurst: false },
            { index: 3, pad: "B15", timer: null, channel: null, dmaStream: null, bidirBurst: false },
        ];
        const r = computeWingRemap(analysis(motors));
        expect(r.motorsToRelease.length).toBe(1);
        expect(r.servosToAssign.length).toBe(1);
    });

    it("supports 1-motor wings (elevon with single motor)", () => {
        const motors = [
            { index: 1, pad: "B07", timer: null, channel: null, dmaStream: null, bidirBurst: false },
            { index: 2, pad: "B06", timer: null, channel: null, dmaStream: null, bidirBurst: false },
        ];
        const r = computeWingRemap(analysis(motors), { motorCount: 1 });
        expect(r.motorsToRelease).toEqual([{ index: 2, pad: "B06" }]);
        expect(r.servosToAssign).toEqual([{ slot: 1, pad: "B06", fromMotorIndex: 2 }]);
    });

    it("skips pads on board-wired peripherals but still releases the motor slot", () => {
        const motors = [
            { index: 1, pad: "B07", timer: null, channel: null, dmaStream: null, bidirBurst: false },
            { index: 2, pad: "B06", timer: null, channel: null, dmaStream: null, bidirBurst: false },
            // Unusual: an imaginary board with M3 on a pad that's also USB. Defense in depth.
            { index: 3, pad: "A11", timer: null, channel: null, dmaStream: null, bidirBurst: false },
            { index: 4, pad: "B15", timer: null, channel: null, dmaStream: null, bidirBurst: false },
        ];
        const r = computeWingRemap(
            analysis(motors, { hardwareFixedPads: [{ pad: "A11", peripheral: "USB", index: null }] }),
            { motorCount: 2 },
        );
        expect(r.cliLines).toEqual([
            "resource MOTOR 3 NONE",
            // SERVO 1 not assigned to A11 — that pad is board-wired.
            "resource MOTOR 4 NONE",
            "resource SERVO 1 B15",
            "save",
        ]);
        expect(r.warnings.find((w) => w.code === "skipped_fixed_pad")).toBeDefined();
    });

    it("handles empty motor list gracefully", () => {
        const r = computeWingRemap(analysis([]), { motorCount: 2 });
        expect(r.isNoOp).toBe(true);
    });

    it("handles missing analysis input", () => {
        expect(computeWingRemap(null).isNoOp).toBe(true);
        expect(computeWingRemap({}).isNoOp).toBe(true);
    });
});
