import { describe, it, expect } from "vitest";
import { PLANE_PRESETS, PRESET_IDS, INPUT_SOURCES } from "../../../src/js/utils/planePresets.js";

const CUSTOM_AIRPLANE = 24;

describe("PLANE_PRESETS", () => {
    it("exports the expected preset set", () => {
        // Delta was dropped (same as flying_wing). Flying wing now splits
        // into rudder + diff-thrust variants so the motor mix template
        // can be preset-driven.
        expect(PRESET_IDS).toEqual(["standard", "flying_wing_rudder", "flying_wing_diff_thrust", "v_tail"]);
        expect(PLANE_PRESETS.delta).toBeUndefined();
    });

    it("every preset targets MIXER_CUSTOM_AIRPLANE", () => {
        // Stock MIXER_FLYING_WING / MIXER_AIRPLANE route servos through
        // hardcoded legacy slots and ignore our custom target channels.
        // CUSTOM_AIRPLANE is the only safe choice for preset-driven smix.
        for (const id of PRESET_IDS) {
            expect(PLANE_PRESETS[id].mixerIndex).toBe(CUSTOM_AIRPLANE);
        }
    });

    it("every preset has yawType + mmix + rules", () => {
        for (const id of PRESET_IDS) {
            const preset = PLANE_PRESETS[id];
            expect(preset.id).toBe(id);
            expect(typeof preset.label).toBe("string");
            expect(preset.label.length).toBeGreaterThan(0);
            expect(["RUDDER", "DIFF_THRUST"]).toContain(preset.yawType);
            expect(Array.isArray(preset.mmix)).toBe(true);
            expect(preset.mmix.length).toBeGreaterThan(0);
            expect(Array.isArray(preset.rules)).toBe(true);
            expect(preset.rules.length).toBeGreaterThan(0);
        }
    });

    it("every rule field is in firmware servoMixer_t range", () => {
        for (const id of PRESET_IDS) {
            for (const rule of PLANE_PRESETS[id].rules) {
                expect(rule.target).toBeGreaterThanOrEqual(0);
                expect(rule.target).toBeLessThanOrEqual(7);
                expect(rule.input).toBeGreaterThanOrEqual(0);
                expect(rule.input).toBeLessThanOrEqual(11);
                expect(rule.rate).toBeGreaterThanOrEqual(-125);
                expect(rule.rate).toBeLessThanOrEqual(125);
                expect(rule.speed).toBeGreaterThanOrEqual(0);
                expect(rule.min).toBeGreaterThanOrEqual(-100);
                expect(rule.max).toBeLessThanOrEqual(100);
                expect(rule.box).toBeGreaterThanOrEqual(0);
                expect(rule.box).toBeLessThanOrEqual(3);
            }
        }
    });

    it("stays within MAX_SERVO_RULES", () => {
        const MAX_SERVO_RULES = 16;
        for (const id of PRESET_IDS) {
            expect(PLANE_PRESETS[id].rules.length).toBeLessThanOrEqual(MAX_SERVO_RULES);
        }
    });

    it("standard plane keeps single-axis servos at 100", () => {
        const std = PLANE_PRESETS.standard;
        expect(std.rules.length).toBe(4);
        // Every rule in standard touches exactly one axis, so 100 is safe.
        for (const r of std.rules) {
            expect(Math.abs(r.rate)).toBe(100);
        }
        expect(std.rules[0].input).toBe(INPUT_SOURCES.STABILIZED_ROLL);
        expect(std.rules[1].input).toBe(INPUT_SOURCES.STABILIZED_ROLL);
        expect(std.rules[2].input).toBe(INPUT_SOURCES.STABILIZED_PITCH);
        expect(std.rules[3].input).toBe(INPUT_SOURCES.STABILIZED_YAW);
        // Aileron differential: L and R must have opposite signs.
        expect(Math.sign(std.rules[0].rate)).not.toBe(Math.sign(std.rules[1].rate));
    });

    it("flying wing rules use 50 to prevent saturation on elevons", () => {
        for (const id of ["flying_wing_rudder", "flying_wing_diff_thrust"]) {
            const preset = PLANE_PRESETS[id];
            const elevonRules = preset.rules.filter((r) => r.target === 0 || r.target === 1);
            for (const r of elevonRules) {
                expect(Math.abs(r.rate)).toBe(50);
            }
        }
    });

    it("flying wing elevons: roll opposite-sign, pitch same-sign", () => {
        const wing = PLANE_PRESETS.flying_wing_rudder;
        const leftRoll = wing.rules.find((r) => r.target === 0 && r.input === INPUT_SOURCES.STABILIZED_ROLL);
        const leftPitch = wing.rules.find((r) => r.target === 0 && r.input === INPUT_SOURCES.STABILIZED_PITCH);
        const rightRoll = wing.rules.find((r) => r.target === 1 && r.input === INPUT_SOURCES.STABILIZED_ROLL);
        const rightPitch = wing.rules.find((r) => r.target === 1 && r.input === INPUT_SOURCES.STABILIZED_PITCH);
        expect(leftRoll).toBeDefined();
        expect(leftPitch).toBeDefined();
        expect(rightRoll).toBeDefined();
        expect(rightPitch).toBeDefined();
        expect(Math.sign(leftRoll.rate)).not.toBe(Math.sign(rightRoll.rate));
        expect(Math.sign(leftPitch.rate)).toBe(Math.sign(rightPitch.rate));
    });

    it("v-tail ruddervators: pitch same-sign, yaw opposite-sign, both at 50", () => {
        const vt = PLANE_PRESETS.v_tail;
        const leftPitch = vt.rules.find((r) => r.target === 2 && r.input === INPUT_SOURCES.STABILIZED_PITCH);
        const leftYaw = vt.rules.find((r) => r.target === 2 && r.input === INPUT_SOURCES.STABILIZED_YAW);
        const rightPitch = vt.rules.find((r) => r.target === 3 && r.input === INPUT_SOURCES.STABILIZED_PITCH);
        const rightYaw = vt.rules.find((r) => r.target === 3 && r.input === INPUT_SOURCES.STABILIZED_YAW);
        expect(leftPitch).toBeDefined();
        expect(leftYaw).toBeDefined();
        expect(rightPitch).toBeDefined();
        expect(rightYaw).toBeDefined();
        expect(Math.abs(leftPitch.rate)).toBe(50);
        expect(Math.abs(rightPitch.rate)).toBe(50);
        expect(Math.abs(leftYaw.rate)).toBe(50);
        expect(Math.abs(rightYaw.rate)).toBe(50);
        expect(Math.sign(leftPitch.rate)).toBe(Math.sign(rightPitch.rate));
        expect(Math.sign(leftYaw.rate)).not.toBe(Math.sign(rightYaw.rate));
    });

    it("flying_wing_diff_thrust has 2 motors with opposite yaw weights", () => {
        const mmix = PLANE_PRESETS.flying_wing_diff_thrust.mmix;
        expect(mmix.length).toBe(2);
        expect(Math.sign(mmix[0].yaw)).not.toBe(Math.sign(mmix[1].yaw));
        expect(mmix[0].throttle).toBe(1.0);
        expect(mmix[1].throttle).toBe(1.0);
    });

    it("rudder-yaw presets are single-motor and include a STABILIZED_YAW servo rule", () => {
        // Non-diff-thrust presets: single motor + yaw driven by a servo.
        for (const id of ["standard", "flying_wing_rudder", "v_tail"]) {
            const preset = PLANE_PRESETS[id];
            expect(preset.yawType).toBe("RUDDER");
            expect(preset.mmix.length).toBe(1);
            const yawRule = preset.rules.find((r) => r.input === INPUT_SOURCES.STABILIZED_YAW);
            expect(yawRule).toBeDefined();
        }
    });

    it("diff-thrust preset has NO STABILIZED_YAW servo rule (would conflict with motor yaw)", () => {
        const diff = PLANE_PRESETS.flying_wing_diff_thrust;
        expect(diff.yawType).toBe("DIFF_THRUST");
        const yawRule = diff.rules.find((r) => r.input === INPUT_SOURCES.STABILIZED_YAW);
        expect(yawRule).toBeUndefined();
    });
});
