# Contract: the coach's prompt and reading (spec 004's code)

What changes in `src/coaching/` because the insights change. The exact Portuguese wording is written in the implementation and read by the maintainer before any paid call (`npm run analyze` prints the message and the version).

## System prompt (`coachPrompt.ts`), "Estrutura do JSON"

| Line today | Change |
|---|---|
| `totalDeltaS`: "delta acumulado medido pelas amostras. Não é a diferença oficial de tempo de volta; não o cite." | It now agrees with the official difference to a few hundredths; the instruction stays to open with the official difference of the message and not to cite `totalDeltaS`, so the text says it is a sample-based measure close to the official difference, and still forbids citing it. |
| `corners`: "curvas detectadas na volta principal" | the track's corners (places), the same whichever lap is the primary |
| — | `corner.brakingStartDistance` / `exitDistance`: the corner's stretch, from the end of the previous straight to the end of the next one; not a braking point |
| `deltaLossS` | time lost over the corner's stretch, including the exit onto the next straight |
| `braking.brakingPointDiffM` | `null` when one of the laps did not brake in that corner |
| — | `braking.brakedPrimary` / `brakedComparison`: whether each lap braked in that corner; `false` means it only lifted or went flat |
| `throttle.throttleOnDiffM` | `null` when one of the laps did not reach full throttle before the next corner |
| — | `throttle.fullThrottlePrimary` / `fullThrottleComparison`: whether each lap reached full throttle inside the corner |
| coasting | from the lap's slowest point to its full-throttle pick-up (or the end of the corner) |

Task rules 4 and 10 already forbid contradicting a field and citing field names; a new rule: never say a lap braked when its `braked*` is false.

## Reading (`coachReading.ts`)

New phrases in each opportunity, from the booleans, before the difference phrases:

- one lap braked and the other did not: which lap only lifted (or went flat) and which braked;
- neither braked: both lifted or went flat;
- one lap did not reach full throttle before the next corner: which one.

The braking-point and throttle phrases keep their rules and are omitted when the difference is `null`, as today. The opportunity rule and labels do not change.

## `PROMPT_VERSION` (`promptVersion.ts`)

Changes: the prompt text, the new phrase templates (and the test that every template appears in some reference message), and `REFERENCE_INPUTS` with the four new fields, including at least one `false` of each. No other cause; a test keeps checking that the same prompt, builder and reference inputs give the same version.
