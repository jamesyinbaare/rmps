---
name: rfdtech-ui
description: Use before building or modifying UI with @rfdtech/components — search the component index, pull authoritative types and examples, and follow design rules instead of inventing APIs or styles.
---

Before generating or editing UI code that uses `@rfdtech/components`:

1. **Search first.** Call `search_components` (or `search_docs`) with the feature you're building
   ("date range filter", "confirmation dialog", "wizard") before writing any markup — a component
   for it may already exist.
2. **Never invent props or types.** Call `get_component_types` (or `get_component`) and use the
   real prop names, variants, and types straight from `src/types/<slug>.ts` — do not guess from
   memory or from a component's visual appearance. MDX prop tables are prose and can go stale;
   the type source is authoritative.
3. **Read real examples.** Call `get_component_examples` before composing a non-trivial usage
   (tables, forms in modals, async flows) — every known example is included, not just the ones
   the doc page happens to show inline.
4. **Follow the rules.** Call `get_rules` (whole corpus, a category like `forms`/`theming`, or a
   component slug) and follow its do/don't guidance — these are real conventions pulled from a
   production consumer of this library, not generic advice.
5. **Prefer composition over new components.** If an existing component covers most of the need,
   compose or extend it (`classNames`, slots, wrapping) rather than hand-rolling a replacement.
6. **Building a new page, screen, dashboard, or layout shell?** Call `get_rules("page-composition")`
   first — it's a required, non-negotiable pattern set (not a style suggestion): the
   `AppLayout`/`AppHeader`/`Sidebar` variant trio, required `SidebarFooter` + `ProfilePopover`,
   `RoleSelect` wired into all three locations when the system has multiple roles, `Launchpad` over
   the deprecated `AppSwitcher`, the `Table`/`MetricCard`/`Tabs` variant set, and more. Also see
   `get_component("migration-v2")` for the full migration/adoption checklist.
7. **Migrating a project that already overrides tokens?** Never decide silently. Find every
   existing override of a *known* token — `gslTheme()` calls, or CSS setting a real `--clet-*` or
   legacy `--gsl-*` color token (not custom/arbitrary variables) — list them, and ask the user
   about each one individually: keep it, or drop it for the new approved default. Every color
   token has both a `--clet-*` name (preferred — use this for any *new* override you write) and a
   `--gsl-*` alias (legacy, still functional — only relevant when reading/preserving existing
   consumer code, never write new overrides with it). Non-color tokens (radius/shadow/font/
   spacing/z-index) only have a `--gsl-*` name. See `get_rules("theming")`.
