// Per-board physical-pad allowlist. Pilot-driven Set of pads NOT
// physically broken out as solder targets on this PCB. The firmware
// target declares M1-M8 in the silkscreen but most boards only wire
// out a subset — without this allowlist the optimizer happily picks
// a phantom pad and the pilot's elevon hangs off a non-existent pin.
//
// Storage model: a Set of *disallowed* pads (rather than allowed).
// Default state = empty Set = all pads allowed = identical to today's
// behavior. Pilots who don't opt in see no difference.
//
// Persistence key precedence:
//   1. FC-reported board `signature` (preferred — uniquely identifies
//      the physical board across clones / rev-A vs rev-B variants
//      sharing target+manufacturer)
//   2. `manufacturerId + boardIdentifier` (fallback when signature
//      unavailable on older firmware)
//
// Pure: takes already-derived inputs, returns a derived value or
// touches localStorage. No FC singleton access, no I/O beyond
// localStorage. Safe to call before connect.

const STORAGE_PREFIX = "wing_pad_allowlist_";

function buildKey({ signature, manufacturerId, boardIdentifier } = {}) {
    if (typeof signature === "string" && signature.length > 0) {
        return STORAGE_PREFIX + signature;
    }
    const m = typeof manufacturerId === "string" && manufacturerId.length > 0 ? manufacturerId : "?";
    const b = typeof boardIdentifier === "string" && boardIdentifier.length > 0 ? boardIdentifier : "?";
    return `${STORAGE_PREFIX}${m}_${b}`;
}

/**
 * Load the disallowed-pad Set for this board from localStorage.
 * Returns an empty Set on first load, parse errors, or when no
 * localStorage is available (test envs).
 *
 * @param {{signature?: string, manufacturerId?: string, boardIdentifier?: string}} idents
 * @returns {Set<string>} pads explicitly marked as not-physically-broken-out.
 */
export function loadAllowlist(idents) {
    if (typeof localStorage === "undefined") return new Set();
    try {
        const raw = localStorage.getItem(buildKey(idents));
        if (!raw) return new Set();
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set(parsed.map((p) => String(p).toUpperCase()));
        if (parsed && Array.isArray(parsed.disallowed)) {
            return new Set(parsed.disallowed.map((p) => String(p).toUpperCase()));
        }
        return new Set();
    } catch {
        return new Set();
    }
}

/**
 * Persist the disallowed-pad Set. Removes the key when the Set is
 * empty so default-state pilots don't accumulate empty entries.
 *
 * @param {{signature?: string, manufacturerId?: string, boardIdentifier?: string}} idents
 * @param {Set<string>|string[]} disallowedPads
 */
export function saveAllowlist(idents, disallowedPads) {
    if (typeof localStorage === "undefined") return;
    try {
        const key = buildKey(idents);
        const arr =
            disallowedPads instanceof Set ? [...disallowedPads] : Array.isArray(disallowedPads) ? disallowedPads : [];
        if (arr.length === 0) {
            localStorage.removeItem(key);
            return;
        }
        localStorage.setItem(key, JSON.stringify(arr.map((p) => String(p).toUpperCase())));
    } catch {
        // ignore — non-fatal, allowlist falls back to in-memory state
    }
}

/**
 * Apply the allowlist filter to a padDefaults object. Returns a new
 * object with `motors` and `ledStrips` arrays filtered to exclude
 * any pad in `disallowedPads`. Empty allowlist returns the input
 * unchanged (no allocation).
 *
 * @param {{motors?: Array<{pad: string}>, ledStrips?: Array<{pad: string}>}} padDefaults
 * @param {Set<string>} disallowedPads
 * @returns {object} same shape as padDefaults
 */
export function applyAllowlist(padDefaults, disallowedPads) {
    if (!padDefaults) return padDefaults;
    if (!(disallowedPads instanceof Set) || disallowedPads.size === 0) return padDefaults;
    const blocked = new Set([...disallowedPads].map((p) => String(p).toUpperCase()));
    const filterPad = (entries) =>
        Array.isArray(entries) ? entries.filter((e) => e?.pad && !blocked.has(e.pad.toUpperCase())) : entries;
    return {
        ...padDefaults,
        motors: filterPad(padDefaults.motors),
        ledStrips: filterPad(padDefaults.ledStrips),
    };
}

/**
 * Toggle a pad's allowlist state. Returns a NEW Set so callers using
 * Vue reactivity can detect the change.
 *
 * @param {Set<string>} disallowedPads
 * @param {string} pad
 * @returns {Set<string>}
 */
export function togglePad(disallowedPads, pad) {
    const next = new Set(disallowedPads);
    const upper = String(pad).toUpperCase();
    if (next.has(upper)) next.delete(upper);
    else next.add(upper);
    return next;
}
