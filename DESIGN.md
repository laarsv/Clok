# Sync — Design-System (Royal-Blau)

Eigener Auftritt. Struktur basiert auf dem **Fin.Co-Design-System**, umgefärbt
auf eine eigenständige Marke: **Royal-Blau statt Mint**. Kein KW-/Fin.Co-Logo,
eigene Wortmarke „Sync".

## 1. Tokens (`tailwind.config.js`)

```js
colors: {
  royal: { DEFAULT: '#2947c9', soft: '#aeb9ee' },
  ink:  '#161a24',
  paper:'#ffffff',
}
```

`<meta name="theme-color" content="#2947c9">`. Schrift: **Roboto**, selbst
gehostet über `@fontsource/roboto` (300/400/500/700/900). Kein Google-CDN (DSGVO).

## 2. Kontrast-Regel — WICHTIG (invertiert ggü. Mint/Gold)

Royal-Blau ist ein **dunkler** Akzent. Damit kehrt sich die Fin.Co-Regel um:

| Muster | Fin.Co (Mint) / KW (Gold) | Sync (Royal-Blau) |
| --- | --- | --- |
| Vordergrund auf Akzent-**Fläche** | `ink` (heller Akzent) | **`paper`/Weiß** — Weiß-auf-`#2947c9` ≈ **7,4:1** ✓ (Ink-auf-Blau ≈ 2,4:1 ✗) |
| Akzent als **Text** (Links, aktive Nav, Eyebrow) | Mint ok / Gold verboten | **`text-royal` erlaubt** — Blau-auf-Weiß ≈ 7,4:1 ✓ |

Also: **blaue Buttons/Flächen = weiße Schrift**, und **Blau darf Textfarbe sein**
(aktive Nav, Eyebrow, Links, Icons).

## 3. Bausteine (`src/index.css`)

- `.btn` + `.btn-primary` (`bg-royal text-paper`), `.btn-outline`, `.btn-danger`,
  `.btn-ghost`, `.btn-sm`.
- `.card` = `rounded-2xl border border-ink/10 bg-paper shadow-sm`.
- `.input`, `.field-label` (`text-xs font-medium text-ink/60`), `.eyebrow`
  (`text-royal`, uppercase).
- Focus-Ring überall `ring-royal/40`.

## 4. Regeln

- **Kein natives `<select>`** — Custom-`Select` (`components/ui/Select.jsx`),
  tastaturbedienbar.
- Icons: Inline-SVG, `stroke-2`, `currentColor` (`components/ui/Icons.jsx`).
  Kein Icon-Package.
- Alle Modals: `role="dialog"`, `aria-modal`, ESC schließt (`components/ui/Modal.jsx`).
- Überschriften Roboto **900**, `tracking-tight`.
- Responsiv: Karten-Layout auch mobil; nichts horizontal scrollen lassen.
- H1 mit `.eyebrow` darüber als Kicker.
