// The cards a 3D game shows over its scene in a browser (J-Ready-xl, -m, -p, -ls and J-Ready-states): the ready
// card, its lock states and the context-lost card, readable on their surface and never wider than the window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { browserSuite } from './helpers/browser.mjs';
import { checkCard } from './helpers/contrast.mjs';
// The page modules components.test.mjs imports, imported here too so the affected-tests mapping
// selects this file for every change that selects that one.
import '../js/ui/components.js';
import '../js/ui/kit-catalogue.js';
import '../js/settings/bindings.js';
import '../js/gamepad.js';
import '../js/ui.js';
import '../js/shell/navigation.js';

const suite = browserSuite();

// The 3D scene's card sizes (J-Ready-xl, -m, -p, -ls): the large and small desktop sizes and a phone held
// either way.
const SIZES = [
  ['xl', { viewport: { width: 1920, height: 1080 } }],
  ['l', { viewport: { width: 1366, height: 768 } }],
  ['m', { viewport: { width: 1024, height: 768 } }],
  ['p', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
  ['ls', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }],
];
// Each size's card (J-Ready-xl, -l, -m, -p, -ls): its width and its body's padding.
const CARD = {
  xl: [640, '24px 26px'], l: [580, '24px 26px'], m: [560, '24px 26px'], p: [360, '16px 18px'], ls: [760, '16px 18px'],
};

const INDEX = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const READY = INDEX.slice(INDEX.indexOf('<section id="ready"'), INDEX.indexOf('<!-- Controls modal'));

test('the ready card\'s markup: the canvas\'s icons, the plain Learn line, the phone-landscape title and the rules with Ctrl as text', () => {
  assert.match(READY, /<button type="button" id="ready-back" class="ui-button ui-button--secondary ui-button--sm" data-icon="arrow-left">/, 'Back leads with the arrow');
  assert.match(READY, /<button id="ready-btn" class="ui-button ui-button--primary ui-button--lg ready-play" type="button" data-icon="mouse">/, 'Click to play leads with the mouse');
  assert.match(READY, /<button type="button" id="ready-learn-btn" class="ui-button ui-button--secondary ui-button--sm" data-icon="cube">Learn 3D<\/button>/, 'Learn 3D leads with the cube');
  assert.match(READY, /<div id="ready-learn" class="ready-learn hidden" role="group" aria-label="Learn 3D">/, 'the Learn line is a plain line, not a banner');
  assert.match(READY, /<h2 class="ui-card__title ready-heading" id="ready-heading" aria-hidden="true">Click to play<\/h2>/, 'the title phone landscape shows above the board line');
  assert.ok(READY.indexOf('id="ready-heading"') < READY.indexOf('id="ready-board"'), 'the title before the board line');
  const ui = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
  const touch = ui.slice(ui.indexOf('  setTouch3D(on) {'), ui.indexOf('\n  }', ui.indexOf('  setTouch3D(on) {')));
  assert.match(touch, /setButtonIcon\(btn, this\._touch \? 'hand' : 'mouse'\)/, 'the touch card\'s play button leads with the hand');
  assert.match(touch, /\$\('ready-heading'\)\.textContent = /, 'the title follows the device');
});

for (const [size, device] of SIZES) {
  test(`in a browser, the 3D ready card, its lock states and the context-lost card at ${size} fit the window without a sideways scroll and meet the contrast contract`, async (t) => {
    const env = await suite.open(t);
    if (!env) return;
    const { browser, base } = env;
    const context = await browser.newContext(device);
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      // Every pointer-lock request refused, so the lock states show.
      await page.addInitScript(() => {
        Element.prototype.requestPointerLock = function requestPointerLock() {
          setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
          return Promise.reject(new Error('blocked'));
        };
      });
      await page.goto(`${base}/index.html?still-backdrop`);
      await page.waitForFunction(() => globalThis.__ms !== undefined);
      const ms = (fn, arg) => page.evaluate(fn, arg);
      const touch = !!device.hasTouch;
      await ms(() => globalThis.__ms.modes.start('3d', { X: 8, Y: 8, Z: 8, mines: 40 }));
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'ready');
      assert.equal(await ms(() => document.querySelector('#ready-btn .ready-title').textContent), touch ? 'Tap to play' : 'Click to play');
      assert.equal(await ms(() => !document.getElementById('ready-rules').classList.contains('hidden')), true, 'the first-use card');
      assert.equal(await ms(() => !document.getElementById('ready-learn').classList.contains('hidden')), true, 'the Learn 3D line before the first game');
      await ms(() => Promise.all(document.getAnimations().map((a) => a.finished))); // the card has popped in
      const card = await ms(() => {
        const $ = (id) => document.getElementById(id);
        const css = (el) => getComputedStyle(el);
        const shown = (el) => css(el).display !== 'none' && el.getBoundingClientRect().width > 0;
        const box = (el) => el.getBoundingClientRect().toJSON();
        const icon = (id) => { const i = $(id).querySelector(':scope > .ui-icon'); return i ? [i.dataset.icon, i.getBoundingClientRect().width] : null; };
        const body = document.querySelector('#ready .ready-body');
        const probe = document.createElement('i');
        probe.style.background = 'var(--color-success-fill)';
        document.body.append(probe);
        const success = css(probe).backgroundColor;
        probe.remove();
        const rules = $('ready-rules'), learn = $('ready-learn');
        return {
          width: box(body).width, height: box(body).height, padding: css(body).padding,
          back: shown($('ready-back')) ? icon('ready-back') : null, play: icon('ready-btn'), learnIcon: icon('ready-learn-btn'),
          board: [css($('ready-board')).fontFamily.includes('JetBrains Mono'), css($('ready-board')).fontSize, css($('ready-board')).fontWeight],
          rules: shown(rules) ? [css(rules).padding, css(rules).rowGap, [...rules.querySelectorAll('.ui-text')].map((p) => css(p).fontSize)] : null,
          learn: [css(learn).backgroundColor === success, css(learn).borderRadius, css(learn).padding, css(learn.querySelector('.ui-text')).fontSize, css(learn.querySelector('.ui-text')).fontWeight],
          heading: shown($('ready-heading')) ? [$('ready-heading').textContent, css($('ready-heading')).fontSize] : null,
          left: ['ready-heading', 'ready-board', 'ready-btn', 'ready-learn'].map((id) => box($(id)).right),
          keys: box($('ready-keys')).x, keysTop: box($('ready-keys')).y, bodyTop: box(body).y,
        };
      });
      const [width, padding] = CARD[size];
      assert.ok(Math.abs(card.width - width) < 1, `${size}: the card ${width} px wide (${card.width})`);
      assert.equal(card.padding, padding, `${size}: the card's padding`);
      assert.deepEqual(card.play, [touch ? 'hand' : 'mouse', 24], `${size}: the play button leads with its 24 px icon`);
      assert.deepEqual(card.learnIcon, ['cube', 18], `${size}: Learn 3D leads with the cube`);
      assert.deepEqual(card.board, [true, '14px', '700'], `${size}: the board line in the mono face, 14 px bold`);
      assert.deepEqual(card.learn, [true, '12px', '8px 8px 8px 14px', '15px', '700'], `${size}: the Learn line a plain success box, its text 15 px bold`);
      if (size === 'ls') {
        assert.equal(card.back, null, 'ls: no Back');
        assert.equal(card.rules, null, 'ls: no "How 3D works" panel');
        assert.deepEqual(card.heading, ['Tap to play', '24px'], 'ls: the title, 24 px');
        assert.ok(card.left.every((r) => r <= card.keys), `ls: the title, board line, Tap to play and Learn line left of the touch rows (${card.left}, ${card.keys})`);
        assert.ok(card.keysTop - card.bodyTop < 24, 'ls: the touch rows at the top of the right column');
        assert.ok(card.height >= 200 && card.height <= 280, `ls: the card about 240 px tall (${card.height})`);
      } else {
        assert.deepEqual(card.back, ['arrow-left', 18], `${size}: Back leads with the 18 px arrow`);
        assert.equal(card.heading, null, `${size}: no title above the board line`);
        assert.deepEqual(card.rules, ['12px 14px', '6px', ['15px', '15px', '15px']], `${size}: "How 3D works" at 12 / 14 px padding, 6 px apart, 15 px lines`);
      }
      await checkCard(page, '#ready .ui-card', `ready-${size}`);
      if (!touch) {
        await ms(() => document.getElementById('ready-btn').click());
        await page.waitForFunction(() => document.getElementById('ready-msg').textContent !== '');
        await page.waitForTimeout(50); // both signals of the refusal have arrived
        await checkCard(page, '#ready .ui-card', `ready-refused-${size}`);
        await ms(() => document.getElementById('ready-btn').click());
        await page.waitForFunction(() => !document.getElementById('ready-blocked').classList.contains('hidden'));
        const offer = await ms(() => {
          const drag = document.getElementById('ready-drag'), note = document.querySelector('#ready-blocked .ready-pad-note');
          const i = drag.querySelector(':scope > .ui-icon');
          const probe = document.createElement('i');
          probe.style.color = 'var(--color-ink-muted)';
          document.body.append(probe);
          const muted = getComputedStyle(probe).color;
          probe.remove();
          return [i?.dataset.icon, getComputedStyle(drag).fontSize, getComputedStyle(note).fontSize, getComputedStyle(note).color === muted];
        });
        assert.deepEqual(offer, ['hand', '17px', '15px', true], `${size}: drag-to-look a medium button with the hand icon, its controller note plain muted 15 px`);
        await checkCard(page, '#ready .ui-card', `ready-blocked-${size}`);
      }

      // The context-lost card: the canvas does not come back.
      await ms(() => { globalThis.__ms.modes.start('3d', { X: 3, Y: 3, Z: 3, mines: 1 }); globalThis.__ms.forcePlay(); });
      await ms(() => globalThis.__ms.renderer.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'ctxlost');
      await checkCard(page, '#ctx-lost .ui-card', `ctx-lost-${size}`);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
}
