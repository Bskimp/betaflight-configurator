import { describe, it, expect, beforeEach } from "vitest";
import { loadAllowlist, saveAllowlist, applyAllowlist, togglePad } from "../../../src/js/utils/wingPadAllowlist.js";

// jsdom provides localStorage; make sure each test starts clean.
beforeEach(() => {
    if (typeof localStorage !== "undefined") localStorage.clear();
});

describe("loadAllowlist", () => {
    it("returns an empty Set on first load", () => {
        const out = loadAllowlist({ signature: "fresh-board" });
        expect(out).toBeInstanceOf(Set);
        expect(out.size).toBe(0);
    });

    it("falls back to manufacturer + board key when signature missing", () => {
        saveAllowlist({ manufacturerId: "TMTR", boardIdentifier: "F722" }, new Set(["B07", "C09"]));
        const out = loadAllowlist({ manufacturerId: "TMTR", boardIdentifier: "F722" });
        expect([...out].sort()).toEqual(["B07", "C09"]);
    });

    it("prefers signature key when both available", () => {
        saveAllowlist({ signature: "device-abc", manufacturerId: "TMTR", boardIdentifier: "F722" }, new Set(["B07"]));
        // Same manufacturer/board but different signature — should NOT see the prior data.
        const out = loadAllowlist({ signature: "device-xyz", manufacturerId: "TMTR", boardIdentifier: "F722" });
        expect(out.size).toBe(0);
    });

    it("upper-cases pads on load", () => {
        saveAllowlist({ signature: "case-test" }, ["b07", "c09"]);
        const out = loadAllowlist({ signature: "case-test" });
        expect([...out].sort()).toEqual(["B07", "C09"]);
    });

    it("returns empty Set on malformed JSON", () => {
        localStorage.setItem("wing_pad_allowlist_broken", "not-json");
        const out = loadAllowlist({ signature: "broken" });
        expect(out.size).toBe(0);
    });
});

describe("saveAllowlist", () => {
    it("removes the storage key when the Set is empty", () => {
        saveAllowlist({ signature: "to-clear" }, new Set(["B07"]));
        expect(localStorage.getItem("wing_pad_allowlist_to-clear")).not.toBeNull();
        saveAllowlist({ signature: "to-clear" }, new Set());
        expect(localStorage.getItem("wing_pad_allowlist_to-clear")).toBeNull();
    });

    it("accepts both Set and Array inputs", () => {
        saveAllowlist({ signature: "via-set" }, new Set(["B07"]));
        saveAllowlist({ signature: "via-array" }, ["C09"]);
        expect(loadAllowlist({ signature: "via-set" }).has("B07")).toBe(true);
        expect(loadAllowlist({ signature: "via-array" }).has("C09")).toBe(true);
    });
});

describe("applyAllowlist", () => {
    const pd = {
        target: "TMOTORF7X2",
        motors: [
            { index: 1, pad: "C06" },
            { index: 7, pad: "B07" },
            { index: 8, pad: "C09" },
        ],
        ledStrips: [{ pad: "A08" }],
    };

    it("returns the input unchanged when allowlist is empty", () => {
        const out = applyAllowlist(pd, new Set());
        expect(out).toBe(pd);
    });

    it("returns null/undefined inputs unchanged", () => {
        expect(applyAllowlist(null, new Set(["B07"]))).toBeNull();
        expect(applyAllowlist(undefined, new Set(["B07"]))).toBeUndefined();
    });

    it("filters disallowed pads from motors and ledStrips arrays", () => {
        const out = applyAllowlist(pd, new Set(["B07", "C09"]));
        expect(out.motors.map((m) => m.pad)).toEqual(["C06"]);
        expect(out.ledStrips.map((l) => l.pad)).toEqual(["A08"]);
    });

    it("filters the LED pad when it's in the disallowed Set", () => {
        const out = applyAllowlist(pd, new Set(["A08"]));
        expect(out.motors.length).toBe(3);
        expect(out.ledStrips).toEqual([]);
    });

    it("matches case-insensitively", () => {
        const out = applyAllowlist(pd, new Set(["b07"]));
        expect(out.motors.find((m) => m.pad === "B07")).toBeUndefined();
    });

    it("preserves other top-level fields on padDefaults", () => {
        const out = applyAllowlist(pd, new Set(["B07"]));
        expect(out.target).toBe("TMOTORF7X2");
    });
});

describe("togglePad", () => {
    it("adds a pad when not present", () => {
        const next = togglePad(new Set(), "B07");
        expect(next.has("B07")).toBe(true);
    });

    it("removes a pad when already present", () => {
        const next = togglePad(new Set(["B07"]), "B07");
        expect(next.has("B07")).toBe(false);
    });

    it("returns a new Set instance (Vue reactivity)", () => {
        const before = new Set(["B07"]);
        const after = togglePad(before, "C09");
        expect(after).not.toBe(before);
        expect(before.has("C09")).toBe(false);
        expect(after.has("C09")).toBe(true);
    });

    it("normalizes pad to upper case", () => {
        const next = togglePad(new Set(), "b07");
        expect(next.has("B07")).toBe(true);
    });
});
