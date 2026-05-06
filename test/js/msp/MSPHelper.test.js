import { beforeEach, describe, expect, it, vi } from "vitest";
import MspHelper from "../../../src/js/msp/MSPHelper";
import MSPCodes from "../../../src/js/msp/MSPCodes";
import "../../../src/js/injected_methods";
import FC from "../../../src/js/fc";
import { API_VERSION_1_47 } from "../../../src/js/data_storage";

describe("MspHelper", () => {
    const mspHelper = new MspHelper();
    beforeEach(() => {
        FC.resetState();
    });
    describe("process_data", () => {
        it("refuses to process data with crc-error", () => {
            let callbackCalled = false;

            let callbackFunction = (item) => {
                callbackCalled = true;
                expect(item["crcError"]).toEqual(true);
                expect(item["command"]).toEqual(MSPCodes.MSP_BOARD_INFO);
                expect(item["length"]).toEqual(0);
            };

            mspHelper.process_data({
                code: MSPCodes.MSP_BOARD_INFO,
                dataView: new DataView(new Uint8Array([]).buffer),
                crcError: true,
                callbacks: [
                    {
                        callback: callbackFunction,
                        code: MSPCodes.MSP_BOARD_INFO,
                    },
                ],
            });

            expect(callbackCalled).toEqual(true);
        });
        it("handles MSP_API_VERSION correctly", () => {
            let randomValues = crypto.getRandomValues(new Uint8Array(3));
            const [mspProtocolVersion, apiVersionMajor, apiVersionMinor] = randomValues;
            mspHelper.process_data({
                code: MSPCodes.MSP_API_VERSION,
                dataView: new DataView(randomValues.buffer),
                crcError: false,
                callbacks: [],
            });

            expect(FC.CONFIG.mspProtocolVersion).toEqual(mspProtocolVersion);
            expect(FC.CONFIG.apiVersion).toEqual(`${apiVersionMajor}.${apiVersionMinor}.0`);
        });
        it("handles MSP_PIDNAMES correctly", () => {
            let pidNamesCount = 1 + crypto.getRandomValues(new Uint8Array(1))[0];
            let expectedNames = Array.from({ length: pidNamesCount }).map((_) => generateRandomString());

            let lowLevelData = [];
            appendStringToArray(lowLevelData, `${expectedNames.join(";")};`);

            mspHelper.process_data({
                code: MSPCodes.MSP_PIDNAMES,
                dataView: new DataView(new Uint8Array(lowLevelData).buffer),
                crcError: false,
                callbacks: [],
            });

            expect(FC.PID_NAMES).toEqual(expectedNames);
        });
        it("handles MSP_MOTOR correctly", () => {
            let motorCount = crypto.getRandomValues(new Uint8Array(1))[0] % 8;
            let motorBytes = crypto.getRandomValues(new Uint16Array(motorCount));

            mspHelper.process_data({
                code: MSPCodes.MSP_MOTOR,
                dataView: new DataView(new Uint16Array(motorBytes).buffer),
                crcError: false,
                callbacks: [],
            });
            expect(new Uint16Array(FC.MOTOR_DATA).slice(0, motorCount)).toEqual(motorBytes);
            expect(FC.MOTOR_DATA.slice(motorCount, 8)).toContain(undefined);
        });
        it("handles MSP2_MOTOR_SERVO_RESOURCE correctly", () => {
            mspHelper.process_data({
                code: MSPCodes.MSP2_MOTOR_SERVO_RESOURCE,
                dataView: new DataView(new Uint8Array([2, 2, 0x18, 0x00, 0x23, 0x00]).buffer),
                crcError: false,
                callbacks: [],
            });

            expect(FC.MOTOR_RESOURCES).toEqual([
                { index: 0, ioTag: 0x18, pin: "A08" },
                { index: 1, ioTag: 0x00, pin: "NONE" },
            ]);
            expect(FC.SERVO_RESOURCES).toEqual([
                { index: 0, ioTag: 0x23, pin: "B03" },
                { index: 1, ioTag: 0x00, pin: "NONE" },
            ]);
        });
        it("keeps existing resource assignments on malformed MSP2_MOTOR_SERVO_RESOURCE payloads", () => {
            FC.MOTOR_RESOURCES = [{ index: 0, ioTag: 0x18, pin: "A08" }];
            FC.SERVO_RESOURCES = [{ index: 0, ioTag: 0x23, pin: "B03" }];
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            mspHelper.process_data({
                code: MSPCodes.MSP2_MOTOR_SERVO_RESOURCE,
                dataView: new DataView(new Uint8Array([2, 2, 0x18]).buffer),
                crcError: false,
                callbacks: [],
            });

            expect(warnSpy).toHaveBeenCalled();
            expect(FC.MOTOR_RESOURCES).toEqual([{ index: 0, ioTag: 0x18, pin: "A08" }]);
            expect(FC.SERVO_RESOURCES).toEqual([{ index: 0, ioTag: 0x23, pin: "B03" }]);
            warnSpy.mockRestore();
        });
        it("keeps existing servo mix rules on malformed MSP_SERVO_MIX_RULES payloads", () => {
            FC.SERVO_RULES = [{ target: 3, input: 0, rate: 100, speed: 0, min: -100, max: 100, box: 0 }];
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            mspHelper.process_data({
                code: MSPCodes.MSP_SERVO_MIX_RULES,
                dataView: new DataView(new Uint8Array([3, 0, 100]).buffer),
                crcError: false,
                callbacks: [],
            });

            expect(warnSpy).toHaveBeenCalled();
            expect(FC.SERVO_RULES).toEqual([{ target: 3, input: 0, rate: 100, speed: 0, min: -100, max: 100, box: 0 }]);
            warnSpy.mockRestore();
        });
        it("handles MSP_BOARD_INFO correctly for API version", () => {
            FC.CONFIG.apiVersion = API_VERSION_1_47;
            let infoBuffer = [];

            const boardIdentifier = appendStringToArray(infoBuffer, generateRandomString(4)); // set board-identifier

            infoBuffer.push16(0xdead); // set board version
            infoBuffer.push8(0x12); // set board type
            infoBuffer.push8(0x32); // set target capabilities

            const targetName = appendStringToArray(infoBuffer, generateRandomString(), true); // set target name
            const boardName = appendStringToArray(infoBuffer, generateRandomString(), true); // set board name
            const manufacturerId = appendStringToArray(infoBuffer, generateRandomString(), true); // set board name
            const signature = crypto.getRandomValues(new Uint8Array(32));

            signature.forEach((element) => infoBuffer.push8(element));
            infoBuffer.push8(0xfa); // mcu type id
            infoBuffer.push8(0xbb); // configuration state
            infoBuffer.push16(0xbaab); // sample rate
            infoBuffer.push32(0xdeadbeef); // configuration problems

            mspHelper.process_data({
                code: MSPCodes.MSP_BOARD_INFO,
                dataView: new DataView(new Uint8Array(infoBuffer).buffer),
                crcError: false,
                callbacks: [],
            });

            expect(FC.CONFIG.boardIdentifier).toEqual(boardIdentifier);
            expect(FC.CONFIG.boardVersion).toEqual(0xdead);
            expect(FC.CONFIG.boardType).toEqual(0x12);
            expect(FC.CONFIG.targetCapabilities).toEqual(0x32);
            expect(FC.CONFIG.targetName).toEqual(targetName);
            expect(FC.CONFIG.boardName).toEqual(boardName);
            expect(FC.CONFIG.manufacturerId).toEqual(manufacturerId);
            expect(new Uint8Array(FC.CONFIG.signature)).toEqual(signature);
            expect(FC.CONFIG.mcuTypeId).toEqual(0xfa);

            expect(FC.CONFIG.configurationState).toEqual(0xbb);
            expect(FC.CONFIG.sampleRateHz).toEqual(0xbaab);
            expect(FC.CONFIG.configurationProblems).toEqual(0xdeadbeef);
        });
    });
    describe("resource pin ioTag conversion", () => {
        it("converts ioTags and pin names", () => {
            expect(mspHelper.ioTagToPin(0x00)).toBe("NONE");
            expect(mspHelper.ioTagToPin(0x18)).toBe("A08");
            expect(mspHelper.ioTagToPin(0x23)).toBe("B03");
            expect(mspHelper.ioTagToPin(0xff)).toBe("O15");

            expect(mspHelper.pinToIoTag("NONE")).toBe(0);
            expect(mspHelper.pinToIoTag("A08")).toBe(0x18);
            expect(mspHelper.pinToIoTag("b03")).toBe(0x23);
            expect(mspHelper.pinToIoTag("O15")).toBe(0xff);
        });

        it("rejects pins outside the 8-bit ioTag encoding range", () => {
            expect(mspHelper.pinToIoTag("A16")).toBe(0);
            expect(mspHelper.pinToIoTag("P00")).toBe(0);
            expect(mspHelper.pinToIoTag("not-a-pin")).toBe(0);
            expect(mspHelper.ioTagToPin(0x100)).toBe("INVALID");
        });
    });
});

/**
 * Appends given string to an array. If required, it will append length of the string by length.
 * @param destination array to which we append given string (and length if required)
 * @param source string to append to an array
 * @param prefixWithLength should we prefix the string by its length in the array
 * @returns {*} string that was requested to be inserted to the array
 */
function appendStringToArray(destination, source, prefixWithLength = false) {
    const size = source.length;

    if (prefixWithLength) {
        destination.push8(source.length);
    }

    for (let i = 0; i < size; i++) {
        destination.push8(source.charCodeAt(i));
    }

    return source;
}

/**
 * Generates a random string of required length. If required length is -1, it will generate a random string of a random length.
 * @param length required random string length. If lower than 0, it will generate a string of random length.
 * @returns {string} random string (composed of letters [A-Za-z0-9])
 */
function generateRandomString(length = -1) {
    let result = "";
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const charactersLength = characters.length;

    if (length < 0) {
        length = crypto.getRandomValues(new Uint8Array(1))[0];
    }

    const signature = crypto.getRandomValues(new Uint8Array(length));
    for (let i = 0; i < length; i++) {
        result += characters.charAt(signature[i] % charactersLength);
    }

    return result;
}
