import { describe, it, expect } from "vitest";
import {
    candidatePadsForSlot,
    computePresetResourcePlan,
    pickOptimalPadLayout,
} from "../../../src/js/utils/wingRemapRecommender.js";

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

        // Filter for bind-style lines only (`resource SERVO N PAD`, not NONE) —
        // defensive-release prefix emits `resource SERVO N NONE` for unused
        // slots, so a loose `/^resource SERVO /` would capture those too.
        const servoBinds = plan.cliLines.filter((l) => /^resource SERVO \d+ [A-Z]\d/.test(l));
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
        const servoBinds = plan.cliLines.filter((l) => /^resource SERVO \d+ [A-Z]\d/.test(l));
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

describe("computePresetResourcePlan: effectiveRules override", () => {
    // Simulates the user having picked Flying Wing then added an extra
    // Rudder rule (SERVO 5) via the Function→Output Mapping editor.
    it("adds rows for SERVO indices the user appended to the rule editor", () => {
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            pwmCapableFreePads: [
                { pad: "A02", timer: 2, channel: 3 },
                { pad: "A03", timer: 2, channel: 4 },
                { pad: "B10", timer: 2, channel: 2 },
            ],
        });
        const effectiveRules = [..._FLYING_WING.rules, { target: 6 /* RUDDER → SERVO 5 */, input: 2, rate: 100 }];
        const plan = computePresetResourcePlan(a, _FLYING_WING, { effectiveRules });
        expect(plan.usedServoIndices).toEqual([2, 3, 5]);
        expect(plan.cliLines.some((l) => /^resource SERVO 5 /.test(l))).toBe(true);
    });

    it("drops SERVO rows when the user removed the preset rule", () => {
        // Flying Wing without its right-elevon rule — only SERVO 2 remains.
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            pwmCapableFreePads: [{ pad: "A02", timer: 2, channel: 3 }],
        });
        const effectiveRules = _FLYING_WING.rules.filter((r) => r.target !== 4);
        const plan = computePresetResourcePlan(a, _FLYING_WING, { effectiveRules });
        expect(plan.usedServoIndices).toEqual([2]);
        // Defensive prefix now emits `resource SERVO 3 NONE` — that's expected.
        // The real assertion is that no *bind* line targets SERVO 3.
        expect(plan.cliLines.some((l) => /^resource SERVO 3 [A-Z]\d/.test(l))).toBe(false);
    });

    it("filters rate=0 rules (editor placeholder / deletion marker)", () => {
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            pwmCapableFreePads: [
                { pad: "A02", timer: 2, channel: 3 },
                { pad: "A03", timer: 2, channel: 4 },
            ],
        });
        const effectiveRules = [
            ..._FLYING_WING.rules,
            { target: 6 /* SERVO 5 */, input: 2, rate: 0 }, // placeholder — should not appear
        ];
        const plan = computePresetResourcePlan(a, _FLYING_WING, { effectiveRules });
        expect(plan.usedServoIndices).toEqual([2, 3]);
    });

    it("falls through to preset.rules when effectiveRules is not passed", () => {
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            pwmCapableFreePads: [
                { pad: "A02", timer: 2, channel: 3 },
                { pad: "A03", timer: 2, channel: 4 },
            ],
        });
        const plan = computePresetResourcePlan(a, _FLYING_WING);
        expect(plan.usedServoIndices).toEqual([2, 3]);
    });
});

describe("computePresetResourcePlan: motorCount override", () => {
    // Single-motor preset (Flying Wing) bumped to 2 motors via the
    // diff-thrust toggle on the Mixer tab. MOTOR 2 should get claimed.
    it("expands usedMotorIndices when motorCount bumps a single-motor preset to 2", () => {
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            pwmCapableFreePads: [
                { pad: "A02", timer: 2, channel: 3 },
                { pad: "A03", timer: 2, channel: 4 },
                { pad: "B10", timer: 2, channel: 2 },
            ],
        });
        const plan = computePresetResourcePlan(a, _FLYING_WING, { motorCount: 2 });
        expect(plan.usedMotorIndices).toEqual([1, 2]);
        // MOTOR 2 had no existing binding, so a bind line is emitted.
        expect(plan.cliLines.some((l) => /^resource MOTOR 2 /.test(l))).toBe(true);
    });

    // Two-motor preset run with motorCount=1 — MOTOR 2 gets released.
    // Supports the inverse toggle (switch diff-thrust preset down to
    // single-motor) without requiring a distinct preset entry.
    it("shrinks usedMotorIndices + releases extras when motorCount downgrades", () => {
        const motors = [
            { index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true },
            { index: 2, pad: "B01", timer: 3, channel: 4, dmaStream: null, bidirBurst: true },
        ];
        const a = analysis(motors, {
            pwmCapableFreePads: [{ pad: "A02", timer: 2, channel: 3 }],
        });
        const plan = computePresetResourcePlan(a, _DIFF_THRUST, { motorCount: 1 });
        expect(plan.usedMotorIndices).toEqual([1]);
        expect(plan.motorsToRelease.map((m) => m.index)).toContain(2);
        expect(plan.cliLines).toContain("resource MOTOR 2 NONE");
    });

    it("falls through to preset.mmix.length when motorCount is not passed", () => {
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            pwmCapableFreePads: [
                { pad: "A02", timer: 2, channel: 3 },
                { pad: "A03", timer: 2, channel: 4 },
            ],
        });
        const plan = computePresetResourcePlan(a, _FLYING_WING);
        expect(plan.usedMotorIndices).toEqual([1]);
    });

    it("ignores motorCount values of 0 or negative (falls back to preset.mmix.length)", () => {
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            pwmCapableFreePads: [{ pad: "A02", timer: 2, channel: 3 }],
        });
        const plan = computePresetResourcePlan(a, _FLYING_WING, { motorCount: 0 });
        expect(plan.usedMotorIndices).toEqual([1]);
    });
});

// ─────────────────────────────────────────────────────────────────
// pickOptimalPadLayout — the joint motor+servo silkscreen-pool picker
// ─────────────────────────────────────────────────────────────────

// FLYWOOF405NANO-shaped fixture (real-ish timer layout): M1-M4+M7 on
// TIM3 (quad ESC convention), M6+M8 on TIM8, M5 on TIM3 too. Plus the
// LED pad on TIM1. Exercises the "can't put MOTOR 2 on silkscreen M2
// without blocking TIM3 for servos" scenario from bench testing.
const FLYWOOF_PAD_TIMERS = new Map([
    ["B00", { timer: 3, channel: 3 }], // M1
    ["B01", { timer: 3, channel: 4 }], // M2
    ["A03", { timer: 2, channel: 4 }], // M3
    ["A02", { timer: 2, channel: 3 }], // M4
    ["B05", { timer: 3, channel: 2 }], // M5
    ["C09", { timer: 8, channel: 4 }], // M6
    ["B04", { timer: 3, channel: 1 }], // M7
    ["C08", { timer: 8, channel: 3 }], // M8
    ["A09", { timer: 1, channel: 2 }], // LED_STRIP
]);

const FLYWOOF_PAD_DEFAULTS = {
    target: "FLYWOOF405NANO",
    source: "firmware",
    motors: [
        { index: 1, pad: "B00" },
        { index: 2, pad: "B01" },
        { index: 3, pad: "A03" },
        { index: 4, pad: "A02" },
        { index: 5, pad: "B05" },
        { index: 6, pad: "C09" },
        { index: 7, pad: "B04" },
        { index: 8, pad: "C08" },
    ],
    ledStrips: [{ pad: "A09" }],
};

describe("pickOptimalPadLayout", () => {
    it("returns null when padDefaults is missing", () => {
        const a = analysis([], { padTimers: FLYWOOF_PAD_TIMERS });
        expect(pickOptimalPadLayout(a, 2, [2, 3], {})).toBeNull();
    });

    it("returns null when padTimers is absent (analyzer built without timerDump)", () => {
        const a = analysis([], {});
        expect(pickOptimalPadLayout(a, 2, [2, 3], { padDefaults: FLYWOOF_PAD_DEFAULTS })).toBeNull();
    });

    it("returns null when the pool can't fit motorCount + servoCount", () => {
        const tinyDefaults = {
            target: "TINY",
            motors: [
                { index: 1, pad: "B00" },
                { index: 2, pad: "B01" },
            ],
            ledStrips: [],
        };
        const a = analysis([], {
            padTimers: new Map([
                ["B00", { timer: 3, channel: 3 }],
                ["B01", { timer: 3, channel: 4 }],
            ]),
        });
        expect(pickOptimalPadLayout(a, 2, [2, 3, 4], { padDefaults: tinyDefaults })).toBeNull();
    });

    it("relocates MOTOR 2 off TIM3 so 4 servos can fit timer-safely on FLYWOOF405NANO", () => {
        // Standard-plane on a 2-motor wing: 2 motors + 4 servos. The
        // silkscreen-first heuristic would put both motors on TIM3
        // (B00+B01), leaving only 3 TIM-disjoint pool pads (A03/A02/C09)
        // for 4 servos → can't fit. Optimizer must relocate motors to
        // free TIM3.
        const a = analysis([], { padTimers: FLYWOOF_PAD_TIMERS });
        const result = pickOptimalPadLayout(a, 2, [1, 2, 3, 4], {
            padDefaults: FLYWOOF_PAD_DEFAULTS,
        });
        expect(result).not.toBeNull();
        expect(result.motors.size).toBe(2);
        expect(result.servos.size).toBe(4);
        // Every servo must be on a timer disjoint from every motor.
        const motorTimers = new Set([...result.motors.values()].map((pad) => FLYWOOF_PAD_TIMERS.get(pad).timer));
        for (const servoPad of result.servos.values()) {
            const st = FLYWOOF_PAD_TIMERS.get(servoPad).timer;
            expect(motorTimers.has(st)).toBe(false);
        }
    });

    it("preserves silkscreen convention when no timer conflict forces relocation (1M + 2S)", () => {
        // Flying Wing: 1 motor + 2 servos. Putting M1 on silkscreen M1
        // (B00, TIM3) leaves TIM2/TIM8 free — plenty of room for SERVO
        // 2+3 on silkscreen M3+M4. No reason to relocate.
        const a = analysis([], { padTimers: FLYWOOF_PAD_TIMERS });
        const result = pickOptimalPadLayout(a, 1, [2, 3], {
            padDefaults: FLYWOOF_PAD_DEFAULTS,
        });
        expect(result).not.toBeNull();
        expect(result.motors.get(1)).toBe("B00"); // silkscreen M1 preserved
    });

    it("includes LED_STRIP pad in pool when allowLedStrip=true", () => {
        // Contrived: all 8 MOTOR silkscreen pads share TIM3 so the only
        // way to place even 1 servo is to steal LED's TIM1 pad.
        const allTim3 = new Map();
        for (let i = 0; i < 8; i++) {
            allTim3.set(`B0${i}`, { timer: 3, channel: (i % 4) + 1 });
        }
        allTim3.set("A09", { timer: 1, channel: 2 });
        const defaults = {
            target: "FAKE",
            motors: Array.from({ length: 8 }, (_, i) => ({ index: i + 1, pad: `B0${i}` })),
            ledStrips: [{ pad: "A09" }],
        };
        const a = analysis([], { padTimers: allTim3 });
        const resultNoLed = pickOptimalPadLayout(a, 1, [2], { padDefaults: defaults, allowLedStrip: false });
        expect(resultNoLed).toBeNull();
        const resultWithLed = pickOptimalPadLayout(a, 1, [2], { padDefaults: defaults, allowLedStrip: true });
        expect(resultWithLed).not.toBeNull();
        expect(resultWithLed.servos.get(2)).toBe("A09");
    });

    it("keeps motors on their current (non-silkscreen) pads when that layout is already timer-safe (zero-churn)", () => {
        // Bench regression (2026-04-22): user had motors at A03+A02
        // (silkscreen M3+M4, both on TIM2) + servos at B05/B04/C09/C08
        // (TIM3+TIM8). Layout is valid — no timer conflict. Optimizer
        // used to force motors onto silkscreen M1+M2 (B00+B01, TIM3),
        // cascading a full resource re-shuffle. Zero-churn bonus MUST
        // keep the current layout.
        const a = analysis(
            [
                { index: 1, pad: "A03", timer: 2, channel: 4, dmaStream: null, bidirBurst: false },
                { index: 2, pad: "A02", timer: 2, channel: 3, dmaStream: null, bidirBurst: false },
            ],
            {
                servos: [
                    { index: 1, pad: "B05", timer: 3, channel: 2 },
                    { index: 2, pad: "B04", timer: 3, channel: 1 },
                    { index: 3, pad: "C09", timer: 8, channel: 4 },
                    { index: 4, pad: "C08", timer: 8, channel: 3 },
                ],
                padTimers: FLYWOOF_PAD_TIMERS,
            },
        );
        const result = pickOptimalPadLayout(a, 2, [1, 2, 3, 4], {
            padDefaults: FLYWOOF_PAD_DEFAULTS,
        });
        expect(result).not.toBeNull();
        // Motors stay put.
        expect(result.motors.get(1)).toBe("A03");
        expect(result.motors.get(2)).toBe("A02");
        // Servos stay put.
        expect(result.servos.get(1)).toBe("B05");
        expect(result.servos.get(2)).toBe("B04");
        expect(result.servos.get(3)).toBe("C09");
        expect(result.servos.get(4)).toBe("C08");
    });

    it("prefers silkscreen M1 for motor 1 among equally-scoring placements", () => {
        // 1M + 1S layout with TIM2 and TIM3 both holding only one M pad
        // each. Either would be a valid motor pick (same servo count
        // either way). Silkscreen-preservation tiebreaker should pick
        // M1 → silkscreen M1 (B00), leaving M3 (A03) for the servo.
        const padTimers = new Map([
            ["B00", { timer: 3, channel: 3 }],
            ["A03", { timer: 2, channel: 4 }],
        ]);
        const defaults = {
            target: "TWO_PAD",
            motors: [
                { index: 1, pad: "B00" },
                { index: 3, pad: "A03" },
            ],
            ledStrips: [],
        };
        const a = analysis([], { padTimers });
        const result = pickOptimalPadLayout(a, 1, [2], { padDefaults: defaults });
        expect(result.motors.get(1)).toBe("B00");
        expect(result.servos.get(2)).toBe("A03");
    });
});

describe("computePresetResourcePlan: optimizer integration", () => {
    it("emits a servo bind on a TIM-disjoint silkscreen pad when all M pads share a timer with motors", () => {
        // Regression for the FLYWOOF405NANO bench case: standard_plane
        // with 2 motors + 4 servos used to end up with SERVO 3 landing
        // on a free-PWM pad *outside* the silkscreen pool (B07) because
        // silkscreen M5 (B05) shared TIM3 with MOTOR 1+2. With the
        // joint optimizer motors get relocated so all 4 servos fit on
        // silkscreen pads with no timer fight.
        const motors = [{ index: 1, pad: "B00", timer: 3, channel: 3, dmaStream: null, bidirBurst: true }];
        const a = analysis(motors, {
            servos: [],
            padTimers: FLYWOOF_PAD_TIMERS,
            pwmCapableFreePads: [
                { pad: "B01", timer: 3, channel: 4 },
                { pad: "A03", timer: 2, channel: 4 },
                { pad: "A02", timer: 2, channel: 3 },
                { pad: "B05", timer: 3, channel: 2 },
                { pad: "C09", timer: 8, channel: 4 },
                { pad: "B04", timer: 3, channel: 1 },
                { pad: "C08", timer: 8, channel: 3 },
            ],
        });
        const preset = {
            mmix: [{ throttle: 1, roll: 0, pitch: 0, yaw: 0 }],
            rules: [
                { target: 2, input: 0, rate: 100 },
                { target: 3, input: 0, rate: -100 },
                { target: 4, input: 1, rate: 100 },
                { target: 5, input: 1, rate: 100 },
            ],
        };
        const plan = computePresetResourcePlan(a, preset, {
            padDefaults: FLYWOOF_PAD_DEFAULTS,
            motorCount: 2,
        });
        // 4 SERVO bind lines, all landing on silkscreen-pool pads.
        const servoBinds = plan.cliLines.filter((l) => /^resource SERVO \d+ [A-Z]\d/.test(l));
        expect(servoBinds).toHaveLength(4);
        for (const line of servoBinds) {
            const pad = line.split(" ").pop();
            expect(FLYWOOF_PAD_DEFAULTS.motors.some((m) => m.pad === pad) || pad === "A09").toBe(true);
        }
        // The plan should not pull any non-silkscreen pad into the bind list.
        const allBinds = plan.cliLines.filter((l) => /^resource (SERVO|MOTOR) \d+ [A-Z]\d/.test(l));
        const allPoolPads = new Set([...FLYWOOF_PAD_DEFAULTS.motors.map((m) => m.pad), "A09"]);
        for (const line of allBinds) {
            const pad = line.split(" ").pop();
            expect(allPoolPads.has(pad)).toBe(true);
        }
    });
});
