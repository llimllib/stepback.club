// A strip of logos on one axis: each at its value, nudged sideways where it
// would cover one already placed, nearest the middle first, so tiers and
// gaps show. Used by team efficiency's "to scale" column and the sketches
// that borrow it

// Where each logo goes across, given where it goes down: `ys` in the order
// to place them, `mid` the strip's middle, `size` a logo's width. With
// `half`, the strip's half-width, a logo stays inside it: where there's no
// free spot, it goes where it covers the least
export function nudge(
  ys: number[],
  mid: number,
  size: number,
  half = Infinity,
): number[] {
  const placed: { x: number; y: number }[] = []
  const room = half - size / 2
  return ys.map(y => {
    // the nearest logo already placed, how far off in the worse direction
    const clearance = (x: number) =>
      Math.min(
        Infinity,
        ...placed.map(q => Math.max(Math.abs(q.x - x), Math.abs(q.y - y))),
      )
    let best = mid
    let bestGap = -Infinity
    for (let k = 0; k < 40; k++) {
      const off = Math.ceil(k / 2) * (size * 0.55) * (k % 2 ? 1 : -1)
      if (Math.abs(off) > room) break
      const gap = clearance(mid + off)
      if (gap >= size) {
        best = mid + off
        break
      }
      if (gap > bestGap) [best, bestGap] = [mid + off, gap]
    }
    placed.push({ x: best, y })
    return best
  })
}
