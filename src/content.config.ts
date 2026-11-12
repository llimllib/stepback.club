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
    // when it was written, with the time and its offset
    // (2026-11-12T08:50:00-05:00): notes sort by it, newest first, and two
    // from one day need the time to sort
    date: z.coerce.date(),
    // the sketch the note embeds, by its name in src/sketches/index.ts
    chart: z.string().optional(),
  }),
})

export const collections = { notes }
