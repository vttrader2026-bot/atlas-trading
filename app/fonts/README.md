# Bundled web fonts

Self-hosted so `next build` never has to reach fonts.googleapis.com (that request timed out / was blocked on some
networks and made the Turbopack build fail with `Can't resolve '@vercel/turbopack-next/internal/font/google/font'`).

| File | Family | Subset | Weights | Used by |
| --- | --- | --- | --- | --- |
| `inter-latin-wght-normal.woff2` | Inter | latin | 100-900 (variable) | `app/layout.tsx` (`--font-sans`) |
| `sora-latin-wght-normal.woff2` | Sora | latin | 100-800 (variable) | `app/layout.tsx` (`--font-heading-family`) |
| `jetbrains-mono-latin-wght-normal.woff2` | JetBrains Mono | latin | 100-800 (variable) | `app/layout.tsx` (`--font-jetbrains-mono`) |
| `noto-sans-arabic-arabic-wght-normal.woff2` | Noto Sans Arabic | arabic | 100-900 (variable; 500-800 declared) | `app/share/layout.tsx` (`--font-arabic`) |

Source: the `@fontsource-variable/*` 5.3.0 packages (the same Google Fonts files, variable axes). All four fonts are
licensed under the SIL Open Font License 1.1 - see the `LICENSE-*.txt` files here.
