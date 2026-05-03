# Authoritative Pin Defaults — fetch from cloud, ignore polluted FC state

Goal: protect the wizard + Pin Assignment panel from a customized FC config
poisoning the "defaults" view. Users with hand-edited resource maps load
into the configurator today and the wizard treats their edits as the
silkscreen baseline — surprising, hard to recover from.

Date: 2026-05-03 · Status: exploration / draft

---

## TL;DR

Most of the infrastructure already exists. Add an HTTP fetch of the
target's stock unified-targets config, parse the `resource ` lines, use
those as the authoritative `padDefaults`. Cache by target+firmware
version in localStorage. Keep the existing "Current" column showing the
FC's live state; the diff between Defaults (cloud-fetched) and Current
(FC-reported) becomes naturally informative — exactly the dual-header
design we already render.

**Net add: ~80–120 LOC + cache layer.** No firmware changes. Falls back
to existing behavior on fetch failure / private targets / offline.

---

## What's already in place

| Piece | Location | Status |
|---|---|---|
| Target identification | [FC.CONFIG.boardIdentifier / targetName / boardName](src/js/fc.js#L43-L47) populated from MSP_BOARD_INFO | ✅ ready |
| Per-target cache key | [WingTuningTab.vue:2140-2143](src/components/tabs/WingTuningTab.vue#L2140-L2143) `padDefaultsKey(target)` | ✅ ready |
| localStorage save/load | [WingTuningTab.vue:2143-2160](src/components/tabs/WingTuningTab.vue#L2143-L2160) `loadPadDefaults` / `savePadDefaults` | ✅ ready |
| Source-tag UI | [WingTuningTab.vue:356-366](src/components/tabs/WingTuningTab.vue#L356-L366) — template already branches on `padDefaults.source === 'firmware'` | ✅ ready |
| Dual-header table | [WingTuningTab.vue:402](src/components/tabs/WingTuningTab.vue#L402) `wingPinAssignCurrent` + Defaults column | ✅ ready |
| Lifecycle hook | [WingTuningTab.vue:2110](src/components/tabs/WingTuningTab.vue#L2110) `ensurePadDefaultsForCurrentBoard()` runs on connect | ✅ ready |
| Resource parser | `readResourceDefaults` (parses `resource ` CLI lines into `{motors, ledStrips}`) | ✅ reusable |

The configurator already has a notion of "padDefaults source" — currently
just `'firmware'` (read from live FC) vs others. We extend with `'cloud'`
as a higher-trust source.

## What's missing

1. **HTTP fetch of unified target config** from an external source
2. **Cache invalidation strategy** — when does a stale cache hurt?
3. **Fallback chain** — cloud → bundled → live-FC → offer manual paste
4. **Refresh button** in the Pin Assignment panel header

---

## Source for unified target configs

**Primary**: `https://raw.githubusercontent.com/betaflight/unified-targets/master/configs/default/<TARGET>.config`

- Community-maintained, ~150 boards covered
- Plain-text format: same `resource MOTOR/SERVO/LED_STRIP/...` syntax we already parse
- Zero auth — direct raw fetch
- CORS: GitHub raw allows cross-origin GETs

Example response shape (FLYWOOF405NANO.config excerpt):

```
# config: <board>
resource MOTOR 1 B06
resource MOTOR 2 B07
resource MOTOR 3 B08
resource MOTOR 4 B09
resource SERVO 1 NONE
resource LED_STRIP 1 A08
...
```

Drop everything except `resource ` lines, run through the existing
`readResourceDefaults` parser. Done.

**Fallback (offline / unknown target)**: keep the current behavior of
reading the live FC's `resource show` output. Tag `padDefaults.source`
as `'fc-fallback'` so the UI can surface a banner: *"Using current FC
state as defaults — silkscreen baseline unavailable for $TARGET."*

**Nice-to-have**: bundle the most common targets into the configurator
itself at build time (~50 KB total for 150 boards). Then offline-first
behavior even on truly cold first connect. Defer to v2.

---

## Proposed flow

```
On connect (after MSP_BOARD_INFO arrives):
  target = FC.CONFIG.targetName || FC.CONFIG.boardName || boardIdentifier
  fwVersion = FC.CONFIG.flightControllerVersion
  cacheKey = `wing.cloudPadDefaults.${target}.${fwVersion}`

  cached = localStorage[cacheKey]
  if (cached && age < 30 days) {
      padDefaults.value = { ...parse(cached), source: 'cloud-cached' }
      return
  }

  try {
      response = await fetch(`https://raw.../${target}.config`, {timeout: 5s})
      padDefaults.value = { ...parse(response), source: 'cloud' }
      localStorage[cacheKey] = response
  } catch {
      // network error / 404 / target not in unified-targets
      padDefaults.value = { ...readFromFC(), source: 'fc-fallback' }
      // surface a non-blocking warning banner
  }
```

The `padDefaults.source` field already drives some UI ([WingTuningTab.vue:356-366](src/components/tabs/WingTuningTab.vue#L356-L366)) — we extend with three new
values:

| Source | Meaning | UI styling |
|---|---|---|
| `'cloud'` | Just-fetched authoritative | green/checkmark, "Verified silkscreen defaults" |
| `'cloud-cached'` | Last fetched within 30 days | green/checkmark, "(cached)" subtext |
| `'fc-fallback'` | Couldn't reach cloud, using live FC | yellow/warning, "Defaults could not be verified — using current FC state" |

---

## Cache strategy

- **Key**: target name + firmware major version (`FLYWOOF405NANO.4.6`)
- **TTL**: 30 days. Configs rarely change between minor firmware versions.
- **Invalidation**: a "Refresh defaults" button in the Pin Assignment
  header that bypasses cache and re-fetches.
- **Stale cache hit**: still preferred over FC-fallback if cloud fetch
  fails (better-than-nothing).

---

## What this DOESN'T solve

- Doesn't help if user has wing-fork firmware compiled with
  custom resources that aren't in unified-targets (rare; mostly the
  fc-fallback path catches this)
- Doesn't validate that the FC's current pad mapping actually matches
  the silkscreen — but the dual-column display already makes that
  visible to the user (Defaults vs Current → user spots the diff)
- Doesn't mediate runtime behavior. CLI batches the wizard fires still
  go to the FC; this just changes what "Defaults" means in the UI

---

## Effort estimate

| Slice | Effort | Files touched |
|---|---|---|
| Fetch + parse + cache util | 30 min | 1 new file `src/js/utils/wingCloudPadDefaults.js` |
| Hook into `ensurePadDefaultsForCurrentBoard()` | 15 min | `WingTuningTab.vue` |
| Source tag UI (3 new states) + warning banner | 30 min | `WingTuningTab.vue` template + locale strings |
| "Refresh defaults" button | 10 min | template + handler |
| Tests for parser + cache + fallback chain | 45 min | new test file |

**Total**: ~2 hours coding + 1 hour bench validation across 3-5 boards.

---

## Open questions for bench

1. Does the unified-targets repo cover the boards Brian uses
   day-to-day? (FLYWOOF405NANO confirmed in repo as of 2026-04-30; need
   to verify TMOTORF7X2, FURYF4OSD, etc.)
2. Should the cache be per-firmware-major-version or per-full-version?
   Major is probably enough — silkscreen pad mappings rarely change in
   point releases.
3. Should we batch-prefetch popular targets at app start? Probably not
   — it'd waste bandwidth for users who only ever connect to one board.

---

## Suggested commit sequence (if user wants to proceed)

1. `feat(wing): add cloud target-config fetch utility + parser`
   — new `wingCloudPadDefaults.js` + tests
2. `feat(wing): use cloud-fetched defaults for Pin Assignment when available`
   — wire into `ensurePadDefaultsForCurrentBoard`, source-tag handling
3. `feat(wing): add Refresh Defaults button to Pin Assignment panel`
   — UX for cache override
4. `docs(wing): document the pad-defaults trust hierarchy`
   — CLAUDE.md note + comment expansions
