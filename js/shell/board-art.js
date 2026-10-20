// The board art hand-off on the shell's side: the active theme's board module goes to the Classic
// 2D tile skin's hand-off (js/classic2d/tile-skin.js BOARD_ART) at start-up and on every theme
// change, and only once the module's number font has loaded, so no tile is drawn or cached in a
// fallback font. A switch another overtakes before its font loads is never handed over.
//
// bindBoardArt({ applier, fonts, art?, onError? }) → unsubscribe
//   applier   the theme applier (js/themes/applier.js): onThemeChange(listener(id, module)),
//             current(), board() — the active theme's board.js module, which exports BOARD
//   fonts     a FontFaceSet (document.fonts): load(spec)
//   art       the hand-off; BOARD_ART by default
// A module already active when it binds (an applier that has started) is handed over at once.
import { BOARD_ART } from '../classic2d/tile-skin.js';

/** The font spec that loads a board module's number font: `<weight> 1em "<family>"`. */
export function numberFontSpec(font) {
  return `${font.weight} 1em "${font.family}"`;
}

export function bindBoardArt({ applier, fonts, art = BOARD_ART, onError = (e) => console.error(e) }) {
  let latest = 0;
  function hand(id, module) {
    const ticket = ++latest;
    const board = module?.BOARD;
    if (!board) return;
    Promise.resolve(fonts.load(numberFontSpec(board.font))).then(() => {
      if (ticket === latest) art.set(id, board);
    }, onError);
  }
  const off = applier.onThemeChange(hand);
  if (applier.board()) hand(applier.current(), applier.board());
  return off;
}
