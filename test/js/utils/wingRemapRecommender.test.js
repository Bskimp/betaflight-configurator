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
            { slot: 1, pad: "B15", fromMotorIndex: 3, fromFreePad: false },
            { slot: 2, pad: "A08", fromMotorIndex: 4, fromFreePad: false },
            { slot: 3, pad: "B11", fromMotorIndex: 5, fromFreePad: false },
            { slot: 4, pad: "B10", fromMotorIndex: 6, fromFreePad: false },
            { slot: 5, pad: "C08", fromMotorIndex: 7, fromFreePad: false },
            { slot: 6, pad: "C09", fromMotorIndex: 8, fromFreePad: false },
        ]);
    });

    it("emits CLI lines that end with save (release phase first, then assign)", () => {
        const motors = [
            { index: 1, pad: "B07", timer: null, channel: null, dmaStream: null, bidirBurst: false },
            { index: 2, pad: "B06", timer: null, channel: null, dmaStream: null, bidirBurst: false },
            { index: 3, pad: "B15", timer: null, channel: null, dmaStream: null, bidirBurst: false },
            { index: 4, pad: "A08", timer: null, channel: null, dmaStream: null, bidirBurst: false },
        ];
        const r = computeWingRemap(analysis(motors), { motorCount: 2 });
        // Release all motors first, then emit servo assignments, then save.
        // Order matters: BF's `resource SERVO 1 A08` would fail if A08 is
        // still bound as MOTOR 4, so releases must come first.
        expect(r.cliLines).toEqual([
            "resource MOTOR 3 NONE",
            "resource MOTOR 4 NONE",
            "resource SERVO 1 B15",
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
        expect(r.servosToAssign).toEqual([{ slot: 1, pad: "B06", fromMotorIndex: 2, fromFreePad: false }]);
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
            "resource MOTOR 4 NONE",
            // SERVO 1 not assigned to A11 — that pad is board-wired.
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

describe("computeWingRemap AIO mode", () => {
    const aioMotors = [
        { index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: { controller: 1, stream: 7 }, bidirBurst: false },
        { index: 2, pad: "B01", timer: 3, channel: 4, dmaStream: { controller: 1, stream: 2 }, bidirBurst: false },
        { index: 3, pad: "A03", timer: 2, channel: 4, dmaStream: { controller: 1, stream: 6 }, bidirBurst: false },
        { index: 4, pad: "A02", timer: 2, channel: 3, dmaStream: { controller: 1, stream: 1 }, bidirBurst: false },
    ];

    // FLYWOOF405S_AIO-ish free PWM pads: M5-M8 declared in TIMER_PIN_MAP
    // but not claimed by the quad mixer.
    const flywooFreePads = [
        { pad: "B05", timer: 1, channel: 2 },
        { pad: "B07", timer: 1, channel: 3 },
        { pad: "C09", timer: 8, channel: 4 },
        { pad: "C08", timer: 8, channel: 3 },
    ];

    it("AIO mode releases extra motors AND assigns servos to free PWM pads", () => {
        const r = computeWingRemap(analysis(aioMotors, { pwmCapableFreePads: flywooFreePads }), {
            motorCount: 2,
            boardWiring: "aio",
        });
        expect(r.isNoOp).toBe(false);
        expect(r.boardWiring).toBe("aio");
        expect(r.motorsToRelease.map((m) => m.index)).toEqual([3, 4]);
        // Servos come from free PWM pads, not from released motor pads.
        expect(r.servosToAssign).toEqual([
            { slot: 1, pad: "B05", fromMotorIndex: 3, fromFreePad: true },
            { slot: 2, pad: "B07", fromMotorIndex: 4, fromFreePad: true },
        ]);
        expect(r.cliLines).toEqual([
            "resource MOTOR 3 NONE",
            "resource MOTOR 4 NONE",
            "resource SERVO 1 B05",
            "resource SERVO 2 B07",
            "save",
        ]);
    });

    it("AIO mode warns when free PWM pad supply runs short", () => {
        // 4 extra motors but only 2 free PWM pads available.
        const extraMotors = [
            ...aioMotors,
            { index: 5, pad: "B05", timer: 1, channel: 2, dmaStream: null, bidirBurst: false },
            { index: 6, pad: "B07", timer: 1, channel: 3, dmaStream: null, bidirBurst: false },
        ];
        const twoFreePads = [
            { pad: "C09", timer: 8, channel: 4 },
            { pad: "C08", timer: 8, channel: 3 },
        ];
        const r = computeWingRemap(analysis(extraMotors, { pwmCapableFreePads: twoFreePads }), {
            motorCount: 2,
            boardWiring: "aio",
        });
        expect(r.servosToAssign.length).toBe(2);
        const shortage = r.warnings.find((w) => w.code === "aio_no_free_pwm_pad");
        expect(shortage).toBeDefined();
    });

    it("AIO mode with no free PWM pads still releases motors but creates no servos", () => {
        const r = computeWingRemap(analysis(aioMotors), { motorCount: 2, boardWiring: "aio" });
        expect(r.servosToAssign).toEqual([]);
        expect(r.cliLines).toEqual(["resource MOTOR 3 NONE", "resource MOTOR 4 NONE", "save"]);
        expect(r.warnings.some((w) => w.code === "aio_no_free_pwm_pad")).toBe(true);
    });

    it("discrete mode (default) still reassigns ex-motor pads as servos", () => {
        const r = computeWingRemap(analysis(aioMotors), { motorCount: 2 });
        expect(r.boardWiring).toBe("discrete");
        expect(r.servosToAssign.length).toBe(2);
        expect(r.cliLines).toContain("resource SERVO 1 A03");
        // fromFreePad should be false for the discrete path
        expect(r.servosToAssign[0].fromFreePad).toBe(false);
    });

    it("AIO no-op (board has exactly N motors) still reports boardWiring", () => {
        const r = computeWingRemap(analysis(aioMotors.slice(0, 2)), { motorCount: 2, boardWiring: "aio" });
        expect(r.isNoOp).toBe(true);
        expect(r.boardWiring).toBe("aio");
    });
});

describe("computeWingRemap LED_STRIP release option", () => {
    const aioMotors = [
        { index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true },
        { index: 2, pad: "B01", timer: 3, channel: 4, dmaStream: null, bidirBurst: true },
        { index: 3, pad: "A03", timer: 2, channel: 4, dmaStream: null, bidirBurst: false },
        { index: 4, pad: "A02", timer: 2, channel: 3, dmaStream: null, bidirBurst: false },
    ];

    it("adds LED_STRIP release line before servo assignments when opted in", () => {
        const r = computeWingRemap(
            analysis(aioMotors, { ledStrips: [{ pad: "A09", timer: 1, channel: 2, dmaStream: null }] }),
            { motorCount: 2, boardWiring: "aio", releaseLedStrip: true },
        );
        // Expect LED_STRIP release to land between the MOTOR releases
        // and the SERVO assignments (BF can't bind SERVO X to a pad
        // still claimed by LED_STRIP).
        expect(r.cliLines).toEqual([
            "resource MOTOR 3 NONE",
            "resource MOTOR 4 NONE",
            "resource LED_STRIP 1 NONE",
            "resource SERVO 1 A09",
            "save",
        ]);
        // Only one ex-motor released + LED_STRIP pad available → 1 servo.
        // The other motor release has no candidate pad; shortage warning.
        expect(r.warnings.some((w) => w.code === "aio_no_free_pwm_pad")).toBe(true);
    });

    it("AIO mode: LED_STRIP pad takes PRIORITY over declared-unclaimed PWM pads", () => {
        // On AIOs the LED_STRIP pad is far more reliably broken out than
        // the M5-M8 declared-but-unclaimed pads, so when the user opts
        // in to LED_STRIP release we want it picked FIRST.
        const r = computeWingRemap(
            analysis(aioMotors, {
                ledStrips: [{ pad: "A09", timer: 1, channel: 2, dmaStream: null }],
                pwmCapableFreePads: [{ pad: "B05", timer: 1, channel: 3 }],
            }),
            { motorCount: 2, boardWiring: "aio", releaseLedStrip: true },
        );
        // Expect A09 (LED_STRIP) as SERVO 1, B05 (M5 declared pad) as SERVO 2.
        expect(r.servosToAssign.map((s) => s.pad)).toEqual(["A09", "B05"]);
        expect(r.cliLines).toContain("resource LED_STRIP 1 NONE");
    });

    it("discrete mode: LED_STRIP gets appended (motor pads are primary)", () => {
        // In discrete mode motor pads are the primary servo source, so
        // LED_STRIP shouldn't displace them — it just adds headroom on
        // the end if needed.
        const fourMotors = [
            { index: 1, pad: "B07", timer: null, channel: null, dmaStream: null, bidirBurst: false },
            { index: 2, pad: "B06", timer: null, channel: null, dmaStream: null, bidirBurst: false },
            { index: 3, pad: "B15", timer: null, channel: null, dmaStream: null, bidirBurst: false },
            { index: 4, pad: "A08", timer: null, channel: null, dmaStream: null, bidirBurst: false },
        ];
        const r = computeWingRemap(
            analysis(fourMotors, { ledStrips: [{ pad: "A09", timer: 1, channel: 2, dmaStream: null }] }),
            { motorCount: 2, releaseLedStrip: true },
        );
        // Discrete mode reuses motor pads, so LED_STRIP doesn't get used
        // unless the motor pool is exhausted. Servos = ex-motor pads.
        expect(r.servosToAssign.map((s) => s.pad)).toEqual(["B15", "A08"]);
    });

    it("warns when LED_STRIP release is on but no LED_STRIP is bound", () => {
        const r = computeWingRemap(analysis(aioMotors, { ledStrips: [] }), {
            motorCount: 2,
            boardWiring: "aio",
            releaseLedStrip: true,
        });
        const w = r.warnings.find((x) => x.code === "led_strip_not_present");
        expect(w).toBeDefined();
        expect(r.cliLines).not.toContain("resource LED_STRIP 1 NONE");
    });

    it("LED_STRIP option is ignored by default (user must opt in)", () => {
        const r = computeWingRemap(
            analysis(aioMotors, {
                ledStrips: [{ pad: "A09", timer: 1, channel: 2, dmaStream: null }],
                pwmCapableFreePads: [{ pad: "B05", timer: 1, channel: 3 }],
            }),
            { motorCount: 2, boardWiring: "aio" }, // no releaseLedStrip
        );
        expect(r.cliLines).not.toContain("resource LED_STRIP 1 NONE");
        // servo 1 uses the PWM free pad, not LED_STRIP
        expect(r.servosToAssign.map((s) => s.pad)).toEqual(["B05"]);
    });
});

describe("computeWingRemap UART release option", () => {
    const aioMotors = [
        { index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true },
        { index: 2, pad: "B01", timer: 3, channel: 4, dmaStream: null, bidirBurst: true },
        { index: 3, pad: "A03", timer: 2, channel: 4, dmaStream: null, bidirBurst: false },
        { index: 4, pad: "A02", timer: 2, channel: 3, dmaStream: null, bidirBurst: false },
    ];

    it("releases UART resources and adds their PWM-capable pads to candidate pool", () => {
        const r = computeWingRemap(
            analysis(aioMotors, {
                spareUarts: [
                    { index: 3, txPad: "B10", rxPad: null }, // only TX is PWM-capable
                    { index: 5, txPad: "C12", rxPad: "D02" },
                ],
            }),
            { motorCount: 2, boardWiring: "aio", releaseUarts: [3, 5] },
        );
        // Three released UART pads (UART3 TX, UART5 TX, UART5 RX) get
        // prepended to candidate pool in AIO mode. Motor releases consume
        // the first 2 candidates: B10, C12.
        expect(r.servosToAssign.map((s) => s.pad)).toEqual(["B10", "C12"]);
        // Verify CLI sequence releases UART resources before binding SERVOs.
        expect(r.cliLines).toContain("resource SERIAL_TX 3 NONE");
        expect(r.cliLines).toContain("resource SERIAL_TX 5 NONE");
        expect(r.cliLines).toContain("resource SERIAL_RX 5 NONE");
    });

    it("warns when a requested UART has no spare/PWM-capable pad", () => {
        const r = computeWingRemap(
            analysis(aioMotors, { spareUarts: [{ index: 3, txPad: "B10", rxPad: null }] }),
            { motorCount: 2, boardWiring: "aio", releaseUarts: [3, 6] }, // UART6 not in spareUarts
        );
        const w = r.warnings.find((x) => x.code === "uart_not_releasable");
        expect(w).toBeDefined();
        expect(w.message).toMatch(/UART6/);
    });

    it("UART release combines with LED_STRIP release (both prepended in AIO)", () => {
        const r = computeWingRemap(
            analysis(aioMotors, {
                ledStrips: [{ pad: "A09", timer: 1, channel: 2, dmaStream: null }],
                spareUarts: [{ index: 3, txPad: "B10", rxPad: null }],
            }),
            { motorCount: 2, boardWiring: "aio", releaseLedStrip: true, releaseUarts: [3] },
        );
        // Both LED_STRIP (A09) and UART3 TX (B10) prepend; LED_STRIP first.
        // 2 motor releases pick from the front: A09, B10.
        expect(r.servosToAssign.map((s) => s.pad)).toEqual(["A09", "B10"]);
        expect(r.cliLines).toContain("resource LED_STRIP 1 NONE");
        expect(r.cliLines).toContain("resource SERIAL_TX 3 NONE");
    });
});
