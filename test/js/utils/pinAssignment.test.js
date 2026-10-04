import { describe, expect, it } from "vitest";
import {
    PIN_NONE,
    assignPin,
    buildPinModel,
    pinChangeLines,
    pinOptions,
    pinTimerConflict,
    rowPinConflict,
} from "../../../src/js/utils/pinAssignment.js";

// An F405 wing: two motors on TIM3, servos on TIM1/TIM2, LED on TIM4, a
// spare TIM2 pad, UART3 on a pad that also has a timer.
const RESOURCES = [
    { pad: "B00", peripheral: "MOTOR", index: 1 },
    { pad: "B01", peripheral: "MOTOR", index: 2 },
    { pad: "B04", peripheral: "MOTOR", index: 3 },
    { pad: "A08", peripheral: "SERVO", index: 1 },
    { pad: "A09", peripheral: "SERVO", index: 2 },
    { pad: "A15", peripheral: "SERVO", index: 3 },
    { pad: "B06", peripheral: "LED_STRIP", index: null },
    { pad: "B10", peripheral: "SERIAL_TX", index: 3 },
    { pad: "B03", peripheral: "FREE", index: null },
    { pad: "A04", peripheral: "GYRO_CS", index: 1 },
];
const TIMERS = [
    { pad: "B00", af: 2, timer: 3, channel: 3 },
    { pad: "B01", af: 2, timer: 3, channel: 4 },
    { pad: "B04", af: 2, timer: 3, channel: 1 },
    { pad: "A08", af: 1, timer: 1, channel: 1 },
    { pad: "A09", af: 1, timer: 1, channel: 2 },
    { pad: "A15", af: 1, timer: 2, channel: 1 },
    { pad: "B03", af: 1, timer: 2, channel: 2 },
    { pad: "B06", af: 2, timer: 4, channel: 1 },
    { pad: "B10", af: 1, timer: 2, channel: 3 },
    { pad: "B14", af: 3, timer: 1, channel: 2 }, // TIM1 CH2N: same channel as A09
];

const model = buildPinModel(RESOURCES, TIMERS);
const pads = (options) => options.map((o) => o.value);

describe("buildPinModel", () => {
    it("splits motor/servo assignments from other owners", () => {
        expect(model.assignments.get("MOTOR 1")).toBe("B00");
        expect(model.assignments.get("SERVO 3")).toBe("A15");
        expect(model.otherOwners.get("B06")).toBe("LED_STRIP");
        expect(model.otherOwners.get("B10")).toBe("SERIAL_TX 3");
        expect(model.otherOwners.has("B03")).toBe(false);
        expect(model.padTimers.get("B14")).toEqual({ timer: 1, channel: 2 });
    });
});

describe("pinOptions", () => {
    const base = { model, assignments: model.assignments, motorCount: 2 };

    it("offers free timer pads and other motor/servo pads, never peripheral pads", () => {
        const options = pinOptions({ ...base, key: "SERVO 3" });
        expect(pads(options)).toContain(PIN_NONE);
        expect(pads(options)).toContain("A15"); // current
        expect(pads(options)).toContain("B03"); // free, TIM2 like the current pin
        expect(pads(options)).not.toContain("B06"); // LED strip
        expect(pads(options)).not.toContain("B10"); // UART
        expect(pads(options)).not.toContain("A04"); // no timer
    });

    it("marks the output a pick would move", () => {
        const a09 = pinOptions({ ...base, key: "SERVO 1" }).find((o) => o.value === "A09");
        expect(a09.owner).toBe("SERVO 2");
        expect(a09.conflict).toBeNull();
    });

    it("hides pads that share a timer channel with a running output", () => {
        // B14 is TIM1 CH2N, the same channel as SERVO 2 on A09.
        expect(pads(pinOptions({ ...base, key: "SERVO 3" }))).not.toContain("B14");
        // ...unless that is the output being moved off it.
        expect(pads(pinOptions({ ...base, key: "SERVO 2" }))).toContain("B14");
    });

    it("hides a motor/servo timer share unless in expert mode", () => {
        // B04 is TIM3, the motors' timer; MOTOR 3 is beyond motor_count so B04 is free to take.
        const normal = pinOptions({ ...base, key: "SERVO 3" });
        expect(pads(normal)).not.toContain("B04");
        const expert = pinOptions({ ...base, key: "SERVO 3", expertMode: true });
        const b04 = expert.find((o) => o.value === "B04");
        expect(b04.conflict).toMatchObject({ hard: false, timer: 3 });
        expect(b04.owner).toBe("MOTOR 3");
    });

    it("lets unused motors' pads go without a timer clash", () => {
        // With motor_count 2, MOTOR 3 never starts, so a motor can take B04.
        const b04 = pinOptions({ ...base, key: "MOTOR 1" }).find((o) => o.value === "B04");
        expect(b04).toMatchObject({ owner: "MOTOR 3", conflict: null });
    });
});

describe("pinTimerConflict / rowPinConflict", () => {
    it("reports a motor and a servo sharing a timer on the row", () => {
        const staged = assignPin(model.assignments, "SERVO 3", "B04");
        expect(rowPinConflict({ model, assignments: staged, key: "SERVO 3", motorCount: 2 })).toMatchObject({
            hard: false,
            timer: 3,
            with: "MOTOR 1",
        });
    });

    it("reports two outputs on one channel as hard", () => {
        const staged = new Map(model.assignments).set("SERVO 3", "B14");
        expect(rowPinConflict({ model, assignments: staged, key: "SERVO 3" })).toMatchObject({
            hard: true,
            with: "SERVO 2",
        });
    });

    it("has no conflict for a pad without a timer", () => {
        expect(pinTimerConflict({ model, assignments: model.assignments, key: "SERVO 1", pad: "A04" })).toBeNull();
    });
});

describe("assignPin / pinChangeLines", () => {
    it("moves the previous owner of a pad to NONE", () => {
        const staged = assignPin(model.assignments, "SERVO 1", "A09");
        expect(staged.get("SERVO 1")).toBe("A09");
        expect(staged.get("SERVO 2")).toBe(PIN_NONE);
        expect(model.assignments.get("SERVO 2")).toBe("A09"); // original untouched
    });

    it("writes nothing when nothing changed", () => {
        expect(pinChangeLines(model.assignments, model.assignments)).toEqual([]);
    });

    it("releases every changed output before assigning", () => {
        let staged = assignPin(model.assignments, "SERVO 1", "B04"); // takes unused MOTOR 3's pad
        staged = assignPin(staged, "SERVO 2", "B03");
        expect(pinChangeLines(model.assignments, staged)).toEqual([
            "resource MOTOR 3 NONE",
            "resource SERVO 1 NONE",
            "resource SERVO 2 NONE",
            "resource SERVO 1 B04",
            "resource SERVO 2 B03",
        ]);
    });

    it("swaps two outputs", () => {
        let staged = assignPin(model.assignments, "SERVO 1", "A09");
        staged = assignPin(staged, "SERVO 2", "A08");
        expect(pinChangeLines(model.assignments, staged)).toEqual([
            "resource SERVO 1 NONE",
            "resource SERVO 2 NONE",
            "resource SERVO 1 A09",
            "resource SERVO 2 A08",
        ]);
    });
});
