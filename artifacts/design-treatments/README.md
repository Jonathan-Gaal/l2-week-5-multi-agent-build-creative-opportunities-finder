# Design treatments (Artist Atlas find flow)

55 design boards for the Artist Atlas front end, saved from the Claude "Design" canvas titled "Artist Atlas: 10 Find Flows".

- Live canvas: https://claude.ai/artifact/A6Um2d13TEFUZW8Xds1VJK
- Saved: 2026-10-29, from canvas version 1793290794-a255.
- `canvas.json` is the index: each board's title and position on the canvas, in order.
- Each `*.dc.html` is one board (1200 x 760).

## See them all in one page

Open `all-treatments.html` in any browser. It shows all 55 boards in a grid with a jump menu (static, so buttons don't
work; it uses the copies in `images/`). Rebuilt from the board files, so if boards change, regenerate it.

## How to view the individual board files

The boards only render inside the Claude Design canvas. They load `./support.js` (not saved here) and the images below
through `/_blob/<id>` links that only work there. Opening the files directly in a browser shows broken images and
unstyled pieces. This folder is a backup of the source, so the designs are not lost if the canvas goes away.

## Images the boards use

| `/_blob/` id starts with | Source image in the repo |
| --- | --- |
| `7efe7104` | `web/public/brand/logo-mark.png` |
| `ef31e1ec` | `web/public/brand/logo.png` (`branding/artist-atlas-logo-transparent.png`) |
| `47a0009a` | `branding/crowd-applauds-after.png` |
| `6870e62f` | `branding/gig-confirmed-after.png` |
| `a5f5b536` | `branding/musician-before.png` |

## Boards

1 Main (Mad Libs sentence), 2 Map, 3 IdCard, 4 Poster, 5 Subway, 6 Zine, 7 Mixer, 8 Chat, 9 Rings, 10 Live,
11 Stepper, 12 FilterBar, 13 Arcade, 14 Classifieds, 15 Stories, 16 Venn, 17 Skyline, 18 Editorial, 19 Matrix,
20 Tokens, 21 Tarot, 22 Bodega, 23 Dance, 24 Visual, 25 Film, 26 Theater, 27 Writing, 28 Comedy, 29 Craft,
30 Deck, 31 Rack, 32 Patch, 33 Globe, 34 Atlas, 35 Bubble, 36 Grid, 37 Blocks, 38 Arches, 39 Meridians,
40 Numerals, 41 Dots, 42 Cover, 43 Segment, 44 Bento, 45 Icons, 46 Index, 47 Words, 48 Photos, 49 Gallery,
50 Flyer, 51 Ticker, 52 Rail, 53 Graffiti, 54 Street, 55 Car.

Board 1 is the one chosen for the home page. It is built live (animated) at `/design-test`
(`web/src/components/MadLibsHero.tsx`).
