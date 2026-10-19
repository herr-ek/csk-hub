# CSK Hub – presentation

A short slide deck about CSK Hub for the körmöte. It is a standalone React app, separate from
the Next.js app, served by Bun's built-in HTML dev server.

```bash
cd presentation
bun install
bun run dev
```

Open the URL Bun prints.

| Key                              | Action          |
| -------------------------------- | --------------- |
| → / Space / PageDown / click     | Next slide      |
| ← / PageUp / click on left third | Previous slide  |
| Home / End                       | First / last    |
| F                                | Fullscreen      |

The current slide is kept in the URL hash (`#3`), so a reload stays put. Slide content lives in
`src/slides.tsx`.

`bun run build` writes a static copy to `dist/` as an offline fallback.
