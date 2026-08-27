# POS Café del Valle

Working implementation of the `POS Cafe del Valle.dc.html` design, imported from the
Claude Design project `8c949336-0d0a-4a27-a26a-ad9bfd10cff1`.

Zero dependencies, no build step — open `index.html` in a browser.

```
open index.html
```

## Files

| Path | |
|---|---|
| `index.html` | Shell: sidebar, header, and the three screens |
| `styles.css` | Design system — every token lifted from the `.dc.html` source |
| `app.js` | State, POS logic, rendering |
| `assets/logo.svg` | Placeholder wordmark (see *Logo* below) |
| `design/POS Cafe del Valle.dc.html` | Imported design source, unmodified |
| `design/support.js` | Claude Design canvas runtime the source renders against |

## What works

**Ventas** — category chips and header search filter the 27-item menu; tapping a product
adds it to the order (repeat taps merge into one line); hovering a line reveals −/+/×
controls; Mesa/Llevar toggles; the tip checkbox recalculates the total; notes via
*Agregar nota*.

**Órdenes** — open orders as cards with status chips. Clicking one loads it back to the
till, parking whatever was in progress so nothing is lost.

**Cobrar** — payment method selection, on-screen keypad (plus physical keyboard: digits,
`.`, Backspace, Enter to confirm, Esc to go back), quick-cash amounts rounded up from the
total, live change calculation, and confirmation that closes the order and opens a fresh
folio. Card and QR skip the keypad and settle at the exact total.

Money is held in integer cents everywhere; only the formatter divides. IVA is treated as
*included* in the listed price (Guatemala) — `subtotal − subtotal/1.12` — so it is
reported, not added. The total is subtotal + tip.

Verified against a 55-assertion browser suite driving real clicks in headless Chrome —
all green, no console errors.

## Two things to know

**Logo.** The design references `assets/logo.png`. Both that file and its `.jpg` sibling
are a 9574×5304 export, and the Design API caps file reads at 192 KiB — both come back
truncated (only the top ~12% decodes). `assets/logo.svg` is a placeholder wordmark in the
brand palette standing in for it. Drop the real `assets/logo.png` into place and it takes
over automatically — the `<img>` falls back to the SVG only on load error, no code change
needed.

**One total in the mock didn't reconcile.** Order `#A-1182` was labelled `Q182.20`, but
its own line items (2 Quiche Q38 · 2 Limonada Q18 · 1 Brownie Q20 = Q132, +10% tip) come
to `Q145.20`. Order totals are now computed from line items rather than hardcoded, so that
card reads `Q145.20` and the header summary reads `Q451.20 en curso` instead of the mock's
`Q612.50`. Every other seeded order reconciled exactly.

## Not built

*Reportes* and *Ajustes* are rendered in their muted state, matching the design — neither
had a screen in the source. State is in-memory only: a reload restores the seed data.
