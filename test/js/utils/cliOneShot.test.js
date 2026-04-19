// Parsers tested against real bench output from a SPEEDYBEEF405WING
// running wing-main firmware. If BF ever changes the output format,
// these tests break first — treat that as a signal to update the
// parsers, not to weaken the tests.

import { describe, it, expect } from "vitest";
import {
    parseResourceShow,
    parseTimerShow,
    parseDmaShow,
    parseResourceDumpLine,
} from "../../../src/js/utils/cliOneShot.js";

// Trimmed `resource show` output from bench.
const RESOURCE_SHOW_FIXTURE = `
Currently active IO resource assignments:
(reboot to update)
--------------------
A00: FREE
A04: GYRO_CS 1
A05: SPI_SCK 1
A08: LED_STRIP
A11: USB
B06: MOTOR 2
B07: MOTOR 1
C15: BEEPER
`;

// Trimmed `timer show` output from bench.
const TIMER_SHOW_FIXTURE = `
Currently active Timers:
-----------------------
TIM1:
    CH1 : LED_STRIP
TIM2: FREE
TIM3: FREE
TIM4:
    CH1 : MOTOR 2
    CH2 : MOTOR 1
TIM8: FREE
`;

// Trimmed `dma show` output from bench.
const DMA_SHOW_FIXTURE = `
Currently active DMA:
--------------------
DMA1 Stream 0: SPI_SDI 3
DMA1 Stream 1: FREE
DMA1 Stream 5: SPI_SDO 3
DMA1 Stream 6: TIMUP 4
DMA2 Stream 0: ADC 1
DMA2 Stream 6: LED_STRIP
`;

describe("parseResourceShow", () => {
    it("parses bench SPEEDYBEEF405WING output", () => {
        const parsed = parseResourceShow(RESOURCE_SHOW_FIXTURE);
        expect(parsed).toEqual([
            { pad: "A00", peripheral: "FREE", index: null },
            { pad: "A04", peripheral: "GYRO_CS", index: 1 },
            { pad: "A05", peripheral: "SPI_SCK", index: 1 },
            { pad: "A08", peripheral: "LED_STRIP", index: null },
            { pad: "A11", peripheral: "USB", index: null },
            { pad: "B06", peripheral: "MOTOR", index: 2 },
            { pad: "B07", peripheral: "MOTOR", index: 1 },
            { pad: "C15", peripheral: "BEEPER", index: null },
        ]);
    });

    it("skips header/divider lines", () => {
        const parsed = parseResourceShow(RESOURCE_SHOW_FIXTURE);
        // None of the decorative lines should produce an entry.
        expect(parsed.find((r) => r.pad === "DAS")).toBeUndefined();
        expect(parsed.length).toBe(8);
    });

    it("accepts a pre-split array", () => {
        const arr = RESOURCE_SHOW_FIXTURE.split("\n");
        expect(parseResourceShow(arr)).toEqual(parseResourceShow(RESOURCE_SHOW_FIXTURE));
    });
});

describe("parseTimerShow", () => {
    it("parses bench output with FREE + active timers", () => {
        const parsed = parseTimerShow(TIMER_SHOW_FIXTURE);
        expect(parsed).toEqual([
            { timer: 1, channel: 1, complementary: false, peripheral: "LED_STRIP", index: null },
            { timer: 2, channel: null, peripheral: "FREE", index: null },
            { timer: 3, channel: null, peripheral: "FREE", index: null },
            { timer: 4, channel: 1, complementary: false, peripheral: "MOTOR", index: 2 },
            { timer: 4, channel: 2, complementary: false, peripheral: "MOTOR", index: 1 },
            { timer: 8, channel: null, peripheral: "FREE", index: null },
        ]);
    });

    it("handles complementary (CHnN) channels", () => {
        const fixture = `
TIM8:
    CH2N : MOTOR 3
`;
        const parsed = parseTimerShow(fixture);
        expect(parsed).toEqual([{ timer: 8, channel: 2, complementary: true, peripheral: "MOTOR", index: 3 }]);
    });
});

describe("parseDmaShow", () => {
    it("parses controller/stream/peripheral/index from bench output", () => {
        const parsed = parseDmaShow(DMA_SHOW_FIXTURE);
        expect(parsed).toEqual([
            { controller: 1, stream: 0, peripheral: "SPI_SDI", index: 3 },
            { controller: 1, stream: 1, peripheral: "FREE", index: null },
            { controller: 1, stream: 5, peripheral: "SPI_SDO", index: 3 },
            { controller: 1, stream: 6, peripheral: "TIMUP", index: 4 },
            { controller: 2, stream: 0, peripheral: "ADC", index: 1 },
            { controller: 2, stream: 6, peripheral: "LED_STRIP", index: null },
        ]);
    });

    it("surfaces the TIMUP burst allocation that bidir DSHOT uses", () => {
        const parsed = parseDmaShow(DMA_SHOW_FIXTURE);
        const timup = parsed.find((e) => e.peripheral === "TIMUP");
        // TIMUP 4 on DMA1 Stream 6 is the bidir-DSHOT burst trigger
        // for both motors on TIM4 (SPEEDYBEEF405WING default). If this
        // regresses, per-motor allocation is happening instead, which
        // changes the Hardware panel recommendation logic.
        expect(timup).toEqual({ controller: 1, stream: 6, peripheral: "TIMUP", index: 4 });
    });
});

describe("parseResourceDumpLine", () => {
    it("parses dump form", () => {
        expect(parseResourceDumpLine("resource MOTOR 1 B07")).toEqual({
            kind: "MOTOR",
            index: 1,
            pad: "B07",
        });
    });

    it("parses NONE (released slot) in dump form", () => {
        expect(parseResourceDumpLine("resource MOTOR 8 NONE")).toEqual({
            kind: "MOTOR",
            index: 8,
            pad: "NONE",
        });
    });

    it("parses underscore peripheral names", () => {
        expect(parseResourceDumpLine("resource LED_STRIP 1 A08")).toEqual({
            kind: "LED_STRIP",
            index: 1,
            pad: "A08",
        });
    });

    it("returns null on non-matching lines", () => {
        expect(parseResourceDumpLine("# comment")).toBeNull();
        expect(parseResourceDumpLine("")).toBeNull();
        expect(parseResourceDumpLine("B07: MOTOR 1")).toBeNull();
    });
});
