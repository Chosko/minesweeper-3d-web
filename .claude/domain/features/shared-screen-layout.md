# Shared screen layout

The redesigned arrangement every screen of the game shares, designed with
*Joyful tiles*: the page backdrop, the framed window each screen sits in, the
main menu, the board choice screens, the Daily screen, and the pause,
results, Records, Settings and replay screens with the cards, confirmations
and messages around them — the same layout under every theme, each theme
restyling it.

## Purpose

[product-design.md § Visual design system](../product-design.md#visual-design-system)
gives the game one shared layout that every theme styles, designed together
with the first theme; later themes add styles, not layouts. This feature
composes the game's screens in that shipping layout, so the Steam
milestone's screens are drawn in it from the start. The in-game screen, which
carries live figures of its own, is `in-game-layout`.

## Scope and non-goals

In scope (m2b-themes):

- **New kit components** the layout needs, added to the kit catalogue
  (`theme-system`) with their parts, states and decoration slots, and styled
  by *Joyful tiles* — every component the canvas's *J-Components* artboard
  draws that the kit lacks, among them:
  - the **page backdrop** behind every screen (a dotted paper in *Joyful
    tiles*, a gradient or a flat desktop colour in other themes);
  - the **screen frame** — a window with a head, a body and a foot (a
    status line, or the bar of the screen's actions), and a decoration slot
    for window chrome. The head is the game's own **title bar** on every
    desktop window — the main menu, every board choice, Daily, Records,
    Settings, the replay viewer, the placeholder and the in-game windows:
    Back on the left as an arrow icon (none on the main menu), the **game
    logo** between them, centred while both sides fit at equal width, and
    Minimise, Fullscreen / Windowed and Quit on the right, every one
    icon-only with a tooltip and an accessible name. A window sized by its
    content below the title bar (the Classic 2D game window, `in-game-layout`)
    fits the title bar to that width: Back's side gives way first, moving the
    logo off-centre, then the logo scales down in steps to a legible floor,
    and below the floor it hides; Back and the window buttons keep their
    size. On a phone the head holds only Back and the logo. The screen's name is
    a **body heading** at the top of the window's body, a control the
    screen puts beside its name sitting at the heading's right; the main
    menu has no body heading, the logo naming it;
  - the **game logo** — the straight version at rest: the letters in the
    game colours, a white outline and a short darker extrusion;
  - the **main menu buttons**: the **play
    tile** — a text side with the mode's icon and label, and a square
    preview of the mode's own board —, the **small entry** for
    Records and Settings, smaller and neutral, and on a phone the **phone
    row**, whose preview is a cropped strip inside its right end that never
    sets the row's height. Every main menu button is the same height at
    every size, the selected one included. At rest a button is a pastel of
    its colour with a pastel edge, the small entries the neutral raised
    surface; selected — hover and keyboard focus alike — it takes its full
    colour (the small entries the stronger neutral) and is pushed level
    with the surface, its bottom edge gone; pressed, it takes its full
    colour sunk below the surface — the hover and pressed behaviour of the
    game's other buttons. A disabled or locked button does not move, and a
    locked one darkens when selected. The buttons have no drop shadow and
    the smaller edge, as board options inside windows do. A disabled
    button gives its reason under the label (3D without WebGL 2, with a
    locked preview; *Needs WebGL 2* on a phone row);
  - the **board option** — a board preset with its name, size line and
    mine density, selectable, with the chosen state (a fill and a check)
    apart from its selected state;
  - the **panel toggle** — a quiet icon button with an accessible name,
    exposing its pressed state and drawn sunk while its panel is pinned or
    open —, and the **drawer** — on a phone, a full-width raised bar that,
    open, lies flat on a cream band ending with a line, its label naming
    what it holds;
  - the **section label**, the **key hint** (a key or controller button
    shown beside an action; inside a button it takes the button's own ink),
    the **chip** (a state, a rank or *Coming soon*) and the **list row** of
    recent games;
  - the **stat tile** — label, figure and detail line, plain by default
    with the warm tile as a variant; a new best is marked by a ring in the
    head colour and a *New best* note, and a note can carry an inline
    *Watch* link;
  - the **scene panel** — a framed region of a screen a mode's own renderer
    draws into;
  - the **button variants** — the **quiet** button (a flat surface with a
    border ring and no drop edge, for row actions and the compact chip
    actions), the **danger** button (the destructive confirm action), and
    the primary **go** and **stop** buttons of the button colour rule
    (**Button colours** below); a **latched toggle** (Swap clicks, the
    touch view modes and the 3D Space latch, Show 3BV, Free camera, the
    panel toggles) is a quiet button when off and shows its on state with
    the pressed look;
  - the **icon set** — the canvas's stroke icons in one kit source, drawn
    in the text colour, and a **leading-icon slot** before a button's label,
    sized by the button's size; the icon is hidden from assistive
    technology and the button keeps its label as its name, and an
    icon-only button carries an accessible name. Each screen puts the
    canvas's icons on its own buttons;
  - the **form controls** — the **switch row** (label with its help line on
    the left, the switch at the right edge, the label keeping its ink when
    the switch is locked), the slider's **fill** from the start to the
    thumb, kept in step by the kit, with the value beside the track, and
    the number field's **invalid state**, which marks a refused field;
  - the **confirm box** — a danger-filled box with an optional heading, its
    text, then the danger action beside Cancel — for every confirmation:
    the pause card's (*Leave this game?*, for Restart and Main menu alike),
    the Records replay delete (an inline row of the replays table) and
    Settings' *Reset all data*;
  - the **warn and err notes** — filled lines with a leading info or
    warning glyph: warn for the Custom refusals, the 3D no-guess reason,
    the density hint, a board code from the other mode and the 3D
    pointer-lock refusal; err for a refused board code and the Settings
    reset failure;
  - the **muted panel** — the panel on a sunk surface, keeping the panel's
    border and drop edge, for the Custom form, the Learn 3D explanation and
    the Records overall block;
  - the **ruled table** — header row, a rule across each full row, figures
    right-aligned, a rank column, label over value on phones, and a
    recent-games variant without a board column, its board codes plain
    text;
  - the **pager**, lighter than a row of buttons, the current page filled;
  - the **code chip** — a compact sunk pill with quiet compact *Copy* and
    *Copy link*, its *Board code* label a section label outside it, above
    it and full width on phones, the same shape for every caller;
  - the **controls list** — one ruled two-column list (the key in plain
    words on the left, the action on the right) for the pause card, the 3D
    ready card, the help card and the Settings bindings, fed from the
    bindings source in the canvas's short wording; the pause card and the
    help card show one help list, which also names the keys that work in
    play and that the canvas's lists leave out;
  - the **frame size steps** — the frame's head and foot, the buttons and
    the type follow the desktop step, a **compact** step for the smaller
    desktop windows and a **touch** step for the phone sizes;
  - the **white action foot** — the foot of the board choice, Daily and
    results screens, a fixed white bottom bar on phones except the
    results', which sits in flow at the card's end; the game window keeps
    its yellow foot;
  - the **message card** layout, with ink text and an even gap between
    icon, title, text and actions, and the **status cards** (generating,
    failed board) centred on the board column;
  - the **scrim** — the plain backdrop colour with no blur, the same over
    2D and 3D; behind the 3D ready card, the pause card and results only
    the board or the scene and the window's title bar show.
- **The selected state** — buttons, menu entries and board options follow
  the kit's state model (`screen-components` § Scope and non-goals): *Joyful
  tiles* draws them raised by default, level with their surface when
  selected, sunk below it when pressed, and flat when disabled, as
  *J-Components* shows. A board option opened by pointer keeps its resting
  look; its focus ring shows on keyboard focus only.
- **The focus ring** — every focusable control, the segmented option,
  slider, link, tab and checkbox included, takes the switch's ring: the
  ink outline with the yellow halo.
- **Button colours** — a button that confirms or goes forward is a green
  go button, never red: Play, Play again, Resume, Restart on the pause
  card, Retry, Try again, Reload, Click / Tap to play, Play Cube Intro,
  Play with drag-to-look and the replay viewer's Play. Red — the stop
  button, or the danger button in a confirm box — is only for Quit and the
  destructive confirmations: leaving the game, restarting, deleting a
  replay and resetting all data. Both rest in a stronger pastel and take
  their full colour when selected. Pause is always the white secondary
  button, the replay viewer's play / pause button included while it shows
  Pause. An on/off toggle is never red when on: it shows the pressed look.
  The key labels on buttons are *Esc* on Resume, *Space* on the replay
  controls and the controller glyphs of the controller-hints frames;
  confirm buttons carry none. The large confirm buttons are slimmer than the large
  primary button.
- **The title bar's window buttons on the web** — Minimise, Fullscreen /
  Windowed and Quit press like any button and then do nothing: no action,
  no message, no confirmation, no lock. Phones do not show them. What they
  do in the desktop build is `steam-desktop-host`'s (Minimise, Fullscreen /
  Windowed) and `leaderboards-menu-entry`'s (Quit).
- **Main menu** — in the screen frame like every other screen, its head
  the title bar with no Back. The window
  holds only the main menu buttons: two columns of play tiles — Classic 2D
  and Hexagon, Triangle and Surface, 3D and Daily —, then Records and
  Settings as a row of small entries; Quit is the title bar's. Each play tile
  shows its own preview, cropped from the middle of its board so that no
  board edge shows: Classic 2D, Hexagon and Triangle on the dark scene
  background, Surface, 3D and Daily on translucent white over the button
  colour. Classic 2D shows a real Intermediate game in progress; Hexagon
  and Triangle their Intermediate boards (`flat-grid-menu-entries`);
  Surface the torus; 3D a still of the menu's demo board cut out on a
  transparent background; Daily a generic calendar icon. 3D without WebGL 2 is disabled, with its
  reason under the label and a locked preview. The foot holds only the
  build label, in the canvas's label style with the shipped version as its
  content. The menu opens with the last mode played selected
  (`game-shell`); a fresh profile without WebGL 2 opens on Classic 2D. The
  controls reference, the sound switch and the volume live on the Settings
  page only. The window takes fixed values per window
  size, as the menu artboards draw them, and scrolls on a window too short
  for it. On a phone: one column of phone rows, each play row's preview a
  cropped strip inside its right end, the disabled 3D row reading *Needs
  WebGL 2*, and the foot as J-Menu-p draws it.
- **Board choice screens** — Classic 2D and 3D, one composition: a window
  sized to its content and centred on the page; the mode's name is the body heading, with the **panel toggle**
  (accessible name *Settings & bests*) at its right. By default the window
  shows only the Board list and the foot, and is as narrow as its content
  allows: the section label *Board*, the board options, Custom, a divider
  and *Insert Board Code*. The **panel** opens to the right of the list,
  the window widening and staying centred, and holds what the selection
  needs: for a preset the no-guess switch under *Board settings* and the
  board's three bests — time, 3BV/s and efficiency, each with its date, a
  dash and "no best yet" when there is none — titled with the board and
  the switch's setting, then *All records* under the bests, opening the
  Records screen on the selected board and switch; for Custom the no-guess
  switch (with its hint or the reason it is unavailable), the size form —
  on the panel, not in a box of its own; in 3D with a Depth field — with
  its info line, *Random* and the refusal line, then the bests for that
  size; for *Insert Board Code* the code field and its one-line feedback.
  - **The pin.** Pressing the toggle pins the panel open, and pressing it
    again unpins it. The pin is a stored preference: it holds across
    sessions and across every mode's board choice until the player unpins
    it.
  - **Auto-open.** Selecting Custom, *Insert Board Code* or Learn 3D opens
    the panel even when it is not pinned; selecting a preset closes it
    again unless it is pinned. While one of those three is selected the
    panel stays open even when the player unpins it; the toggle then
    changes only the stored preference.
  - **The foot** holds only *Play*, on the right, disabled while there is
    nothing valid to play — for *Insert Board Code*, until a code is
    entered.
  - The last board played is the one selected when the window opens. The no-guess switch is a
    switch row; the bests are plain stat tiles; refusals, reasons, the
    density hint (inside the board settings, under the switch) and the
    board code feedback are warn and err notes, and a refused field or
    code takes the invalid state. The window's option rows grow denser on
    the smaller desktop windows so the window fits them — a rule that never
    reaches phones.
  - **On a phone** — one column, full-bleed, with no panel toggle in the
    head: a full-width drawer under the Board list holds the panel, its
    label naming what it holds (*Board settings*, *Board code* or *Learn
    3D*), under the same pin and auto-open rules; the bests are a single
    one-row table after the settings; Back, *Play* and the white bottom bar
    that pins *Play* are slimmer.
  - **3D** — the options open with Learn 3D, outlined in its own accent,
    then the cube presets in one group (**3D presets** below); while Learn
    3D is selected the panel shows only how 3D works and that the lesson
    keeps no records.
- **3D presets** — the 3D board choice offers four presets in one group
  with no group label, named as results and Records name them: Cube Intro
  (6 × 6 × 6, 10 mines), Cube Beginner (6 × 6 × 6, 20), Cube Intermediate
  (8 × 8 × 8, 40) and Cube Expert (10 × 10 × 10, 100). Records and replays
  of a 4 × 4 × 3 board with 4 mines or a 5 × 5 × 3 board with 6 show as
  custom boards, by `3d-play-flow`'s rule for dropped presets. Every 3D
  board starts at the camera's ordinary spacing. A Learn 3D win offers
  *Play Cube Intro*, with a line saying Cube Intro is a real board with a
  timer and records.
- **Daily screen** — a window sized to its content, *Daily* as its body
  heading; on the left today's date, the intro line and one
  entry per mode in menu order (`game-shell`), each mode with a daily board
  with its state beside the name — a won row shows a *Won* badge and, apart from it,
  the time in the game's standard time format, to the thousandth of a
  second, as the results, Records and leaderboard screens show it — and
  their board line, the others *Coming soon*; on the right the selected
  mode's board preview (its closed daily board with the marked start cell
  or cube), its status row — the state at the left, the days
  in a row and the longest run at the right — and its code chip, a
  coming-soon mode showing its colour badge; the white action foot with
  the summary, *Watch replay* and *Play*. On a phone: one column, no title, no border and no preview, the
  code shown instead, a rule between the mode list and the detail.
- **Results screen** — one column, its width by window size, over the game it
  ended, in the order and with the content `results-screen` gives, and the
  3D changes `3d-results-records-screens` gives. A loss takes the canvas's
  neutral header, not the win look; the board line names the mode, and in
  3D carries the rank at its end. The figures are plain stat tiles, the
  details a ruled table, the 3BV solved bar the kit's styled track, every
  action carries its icon, and the foot is the white action foot. The
  details read in the canvas's wording, except that clicks read *reveal /
  flag* while Swap clicks is on. No first-use toast draws over the card.
  On a phone the figure tiles go two by two, the code chip stacks, *Play
  again* runs full width, then *Watch replay* and *Records* side by side,
  then *Main menu*; the action bar sits in flow at the card's end and the
  page scrolls.
- **Records screen** — the content `records-screen` gives, its tabs Recent
  games, Top 10, Replays and Leaderboards, the last showing its coming-soon
  panel with no pager. The frame is inset on the backdrop, not full
  height, the mode switch (its modes `flat-grid-records-replays`') at the
  right of its *Records* body heading. The left column's sections sit on the frame under section
  labels, the overall block alone a muted panel; the bests are plain
  tiles with an inline *Watch* link, the counters sunk tiles. The board
  picker is one line, *Daily* among its options. An empty chart shows only
  its centred line. The tables are ruled, one line per row on desktop, the
  range captions kept beside the kit's pager; the replays library's row
  actions are quiet icon buttons — *Watch*, *Download*, *Pin* and an
  icon-only delete — and the delete confirms in an inline row. On a phone
  the mode switch is a full-width bar under the head and the picker
  scrolls sideways.
- **Settings page** — the content `settings` gives, in a frame inset on
  the backdrop that fits without scrolling on the largest window; on the
  compact windows two independent stacks; every setting row ruled; the
  Data panel's exports small buttons with download icons, *Reset all data*
  confirmed in a confirm box and its failure an err note; the bindings
  list is the page's controls reference. On a phone the bindings device choice
  spans the full width, each option's label wrapping inside it, and the
  exports stack.
- **Pause card, replay viewer, generating and failed-board cards, the 3D
  ready card and its lock states, the Learn 3D prompts and end cards, the
  placeholder screen (*Coming soon*), the confirmations, the toasts, the
  fatal card, the no-JavaScript notice and the 404 page** — each in the
  frame or card the canvas draws for it, with the content its owning
  feature defines. Every card animates in and out, respecting reduced
  motion. Among them:
  - the **pause card** — a title block with the full board line (mode,
    board, size, mines, no-guess) and a status line; Resume, Restart and
    Main menu with their icons; Sound as a switch row and Volume as a
    filled slider; the controls list; the confirm box for Restart and Main
    menu. With no game in progress the status line says so — that the
    board is not started yet before the first click, that the game is over
    once it is won or lost — Restart comes first as the primary action and
    there is no Resume;
  - the **3D ready card** — sized per window step, its board line, a plain
    success line for Learn 3D, the controls list, the icons the canvas
    draws, the pointer-lock refusal as a warn note, and a phone landscape
    layout with no Back: the title, the board line, *Tap to play* and the
    Learn line in one column, the touch rows alone in the other;
  - the **replay viewer** — a frame inset on the backdrop; an overlay bar
    across the body's full width with its figures inline and unlabelled; a
    full-width seek bar with no label or readout, its played part filled;
    the files actions at the end of the tools row; one keyboard key line,
    controller glyphs only while a pad is connected; the end line (a won
    badge and the time) in the tools row; the Show 3BV tints drawn from
    the confetti colours; the recorded dot pointer and trail, its rings in
    the canvas look with the shipped expansion. In 3D the scene sits inside the frame's board
    area, and the canvas's free-camera notice shows. A failure keeps the
    frame's heading and the controls that still work. The phone layouts
    follow the replay artboards;
  - the **placeholder** — a lock badge above *Coming soon*, its back
    actions with the arrow icon;
  - the **fatal card**, its Reload focused when it appears, and the
    context-lost card, *Click to reload* carrying a refresh icon;
  - the **toasts**, centred at the bottom of the page — windowed at the
    desktop host, the page is the window: the toast sits at the window's
    bottom, centred on it and no wider than it, over its bottom bar.
- **Copy** — the canvas's wording for the toasts, the board code lines
  (valid, from the other mode, incomplete — which the board code parser
  reports as its own reason), the board-code summary, the refusals, the
  game window's foot line, the 3D ready tip, the results board line and
  equal-best note, and the live figure notes `in-game-layout` gives. A board code from another version keeps both of its
  reasons in the canvas's sentence form, the newer case with its reload
  action.
- **The 3D scene in a panel** — the 3D renderer draws into the scene panel's
  rectangle when a screen has one (the Daily screen's cube, a 3D replay's
  board area), and full-window in a 3D game. The main menu's 3D tile shows
  a still image.
- The shared layout at every window size the game supports, from the
  phone sizes to the largest desktop window the canvas draws.

Non-goals:

- The in-game screen of either mode — `in-game-layout`.
- What a screen does: entries and routing, pause and restart rules, results
  contents, records rules, settings behaviour — their owning features
  (`game-shell`, `settings`, `results-screen`, `records-screen`,
  `replay-playback`, `3d-results-records-screens`, `3d-play-flow`,
  `classic-2d-square-play`). This feature arranges and styles them; it adds
  only the board choice screens' bests, a view over the records store, and
  changes only the 3D presets (**3D presets**).
- The Hexagon and Triangle modes and their screens — `flat-grid-modes` and
  `flat-grid-menu-entries` (`m2c-flat-grids`). The Surface mode and its
  screens — deferred to `m6-launch`; until then its entry opens the
  placeholder screen. The
  Campaign and demo entries — each arrives with its milestone.
- Text the artboards carry as placeholder (sample figures, the build
  label's version, the 3D daily code) — the screens show the game's real
  content, and copy follows the owning features' wording where the canvas
  draws none (**Copy** above).
- Canvas values that contradict a product rule — the Classic 2D Custom
  mine cap stays the board choice's measured rule, and *· no-guess* stays
  off the bests title and summary of a custom board that cannot be
  no-guess.
- Theme styling beyond *Joyful tiles* — later themes style these components
  through the theme skill.
- The game logo's bouncy version — reserved for a game-start animation that
  settles into the straight logo, not built here.
- The m3-on-steam screens and controls drawn in this layout — the
  leaderboards in Records' Leaderboards tab and what Quit does
  (`leaderboards-menu-entry`), what Minimise and Fullscreen / Windowed do
  in the desktop build (`steam-desktop-host`), the leaderboard screen in the screen frame
  (`leaderboard-screen`), the rank panel in the results screen
  (`results-steam-rank`), and the rebinding controls on the Settings page
  with every key hint and the in-game controls reminder reading the current
  bindings (`input-rebinding`) — each defined by its own feature.

## Architecture

Built within the recorded technical direction — plain DOM, static markup
toggled by class, no framework (see
[technical-direction.md](../technical-direction.md)); the current shell and
kit are described in [app-shell.md](../../context/app-shell.md),
[app-shell-kit.md](../../context/app-shell-kit.md) and
[app-shell-kit-helpers.md](../../context/app-shell-kit-helpers.md).

- **Kit additions.** Each new component is a documented markup pattern in
  the kit catalogue, with structure in the base stylesheet and every visual
  value in the theme stylesheet (`theme-system`). A screen uses components
  by their catalogued names only; it carries no styling of its own beyond
  placement. The icon set is one kit source the button helpers draw from;
  the slider's fill is a kit behaviour that follows both input and
  programmatic value changes; the controls list reads its rows from the
  bindings source, so rebinding updates every list.
- **Size steps.** The frame's head and foot, the buttons and the type
  resolve per size step — desktop, compact, touch — each step's values
  held by the theme stylesheet. The desktop and compact steps are chosen
  from the available area (below), never from the desktop window's own
  size: the compact step is taken when the area falls below the desktop
  step in width or in height, for the frame's natural size and its head
  alike. The touch step is the web build's alone, chosen from the browser
  window; the desktop host never takes it.
- **Screen frame.** Every screen's outer composition, the in-game windows'
  included. Each screen has a **natural size**: the size its desktop
  artboard on the canvas draws or, where the screen says so, its
  content's — the game window's is its board at the board scale's tile
  plus its chrome (`in-game-layout`). The frame takes its natural size
  within the **available area** — the browser window on the web, the work
  area (the monitor less the taskbar) of the display the window is on at
  the desktop host — and its content shrinks to fit when the natural size
  does not, never growing past it. On the web and in desktop fullscreen
  the frame sits centred on the backdrop; in the desktop's windowed mode
  there is no backdrop and the frame is the window, its size reported to
  the host on every screen change and every change of the frame's size
  (`steam-desktop-host`). The frame's head is the title bar, its body
  opening with the screen's heading and the control beside it; its body
  scrolls when the content is taller than the available area, head and
  foot staying in view. At the touch step the frame keeps the layout its
  phone artboards draw. The title bar's window buttons reach the desktop
  host through the platform layer's capability flags and the page bridge
  (`steam-desktop-host`); with no host they do nothing.
- **Screen compositions.** The menu, board choice, Daily, pause, results,
  Records, Settings, replay viewer, cards, confirmations and messages
  composed inside the frame from kit components, on the element ids,
  routes, default focus and controller navigation targets their owners and
  tests rely on; a change that moves one moves its owners with it.
- **Board choice bests.** The board choice screens read the records store
  through its existing read interface and its change notification; they
  hold no records of their own.
- **Scene panel.** The 3D renderer gains a target rectangle: the shell
  hands it the panel's rectangle while a screen with a scene panel shows —
  measured again on every screen change, window resize and change of the
  panel's own box, which a `ResizeObserver` reports —, and the full window
  otherwise; it draws only there, with the panel's own
  frame and corners drawn by the theme stylesheet over it.
- **Menu previews.** Every play tile shows its own preview, whichever
  tile is selected: Classic 2D's is the Classic 2D board view
  drawing a game in progress, cropped to the tile; 3D's a still image of
  the demo board; Daily's an icon.
- **Main menu buttons.** The menu's play tiles are an open-ended grid of
  two columns: a mode joins it by adding one play tile, with no change to
  the menu's composition.
- **Board choice panel.** One panel behaviour for every mode's board
  choice: open while pinned or while Custom, *Insert Board Code* or Learn
  3D is selected, closed otherwise; the window's width follows it, as a
  desktop window and as the phone drawer alike.
- **Design status per screen.** The canvas's *Joyful tiles* page is the
  finished design: J-Tokens (every token) and J-Components (every kit
  component in every state) are the source of the theme's tokens and kit
  styles; J-BoardSheet and J-3DSheet are the boards'; and every screen is
  drawn at each supported window size (`J-<Screen>-xl`, `-l`, `-m`, `-p`,
  and `-ls` where a phone in landscape applies) with its states
  (`J-<Screen>-states`), the menu's previews on J-Menu-extra. A screen is
  built from its artboards, read as data from the canvas
  https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC; boards on its other
  pages are history, not design. The title bar and game logo, the main
  menu buttons, the collapsible board choice panel and the button colour
  rule take their exact sizes, colours and positions from J-Components
  (*Main menu buttons*, *Menu entry*, *Buttons*, the section *Window title
  bar, confirm and cancel buttons, panel toggle, drawer* with its row *Game
  title · title-bar logo*, the stat row), J-Tokens (*Menu entry pastels*),
  J-Logo-proposals (4a at rest), J-Menu-xl, -l, -m, -p, -states and -extra,
  J-C2D-xl — the reference screen — and J-C2D-xl-expanded (interactive in
  Play), J-C2D-l, -m, -p, -p-expanded and -states, and J-C3D-xl, -l, -m,
  -p and -states, beside every other screen's artboards.

## Data and state

- **The board choice panel's pin** — one stored view preference shared by
  every mode's board choice, saved through the platform layer in its own
  document `shell.boardPanel` as the Records screen's view preferences
  are, read before the first screen; unpinned when nothing is stored, and
  cleared by Reset all data.
- The board choice bests are a view over `personal-records` and
  `3d-game-records`; the last board choices and the last mode played stay
  with their owners.
- Component state (focus, selection, the open Custom fields) is DOM state of
  the hosting screen.

## Interfaces and contracts

- **Kit catalogue additions** — the new components' names, parts and slots
  join the contract `theme-system` enforces: `ui-backdrop`; `ui-frame`
  (parts `head`, `back`, `logo`, the window buttons `window`, `minimise`,
  `fullscreen` and `quit`, `heading`, `title`, `action`, `body`, `foot`,
  `status`, `summary`; slot `window-chrome`); the game logo `ui-logo`
  (`word`, `letter`); the main menu buttons — the play tile `ui-play-tile`
  (`tile`, `side`, `top`, `icon`, `text`, `label`, `reason`, `lock`,
  `preview`, `art`, `badge`, `still`, `calendar`; the phone row as its
  variant `ui-play-tile--row`, the preview's variants
  `ui-play-tile__preview--light` and `ui-play-tile__preview--locked`) and
  the small entry `ui-small-entry` (`entry`, `icon`, `label`);
  `ui-option` (`option`, `badge`, `name`, `meta`, `size`, `density`,
  `check`; variant `ui-option--learn`); the panel toggle, a
  `ui-button--quiet` latched toggle in the frame's `action`, and the
  drawer `ui-drawer` (`bar`, `label`, `chevron`, `body`); the go and stop
  button variants `ui-button--go` and `ui-button--stop`, worn beside
  `ui-button--primary`; `ui-section-label` (`text`, `aside`);
  `ui-key-hint` (`key`, `label`; variant `ui-key-hint--pad`); `ui-chip`
  (variants `--won`, `--lost`, `--muted`, `--best`); `ui-list-row`
  (`date`, `board`, `figure`, `outcome`); `ui-scene-panel` (`stage`,
  `tag`, `card`, `badge`, `name`, `note`; variant `ui-scene-panel--live`);
  `ui-stat--tile` (plain by default, with the warm variant and the new-best
  state); `ui-button--quiet`; `ui-button--danger`;
  the icon set `ui-icon` and the button's leading-icon slot, which a
  button's `data-icon` names; `ui-switchrow`; the number field's
  `is-invalid` state; `ui-confirm`; `ui-note--warn` and `ui-note--err`;
  `ui-panel--muted`; `ui-divider`; `ui-tabs` (`tab`); `ui-checkbox`;
  `ui-table` (with its recent-games variant `ui-table--recent`); the pager
  `ui-pager`; the code chip `ui-code`; the controls list `ui-controls`
  (`key`, `action`); `ui-frame`'s size steps — desktop, compact and
  touch — and its white action foot `ui-frame__foot--action`; `ui-toast`
  (`icon`, `text`); a message
  `ui-card`'s `icon`; and the compositions `ui-mode-list`, `ui-options`,
  `ui-key-hints` and `ui-list`.
- **Accessibility and controller parity** — every control has an accessible
  name, focus is always visible as `screen-components` § Interfaces and
  contracts, **Accessibility**, states it, every action is reachable by
  keyboard and controller, and the key hints follow the active input device
  from the bindings source, as every help surface does.
- **Stable hooks** — element ids, routes and default focus targets are
  stable across the screen compositions, so the shell's navigation and the
  browser tests keep their footing.
- **Window sizes** — no screen scrolls horizontally at any supported window
  size; the frame's body scrolls vertically when needed; a frame never
  exceeds the available area, and on the desktop host nothing in its
  layout reads the window's own size (§ Architecture, **Screen frame**). On a narrow or
  mobile window a screen may hide its non-vital parts, such as the in-game
  live figures panel, as its phone artboards show.

## Dependencies

- `theme-system` — the kit catalogue the components join, the base and
  theme stylesheets, and *Joyful tiles*.
- `screen-components` — the existing kit components and the kit's state
  model.
- `game-shell`, `settings`, `results-screen`, `records-screen`,
  `replay-playback`, `3d-results-records-screens`, `3d-play-flow`,
  `classic-2d-square-play` — the screens' content and behaviour.
- `personal-records`, `3d-game-records` — the bests the board choice
  screens show.
- No new libraries.
