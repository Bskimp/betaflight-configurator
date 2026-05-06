# Servo Tab Integration Plan

## Branch

Work stays on `feature/servo-wing-resources`. `wing-main` remains at `40e2f193` unless a separate update is requested.

## Section 1: Resource Assignments

Status: implemented on this branch.

Scope:

- MSP2 motor/servo resource read/write support.
- FC state for motor and servo resources.
- Servo tab Resource Assignments panel.
- Generic fallback pin candidates.
- Timer-aware candidate ranking when hardware analysis is available.

Draft PR note: `notes/pr-section-1-resource-assignments.md`

## Section 2: Generic Function -> Output Mapper

Status: implemented on this branch.

Scope:

- Generic Servo tab `smix` mapper.
- Pure `smix` table: Output, Input, Rate, Speed, Min, Max, Box, Delete.
- All 8 target slots and all 14 Betaflight input sources.
- Mixer-aware output labels while preserving raw target IDs.
- Stable per-servo color accents across the top config table, live bars, mapper rows, and servo resource rows. The config table, bars, and smix mapper key off `servoIndex_e` directly. The resource panel key off `pwmSlotToServoIndex(slot, mixerMode)`, which mirrors the firmware `writeServos()` slot allocation so the same physical servo wears the same color in all four views. Slots not driven by the active mixer render muted.
- Generic aircraft helper buttons.

Draft PR note: `notes/pr-section-2-servo-function-mapper.md`

## Draft Cadence

When a section becomes testable, create or update its draft PR note with:

- summary
- screenshots to capture
- test plan
- upstream-risk notes

Future feature work on this branch should become Section 3, Section 4, and so on, with a matching draft note before it is treated as PR-ready.
