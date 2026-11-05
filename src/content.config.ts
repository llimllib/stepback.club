// Notes: a chart and the take you'd have posted anyway. Each is a Markdown
// file in src/notes/, with any data it froze beside it. See "Notes" in
// docs/plans/2026-10-10-site-v2-design.md
import { defineCollection } from "astro:content"
import { glob } from "astro/loaders"
import { z } from "astro/zod"

const notes = defineCollection({
  loader: glob({ pattern: "*.md", base: "src/notes" }),
  schema: z.object({
    title: z.string(),
    deck: z.string(),
    date: z.coerce.date(),
    // the sketch the note embeds, by its name in src/sketches/index.ts
    chart: z.string().optional(),
  }),
})

export const collections = { notes }
