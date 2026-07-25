---
name: uipro
description: "Design system database search. Search HSL colors, typography configurations, stacks guides (React, Next.js, Tailwind, etc.), and UX guidelines using BM25 ranking. Triggers: uipro, ui-ux-pro, search design system, search styles, search colors."
metadata:
  short-description: "Search BM25 UI/UX styles, typography, HSL colors, and stack-specific guidelines"
---

# uipro (UI/UX Pro Max Database Search)

You are equipped with the UI/UX Pro Max Database search skill. Use this skill to query design patterns, color palettes, spacing systems, and framework-specific styling guidelines (such as React, Next.js, Vue, Tailwind, shadcn, etc.) using BM25 semantic ranking.

## 1. Core Workflow

1.  **Run Search Script**:
    - When searching for specific design aesthetics, color palettes, or layout strategies, execute the search wrapper:
      ```bash
      node scripts/uipro.mjs "<query>" [options]
      ```
    - Available domains: `style`, `prompt`, `color`, `chart`, `landing`, `product`, `ux`, `typography`, `google-fonts`
    - Available stacks: `react`, `nextjs`, `vue`, `svelte`, `astro`, `swiftui`, `react-native`, `flutter`, `nuxtjs`, `html-tailwind`, `shadcn`, `jetpack-compose`

2.  **Generate Complete Design System Recommendation**:
    - To generate and persist a hierarchically structured markdown design system for a project:
      ```bash
      node scripts/uipro.mjs "<query>" --design-system -p "Project Name" --persist
      ```
    - This will generate `design-system/<project_name>/MASTER.md` as the global source of truth for color values (HSL) and typography.

3.  **Read and Apply Findings**:
    - Incorporate search outputs, HSL color tokens, and layout guidelines directly when building web interfaces or UI pages.

## 2. Examples

- **Search HSL colors for sleek dark mode**:
  ```bash
  node scripts/uipro.mjs "sleek dark mode" -d color
  ```

- **Get Next.js + Tailwind layout instructions**:
  ```bash
  node scripts/uipro.mjs "responsive grid" -s nextjs
  ```
