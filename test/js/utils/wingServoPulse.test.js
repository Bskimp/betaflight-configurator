// Tests for the MSP2_SET_SERVO_OVERRIDE-based pulse path. Replaced
// the prior live-edit-middle test suite when wingServoPulse switched
// to the firmware override primitive (see comment in wingServoPulse.js).
//
// Override semantics: send-and-forget. Firmware auto-clears after
// durationMs; no client-side restore lifecycle, no snapshot/cache
// state. The four legacy exports (wizardServoPulseCleanup,
// snapshotMiddles, restoreMiddlesFromSnapshot, resetCapabilityCache)
// are no-op stubs kept so PlaneSetupWizard's destructured import
// list still resolves.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/js/msp", () => {
    const send_message = vi.fn((code, payload, _expectResponse, callback) => {
        if (typeof callback === "function") callback();
    });
    return { default: { send_message } };
});

vi.mock("../../../src/js/msp/MSPCodes", () => ({
    default: {
        MSP2_SET_SERVO_OVERRIDE: 0x301b,
    },
}));

import MSP from "../../../src/js/msp";
import {
    pulseServoMiddle,
    wizardServoPulseCleanup,
    snapshotMiddles,
    restoreMiddlesFromSnapshot,
    resetCapabilityCache,
    PULSE_PWM_MIN,
    PULSE_PWM_MAX,
    PULSE_MAX_DURATION_MS,
} from "../../../src/js/utils/wingServoPulse";

describe("pulseServoMiddle — argument validation", () => {
    beforeEach(() => {
        MSP.send_message.mockClear();
    });

    it("throws on non-integer slotN", async () => {
        await expect(pulseServoMiddle(1.5, 1500, 1000)).rejects.toThrow(/slotN/);
    });

    it("throws on out-of-range pwm (low)", async () => {
        await expect(pulseServoMiddle(2, PULSE_PWM_MIN - 1, 1000)).rejects.toThrow(/pwm/);
    });

    it("throws on out-of-range pwm (high)", async () => {
        await expect(pulseServoMiddle(2, PULSE_PWM_MAX + 1, 1000)).rejects.toThrow(/pwm/);
    });

    it("throws on durationMs <= 0", async () => {
        await expect(pulseServoMiddle(2, 1500, 0)).rejects.toThrow(/durationMs/);
    });

    it("throws on durationMs above ceiling", async () => {
        await expect(pulseServoMiddle(2, 1500, PULSE_MAX_DURATION_MS + 1)).rejects.toThrow(/durationMs/);
    });
});

describe("pulseServoMiddle — MSP wire format", () => {
    beforeEach(() => {
        MSP.send_message.mockClear();
    });

    it("sends MSP2_SET_SERVO_OVERRIDE with 5-byte payload", async () => {
        await pulseServoMiddle(2, 1800, 1500);
        expect(MSP.send_message).toHaveBeenCalledOnce();
        const [code, payload] = MSP.send_message.mock.calls[0];
        expect(code).toBe(0x301b);
        expect(payload).toHaveLength(5);
    });

    it("encodes pwm as u16 little-endian", async () => {
        // pwm = 1800 = 0x0708 → low=0x08, high=0x07
        await pulseServoMiddle(2, 1800, 1500);
        const payload = MSP.send_message.mock.calls[0][1];
        expect(payload[1]).toBe(0x08);
        expect(payload[2]).toBe(0x07);
    });

    it("encodes durationMs as u16 little-endian", async () => {
        // durationMs = 1500 = 0x05DC → low=0xDC, high=0x05
        await pulseServoMiddle(2, 1800, 1500);
        const payload = MSP.send_message.mock.calls[0][1];
        expect(payload[3]).toBe(0xdc);
        expect(payload[4]).toBe(0x05);
    });

    it("maps slotN → servoIdx via slotN + 1 (wing-fork SLOT enum 0+1 reserved)", async () => {
        // slot 1 (CLI "SERVO 1") → idx 2 (SLOT_ELEVATOR convention)
        await pulseServoMiddle(1, 1500, 1000);
        expect(MSP.send_message.mock.calls[0][1][0]).toBe(2);

        MSP.send_message.mockClear();
        // slot 4 (CLI "SERVO 4") → idx 5
        await pulseServoMiddle(4, 1500, 1000);
        expect(MSP.send_message.mock.calls[0][1][0]).toBe(5);
    });
});

describe("legacy export stubs (kept for wizard import resolution)", () => {
    it("wizardServoPulseCleanup resolves without error", async () => {
        await expect(wizardServoPulseCleanup()).resolves.toBeUndefined();
    });

    it("snapshotMiddles returns null", () => {
        expect(snapshotMiddles()).toBeNull();
    });

    it("restoreMiddlesFromSnapshot resolves without error", async () => {
        await expect(restoreMiddlesFromSnapshot()).resolves.toBeUndefined();
    });

    it("resetCapabilityCache is callable as a no-op", () => {
        expect(() => resetCapabilityCache()).not.toThrow();
    });
});
