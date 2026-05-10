# Claude Hand-Off Brief: Guest Screen Fixes

**Generated:** 2026-05-10
**Review mode:** B (Code Review / Bug Fix)
**Overall risk:** High (2 blocking findings that affect live projection display)

## DO NOT REWRITE

- Host challenge detection refactor (`detectChallenge` helper) — correct approach, preserves intro precedence
- Guest `useInterpolatedProgress` hook structure — anchor + tick pattern is sound
- Timer cleanup in the interval effect
- Import of `computeRevealState` for local reveal computation

## IMPLEMENTATION CHANGES REQUIRED

- [ ] **FINDING-1** (`app/guest/[sessionId]/page.tsx:199`): Include `runtime.extensionMs` in the reveal config before computing local reveal state. The guest currently uses base `effectiveCfg` without extensions, causing premature "Advancing..." display when the host extends a song.

- [ ] **FINDING-2** (`app/guest/[sessionId]/page.tsx:49-64`): Fix stale tick flash on track change. The `useEffect` reset runs after paint, so for one frame the old tick inflates the new track's progress. Use synchronous state reset during render (React-approved pattern for derived state).

## ASSUMPTIONS TO RESOLVE

- None — all assumptions verified against codebase during review.

## REPO CONVENTIONS TO PRESERVE

- The project's ESLint config flags `setState` in effects and ref access during render. Any fix must avoid both patterns.
- `useMemo` with intentionally limited deps requires the `eslint-disable-next-line` comment.
- All state updates that affect guest display must flow through `commitRuntime` → `persistAndBroadcastRuntime` on the host side.

## RE-REVIEW REQUIRED AFTER FIXES

- [ ] FINDING-1: verify guest reveal timing matches host when extensionMs > 0
- [ ] FINDING-2: verify no flash of revealed content on track transition

## REVISION PROMPT

Apply these two fixes to `app/guest/[sessionId]/page.tsx`:

1. Before computing `localRevealState`, adjust `effectiveCfg` to include extensions:
```
const effectiveNextCfg = runtime.extensionMs > 0
  ? { ...effectiveCfg, nextMs: effectiveCfg.nextMs + runtime.extensionMs }
  : effectiveCfg;
```
Then use `effectiveNextCfg` in `computeRevealState(interpolatedProgress, effectiveNextCfg)`.

2. Replace the `useEffect` tick reset with a synchronous reset pattern:
```
const [tick, setTick] = useState(0);
const [lastAnchor, setLastAnchor] = useState(anchor);
if (anchor !== lastAnchor) {
  setLastAnchor(anchor);
  setTick(0);
}
```
Remove the `useEffect(() => { setTick(0) }, [anchor])` block.
