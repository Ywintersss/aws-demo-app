# Aethelgard EHR — the ward operations board

A demo electronic health record, dressed as the one object a hospital
trusts more than its software: the board.

## Surface

A hospital whiteboard translated faithfully to the small screen — not a
metaphor layered over a dashboard. What you see on a ward board, you see
here:

- **Enamel ground** — warm flint `#f2f0e6` everywhere, with paper panels
  (`#fdfbf5`) floating as the laminated sheets pinned to it.
- **Marker ink** — near-black `#26241f` for structure; a single clinical
  green `#1d7a5c` reserved for the actions that commit (sign in, record,
  discharge). Nothing else may be green.
- **The mark** — Kalam, a handwriting face (loaded from Google Fonts, see
  `index.html`), for board lettering: titles, ledger names, patient names,
  status words. System sans only for chrome (labels, buttons,
  descriptions); one mono family reserved strictly for *data* (MRN,
  instance ids, uptime, values).
- **Status markers** — four marker colors carry state and nothing else:
  green open, blue done, amber warn, red danger. Status shows as a small
  fat dot, never as a badge-with-gradient.

## Who reads what

Five routes, one board each:

| board | reads |
| --- | --- |
| `/login` | intake clipboard — demo accounts as **post-it notes** (pasted, slightly rotated), each note a real seeded account; one green sign-in |
| `/patients` | *registry* — ruled ledger rows, branch tags (KL / PG / JB) pulled from the MRN, search that filters inline |
| `/patients/:id` | the patient's own board — contacts, status dots per encounter, open a fresh encounter or discharge |
| `/encounters/:id` | observations as a ruled table; record new vitals; discharge stamps the row done |
| `/infra` | *the machines* — a live operations board fed by the real API (`/api/meta`, polled every 1.5 s): how many instances serve each region, where the last request landed, an availability tally that marks fail/recover, a load burn |

## Honesty

- **Nothing fabricated.** Instance counts, served-by, availability all read
  live auth values from API metadata. The infra page is wired to the actual
  infra — if you click *burn* it really churns the API and the tally dips.
- **Served-by ambiguity preserved**: `Served by <x-served-by> — <x-az>`
  stays a footer stamp on every screen, exactly as the product already
  did.
- **Five demo accounts only**, labeled as demo, one shared password
  (`demo1234`), exactly as seeded.
- **The story is told in true counts**: "5 accounts, 3 branches", patient
  counts are the registry's own length.

## The hand

One piece of motion, used sparsely: the board **settles** when a route
lands (420 ms ease-out), and committing an action **stamp-down** the button
for 110 ms. Respects reduced-motion. No entry animations anywhere else, no
parachutes, no confetti.

## .impeccable

- Seed lock: `db07ba04` (direction, index 3, operate) in the FORM block of
  `index.html`.
- All machinery from the impeccable skill kept: product doc, craft floor
  applied at the pixel level (checked contrast 4.5+ on all screens,
  hover/disabled/loading/error/empty states). Fonts via Google Fonts
  preconnect + stylesheet in `index.html`.
- Code split fine is out of reach for the web package build surface size —
  the app is a working demo, not a CMS.
