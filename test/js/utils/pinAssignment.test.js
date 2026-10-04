import { describe, expect, it } from "vitest";
import {
    PIN_NONE,
    buildPadDefaults,
    buildPinModel,
    currentPinValue,
    initialPinState,
    pinChangeLines,
    pinOptions,
    pinTimerConflict,
    rowPinConflict,
    selectPin,
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

// `timer <pad> list` for two pads: A15 can also be TIM8 CH1N; B00 can be
// TIM1 CH2N or TIM8 CH2N.
const TIMER_OPTIONS = new Map([
    [
        "A15",
        [
            { af: 1, timer: 2, channel: 1, complementary: false },
            { af: 3, timer: 8, channel: 1, complementary: true },
        ],
    ],
    [
        "B00",
        [
            { af: 1, timer: 1, channel: 2, complementary: true },
            { af: 2, timer: 3, channel: 3, complementary: false },
            { af: 3, timer: 8, channel: 2, complementary: true },
        ],
    ],
]);

const model = buildPinModel(RESOURCES, TIMERS, TIMER_OPTIONS);
const state = initialPinState(model);
const select = (s, key, value) => selectPin(model, s, key, value);
const pads = (options) => options.map((o) => o.value);

describe("buildPinModel", () => {
    it("splits motor/servo assignments from other owners", () => {
        expect(model.assignments.get("MOTOR 1")).toBe("B00");
        expect(model.assignments.get("SERVO 3")).toBe("A15");
        expect(model.otherOwners.get("B06")).toBe("LED_STRIP");
        expect(model.assignments.get("SERIAL_TX 3")).toBe("B10");
        expect(model.otherOwners.has("B10")).toBe(false);
        expect(model.otherOwners.get("A04")).toBe("GYRO_CS 1");
        expect(model.otherOwners.has("B03")).toBe(false);
        expect(model.padTimers.get("B14")).toEqual({ timer: 1, channel: 2 });
    });
});

describe("pinOptions", () => {
    const base = { model, state, motorCount: 2 };

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
        const staged = select(state, "SERVO 3", "B04");
        expect(rowPinConflict({ model, state: staged, key: "SERVO 3", motorCount: 2 })).toMatchObject({
            hard: false,
            timer: 3,
            with: "MOTOR 1",
        });
    });

    it("reports two outputs on one channel as hard", () => {
        const staged = { ...state, assignments: new Map(state.assignments).set("SERVO 3", "B14") };
        expect(rowPinConflict({ model, state: staged, key: "SERVO 3" })).toMatchObject({
            hard: true,
            with: "SERVO 2",
        });
    });

    it("has no conflict for a pad without a timer", () => {
        expect(pinTimerConflict({ model, state, key: "SERVO 1", pad: "A04" })).toBeNull();
    });
});

describe("selectPin / pinChangeLines", () => {
    it("moves the previous owner of a pad to NONE", () => {
        const staged = select(state, "SERVO 1", "A09").assignments;
        expect(staged.get("SERVO 1")).toBe("A09");
        expect(staged.get("SERVO 2")).toBe(PIN_NONE);
        expect(model.assignments.get("SERVO 2")).toBe("A09"); // original untouched
    });

    it("writes nothing when nothing changed", () => {
        expect(pinChangeLines(model, state)).toEqual([]);
    });

    it("releases every changed output before assigning", () => {
        let staged = select(state, "SERVO 1", "B04"); // takes unused MOTOR 3's pad
        staged = select(staged, "SERVO 2", "B03");
        expect(pinChangeLines(model, staged)).toEqual([
            "resource MOTOR 3 NONE",
            "resource SERVO 1 NONE",
            "resource SERVO 2 NONE",
            "resource SERVO 1 B04",
            "resource SERVO 2 B03",
        ]);
    });

    it("swaps two outputs", () => {
        let staged = select(state, "SERVO 1", "A09");
        staged = select(staged, "SERVO 2", "A08");
        expect(pinChangeLines(model, staged)).toEqual([
            "resource SERVO 1 NONE",
            "resource SERVO 2 NONE",
            "resource SERVO 1 A09",
            "resource SERVO 2 A08",
        ]);
    });
});

describe("buildPinModel from the `resource` dump", () => {
    it("reads configured pins, including motors the mixer isn't running", async () => {
        const { parseResourceShow } = await import("../../../src/js/utils/resourceCli.js");
        const dump = [
            "# resource",
            "resource BEEPER 1 C13",
            "resource MOTOR 1 B00",
            "resource MOTOR 2 B01",
            "resource SERVO 1 NONE",
            "resource LED_STRIP 1 B06",
            "resource SERIAL_TX 1 A09",
        ];
        const dumpModel = buildPinModel(parseResourceShow(dump), TIMERS);
        expect([...dumpModel.assignments]).toEqual([
            ["MOTOR 1", "B00"],
            ["MOTOR 2", "B01"],
            ["LED_STRIP 1", "B06"],
            ["SERIAL_TX 1", "A09"],
        ]);
        expect(dumpModel.otherOwners.get("C13")).toBe("BEEPER 1");
    });
});

describe("buildPadDefaults", () => {
    it("labels pads by their default resource, even after they were cleared or moved", () => {
        const current = [
            { pad: "A02", peripheral: "MOTOR", index: 3 }, // moved from B04
            { pad: "B05", peripheral: "SERVO", index: 1 }, // added, no default
            { pad: "B06", peripheral: "LED_STRIP", index: 1 },
        ];
        const defaults = new Map([
            ["MOTOR 1", "B00"], // now NONE
            ["MOTOR 3", "B04"],
            ["SERVO 1", "NONE"],
        ]);
        const padDefaults = buildPadDefaults(current, defaults);
        expect(padDefaults.get("B00")).toBe("MOTOR 1");
        expect(padDefaults.get("B04")).toBe("MOTOR 3");
        expect(padDefaults.get("B06")).toBe("LED_STRIP 1");
        expect(padDefaults.has("A02")).toBe(false);
        expect(padDefaults.has("B05")).toBe(false);
    });
});

describe("alternate timers (alt-AF)", () => {
    const base = { model, state, motorCount: 2 };

    it("offers a servo the other timers of a pad", () => {
        const options = pinOptions({ ...base, key: "SERVO 3" });
        const a15Alt = options.find((o) => o.value === "A15/AF3");
        expect(a15Alt).toMatchObject({ pad: "A15", alt: true, timer: { timer: 8, channel: 1, complementary: true } });
        // B00 on TIM1 CH2N is the same channel as SERVO 2 on A09, so it's not offered.
        expect(options.find((o) => o.value === "B00/AF1")).toBeUndefined();
        // B00 on TIM8 CH2N is free; it moves MOTOR 1 off the pad.
        expect(options.find((o) => o.value === "B00/AF3")).toMatchObject({ owner: "MOTOR 1", conflict: null });
    });

    it("never offers alternate timers to motors", () => {
        const options = pinOptions({ ...base, key: "MOTOR 1" });
        expect(options.some((o) => o.alt)).toBe(false);
    });

    it("stages the AF with the pin and writes a timer line first", () => {
        const staged = select(state, "SERVO 3", "A15/AF3");
        expect(currentPinValue(model, staged, "SERVO 3")).toBe("A15/AF3");
        expect(pinChangeLines(model, staged)).toEqual(["timer A15 AF3"]);
        const moved = select(staged, "SERVO 1", "B00/AF3");
        expect(pinChangeLines(model, moved)).toEqual([
            "timer A15 AF3",
            "timer B00 AF3",
            "resource MOTOR 1 NONE",
            "resource SERVO 1 NONE",
            "resource SERVO 1 B00",
        ]);
    });

    it("checks conflicts on the alternate timer", () => {
        // SERVO 3 moves A15 to TIM8 CH1N; a servo on C08-like TIM8 CH1 would clash.
        const staged = select(state, "SERVO 3", "A15/AF3");
        const clash = pinTimerConflict({ model, state: staged, key: "SERVO 1", pad: "B00", af: 3 });
        expect(clash).toBeNull(); // CH2N vs CH1N: different channel, both servos
        expect(rowPinConflict({ model, state: staged, key: "SERVO 3", motorCount: 2 })).toBeNull();
    });

    it("returns a pad to its configured AF when its servo leaves", () => {
        let staged = select(state, "SERVO 3", "A15/AF3");
        staged = select(staged, "SERVO 3", "B03");
        expect(staged.afs.get("A15")).toBe(1);
        expect(pinChangeLines(model, staged)).toEqual(["resource SERVO 3 NONE", "resource SERVO 3 B03"]);
    });

    it("puts a pad back on its configured AF when a motor takes it", () => {
        let staged = select(state, "SERVO 1", "B00/AF3");
        staged = select(staged, "MOTOR 1", "B00");
        expect(staged.afs.get("B00")).toBe(2);
        expect(currentPinValue(model, staged, "MOTOR 1")).toBe("B00");
    });
});

describe("motors use the default timer and DMA", () => {
    // Flywoo bench case: a servo left A02 on TIM9 CH1 (AF3, no DMA). Its
    // default is TIM2 CH3 (AF1) with DMA option 0, which the timer change cleared.
    const resources = [
        { pad: "A02", peripheral: "SERVO", index: 1 },
        { pad: "B00", peripheral: "MOTOR", index: 1 },
        { pad: "A03", peripheral: "FREE", index: null },
    ];
    const timers = [
        { pad: "A02", af: 3, timer: 9, channel: 1 },
        { pad: "B00", af: 2, timer: 3, channel: 3 },
        { pad: "A03", af: 1, timer: 2, channel: 4 },
    ];
    const options = new Map([
        [
            "A02",
            [
                { af: 1, timer: 2, channel: 3, complementary: false },
                { af: 2, timer: 5, channel: 3, complementary: false },
                { af: 3, timer: 9, channel: 1, complementary: false },
            ],
        ],
    ]);
    const hardware = {
        timerAfs: new Map([["A02", 1]]),
        dmaPins: new Map([["A02", "0"]]),
        currentDma: new Map([
            ["B00", "0"],
            ["A03", "0"],
        ]),
    };
    const fw = buildPinModel(resources, timers, options, hardware);
    const s0 = initialPinState(fw);

    it("offers a motor the pad on its default timer, not the servo's", () => {
        const a02 = pinOptions({ model: fw, state: s0, key: "MOTOR 2", motorCount: 2 }).find((o) => o.pad === "A02");
        expect(a02).toMatchObject({ value: "A02/AF1", timer: { timer: 2, channel: 3 }, owner: "SERVO 1" });
    });

    it("restores the default timer and DMA option when a motor takes the pad", () => {
        const staged = selectPin(fw, s0, "MOTOR 2", "A02/AF1");
        expect(pinChangeLines(fw, staged)).toEqual([
            "timer A02 AF1",
            "dma pin A02 0",
            "resource SERVO 1 NONE",
            "resource MOTOR 2 A02",
        ]);
    });

    it("restores a cleared DMA option even when the timer is already the default", () => {
        const cleared = buildPinModel(
            [{ pad: "A02", peripheral: "SERVO", index: 1 }],
            [{ pad: "A02", af: 1, timer: 2, channel: 3 }],
            new Map(),
            { dmaPins: new Map([["A02", "0"]]) },
        );
        const staged = selectPin(cleared, initialPinState(cleared), "MOTOR 1", "A02");
        expect(pinChangeLines(cleared, staged)).toEqual([
            "dma pin A02 0",
            "resource SERVO 1 NONE",
            "resource MOTOR 1 A02",
        ]);
    });

    it("writes no DMA line for servos", () => {
        const staged = selectPin(fw, s0, "SERVO 2", "A03");
        expect(pinChangeLines(fw, staged)).toEqual(["resource SERVO 2 A03"]);
    });
});

describe("LED strip and UART release", () => {
    // LED strip on B06 (TIM4 CH1), UART3 on B10/B11 (no timer configured;
    // B10 can be TIM2 CH3, B11 TIM2 CH4), a servo on A15 (TIM2 CH1).
    const resources = [
        { pad: "B00", peripheral: "MOTOR", index: 1 },
        { pad: "A15", peripheral: "SERVO", index: 1 },
        { pad: "B07", peripheral: "SERVO", index: 2 },
        { pad: "B06", peripheral: "LED_STRIP", index: 1 },
        { pad: "B10", peripheral: "SERIAL_TX", index: 3 },
        { pad: "B11", peripheral: "SERIAL_RX", index: 3 },
        { pad: "A09", peripheral: "SERIAL_TX", index: 1 },
    ];
    const timers = [
        { pad: "B00", af: 2, timer: 3, channel: 3 },
        { pad: "A15", af: 1, timer: 2, channel: 1 },
        { pad: "B07", af: 2, timer: 4, channel: 2 },
        { pad: "B06", af: 2, timer: 4, channel: 1 },
    ];
    const options = new Map([
        ["B10", [{ af: 1, timer: 2, channel: 3, complementary: false }]],
        ["B11", [{ af: 1, timer: 2, channel: 4, complementary: false }]],
        ["A09", [{ af: 1, timer: 1, channel: 2, complementary: false }]],
    ]);
    const m = buildPinModel(resources, timers, options);
    const s0 = initialPinState(m);
    const values = (key, extra = {}) =>
        pinOptions({ model: m, state: s0, key, motorCount: 1, ...extra }).map((o) => o.value);

    it("offers the LED strip pad and moves the LED off it", () => {
        const led = pinOptions({ model: m, state: s0, key: "SERVO 1", motorCount: 1 }).find((o) => o.pad === "B06");
        expect(led.owner).toBe("LED_STRIP 1");
        const staged = selectPin(m, s0, "SERVO 1", "B06");
        expect(pinChangeLines(m, staged)).toEqual([
            "resource LED_STRIP 1 NONE",
            "resource SERVO 1 NONE",
            "resource SERVO 1 B06",
        ]);
        // A motor isn't offered it: SERVO 2 holds TIM4 too.
        expect(values("MOTOR 1")).not.toContain("B06");
    });

    it("treats the LED strip timer like another output's", () => {
        // B07 shares TIM4 with the LED strip: SERVO 2 already sits there, so
        // its row warns; a motor isn't offered B07 outside expert mode.
        expect(rowPinConflict({ model: m, state: s0, key: "SERVO 2" })).toMatchObject({
            hard: false,
            timer: 4,
            with: "LED_STRIP 1",
        });
        const off = buildPinModel(resources, timers, options, { ledStripEnabled: false });
        expect(rowPinConflict({ model: off, state: initialPinState(off), key: "SERVO 2" })).toBeNull();
    });

    it("hides UART pins unless their UART is released", () => {
        expect(values("SERVO 1")).not.toContain("B10/AF1");
        expect(values("SERVO 1", { releasableUarts: new Set([3]) })).toContain("B11/AF1");
        expect(values("MOTOR 1", { releasableUarts: new Set([3]) })).not.toContain("B11/AF1");
        expect(values("SERVO 1", { releasableUarts: new Set([3]) })).not.toContain("A09/AF1");
    });

    it("frees both pins of a UART and gives its pad a timer", () => {
        const staged = selectPin(m, s0, "SERVO 1", "B10/AF1");
        expect(staged.assignments.get("SERIAL_RX 3")).toBe(PIN_NONE);
        expect(pinChangeLines(m, staged)).toEqual([
            "timer B10 AF1",
            "resource SERIAL_RX 3 NONE",
            "resource SERIAL_TX 3 NONE",
            "resource SERVO 1 NONE",
            "resource SERVO 1 B10",
        ]);
    });

    it("gives the LED strip and a UART their pins back when the servo leaves", () => {
        let staged = selectPin(m, s0, "SERVO 1", "B10/AF1");
        staged = selectPin(m, staged, "SERVO 1", "A15");
        expect(pinChangeLines(m, staged)).toEqual([]);
        staged = selectPin(m, s0, "MOTOR 1", "B06");
        staged = selectPin(m, staged, "MOTOR 1", "B00");
        expect(pinChangeLines(m, staged)).toEqual([]);
    });
});
