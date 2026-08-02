# SEMS Frontend

Next.js App Router UI for the Certificate II Examination Management System (SEMS / ICM).

## Design system

SEMS uses **[@rfdtech/components](https://gsl-components.vercel.app/)** (GSL / CLET component library).

- Docs: https://gsl-components.vercel.app/docs/getting-started
- Theme overrides: [`clet.theme.ts`](./clet.theme.ts) (WorldSkills Ghana CTVET palette, green primary)
- Next.js entry: import from `@rfdtech/components/next` and wrap the app with `RouterAdapterProvider` + `ThemeProvider` (see [`app/providers.tsx`](./app/providers.tsx))

### Conventions for new UI

1. Prefer components from `@rfdtech/components` / `@rfdtech/components/next`.
2. Do **not** add new shadcn primitives under `components/ui/` unless GSL has no equivalent.
3. Brand colors live in `clet.theme.ts` via `cletTheme()` — do not hard-code palette hex in feature code when a `--clet-*` token exists.
4. Existing shadcn screens are bridged to CLET tokens in [`app/globals.css`](./app/globals.css); migrate them to GSL incrementally.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build
npm start
```
