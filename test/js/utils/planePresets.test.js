import { describe, it, expect } from "vitest";
import {
    PLANE_PRESETS,
    PRESET_IDS,
    INPUT_SOURCES,
    SLOT,
    PLANE_SLOT_MIN,
    PLANE_SLOT_MAX,
} from "../../../src/js/utils/planePresets.js";

const CUSTOM_AIRPLANE = 24;

describe("PLANE_PRESETS", () => {
    it("exports the expected preset set", () => {
        expect(PRESET_IDS).toEqual(["standard", "flying_wing", "flying_wing_diff_thrust", "v_tail"]);
    });

    it("every preset targets MIXER_CUSTOM_AIRPLANE", () => {
        for (const id of PRESET_IDS) {
            expect(PLANE_PRESETS[id].mixerIndex).toBe(CUSTOM_AIRPLANE);
        }
    });

    it("every rule target is in the plane slot range (2..7)", () => {
        for (const id of PRESET_IDS) {
            for (const rule of PLANE_PRESETS[id].rules) {
                expect(rule.target).toBeGreaterThanOrEqual(PLANE_SLOT_MIN);
                expect(rule.target).toBeLessThanOrEqual(PLANE_SLOT_MAX);
            }
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

    it("standard plane uses ELEVATOR/FLAPPERONS/RUDDER slots per BF convention", () => {
        const std = PLANE_PRESETS.standard;
        expect(std.rules.length).toBe(4);
        // Elevator on slot 2 (S1 pad), ailerons on 3 and 4 (S2/S3),
        // rudder on 5 (S4).
        const elev = std.rules.find((r) => r.target === SLOT.ELEVATOR);
        expect(elev).toBeDefined();
        expect(elev.input).toBe(INPUT_SOURCES.STABILIZED_PITCH);
        expect(elev.rate).toBe(100);

        const ailL = std.rules.find((r) => r.target === SLOT.FLAPPERON_L && r.input === INPUT_SOURCES.STABILIZED_ROLL);
        const ailR = std.rules.find((r) => r.target === SLOT.FLAPPERON_R && r.input === INPUT_SOURCES.STABILIZED_ROLL);
        expect(ailL).toBeDefined();
        expect(ailR).toBeDefined();
        expect(Math.sign(ailL.rate)).not.toBe(Math.sign(ailR.rate));

        const rud = std.rules.find((r) => r.target === SLOT.RUDDER);
        expect(rud).toBeDefined();
        expect(rud.input).toBe(INPUT_SOURCES.STABILIZED_YAW);
    });

    it("flying_wing elevons land on FLAPPERON_L / FLAPPERON_R (slots 3 & 4) at 50%", () => {
        const wing = PLANE_PRESETS.flying_wing;
        expect(wing.rules.length).toBe(4);
        for (const r of wing.rules) {
            expect([SLOT.FLAPPERON_L, SLOT.FLAPPERON_R]).toContain(r.target);
            expect(Math.abs(r.rate)).toBe(50);
        }
        // No rudder rule.
        const yawRule = wing.rules.find((r) => r.input === INPUT_SOURCES.STABILIZED_YAW);
        expect(yawRule).toBeUndefined();
    });

    it("flying wing elevons: roll opposite-sign, pitch same-sign", () => {
        for (const id of ["flying_wing", "flying_wing_diff_thrust"]) {
            const wing = PLANE_PRESETS[id];
            const leftRoll = wing.rules.find(
                (r) => r.target === SLOT.FLAPPERON_L && r.input === INPUT_SOURCES.STABILIZED_ROLL,
            );
            const leftPitch = wing.rules.find(
                (r) => r.target === SLOT.FLAPPERON_L && r.input === INPUT_SOURCES.STABILIZED_PITCH,
            );
            const rightRoll = wing.rules.find(
                (r) => r.target === SLOT.FLAPPERON_R && r.input === INPUT_SOURCES.STABILIZED_ROLL,
            );
            const rightPitch = wing.rules.find(
                (r) => r.target === SLOT.FLAPPERON_R && r.input === INPUT_SOURCES.STABILIZED_PITCH,
            );
            expect(leftRoll).toBeDefined();
            expect(leftPitch).toBeDefined();
            expect(rightRoll).toBeDefined();
            expect(rightPitch).toBeDefined();
            expect(Math.sign(leftRoll.rate)).not.toBe(Math.sign(rightRoll.rate));
            expect(Math.sign(leftPitch.rate)).toBe(Math.sign(rightPitch.rate));
        }
    });

    it("v-tail ruddervators on ELEVATOR and RUDDER slots (S1 + S4), 50/50 pitch+yaw", () => {
        const vt = PLANE_PRESETS.v_tail;
        // Left ruddervator = ELEVATOR slot (2), right = RUDDER slot (5).
        const leftPitch = vt.rules.find(
            (r) => r.target === SLOT.ELEVATOR && r.input === INPUT_SOURCES.STABILIZED_PITCH,
        );
        const leftYaw = vt.rules.find((r) => r.target === SLOT.ELEVATOR && r.input === INPUT_SOURCES.STABILIZED_YAW);
        const rightPitch = vt.rules.find((r) => r.target === SLOT.RUDDER && r.input === INPUT_SOURCES.STABILIZED_PITCH);
        const rightYaw = vt.rules.find((r) => r.target === SLOT.RUDDER && r.input === INPUT_SOURCES.STABILIZED_YAW);
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

    it("rudder-yaw presets are single-motor; only standard has a rudder servo", () => {
        for (const id of ["standard", "flying_wing", "v_tail"]) {
            const preset = PLANE_PRESETS[id];
            expect(preset.yawType).toBe("RUDDER");
            expect(preset.mmix.length).toBe(1);
        }
        // Only Standard Plane has a dedicated rudder servo rule.
        // flying_wing has no yaw surface; v_tail blends yaw via the
        // V-tail ruddervator pair.
        expect(PLANE_PRESETS.standard.rules.find((r) => r.input === INPUT_SOURCES.STABILIZED_YAW)).toBeDefined();
    });

    it("diff-thrust preset has NO STABILIZED_YAW servo rule", () => {
        const diff = PLANE_PRESETS.flying_wing_diff_thrust;
        expect(diff.yawType).toBe("DIFF_THRUST");
        const yawRule = diff.rules.find((r) => r.input === INPUT_SOURCES.STABILIZED_YAW);
        expect(yawRule).toBeUndefined();
    });
});
