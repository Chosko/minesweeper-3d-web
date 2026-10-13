# Audio

## OVERVIEW

Synthesized sound effects for game events, built entirely from WebAudio
oscillators and filtered noise (no audio assets), plus the mute and volume
they play at. The values belong to the settings store
([settings.md](settings.md)); this module only applies them.

| File | Implements |
| --- | --- |
| `js/audio.js` | `Sfx` singleton, exported `sfx` instance, free-function wrappers, master signal chain, mute/volume gain, auto-unlock |

The consumers are `js/main.js` (the 3D game's event-to-sound mapping,
`unlock`), the Classic 2D mode (`js/classic2d/mode.js`), which plays the same
cues through the `sfx` instance `main.js` hands it as its `sound` option and
imports no sound module itself, and the settings appliers
(`js/settings/appliers.js`), which call `setVolume` and `setMuted` with the
store's values at start-up and on every change. Both modes therefore play at
the one shared volume and mute. The mute
label and volume sliders are bound to the store, not to this module — see
[app-shell.md](app-shell.md).

## PUBLIC API

**Singleton**
- `js/audio.js::Sfx` — `new Sfx()` always returns the one shared instance.
- `js/audio.js::sfx` — that instance, created at module load. `main.js` uses
  `audio.sfx ?? new audio.Sfx()`.

**Mute and volume** (in memory only, all safe before any AudioContext exists)
- `Sfx.muted` — boolean field, default false.
- `Sfx.setMuted(m)` — unmuting (muted → unmuted) also creates/resumes the context; ramps master gain.
- `Sfx.toggleMute() -> boolean` — returns the new muted state; the game mutes through the `muted` setting, not this.
- `Sfx.setVolume(v)` — clamps to 0..1, ignores non-finite input; ramps master gain.
- `Sfx.getVolume() -> number` — 0..1, default 0.7.
- `Sfx.unlock()` — creates/resumes the AudioContext; no-op while muted. Call from a user gesture.

**Sounds** (each no-ops when muted or when WebAudio is unavailable; each self-throttles)
- `Sfx.reveal(count = 1)` — cells opened; intensity scales with `log2(count)`; `count >= 6` adds a whoosh + pentatonic cascade.
- `Sfx.flag(on = true, count = 1)` — flag placed (`on`) or removed; its voice is `flagVoice(on, count)`.
- `flagVoice(on, count)` — pure: `{ on, count, steps, level }` for a flag click changing `count`
  cells, capped at `FLAG_COUNT_CAP` (26); steps and level never fall as the count grows, counts 1, 2,
  4, 8 and 16 differ, count 1 is the single flag sound with no step. A mass flag stacks rising steps
  through `FLAG_STEP_RATIOS` above the plant; an unflag (a number's undo) the same steps falling
  below the pluck.
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
- **No storage:** the module reads and writes no `localStorage` key; mute and
  volume start at their defaults until the settings appliers set them.
- **Environment safety:** `window` access is guarded (`typeof window`
  checks), so the module imports under
  `node --test` without a DOM; it then reports unmuted, volume 0.7, and every
  sound no-ops.
- Event semantics (what counts as reveal vs chord vs noop, flag direction for
  mixed results) are decided by the callers, not here: `main.js::onAction`
  for the 3D game and `cue` in `js/classic2d/mode.js` for Classic 2D, which
  mirrors it ([classic2d.md](classic2d.md)).

## DOMAIN DEPENDENCIES

- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md) — gameplay
  fidelity to the original is the overriding rule, and its preamble lists
  sound among the things that may be improved freely. Audio enforces no
  gameplay rule: a sound must never change, delay, or gate a game action.
- [../domain/INDEX.md](../domain/INDEX.md) — product/domain index; it holds no
  audio-specific document.

## CROSS-REFERENCES

- [app-shell.md](app-shell.md) — `main.js` maps actions to sounds — the 3D game's
  `reveal`/`toggleFlag`/`chord` results (`revealed`, `flagged`, `unflagged`, `exploded`) and the
  state view's `version` pick the sound — and calls
  `unlock()` on start, ready-click, controller resume and after a volume or
  mute change; the M key and Sound buttons set the `muted` setting.
- [classic2d.md](classic2d.md) — the Classic 2D mode's `sound` option: every
  2D action, by mouse, keyboard or controller, plays the 3D game's cue for
  its outcome (reveal, flag, chord, noop, explode, win); a flag before the
  first reveal changes nothing under the reference rules and is silent.
- [settings.md](settings.md) — the store holding `volume` and `muted`, and
  `applyAudio`, which drives `setVolume` / `setMuted`.
- [input.md](input.md) — the keyboard/pointer gestures that trigger auto-unlock
  and the actions that produce sounds originate there.
- [rendering.md](rendering.md) — no direct link; the loss flash and reveal
  wave run alongside `explode()` but are driven from `main.js`.
- [testing.md](testing.md) — no automated test listens to the sounds; verify by ear in a browser.
  `tests/settings-appliers.test.mjs` checks that the module keeps no `localStorage` keys;
  `tests/classic2d-mode.test.mjs` pins which cue each Classic 2D action calls on a fake sink, that
  `main.js` hands the mode the one `sfx` instance, and that the mode and the replay viewers import
  no sound.

## WHEN TO READ THE SOURCE

- Retuning or redesigning a specific sound (frequencies, envelopes, timing, gain levels).
- Adding a new sound effect: copy the `_ok()` + `_throttle()` gate and use the primitives.
- Changing the volume curve, compressor settings, or the module's starting defaults
  (the saved defaults are the settings schema's).
- Debugging silence: autoplay policy, suspended context, the `muted` setting on,
  voice cap reached, or a throttle swallowing rapid calls.
- Rendering sounds offline (e.g. for an automated audio test) through `_setContext`.
- Changing what happens on unmute or making unlock work while muted.
