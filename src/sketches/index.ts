// The sketches a note can embed, by the name its `chart` gives. Each is
// loaded only by the note that shows it. Each is typed as a Tool of any
// data, so a note can embed whichever one it names
import type { Tool } from "../kit/tool"

type Sketch = () => Promise<Tool<any, any>>
export const sketches: Record<string, Sketch> = {
  wemby: () => import("./wemby").then(m => m.wemby),
  changes: () => import("./changes").then(m => m.changes),
  fiveways: () => import("./fiveways").then(m => m.fiveways),
}

export type SketchName = keyof typeof sketches
