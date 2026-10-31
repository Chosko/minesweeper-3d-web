# Settings — Reset all data

## OVERVIEW

The Data panel's Reset all data, which clears everything the game keeps and
reloads into a fresh profile: the confirmation's binder in `page.js` and
the reset itself in `reset.js`, whose head comment states the full
contract. The panel's markup is the Settings page's
([settings-page.md](settings-page.md)).

| File | Responsibility |
| --- | --- |
| `js/settings/page.js` | `bindResetPanel`, the confirmation's binder |
| `js/settings/reset.js` | Reset all data: clears every document, replay blob and reset key, then reloads; reports what could not be deleted |

## PUBLIC API

Confirmation (`js/settings/page.js`)
- `bindResetPanel({ open, panel, yes, no, note }, { reset, desktopHost? })`
  → `{ isOpen, close, clear }`: the confirmation opens with focus on
  Cancel; confirming while it is open (a closed one fading out confirms
  nothing) disables both buttons and calls `reset()` once, a failure
  closing the confirmation and writing its message in the err note
  (`setNote`) — the build's failure line when the reset threw; `close()` →
  false when closed, true and nothing done while the reset runs.
- `RESET_MESSAGE` / `RESET_MESSAGE_DESKTOP` — the confirmation's text,
  deleting from "this browser" on the web build and "this computer" on the
  Steam build (`settingsPageHtml({ desktopHost })`,
  [settings-page.md](settings-page.md)).

Reset (`js/settings/reset.js`)
- `RESET_KEYS` — `LEGACY_KEYS` and `FIRST_USE_LEGACY_KEY`
  (`ms3d.hintH.done`); `ms3d.custom`, `ms3d.best.*` and `ms3d.lastPreset`
  stay.
- `RESET_FAILURE` / `RESET_FAILURE_DESKTOP` — the build's one failure line,
  the web build's asking the player to close the game's other tabs.
- `createReset({ storage, blobStore, legacy?, desktopHost?, waitFor?,
  reload })` → `{ run }`; `legacy` is `{ remove(key) }` over the loose
  keys, the global `localStorage` by default, `null` for none; `run()` →
  `{ ok: true }` after `reload()`, or `{ ok: false, failed, message }`
  (`failed` from `'documents'`, `'replays'`, `'keys'`) with no reload,
  `message` the build's failure line. Never rejects.

## INTERNAL PATTERNS

- **Reset is clear, then reload.** `run()` awaits `waitFor()` (a rejection
  ignored), then clears storage, deletes every blob `blobStore.list()`
  names and removes `RESET_KEYS`, each part attempted whatever failed
  before it. The fresh profile comes from the reload: every owner loads its
  document at start-up, so no store has a reset of its own.
- **Loose keys on the browser build only.** The `ms3d.*` keys are removed
  on the web build alone, the build split being
  [settings.md](settings.md)'s loose-key carry-over: given `legacy: null`,
  the keys part succeeds with nothing to remove.
- **Reset wiring.** `js/main.js` builds `RESET` with `storage`, `blobStore`,
  `legacy` (`null` on the Steam build, the settings store's same value),
  `desktopHost` from `capabilities.desktopHost`, `waitFor` the replay
  library's `load()` then `settled()` (so no owner saves a cleared document
  back), and a `reload` that sets the leave-page guard's `reloading` and
  calls `location.reload()`; `UI`'s `onResetAll` runs it, and `UI` hands
  its own `desktopHost` option to the page and the binder.
- **Back closes the confirmation first.** `UI.closeResetConfirm()` (→ false
  when none is open, or the page is hidden) comes after `closeConfirm` in
  `shellBack` and `historyBack`, so Esc, the controller's
  Back and the browser's Back close it before leaving the page;
  `showSettings` opens the page with it closed.

## DOMAIN DEPENDENCIES

- [../domain/features/settings.md](../domain/features/settings.md) — the
  Data panel and Reset all data.
- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — clearing every document and the blob store.

## CROSS-REFERENCES

- [settings-page.md](settings-page.md) — the Data panel's markup
  (`#set-reset`, `#set-reset-confirm`, the err note).
- [platform.md](platform.md) — `storage.clear()` and the blob store.
- [replay-library.md](replay-library.md) — the replay library `waitFor` waits on.
- [app-shell-pause.md](app-shell-pause.md) — the leave-page guard the
  reload bypasses; [app-shell-ui.md](app-shell-ui.md) — `onResetAll`,
  `UI.closeResetConfirm`.
- [app-shell-navigation.md](app-shell-navigation.md) — `shellBack` and
  `historyBack`.
- [testing.md](testing.md) — `tests/settings-reset.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding something the game keeps outside platform storage and the blob
  store, which Reset all data must also delete: `RESET_KEYS` and `run` in
  `reset.js`.
- Changing the confirmation's focus, close or failure note:
  `bindResetPanel` in `page.js`.
