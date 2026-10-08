# Business model — Minesweeper 3D

## Revenue model

The player pays once, on Steam, for the full game. There is no subscription and
no in-game purchase. A free demo on Steam lets players
try the game before buying and converts them through a *Buy full game* entry
in its menu. The buyer and the player are the same person.

Steam's standard 30% revenue share applies to every sale.

## Cost structure

Not discussed in depth; what is known:

- **Build cost** — the author's own time (assumed; team size not discussed).
  Art and audio carry no asset cost: textures are drawn procedurally and
  sounds are synthesized.
- **Development tooling** — a Claude Max 20x subscription (about US$200 per
  month at list price — check current pricing), paid only during development,
  up to the Steam release.
- **Fixed costs** — Steam Direct's one-time app fee (US$100, recoupable from
  sales per Valve's terms). No servers, so no running cost at zero players or
  after release.
- **Variable costs** — none of its own: no backend, and leaderboards, cloud
  saves and achievements are provided by Steam at no charge to the developer.
  The only per-sale cost is Steam's revenue share.

## Target segments

**Minesweeper enthusiasts on Steam** — the one targeted segment, and the
paying one, as described in
[product-design.md](./product-design.md#target-users). They already buy
Minesweeper games and compare implementations on Steam. No secondary segment
is targeted.

Deliberately not served: mobile and touch players.

## Pricing

- **Full game: US$5.99, one-time purchase.** Decided.
- **EUR and other regions:** Steam's recommended regional price for the US$5.99
  tier, read from Steamworks when the price is set. A store-API sample of
  games at US$5.99 shows €5.89 / £4.99 as the most common pairing and €6.15 /
  £5.29 as the second (sample, not Valve's table).
- **Demo: free.** Contents per
  [product-design.md](./product-design.md#design-decisions).
- **Positioning (comparables, Steam US prices sampled 2026-10):** above simple
  Minesweeper clones (about US$2.99) and Hexcells Infinite (US$4.99), just
  under 14 Minesweeper Variants (US$6.99), well under DemonCrawl (US$14.99).
- **If the game launches through Early Access:** US$4.99 during Early Access,
  rising to US$5.99 at 1.0. Conditional on the open Early Access decision
  below.

## Go-to-market

- **Store presence** — a Steam store page that collects wishlists well before
  release.
- **Demo** — published on Steam ahead of release; it is the main vehicle for
  trying the game. Steam Next Fest requires an unreleased game, so a Next Fest
  appearance comes before any release, Early Access included.
- **Channels beyond Steam** — not decided.
- **Early Access — open decision.** Either the game enters Early Access once
  its core is complete (Classic 2D with no-guess, stats, replays and
  leaderboards; the 3D mode; the first part of each campaign; the demo) and
  grows its campaigns and platforms until 1.0, or it launches once, complete.
  Early Access counts as the release for Steam's launch visibility and
  reviews; a later 1.0 gets a smaller second boost.

## Unit economics

At whatever precision is honest — no measurement exists yet:

- **Net revenue per sale** — about US$4.19 at full US price after Steam's 30%
  (calculated; regional prices and discounts lower the real average —
  estimate).
- **Cost to serve a player** — effectively zero to the developer (no backend;
  Steam services are free to use).
- **Acquisition cost** — not known; no paid acquisition is planned, so
  acquisition is organic through Steam discovery, wishlists and the demo.
- **Break-even** — about 48 full-price sales per month of development
  (US$200 subscription ÷ US$4.19, calculated), plus about 24 for the Steam
  Direct fee. A 6-month development comes to about 310 sales (calculated; the
  duration is an illustration, not a plan). Any return on the author's own
  time depends on volume, for which there is no estimate.

## Risks

Ranked, most serious first:

1. **Discoverability.** The niche is crowded with cheap Minesweeper clones, and
   the model depends entirely on organic Steam discovery. If the store page
   and demo do not stand out, volume stays negligible. *Most likely to hurt.*
2. **First impressions with a critical audience.** Enthusiasts judge rules
   fidelity, input feel and stats precisely; early negative reviews would be
   hard to recover from — sharper still if the game enters Early Access before
   its core is polished.
3. **Low price, low ceiling.** At US$5.99 the game needs volume to repay
   development time; there is no second revenue line.
4. **Platform concentration.** Steam is the only storefront and the only
   provider of the online features; a change in its terms or services reaches
   the whole business.
5. **Leaderboard integrity.** Steam accepts whatever score the client submits;
   cheated entries could undermine the leaderboards enthusiasts care about.
   Attached replays let players check a suspicious entry. *Hurts, does not
   kill.*
