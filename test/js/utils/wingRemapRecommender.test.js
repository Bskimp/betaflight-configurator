import { describe, it, expect } from "vitest";
import { candidatePadsForSlot, computePresetResourcePlan } from "../../../src/js/utils/wingRemapRecommender.js";

// Minimal analyzer shape used across the suite — same shape analyzer returns.
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

describe("candidatePadsForSlot", () => {
    it("returns an empty list when analysis is null", () => {
        expect(candidatePadsForSlot(null, 2)).toEqual([]);
    });

    it("ranks currentPad first (zero-churn) when still safe", () => {
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            servos: [{ index: 2, pad: "B01", timer: 3, channel: 4 }],
            pwmCapableFreePads: [
                { pad: "A02", timer: 2, channel: 3 },
                { pad: "A03", timer: 2, channel: 4 },
            ],
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1], currentPad: "B01" });
        expect(cands[0].pad).toBe("B01");
        expect(cands[0].source).toBe("existing");
        expect(cands[0].requiresRelease).toEqual([]);
    });

    it("ranks free-PWM pads with no motor-timer conflict above conflicting ones", () => {
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            pwmCapableFreePads: [
                { pad: "A02", timer: 3, channel: 1 }, // conflicts with motor timer 3
                { pad: "A03", timer: 2, channel: 4 }, // safe
                { pad: "B10", timer: 2, channel: 3 }, // safe
            ],
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1] });
        // Non-conflict free-pwm first (A03, B10), then conflict (A02).
        expect(cands.map((c) => c.pad)).toEqual(["A03", "B10", "A02"]);
        expect(cands[0].sharesTimerWithMotor).toBe(false);
        expect(cands[2].sharesTimerWithMotor).toBe(true);
    });

    it("includes releasable-motor pads with a requiresRelease hint", () => {
        const a = analysis([
            { index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true },
            { index: 2, pad: "B01", timer: 3, channel: 4, dmaStream: null, bidirBurst: true },
        ]);
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1] });
        const motorRelease = cands.find((c) => c.source === "motor-release");
        expect(motorRelease).toBeDefined();
        expect(motorRelease.pad).toBe("B01");
        expect(motorRelease.requiresRelease).toEqual(["resource MOTOR 2 NONE"]);
    });

    it("excludes LED_STRIP and unopted UART pads by default", () => {
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            ledStrips: [{ pad: "A09", timer: 1, channel: 2, dmaStream: { controller: 2, stream: 6 } }],
            serials: [{ index: 3, txPad: "B10", rxPad: null, txDma: null, rxDma: null }],
            spareUarts: [{ index: 3, txPad: "B10", rxPad: null }],
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1] });
        expect(cands.map((c) => c.pad)).not.toContain("A09");
        expect(cands.map((c) => c.pad)).not.toContain("B10");
    });

    it("exposes LED_STRIP pad with release hint when allowLedStrip is true", () => {
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            ledStrips: [{ pad: "A09", timer: 1, channel: 2, dmaStream: { controller: 2, stream: 6 } }],
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1], allowLedStrip: true });
        const led = cands.find((c) => c.source === "led-strip");
        expect(led).toBeDefined();
        expect(led.pad).toBe("A09");
        expect(led.requiresRelease).toEqual(["resource LED_STRIP 1 NONE"]);
    });

    it("exposes UART TX/RX pads with release hints when allowUartRelease lists that UART", () => {
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            serials: [{ index: 3, txPad: "B10", rxPad: "B11", txDma: null, rxDma: null }],
            spareUarts: [{ index: 3, txPad: "B10", rxPad: "B11" }],
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1], allowUartRelease: [3] });
        const tx = cands.find((c) => c.pad === "B10");
        const rx = cands.find((c) => c.pad === "B11");
        expect(tx.source).toBe("uart-release");
        expect(tx.requiresRelease).toEqual(["resource SERIAL_TX 3 NONE"]);
        expect(rx.requiresRelease).toEqual(["resource SERIAL_RX 3 NONE"]);
    });

    it("filters out pads claimed by another SERVO (collision defense)", () => {
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            servos: [{ index: 1, pad: "B01", timer: 3, channel: 4 }],
            pwmCapableFreePads: [
                { pad: "B01", timer: 3, channel: 4 }, // stale — already SERVO 1
                { pad: "A02", timer: 2, channel: 3 },
            ],
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1] });
        expect(cands.map((c) => c.pad)).not.toContain("B01");
        expect(cands.map((c) => c.pad)).toContain("A02");
    });

    it("filters out pads claimed by an in-use motor (can't steal an active motor pad)", () => {
        const a = analysis(
            [
                { index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true },
                { index: 2, pad: "B01", timer: 3, channel: 4, dmaStream: null, bidirBurst: true },
            ],
            {
                pwmCapableFreePads: [{ pad: "A02", timer: 2, channel: 3 }],
            },
        );
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1, 2] });
        expect(cands.map((c) => c.pad)).not.toContain("B00");
        expect(cands.map((c) => c.pad)).not.toContain("B01");
        expect(cands.map((c) => c.pad)).toContain("A02");
    });

    it("filters out hardware-fixed pads (SPI_SCK, GYRO_CS, BEEPER, etc.)", () => {
        const a = analysis([{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }], {
            pwmCapableFreePads: [
                { pad: "A05", timer: 2, channel: 1 },
                { pad: "C13", timer: 1, channel: 1 },
            ],
            hardwareFixedPads: [{ pad: "C13", peripheral: "BEEPER", index: 1 }],
        });
        const cands = candidatePadsForSlot(a, 2, { motorIndicesInUse: [1] });
        expect(cands.map((c) => c.pad)).not.toContain("C13");
        expect(cands.map((c) => c.pad)).toContain("A05");
    });

    it("combined ranking: existing → motor-release → free-pwm → LED → UART", () => {
        const a = analysis(
            [
                { index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true },
                { index: 2, pad: "B04", timer: 3, channel: 2, dmaStream: null, bidirBurst: true },
            ],
            {
                servos: [{ index: 2, pad: "B07", timer: 4, channel: 2 }],
                pwmCapableFreePads: [{ pad: "A03", timer: 2, channel: 4 }],
                ledStrips: [{ pad: "A09", timer: 1, channel: 2, dmaStream: null }],
                serials: [{ index: 3, txPad: "B10", rxPad: null, txDma: null, rxDma: null }],
                spareUarts: [{ index: 3, txPad: "B10", rxPad: null }],
            },
        );
        const cands = candidatePadsForSlot(a, 2, {
            motorIndicesInUse: [1],
            currentPad: "B07",
            allowLedStrip: true,
            allowUartRelease: [3],
        });
        expect(cands.map((c) => c.source)).toEqual([
            "existing", // B07
            "motor-release", // B04 (M2 not in use) — preferred to keep silkscreen labels intuitive
            "free-pwm", // A03
            "led-strip", // A09
            "uart-release", // B10
        ]);
    });
});

// Plane preset fixtures — same shape planePresets.js exports.
const _FLYING_WING = {
    mmix: [{ throttle: 1.0, roll: 0, pitch: 0, yaw: 0 }],
    rules: [
        { target: 3 /* FLAPPERON_L → SERVO 2 */, input: 0, rate: 50 },
        { target: 3, input: 1, rate: 50 },
        { target: 4 /* FLAPPERON_R → SERVO 3 */, input: 0, rate: -50 },
        { target: 4, input: 1, rate: 50 },
    ],
};
const _STANDARD_PLANE = {
    mmix: [{ throttle: 1.0, roll: 0, pitch: 0, yaw: 0 }],
    rules: [
        { target: 2 /* ELEVATOR → SERVO 1 */, input: 1, rate: 100 },
        { target: 3, input: 0, rate: 100 },
        { target: 4, input: 0, rate: -100 },
        { target: 5 /* RUDDER → SERVO 4 */, input: 2, rate: 100 },
    ],
};
const _DIFF_THRUST = {
    mmix: [
        { throttle: 1.0, roll: 0, pitch: 0, yaw: 0.4 },
        { throttle: 1.0, roll: 0, pitch: 0, yaw: -0.4 },
    ],
    rules: [
        { target: 3, input: 0, rate: 50 },
        { target: 3, input: 1, rate: 50 },
        { target: 4, input: 0, rate: -50 },
        { target: 4, input: 1, rate: 50 },
    ],
};

describe("computePresetResourcePlan", () => {
    it("Flying Wing on stock 8-motor FLYWOOF: releases M2-M8, binds only SERVO 2+3 (no orphan SERVO 1)", () => {
        const motors = ["B00", "B01", "A03", "A02", "B05", "B07", "C09", "C08"].map((pad, i) => ({
            index: i + 1,
            pad,
            timer: null,
            channel: null,
            dmaStream: null,
            bidirBurst: false,
        }));
        const plan = computePresetResourcePlan(analysis(motors), _FLYING_WING);

        expect(plan.usedMotorIndices).toEqual([1]);
        expect(plan.usedServoIndices).toEqual([2, 3]);

        expect(plan.motorsToRelease.map((m) => m.index)).toEqual([2, 3, 4, 5, 6, 7, 8]);
        expect(plan.servosToRelease).toEqual([]);

        const servoBinds = plan.cliLines.filter((l) => /^resource SERVO /.test(l));
        expect(servoBinds).toHaveLength(2);
        expect(servoBinds[0]).toBe("resource SERVO 2 B01");
        expect(servoBinds[1]).toBe("resource SERVO 3 A03");
    });

    it("Flying Wing on already-correct wing board: zero CLI lines (true no-op)", () => {
        const a = analysis([{ index: 1, pad: "B07", timer: 4, channel: 2, dmaStream: null, bidirBurst: true }], {
            servos: [
                { index: 2, pad: "B15", timer: 3, channel: 1 },
                { index: 3, pad: "A08", timer: 1, channel: 1 },
            ],
        });
        const plan = computePresetResourcePlan(a, _FLYING_WING);
        expect(plan.cliLines).toEqual([]);
    });

    it("Flying Wing from bad state (orphan SERVO 1 bound): cleans up SERVO 1, keeps S2+S3", () => {
        const a = analysis([{ index: 1, pad: "B07", timer: 4, channel: 2, dmaStream: null, bidirBurst: true }], {
            servos: [
                { index: 1, pad: "B00", timer: 3, channel: 3 },
                { index: 2, pad: "B01", timer: 3, channel: 4 },
                { index: 3, pad: "A03", timer: 2, channel: 4 },
            ],
        });
        const plan = computePresetResourcePlan(a, _FLYING_WING);
        expect(plan.cliLines).toContain("resource SERVO 1 NONE");
        const servoBinds = plan.cliLines.filter((l) => /^resource SERVO \d+ [A-Z]\d/.test(l));
        expect(servoBinds).toEqual([]);
    });

    it("Standard Plane: 4 SERVOs (1-4), usedMotorIndices = [1]", () => {
        const motors = ["B00", "B01", "A03", "A02"].map((pad, i) => ({
            index: i + 1,
            pad,
            timer: null,
            channel: null,
            dmaStream: null,
            bidirBurst: false,
        }));
        const plan = computePresetResourcePlan(analysis(motors), _STANDARD_PLANE);
        expect(plan.usedServoIndices).toEqual([1, 2, 3, 4]);
        // Only 3 motors releasable (M2, M3, M4) — 4th servo (S4) has no pad.
        const servoBinds = plan.cliLines.filter((l) => /^resource SERVO \d+ [A-Z]\d/.test(l));
        expect(servoBinds).toHaveLength(3);
        expect(plan.warnings.some((w) => w.code === "no_pad_for_slot")).toBe(true);
    });

    it("Diff-thrust: usedMotorIndices = [1,2], motors 3-8 released, 2 SERVO binds", () => {
        const motors = ["B00", "B01", "A03", "A02", "B05", "B07", "C09", "C08"].map((pad, i) => ({
            index: i + 1,
            pad,
            timer: null,
            channel: null,
            dmaStream: null,
            bidirBurst: false,
        }));
        const plan = computePresetResourcePlan(analysis(motors), _DIFF_THRUST);
        expect(plan.usedMotorIndices).toEqual([1, 2]);
        expect(plan.usedServoIndices).toEqual([2, 3]);
        expect(plan.motorsToRelease.map((m) => m.index)).toEqual([3, 4, 5, 6, 7, 8]);
        const servoBinds = plan.cliLines.filter((l) => /^resource SERVO \d+ [A-Z]\d/.test(l));
        expect(servoBinds).toHaveLength(2);
    });

    it("user override: picks.servoIndex replaces the top-ranked candidate", () => {
        const motors = ["B00", "B01", "A03", "A02"].map((pad, i) => ({
            index: i + 1,
            pad,
            timer: null,
            channel: null,
            dmaStream: null,
            bidirBurst: false,
        }));
        const plan = computePresetResourcePlan(analysis(motors), _FLYING_WING, {
            picks: { 2: "A03" },
        });
        const servoBinds = plan.cliLines.filter((l) => /^resource SERVO /.test(l));
        expect(servoBinds[0]).toBe("resource SERVO 2 A03");
        expect(servoBinds[1]).toMatch(/^resource SERVO 3 (?!A03)/);
    });

    it("diff-thrust after Flying Wing: binds MOTOR 2 from free PWM pool instead of leaving it orphaned", () => {
        const a = analysis([{ index: 1, pad: "A03", timer: 2, channel: 4, dmaStream: null, bidirBurst: true }], {
            servos: [
                { index: 2, pad: "B01", timer: 3, channel: 4 },
                { index: 3, pad: "A02", timer: 2, channel: 3 },
            ],
            pwmCapableFreePads: [
                { pad: "B04", timer: 3, channel: 1 },
                { pad: "B05", timer: 3, channel: 2 },
            ],
        });
        const plan = computePresetResourcePlan(a, _DIFF_THRUST);
        expect(plan.usedMotorIndices).toEqual([1, 2]);
        expect(plan.motorPicks.has(2)).toBe(true);
        const motorBinds = plan.cliLines.filter((l) => /^resource MOTOR \d+ [A-Z]\d/.test(l));
        expect(motorBinds).toHaveLength(1);
        expect(motorBinds[0]).toMatch(/^resource MOTOR 2 /);
        const motor2Pad = motorBinds[0].split(" ").pop();
        expect(["B01", "A02"]).not.toContain(motor2Pad);
    });

    it("warns and skips MOTOR bind when no free PWM pad is available", () => {
        const a = analysis([{ index: 1, pad: "A03", timer: 2, channel: 4, dmaStream: null, bidirBurst: true }], {
            servos: [
                { index: 2, pad: "B01", timer: 3, channel: 4 },
                { index: 3, pad: "A02", timer: 2, channel: 3 },
            ],
            pwmCapableFreePads: [],
        });
        const plan = computePresetResourcePlan(a, _DIFF_THRUST);
        expect(plan.warnings.some((w) => w.code === "no_pad_for_motor")).toBe(true);
        const motorBinds = plan.cliLines.filter((l) => /^resource MOTOR \d+ [A-Z]\d/.test(l));
        expect(motorBinds).toEqual([]);
    });

    it("honors allowLedStrip / allowUartRelease options (release lines precede binds)", () => {
        const a = analysis(
            [
                { index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: false },
                { index: 2, pad: "B01", timer: 3, channel: 4, dmaStream: null, bidirBurst: false },
            ],
            {
                ledStrips: [{ pad: "A09", timer: 1, channel: 2, dmaStream: null }],
                serials: [{ index: 3, txPad: "B10", rxPad: null, txDma: null, rxDma: null }],
                spareUarts: [{ index: 3, txPad: "B10", rxPad: null }],
                pwmCapableFreePads: [],
            },
        );
        const plan = computePresetResourcePlan(a, _FLYING_WING, {
            allowLedStrip: true,
            allowUartRelease: [3],
        });
        expect(plan.cliLines).toContain("resource LED_STRIP 1 NONE");
        const ledIdx = plan.cliLines.indexOf("resource LED_STRIP 1 NONE");
        const s3Idx = plan.cliLines.findIndex((l) => /^resource SERVO 3 /.test(l));
        expect(ledIdx).toBeLessThan(s3Idx);
    });
});
