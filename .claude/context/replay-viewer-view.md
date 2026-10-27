# Replay viewer screen — the `#replay` binder

## OVERVIEW

The replay viewer screen's page side: `createReplayView` in
`js/replay/viewer.js` fills `#replay` — the frame, the strip, the board area
with the figures panel beside it, the controls and the key line — and hands
the screen's commands back to the viewer
([replay-viewer-screen.md](replay-viewer-screen.md)), which drives it.
`viewer.js`'s head comment lists the ids; the composition, by size step,
is the head comment of `css/components.css` (*Replay viewer*) and the
`#replay` rules of `css/style.css`.

- `js/replay/viewer.js` — `createReplayView`.

## PUBLIC API

- `createReplayView({root, win?, onCommand, onSpeed, onSeek, onBack,
  onDownload?, onOpen?, onCopy?})` → the `#replay` binder (its ids in the
  head comment): a `ui-frame` centred on the backdrop at its natural size
  for the size step the root area takes
  ([app-shell-kit-layout.md](app-shell-kit-layout.md) § The root area),
  shrinking to fit a smaller area (`#replay-frame`; Back `#rp-back`, its arrow alone, in its title bar and
  the title `#replay-title` its heading), whose body holds the strip across it — the
  figures inline and unlabelled with the code chip `#rp-code` (Copy and
  Copy link call `onCopy`; hidden while loading, failed or with no code) —,
  then `#replay-main`: the board area `#replay-stage`, which takes the room
  the strip, the panel and the controls leave, with the message card over
  it, and beside it, down to its bottom, the figures panel `#rp-figures`
  (`bindFigures`, `bindFiguresLive`; dashes while no replay plays; hidden
  with the code chip on the narrower areas); then the controls: the seek
  bar alone on its row (named Position, its played part following its
  value through `bindSliderFill`, ticks above the track, hatched pause marks
  on it), the tools row (transport — Play's icon follows its label: play,
  pause, restart —, speed, the toggles — `#rp-camera` in 3D only —, the end
  line with its outcome chip after them, Download and Open replay file at
  the row's end), and the key line `#rp-keys` (`REPLAY_KEY_LINE`, its
  controller buttons shown only under `body.pad-connected`, which the
  shell sets while a pad is connected) beside the pauses' line. While a
  replay opens or has failed the controls stay in place, those that need
  a replay disabled. A failed replay whose header reads (no viewer for its
  board, or it does not reproduce) is handed to `view.failed(message,
  known)` as its title and timeline: the frame keeps the title, the seek
  bar its marks and ticks, and the speed choice, Show 3BV and Download stay
  enabled, `download()` saving it; its strip and panel read dashes. A 3D
  replay marks `#replay` `replay--scene`: the shell draws its scene in the
  board area, the frame keeping its white body
  ([app-shell-replay.md](app-shell-replay.md)), and the free-camera notice
  `#rp-free-note`, on the layer over the scene, shows while the camera is
  free. The composition, by size step, is the head comment of
  `css/components.css` (*Replay viewer*) and the `#replay` rules of
  `css/style.css`.

## INTERNAL PATTERNS

- **Controls stay in place.** While a replay opens or has failed nothing
  moves; what needs a replay is disabled, and a failed replay whose header
  reads keeps the parts that header can fill (above).
- **3D in the same frame.** A 3D replay changes only the board area, which
  the shell's scene shows through; the frame, strip and controls are the
  2D ones, `#rp-camera` added.
- **Narrow areas** hide the figures panel and the code chip; the board
  area takes the room they leave.

## DOMAIN DEPENDENCIES

- [../domain/features/replay-playback.md](../domain/features/replay-playback.md)
  — the viewer's controls and overlay.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the viewer in the frame.

## CROSS-REFERENCES

- [replay-viewer-screen.md](replay-viewer-screen.md) — the viewer that
  drives the binder, its commands, keys and figures.
- [app-shell-replay.md](app-shell-replay.md) — the 3D replay scene drawn in
  the board area.
- [app-shell-markup.md](app-shell-markup.md) — `#replay` in `index.html`.
- [app-shell-kit-layout.md](app-shell-kit-layout.md), [app-shell-kit-helpers.md](app-shell-kit-helpers.md)
  — the frame, code chip, `bindFigures`, `bindSliderFill`.
- [testing.md](testing.md) — `tests/replay-viewer.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing the frame, the strip, the controls' layout or the key line: the
  head comment of `viewer.js` and `createReplayView`; the panel's place by
  size step, the `#replay-main` and `#rp-figures` rules of
  `css/style.css`.
