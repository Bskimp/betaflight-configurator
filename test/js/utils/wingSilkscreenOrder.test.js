import { describe, it, expect } from "vitest";
import { pickSilkscreenOrderLayout } from "../../../src/js/utils/wingRemapRecommender";

// Common pad-defaults shape used by computePresetResourcePlan.
const SIX_MOTOR_BOARD = {
    motors: [
        { index: 1, pad: "B06" },
        { index: 2, pad: "B08" },
        { index: 3, pad: "B07" },
        { index: 4, pad: "B09" },
        { index: 5, pad: "C08" },
        { index: 6, pad: "C09" },
    ],
    ledStrips: [{ pad: "A08" }],
};

describe("pickSilkscreenOrderLayout", () => {
    it("4 servos + 2 motors: servos on silkscreen 1-4, motors on 5-6", () => {
        const r = pickSilkscreenOrderLayout(
            {},
            2, // motorCount
            [1, 2, 3, 4], // usedServoIndices
            { padDefaults: SIX_MOTOR_BOARD },
        );
        expect([...r.servos.entries()]).toEqual([
            [1, "B06"],
            [2, "B08"],
            [3, "B07"],
            [4, "B09"],
        ]);
        expect([...r.motors.entries()]).toEqual([
            [1, "C08"],
            [2, "C09"],
        ]);
    });

    it("1 motor + 4 servos (single-motor wing): motor lands on silkscreen 5", () => {
        const r = pickSilkscreenOrderLayout({}, 1, [1, 2, 3, 4], { padDefaults: SIX_MOTOR_BOARD });
        expect(r.motors.get(1)).toBe("C08");
        expect(r.servos.get(4)).toBe("B09");
    });

    it("returns null when pool can't fit servos + motors", () => {
        const tightBoard = { motors: [{ index: 1, pad: "B06" }], ledStrips: [] };
        const r = pickSilkscreenOrderLayout({}, 1, [1, 2, 3, 4], { padDefaults: tightBoard });
        expect(r).toBeNull();
    });

    it("LED pad joins the pool when allowLedStrip is true", () => {
        const fiveMotor = {
            motors: [
                { index: 1, pad: "B06" },
                { index: 2, pad: "B08" },
                { index: 3, pad: "B07" },
                { index: 4, pad: "B09" },
                { index: 5, pad: "C08" },
            ],
            ledStrips: [{ pad: "A08" }],
        };
        // 4 servos + 2 motors needs 6 slots; without LED only 5 are
        // available so the picker returns null. With LED → A08 fills
        // motor 2.
        const without = pickSilkscreenOrderLayout({}, 2, [1, 2, 3, 4], {
            padDefaults: fiveMotor,
        });
        expect(without).toBeNull();
        const withLed = pickSilkscreenOrderLayout({}, 2, [1, 2, 3, 4], {
            padDefaults: fiveMotor,
            allowLedStrip: true,
        });
        expect(withLed.motors.get(1)).toBe("C08");
        expect(withLed.motors.get(2)).toBe("A08");
    });

    it("returns null when padDefaults missing or empty", () => {
        expect(pickSilkscreenOrderLayout({}, 2, [1, 2], {})).toBeNull();
        expect(pickSilkscreenOrderLayout({}, 2, [1, 2], { padDefaults: { motors: [] } })).toBeNull();
    });
});
