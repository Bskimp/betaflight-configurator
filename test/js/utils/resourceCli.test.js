// Parsers tested against real bench output from a SPEEDYBEEF405WING.
// If BF ever changes the output format, these tests break first; treat
// that as a signal to update the parsers, not to weaken the tests.

import { describe, it, expect } from "vitest";
import { parseResourceDefaults, parseResourceShow, parseTimerDump } from "../../../src/js/utils/resourceCli.js";

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
