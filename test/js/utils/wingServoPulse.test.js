// Dual-path servo pulse tests. The wizard picks override vs
// live-edit-middle based on FC.CONFIG.wingCapabilities; tests below
// flip that flag to exercise each path.

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

vi.mock("../../../src/js/msp/MSPHelper", () => ({
    mspHelper: {
        sendServoConfigurations: vi.fn((cb) => {
            if (typeof cb === "function") cb();
        }),
    },
}));

vi.mock("../../../src/js/fc", () => ({
    default: {
        CONFIG: {},
        SERVO_CONFIG: [],
    },
}));

import MSP from "../../../src/js/msp";
import { mspHelper } from "../../../src/js/msp/MSPHelper";
import FC from "../../../src/js/fc";
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

function setForkActive(active) {
    if (active) {
        FC.CONFIG.wingCapabilities = { tuning: true };
    } else {
        delete FC.CONFIG.wingCapabilities;
    }
}

function seedServoConfig() {
    // Index 0+1 reserved on the wing-fork SLOT enum; real servos start
    // at idx 2 (= SERVO 1). Mainline mirrors the same numbering for
    // CUSTOM_AIRPLANE so configIdxFromSlot(slotN) = slotN + 1 is right
    // on both targets.
    FC.SERVO_CONFIG = [
        { middle: 0, min: 1000, max: 2000 }, // reserved 0
        { middle: 0, min: 1000, max: 2000 }, // reserved 1
        { middle: 1500, min: 1000, max: 2000 }, // SERVO 1
        { middle: 1500, min: 1000, max: 2000 }, // SERVO 2
        { middle: 1500, min: 1000, max: 2000 }, // SERVO 3
        { middle: 1500, min: 1000, max: 2000 }, // SERVO 4
    ];
}

describe("pulseServoMiddle — argument validation", () => {
    beforeEach(() => {
        MSP.send_message.mockClear();
        mspHelper.sendServoConfigurations.mockClear();
        setForkActive(true);
        seedServoConfig();
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

describe("pulseServoMiddle — wing-fork override path", () => {
    beforeEach(() => {
        MSP.send_message.mockClear();
        mspHelper.sendServoConfigurations.mockClear();
        setForkActive(true);
        seedServoConfig();
    });

    it("sends MSP2_SET_SERVO_OVERRIDE with 5-byte payload", async () => {
        await pulseServoMiddle(2, 1800, 1500);
        expect(MSP.send_message).toHaveBeenCalledOnce();
        const [code, payload] = MSP.send_message.mock.calls[0];
        expect(code).toBe(0x301b);
        expect(payload).toHaveLength(5);
    });

    it("encodes pwm as u16 little-endian", async () => {
        await pulseServoMiddle(2, 1800, 1500);
        const payload = MSP.send_message.mock.calls[0][1];
        expect(payload[1]).toBe(0x08);
        expect(payload[2]).toBe(0x07);
    });

    it("encodes durationMs as u16 little-endian", async () => {
        await pulseServoMiddle(2, 1800, 1500);
        const payload = MSP.send_message.mock.calls[0][1];
        expect(payload[3]).toBe(0xdc);
        expect(payload[4]).toBe(0x05);
    });

    it("maps slotN → servoIdx via slotN + 1", async () => {
        await pulseServoMiddle(1, 1500, 1000);
        expect(MSP.send_message.mock.calls[0][1][0]).toBe(2);

        MSP.send_message.mockClear();
        await pulseServoMiddle(4, 1500, 1000);
        expect(MSP.send_message.mock.calls[0][1][0]).toBe(5);
    });

    it("does not touch FC.SERVO_CONFIG", async () => {
        await pulseServoMiddle(1, 1800, 1500);
        expect(FC.SERVO_CONFIG[2].middle).toBe(1500);
        expect(mspHelper.sendServoConfigurations).not.toHaveBeenCalled();
    });
});

describe("pulseServoMiddle — mainline live-edit-middle path", () => {
    beforeEach(() => {
        MSP.send_message.mockClear();
        mspHelper.sendServoConfigurations.mockClear();
        setForkActive(false);
        seedServoConfig();
    });

    it("does not send MSP2_SET_SERVO_OVERRIDE on mainline", async () => {
        await pulseServoMiddle(1, 1800, 1);
        expect(MSP.send_message).not.toHaveBeenCalled();
    });

    it("treats all-false default wingCapabilities object as mainline (regression: bench-observed bug)", async () => {
        // fc.js initializes wingCapabilities as an all-false object so
        // sub-tab gates can read bits without null-guarding. Earlier
        // gate logic (`wingCapabilities != null`) wrongly classified
        // this as wing-fork → fired MSP2_SET_SERVO_OVERRIDE on mainline
        // → NACK 12315 → silent servo. Bench user confirmed via console
        // logs.
        FC.CONFIG.wingCapabilities = {
            tuning: false,
            launch: false,
            gpsRescue: false,
            autoland: false,
            combinedYaw: false,
        };
        await pulseServoMiddle(1, 1800, 1);
        expect(MSP.send_message).not.toHaveBeenCalled();
        expect(mspHelper.sendServoConfigurations).toHaveBeenCalled();
    });

    it("writes pulse PWM to FC.SERVO_CONFIG middle then restores", async () => {
        const writes = [];
        mspHelper.sendServoConfigurations.mockImplementation((cb) => {
            writes.push(FC.SERVO_CONFIG[2].middle);
            cb();
        });
        await pulseServoMiddle(1, 1800, 1);
        // Expect: write pulse PWM (1800), restore original (1500).
        expect(writes).toEqual([1800, 1500]);
        // Final FC state matches the snapshot.
        expect(FC.SERVO_CONFIG[2].middle).toBe(1500);
    });

    it("calls sendServoConfigurations exactly twice (set + restore)", async () => {
        await pulseServoMiddle(1, 1700, 1);
        expect(mspHelper.sendServoConfigurations).toHaveBeenCalledTimes(2);
    });

    it("throws when FC.SERVO_CONFIG is missing the target slot", async () => {
        FC.SERVO_CONFIG = [];
        await expect(pulseServoMiddle(1, 1800, 1)).rejects.toThrow(/SERVO_CONFIG/);
    });
});

describe("wizardServoPulseCleanup", () => {
    beforeEach(() => {
        MSP.send_message.mockClear();
        mspHelper.sendServoConfigurations.mockClear();
        setForkActive(false);
        seedServoConfig();
    });

    it("resolves without error when nothing is in flight", async () => {
        await expect(wizardServoPulseCleanup()).resolves.toBeUndefined();
        expect(mspHelper.sendServoConfigurations).not.toHaveBeenCalled();
    });

    it("restores in-flight middle if pulse is interrupted before restore", async () => {
        // Simulate a Save fired DURING a pulse: stage the in-flight
        // state by intercepting the "set" sendServoConfigurations call,
        // running cleanup before the pulse's own restore runs.
        let setCallSeen = false;
        mspHelper.sendServoConfigurations.mockImplementation((cb) => {
            if (!setCallSeen) {
                setCallSeen = true;
                // Cleanup runs while middle is still 1800. It should
                // restore back to 1500 BEFORE we let the original
                // pulse's restore call return.
                wizardServoPulseCleanup().then(() => cb());
                return;
            }
            cb();
        });
        await pulseServoMiddle(1, 1800, 1);
        expect(FC.SERVO_CONFIG[2].middle).toBe(1500);
    });

    it("snapshotMiddles returns null when no pulse is in flight", () => {
        expect(snapshotMiddles()).toBeNull();
    });

    it("restoreMiddlesFromSnapshot resolves cleanly with empty snapshot", async () => {
        await expect(restoreMiddlesFromSnapshot()).resolves.toBeUndefined();
    });

    it("resetCapabilityCache is callable as a no-op", () => {
        expect(() => resetCapabilityCache()).not.toThrow();
    });
});
