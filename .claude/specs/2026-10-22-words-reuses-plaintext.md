# words reuses plainText

## Goal
`words()` in `js/settings/bindings.js` repeats the two `.replace` calls that
`plainText` makes. Have it escape `plainText`'s result instead, so the
row-text-to-plain-words conversion lives in one place, with no change in
behaviour.

## Acceptance criteria
- `words(text, glyphs)` returns `escape(plainText(text, glyphs))` and holds no
  `.replace` of its own.
- Every list, help foot and hint the module draws is unchanged: the fast tier
  and the browser tests the change reaches pass unedited.

## Hints
- `js/settings/bindings.js` (`plainText`, `words`)
- `tests/shell-help.test.mjs`, `tests/settings-page.test.mjs` (the lists and the help foot drawn through `words`)

## Drift
none
