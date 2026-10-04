// Parsers tested against real bench output from a SPEEDYBEEF405WING.
// If BF ever changes the output format, these tests break first; treat
// that as a signal to update the parsers, not to weaken the tests.

import { describe, it, expect } from "vitest";
import {
    parseDmaPinDefaults,
    parseResourceDefaults,
    parseResourceShow,
    parseTimerDefaults,
    parseTimerDump,
    parseTimerOptions,
} from "../../../src/js/utils/resourceCli.js";

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

    it("parses dump-style 'resource NAME N PAD' format (some BF forks emit this from resource show)", () => {
        // Observed on FURYF4OSD and several community forks - resource show
        // output mirrors the dump/diff layout instead of the classic PAD:BODY
        // layout. NONE entries (released slots) must be skipped.
        const input = [
            "resource BEEPER 1 A08",
            "resource MOTOR 1 A03",
            "resource MOTOR 2 B00",
            "resource MOTOR 5 NONE",
            "resource LED_STRIP 1 A00",
            "resource SERIAL_TX 3 B10",
        ].join("\n");
        const parsed = parseResourceShow(input);
        expect(parsed).toEqual([
            { pad: "A08", peripheral: "BEEPER", index: 1 },
            { pad: "A03", peripheral: "MOTOR", index: 1 },
            { pad: "B00", peripheral: "MOTOR", index: 2 },
            // MOTOR 5 NONE - skipped (empty binding)
            { pad: "A00", peripheral: "LED_STRIP", index: 1 },
            { pad: "B10", peripheral: "SERIAL_TX", index: 3 },
        ]);
    });
});

describe("parseTimerDump", () => {
    const TIMER_DUMP_FIXTURE = `
timer B07 AF2
# pin B07: TIM4 CH2 (AF2)
timer B06 AF2
# pin B06: TIM4 CH1 (AF2)
timer B00 AF2
# pin B00: TIM3 CH3 (AF2)
timer A08 AF1
# pin A08: TIM1 CH1 (AF1)
`;

    it("extracts pad + AF + TIM/CH from dump + comment pairs", () => {
        const parsed = parseTimerDump(TIMER_DUMP_FIXTURE);
        expect(parsed).toEqual([
            { pad: "B07", af: 2, timer: 4, channel: 2 },
            { pad: "B06", af: 2, timer: 4, channel: 1 },
            { pad: "B00", af: 2, timer: 3, channel: 3 },
            { pad: "A08", af: 1, timer: 1, channel: 1 },
        ]);
    });

    it("tolerates missing comment lines (timer/channel become null)", () => {
        const parsed = parseTimerDump("timer B07 AF2\n");
        expect(parsed).toEqual([{ pad: "B07", af: 2, timer: null, channel: null }]);
    });

    it("tolerates complementary channel suffix (CH2N)", () => {
        const fixture = "timer B14 AF3\n# pin B14: TIM8 CH2N (AF3)\n";
        const parsed = parseTimerDump(fixture);
        expect(parsed).toEqual([{ pad: "B14", af: 3, timer: 8, channel: 2 }]);
    });
});

describe("parseResourceDefaults", () => {
    it("reads the commented defaults of changed resources", () => {
        const diff = [
            "# diff hardware defaults",
            "# resource",
            "#resource MOTOR 1 B00",
            "resource MOTOR 1 NONE",
            "#resource MOTOR 3 B04",
            "resource MOTOR 3 A02",
            "#resource SERVO 1 NONE",
            "resource SERVO 1 B05",
            "resource BEEPER 1 C13",
        ];
        expect([...parseResourceDefaults(diff)]).toEqual([
            ["MOTOR 1", "B00"],
            ["MOTOR 3", "B04"],
            ["SERVO 1", "NONE"],
        ]);
    });
});

// `timer <pin> list` lists every available (timer, channel, AF) for a
// pin per the firmware's DEF_TIM table. Output format from cli.c
// cliTimer() "list" branch - see firmware src/main/cli/cli.c:7244.
const TIMER_LIST_FIXTURE_F405_B07 = `
# AF1: TIM4 CH2
# AF2: TIM4 CH2
# AF3: TIM8 CH2N
`;

const TIMER_LIST_FIXTURE_H743_PE9 = `
# AF1: TIM1 CH1
# AF3: TIM1 CH1
`;

describe("parseTimerOptions", () => {
    it("returns [] on empty/null input", () => {
        expect(parseTimerOptions("")).toEqual([]);
        expect(parseTimerOptions([])).toEqual([]);
    });

    it("ignores non-AF lines", () => {
        const noisy = `
Some random text
# This is a comment but not an AF line
PIN NOT USED ON BOARD.
`;
        expect(parseTimerOptions(noisy)).toEqual([]);
    });

    it("parses each AF line into {af, timer, channel, complementary}", () => {
        const out = parseTimerOptions(TIMER_LIST_FIXTURE_F405_B07);
        expect(out).toEqual([
            { af: 1, timer: 4, channel: 2, complementary: false },
            { af: 2, timer: 4, channel: 2, complementary: false },
            { af: 3, timer: 8, channel: 2, complementary: true },
        ]);
    });

    it("flags complementary channels (CHnN suffix)", () => {
        const out = parseTimerOptions("# AF3: TIM1 CH1N");
        expect(out[0].complementary).toBe(true);
    });

    it("accepts both string and array input", () => {
        const lines = TIMER_LIST_FIXTURE_H743_PE9.trim().split(/\r?\n/);
        expect(parseTimerOptions(lines)).toHaveLength(2);
        expect(parseTimerOptions(TIMER_LIST_FIXTURE_H743_PE9)).toHaveLength(2);
    });
});

describe("parseTimerDefaults / parseDmaPinDefaults", () => {
    // A02 moved from TIM2 CH3 (AF1) to TIM9 CH1 (AF3); the timer change
    // cleared its DMA option.
    const DIFF = [
        "# timer",
        "#timer A02 AF1",
        "## pin A02: TIM2 CH3 (AF1)",
        "timer A02 AF3",
        "# pin A02: TIM9 CH1 (AF3)",
        "# dma",
        "#dma pin A02 0",
        "## pin A02: DMA1 Stream 1 Channel 3",
        "dma pin A02 NONE",
        "#dma pin B07 NONE",
        "dma pin B07 1",
    ];

    it("reads default AFs of changed timers", () => {
        expect([...parseTimerDefaults(DIFF)]).toEqual([["A02", 1]]);
    });

    it("maps a pad with no default timer to null", () => {
        // A00 is a UART pin on the defaults; a servo gave it TIM2 CH1.
        const diff = ["# timer", "timer A00 AF1", "# pin A00: TIM2 CH1 (AF1)"];
        expect([...parseTimerDefaults(diff)]).toEqual([["A00", null]]);
    });

    it("reads default DMA options of changed pins", () => {
        expect([...parseDmaPinDefaults(DIFF)]).toEqual([
            ["A02", "0"],
            ["B07", "NONE"],
        ]);
    });
});
