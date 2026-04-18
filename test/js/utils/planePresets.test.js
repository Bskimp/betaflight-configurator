import { describe, it, expect } from "vitest";
import { PLANE_PRESETS, PRESET_IDS, INPUT_SOURCES } from "../../../src/js/utils/planePresets.js";

describe("PLANE_PRESETS", () => {
    it("exports at least four airframes", () => {
        expect(PRESET_IDS.length).toBeGreaterThanOrEqual(4);
    });

    it("every preset has required fields", () => {
        for (const id of PRESET_IDS) {
            const preset = PLANE_PRESETS[id];
            expect(preset.id).toBe(id);
            expect(typeof preset.label).toBe("string");
            expect(preset.label.length).toBeGreaterThan(0);
            expect(typeof preset.mixerIndex).toBe("number");
            expect(preset.mixerIndex).toBeGreaterThan(0);
            expect(Array.isArray(preset.rules)).toBe(true);
            expect(preset.rules.length).toBeGreaterThan(0);
        }
    });

    it("every rule has all servoMixer_t fields within firmware range", () => {
        for (const id of PRESET_IDS) {
            for (const rule of PLANE_PRESETS[id].rules) {
                expect(rule.target).toBeGreaterThanOrEqual(0);
                expect(rule.target).toBeLessThanOrEqual(7); // MAX_SUPPORTED_SERVOS - 1
                expect(rule.input).toBeGreaterThanOrEqual(0);
                expect(rule.input).toBeLessThanOrEqual(11); // matches INPUT_SOURCES table
                expect(rule.rate).toBeGreaterThanOrEqual(-125);
                expect(rule.rate).toBeLessThanOrEqual(125);
                expect(rule.speed).toBeGreaterThanOrEqual(0);
                expect(rule.min).toBeGreaterThanOrEqual(-100);
                expect(rule.min).toBeLessThanOrEqual(100);
                expect(rule.max).toBeGreaterThanOrEqual(-100);
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

    it("standard plane preset has expected function rules", () => {
        const standard = PLANE_PRESETS.standard;
        // 4 rules: aileron L, aileron R, elevator, rudder.
        expect(standard.rules.length).toBe(4);
        expect(standard.rules[0].input).toBe(INPUT_SOURCES.STABILIZED_ROLL);
        expect(standard.rules[1].input).toBe(INPUT_SOURCES.STABILIZED_ROLL);
        expect(standard.rules[2].input).toBe(INPUT_SOURCES.STABILIZED_PITCH);
        expect(standard.rules[3].input).toBe(INPUT_SOURCES.STABILIZED_YAW);
        // Aileron R reversed sign relative to aileron L.
        expect(Math.sign(standard.rules[0].rate)).toBe(1);
        expect(Math.sign(standard.rules[1].rate)).toBe(-1);
    });

    it("flying wing preset mixes roll and pitch onto both elevons", () => {
        const wing = PLANE_PRESETS.flying_wing;
        const leftRoll = wing.rules.find((r) => r.target === 0 && r.input === INPUT_SOURCES.STABILIZED_ROLL);
        const leftPitch = wing.rules.find((r) => r.target === 0 && r.input === INPUT_SOURCES.STABILIZED_PITCH);
        const rightRoll = wing.rules.find((r) => r.target === 1 && r.input === INPUT_SOURCES.STABILIZED_ROLL);
        const rightPitch = wing.rules.find((r) => r.target === 1 && r.input === INPUT_SOURCES.STABILIZED_PITCH);
        expect(leftRoll).toBeDefined();
        expect(leftPitch).toBeDefined();
        expect(rightRoll).toBeDefined();
        expect(rightPitch).toBeDefined();
        // Roll must be opposite-sign on the two elevons so aileron inputs
        // produce a differential; pitch must be same-sign so pitch inputs
        // produce a common deflection.
        expect(Math.sign(leftRoll.rate)).not.toBe(Math.sign(rightRoll.rate));
        expect(Math.sign(leftPitch.rate)).toBe(Math.sign(rightPitch.rate));
    });
});
