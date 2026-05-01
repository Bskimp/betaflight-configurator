import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../../src/js/injected_methods";

vi.mock("../../../src/js/msp", () => ({
    default: {
        send_message: vi.fn((code, buffer, expectFalse, callback) => {
            if (callback) callback();
        }),
        promise: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock("../../../src/js/msp/MSPCodes", () => ({
    default: {
        MSP_SET_SERVO_CONFIGURATION: 212,
        MSP_SERVO_CONFIGURATIONS: 120,
    },
}));

vi.mock("../../../src/js/fc", () => ({
    default: {
        SERVO_CONFIG: [],
    },
}));

import MSP from "../../../src/js/msp";
import FC from "../../../src/js/fc";
import {
    pulseServoMiddle,
    wizardServoPulseCleanup,
    snapshotMiddles,
    restoreMiddlesFromSnapshot,
    resetCapabilityCache,
    _internals,
    PULSE_PWM_MIN,
    PULSE_PWM_MAX,
    PULSE_MAX_DURATION_MS,
} from "../../../src/js/utils/wingServoPulse";

function makeServoConfig(middle) {
    return { min: 1000, max: 2000, middle, rate: 100, indexOfChannelToForward: 255, reversedInputSources: 0 };
}

beforeEach(() => {
    vi.clearAllMocks();
    _internals.getPulseState().clear();
    // 8 servo configs — slotN of 2-7 are the plane-relevant ones.
    FC.SERVO_CONFIG = [
        makeServoConfig(1500),
        makeServoConfig(1500),
        makeServoConfig(1500), // SLOT 2 — ELEVATOR
        makeServoConfig(1500), // SLOT 3 — FLAPPERON_L
        makeServoConfig(1500), // SLOT 4 — FLAPPERON_R
        makeServoConfig(1500), // SLOT 5 — RUDDER
        makeServoConfig(1500),
        makeServoConfig(1500),
    ];
});

describe("pulseServoMiddle — argument validation", () => {
    it("throws on out-of-range pwm", async () => {
        await expect(pulseServoMiddle(2, PULSE_PWM_MIN - 1, 100)).rejects.toThrow(/pwm out of range/);
        await expect(pulseServoMiddle(2, PULSE_PWM_MAX + 1, 100)).rejects.toThrow(/pwm out of range/);
    });

    it("throws on out-of-range durationMs", async () => {
        await expect(pulseServoMiddle(2, 1500, 0)).rejects.toThrow(/durationMs out of range/);
        await expect(pulseServoMiddle(2, 1500, PULSE_MAX_DURATION_MS + 1)).rejects.toThrow(/durationMs out of range/);
    });

    it("throws on out-of-range slotN", async () => {
        await expect(pulseServoMiddle(-1, 1500, 100)).rejects.toThrow(/slotN out of range/);
        await expect(pulseServoMiddle(0x100, 1500, 100)).rejects.toThrow(/slotN out of range/);
    });
});

describe("pulseServoMiddle — addresses correct slot index", () => {
    it("SLOT 2 (ELEVATOR) writes to FC.SERVO_CONFIG[2]", async () => {
        await pulseServoMiddle(2, 1700, 5000);
        expect(_internals.getPulseState().has(2)).toBe(true);
        expect(_internals.getPulseState().get(2).originalMiddle).toBe(1500);
    });

    it("SLOT 3 (FLAPPERON_L) writes to FC.SERVO_CONFIG[3]", async () => {
        await pulseServoMiddle(3, 1300, 5000);
        expect(_internals.getPulseState().has(3)).toBe(true);
    });
});

describe("pulseServoMiddle — restore timer behavior", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it("schedules a restore after durationMs", async () => {
        await pulseServoMiddle(2, 1700, 500);
        expect(_internals.getPulseState().size).toBe(1);
        // Pulse write
        expect(MSP.send_message).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(500);
        // Restore fires
        expect(MSP.send_message).toHaveBeenCalledTimes(2);
        expect(_internals.getPulseState().size).toBe(0);
    });

    it("second pulse on same servo cancels first's restore", async () => {
        await pulseServoMiddle(2, 1700, 500);
        await vi.advanceTimersByTimeAsync(200);
        await pulseServoMiddle(2, 1300, 500);

        // Past first pulse's original restore time — first restore must NOT fire
        await vi.advanceTimersByTimeAsync(400);
        expect(MSP.send_message).toHaveBeenCalledTimes(2); // 2 pulse writes only

        // Past second pulse's restore time
        await vi.advanceTimersByTimeAsync(200);
        expect(MSP.send_message).toHaveBeenCalledTimes(3); // + 1 restore
        expect(_internals.getPulseState().size).toBe(0);
    });
});

describe("wizardServoPulseCleanup", () => {
    it("force-restores pulse state regardless of pending timers", async () => {
        await pulseServoMiddle(2, 1700, 5000);
        expect(_internals.getPulseState().size).toBe(1);

        await wizardServoPulseCleanup();
        // Pulse + cleanup restore = 2 sends
        expect(MSP.send_message).toHaveBeenCalledTimes(2);
        expect(_internals.getPulseState().size).toBe(0);
    });

    it("is a no-op when nothing has been pulsed", async () => {
        await wizardServoPulseCleanup();
        expect(MSP.send_message).not.toHaveBeenCalled();
    });
});

describe("snapshot + restore safety net", () => {
    it("restores middles to snapshotted values regardless of pulseState", async () => {
        snapshotMiddles();
        FC.SERVO_CONFIG[2].middle = 1700;
        FC.SERVO_CONFIG[5].middle = 1300;

        await restoreMiddlesFromSnapshot();
        expect(MSP.send_message).toHaveBeenCalledTimes(2);
        expect(FC.SERVO_CONFIG[2].middle).toBe(1500);
        expect(FC.SERVO_CONFIG[5].middle).toBe(1500);
    });

    it("is a no-op if snapshot has no drift", async () => {
        snapshotMiddles();
        await restoreMiddlesFromSnapshot();
        expect(MSP.send_message).not.toHaveBeenCalled();
    });

    it("is a no-op if no snapshot was taken", async () => {
        await restoreMiddlesFromSnapshot();
        expect(MSP.send_message).not.toHaveBeenCalled();
    });
});

describe("resetCapabilityCache", () => {
    it("is callable as a no-op stub", () => {
        // Future-proofing for buildOptions-based override re-enable.
        expect(() => resetCapabilityCache()).not.toThrow();
    });
});
