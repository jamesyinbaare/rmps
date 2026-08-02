---
name: image-to-components
description: Use when the user hands over a screenshot, image, mockup, or textual description of a screen/interface to build — decompose it into existing `@rfdtech/components` components and variants via the MCP before writing any markup, instead of hand-rolling custom UI.
---

Whenever the user gives you a screenshot, image, mockup, or a written description of a
screen, page, or dashboard they want built, treat it as a **translation** job: turn the
image/text into a page composed of `@rfdtech/components` that already exist — not a spec
for custom-built UI.

1. **Decompose the design first.** Before writing any code, break the screen into its
   regions and elements: layout shell, header/nav, sidebar, tables, forms and their fields,
   cards/metrics, tabs, modals, buttons, badges, empty/loading states, etc. Do this for
   every distinct element visible in the image or described in the text — don't skip
   anything because it looks "simple enough to just write."

2. **Map every element to an existing component via the MCP.** For each element:
   - Call `search_components` (or `search_docs`) with what the element does or looks like
     to find candidate matches.
   - Call `get_component_types` / `get_component` to confirm the real prop names and
     variants — never guess an API from how something looks in the image.
   - Call `get_component_examples` for non-trivial compositions (a table inside a modal, a
     multi-step form, etc.).
   - Call `get_rules` for the component (and its category) to follow real do/don't
     conventions.
   - **Building a layout shell, full page, or dashboard?** Call
     `get_rules("page-composition")` first — it's a required pattern set (the
     `AppLayout`/`AppHeader`/`Sidebar` trio, `SidebarFooter` + `ProfilePopover`, `RoleSelect`
     wiring, `Launchpad` over `AppSwitcher`, the `Table`/`MetricCard`/`Tabs` variant set),
     not a style suggestion.
   - Pick the variant that best aligns with what's in the image, not just the first result.

3. **Compose only from matched rfd components.** Build the page exclusively out of
   `@rfdtech/components` you've confirmed via step 2. Prefer image → page and text → page
   translation grounded in the component set that already exists — do not introduce new
   one-off components or raw markup/CSS to reproduce something a real component already
   covers.

4. **No match found? Stop and ask — never build custom silently.** If an element in the
   image/description has no reasonable match in the component library, do not hand-roll
   custom UI for it. Stop and ask the user exactly what they want for that specific
   element. Only build custom UI when the user has explicitly said to build custom; if they
   say "build custom" without specifics, ask exactly what they want (markup, behavior,
   styling) before writing it. Never default to custom UI just because a match wasn't
   obvious on the first search — exhaust `search_components`/`search_docs` first.

5. **Everything else about writing the code follows `rfdtech-ui`** — authoritative types
   over guessed props, real examples over invented ones, and the do/don't rules — see that
   skill for the full discipline once components are identified.
