// The sketches a note can embed, by the name its `chart` gives. Each is
// loaded only by the note that shows it
export const sketches = {
  wemby: () => import("./wemby").then(m => m.wemby),
}

export type SketchName = keyof typeof sketches
