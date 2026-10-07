# Audio

## OVERVIEW

Synthesized sound effects for game events, built entirely from WebAudio
oscillators and filtered noise (no audio assets), plus the persisted mute and
volume settings.

| File | Implements |
| --- | --- |
| `js/audio.js` | `Sfx` singleton, exported `sfx` instance, free-function wrappers, master signal chain, mute/volume persistence, auto-unlock |

The only consumer is `js/main.js` (event-to-sound mapping, mute toggle, volume
slider wiring); the mute label and volume sliders are drawn by `js/ui.js`
(`setSound`, `initVolume`) — see [app-shell.md](app-shell.md).

## PUBLIC API

**Singleton**
- `js/audio.js::Sfx` — `new Sfx()` always returns the one shared instance.
- `js/audio.js::sfx` — that instance, created at module load. `main.js` uses
  `audio.sfx ?? new audio.Sfx()`.

**Settings** (all write-through to `localStorage`, all safe before any AudioContext exists)
- `Sfx.muted` — boolean field, read directly by `main.js` for the initial HUD label.
- `Sfx.setMuted(m)` — stores `'1'`/`'0'` under `ms3d.muted`; unmuting also creates/resumes the context; ramps master gain.
- `Sfx.toggleMute() -> boolean` — returns the new muted state (fed to `ui.setSound`).
- `Sfx.setVolume(v)` — clamps to 0..1, ignores non-finite input, stores under `ms3d.volume`; ramps master gain.
- `Sfx.getVolume() -> number` — 0..1, default 0.7.
- `Sfx.unlock()` — creates/resumes the AudioContext; no-op while muted. Call from a user gesture.

**Sounds** (each no-ops when muted or when WebAudio is unavailable; each self-throttles)
- `Sfx.reveal(count = 1)` — cells opened; intensity scales with `log2(count)`; `count >= 6` adds a whoosh + pentatonic cascade.
- `Sfx.flag(on = true, count = 1)` — flag placed (`on`) or removed; `count > 1` = mass flag/unflag variant.
- `Sfx.chord(count = 0)` — chord knock + triad; when `count > 0` it also calls `reveal(count)`.
- `Sfx.noop()` — soft thunk for an action that changed nothing.
- `Sfx.explode()` — loss boom with debris and rumble tail (~1.7 s).
- `Sfx.win()` — ~1.5 s arpeggio then bell chord.

**Free functions** (thin wrappers over `sfx`): `unlock`, `setMuted`, `isMuted`,
`toggleMute`, `setVolume`, `getVolume`, `playReveal`, `playFlag`, `playChord`,
`playNoop`, `playExplode`, `playWin`. `main.js` calls the instance methods,
not these.

## INTERNAL PATTERNS

- **Signal chain:** every voice -> `bus` (gain 1.4) -> `DynamicsCompressor`
  (threshold -12 dB, ratio 6) -> `master` -> `destination`. Mute and volume act
  only on `master`; voices never read them.
- **Master gain curve:** `muted ? 0 : volume²` (0.7 -> ~0.49). Changes are
  applied with `setTargetAtTime(…, 0.015)` after cancelling scheduled values,
  so toggling never clicks.
- **Lazy context:** no AudioContext exists until `_ensure()` runs (via
  `unlock`, `setMuted(false)`, or the first sound while unmuted). `_ensure()`
  resumes a suspended context on every call and plays a 1-sample silent blip on
  creation to warm the audio thread.
- **Auto-unlock:** the constructor installs capture-phase `pointerdown` /
  `keydown` listeners on `window` that call `unlock()` and remove themselves
  once a context exists. While muted they stay installed (unlock is a no-op).
- **Gate:** every sound starts with `_ok()` (= not muted and `_ensure()`
  succeeded), then `_throttle(key, gap)` keyed per sound on
  `ctx.currentTime` (reveal 35 ms single / 60 ms flood, flag 40 ms, chord 50 ms,
  noop 80 ms, explode 300 ms, win 500 ms). A throttled call is silently dropped.
- **Voice cap:** `MAX_VOICES = 48`; `_tone`/`_noise` drop new voices at the
  cap. The counter is decremented in each source's `onended`.
- **Primitives:** `_tone`, `_noise`, `_bell` use exponential envelopes from
  0.0001 (exponential ramps cannot target 0). `_noise` reads a random offset in
  one shared 2 s white-noise buffer built in `_setContext`; keep any new noise
  voice shorter than ~1.95 s.
- **Randomness:** pitches carry small multiplicative `jitter` so repeated
  sounds vary; sounds are not deterministic.
- **`_setContext(c)`** builds the whole chain on any context (documented as
  "possibly offline"), resetting voice count and throttle timestamps — the hook
  for rendering sounds into an `OfflineAudioContext`.
- **Environment safety:** `localStorage` and `window` access are guarded
  (try/catch, `typeof window` checks), so the module imports under
  `node --test` without a DOM; it then reports unmuted, volume 0.7, and every
  sound no-ops.
- Event semantics (what counts as reveal vs chord vs noop, flag direction for
  mixed results) are decided in `main.js::onAction`, not here.

## DOMAIN DEPENDENCIES

- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md) — gameplay
  fidelity to the original is the overriding rule, and its preamble lists
  sound among the things that may be improved freely. Audio enforces no
  gameplay rule: a sound must never change, delay, or gate a game action.
- [../domain/INDEX.md](../domain/INDEX.md) — product/domain index; it holds no
  audio-specific document.

## CROSS-REFERENCES

- [logic.md](logic.md) — `Game.leftClick/rightClick/chord` results
  (`revealed`, `flagged`, `unflagged`, `exploded`, `version`) are what pick the sound.
- [app-shell.md](app-shell.md) — `main.js` maps actions to sounds, wires the
  M key / sound buttons to `toggleMute`, volume sliders to `setVolume`, and
  calls `unlock()` on start, ready-click and controller resume.
- [input.md](input.md) — the keyboard/pointer gestures that trigger auto-unlock
  and the actions that produce sounds originate there.
- [rendering.md](rendering.md) — no direct link; the loss flash and reveal
  wave run alongside `explode()` but are driven from `main.js`.
- [testing.md](testing.md) — no automated tests cover `js/audio.js`; verify by ear in a browser.

## WHEN TO READ THE SOURCE

- Retuning or redesigning a specific sound (frequencies, envelopes, timing, gain levels).
- Adding a new sound effect: copy the `_ok()` + `_throttle()` gate and use the primitives.
- Changing the volume curve, compressor settings, or the localStorage keys / defaults.
- Debugging silence: autoplay policy, suspended context, mute persisted as `'1'`,
  voice cap reached, or a throttle swallowing rapid calls.
- Rendering sounds offline (e.g. for an automated audio test) through `_setContext`.
- Changing what happens on unmute or making unlock work while muted.
