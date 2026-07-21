# Design System Inspired by Astryx (Meta)

> Category: Developer Tools & IDEs
> Meta's open-source, AI-fluent design system. Built on React and StyleX, using CSS custom properties for deep brand-level customization.

## 1. Visual Theme & Atmosphere

Astryx is Meta's internal-grade, open-source React design system designed from the ground up to be "AI-fluent" and machine-readable. Powering over 13,000 internal applications, it is built for rapid developer iteration, clean responsive layouts, and robust accessibility. 

The visual atmosphere is clean, modular, and developer-friendly. It leverages fluid grid architectures, flexible light/dark modes, and a modern typography hierarchy. Astryx does not lock developers into a specific styling ecosystem, allowing standard CSS or Tailwind to easily override the compile-time StyleX engine.

**Key Characteristics:**
- **AI-Ready Architecture:** JSDoc annotations, composition hints, and dense token outputs optimized for AI context windows.
- **Model Context Protocol (MCP) Server:** Allows AI assistants (`xds`) to query component specs and retrieve code templates natively.
- **StyleX Foundations:** Compiled CSS footprint utilizing Meta's StyleX for type-safe styles.
- **Swizzle Support:** Component extraction command (`npx astryx swizzle <name>`) allows full source customization.
- **Aurora Glow Canvas:** Soft gradient rings (left yellow, right pink) on deep charcoal surfaces to signify AI integration.

## 2. Color Palette & Roles

Astryx utilizes CSS custom properties (`--color-*`) for design tokens.

### Primary & Accent
- **Astryx Blue** (`#225BFF`): Primary interactive elements, active links, and brand focal points.
- **Astryx Light Blue** (`#3D87FF`): Adaptive primary variant for high-contrast dark modes.
- **Aurora Left (Yellow)** (`#FFD02C`): Warm yellow radial glow accent.
- **Aurora Right (Pink)** (`#FF6584`): Soft pink radial glow accent.

### Surface & Background
- **Primary Canvas** (`#FFFFFF`): Light mode background.
- **Surface Layer** (`#F7F8FA`): Secondary background wash for cards and side panels.
- **Dark Canvas** (`#1C1E21`): Default dark mode background.
- **Void Surface** (`#0D0F12`): Immersive dark mode background layer.
- **Card Accent** (`rgba(255, 255, 255, 0.05)`): Glassmorphic card surface in dark mode.

### Neutrals & Text
- **Primary Text** (`#050505`): Main body and heading text on light surfaces.
- **Dark Text** (`#F5F6F7`): Main body and heading text on dark surfaces.
- **Secondary Text** (`#65676B`): Supporting descriptions, metadata, and placeholder text.
- **Border / Divider** (`#DEE3E9`): Clean hairline boundaries.
- **Dark Border** (`rgba(255, 255, 255, 0.1)`): Muted divider line on dark surfaces.

## 3. Typography Rules

### Font Family
- **Primary:** Albert Sans (humanist geometric sans-serif)
- **Code:** JetBrains Mono (monospaced developer font)
- **Fallbacks:** Figtree, DM Sans, Inter, system-ui

### Hierarchy

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Display 1 | 48px | 700 (Bold) | 1.20 |
| Heading 1 | 36px | 600 (Semibold) | 1.25 |
| Heading 2 | 24px | 600 (Semibold) | 1.30 |
| Body | 16px | 400 (Regular) | 1.50 |
| Supporting | 14px | 400 (Regular) | 1.40 |
| Button / Label | 14px | 500 (Medium) | 1.40 |
| Monospace | 14px | 400 (Regular) | 1.50 |

## 4. Component Stylings

### Buttons
- **Primary:** Fully rounded pill or 8px border-radius, background `#225BFF` (or `#3D87FF` in dark mode), white text. Fully rounded padding: 8px 16px.
- **Secondary:** Outlined or soft background (`rgba(0, 0, 0, 0.05)` or `rgba(255, 255, 255, 0.05)`).
- **Ghost:** Transparent background, active hover state highlighting.

### Cards & Container Radius
- Corner radius: `12px` or `16px` for layout panels.
- Spacing: 16px padding on standard blocks, 24px on hero containers.
- Border target: 1px solid separator with subtle shadows.

### Command Palette & Modals
- Dialog max width: `640px` with Centered and Frosted glass overlay.
- Dynamic key indicators (e.g. `↑`, `↓`, `↵`, `Esc`) displayed as `<kbd>` badges.

### Chat Composer
- Interactive input zone featuring file attachment action and vertical arrow send CTA.
- Floating backdrop and dynamic growth line height (up to `176px`).

### Theming & Theme Provider
- **Theme Definition (`defineTheme`):** Define static themes with name and custom tokens (e.g. `--color-accent`, `--color-background-surface`, `--radius-container`).
- **Theme Component (`Theme`):** Wraps subtree. Custom color mode overrides (`light` | `dark` | `system`).
- **Build integration:** Precompiled static assets via `npx astryx theme build` for production first-paint/SSR optimization.

### Layout & Shells
- **AppShell:** Outermost app frame. Outermost slots for top/side navigation and collapsible control panels.
- **Layout & LayoutPanel:** Page-level flex layouts with complémentary side drawer inspector widgets. Handles mobile collapse automatically.

### Forms & Progress
- **DatePicker & DateRangeInput:** Select start/end dates from dual-month calendar popovers.
- **Switch:** Toggle controls with immediate state updates (e.g. preferences/settings).
- **CircularProgress:** radial progress completion arcs and score display widgets.

### Styling Interop & Compiles
- **StyleX overrides:** Create build-time optimized styles via `stylex.create()` and override components via `xstyle={overrides.card}`. All `:hover` styles inside StyleX must use `@media (hover: hover)` media queries.
- **Tailwind Interop:** Custom inline layout adjustments are configured using Tailwind via `className="flex gap-3 p-4"`.

## 5. Layout & Breakpoints

- Mobile: `<768px` (Single column, navigation drawer menu).
- Tablet: `768px - 1024px` (Fluid grid).
- Desktop: `>1024px` (Multi-column layout, sticky nav header).

## 6. Do's and Don'ts

### Do
- Use CSS custom property tokens (`var(--color-brand)`) to preserve clean theme configurations.
- Reuse existing primitives (like `Button`, `Card`, `Badge`) rather than writing new custom styles.
- Leverage the `section` parameter in `xds/get` to retrieve only the relevant sections of documentation, minimizing token overhead.
- Add rich JSDoc annotations (specifying types, defaults, and composition hints) to all customized, swizzled, or newly created components to maintain their "AI-fluent" capabilities.
- Apply Albert Sans for friendly geometric display headers.
- Build static production themes using `npx astryx theme build` for optimal SSR hydration.

### Don't
- Don't write inline StyleX declarations when design tokens already cover the styling properties.
- Don't introduce duplicate layout patterns; use the unified grid and spacing scales.
- Don't use heavy shadows on dark theme containers — rely on `rgba(255, 255, 255, 0.05)` or borders to divide layers.
- Don't use hover classes without `@media (hover: hover)` guards inside StyleX configurations.

## 7. Agent Prompt Guide

### Prompt Examples
- "Create an Astryx-style chat composer with balanced density, `#225BFF` primary send action, and file upload attachment icon."
- "Generate a document layout under Albert Sans display headers featuring a 3-column Card grid with 12px rounded borders."
- "Configure an MCP dialog wrapper with a frosted glass backdrop filter, displaying key indicator badges (`↑`, `↓`, `↵`)."
- "Setup an Astryx Theme wrapper utilizing defineTheme to configure custom `--color-accent` and `--radius-container` variables."
- "Implement a responsive AppShell layout with a collapsible SideNav panel and main content viewport."
