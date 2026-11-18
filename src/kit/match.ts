// Matching a typed name against players' names, loosely: case, accents
// and punctuation don't count, and the words can come in any order. So
// "jokic" finds Jokić, "dayr" Day'Ron Sharpe, "tj mcc" T.J. McConnell,
// "karl anthony" Karl-Anthony Towns and "sharpe day" Day'Ron Sharpe.
// Every word typed has to appear somewhere in the name, spaces aside
// ("ronsh" finds Day'Ron Sharpe too, which is harmless)

// letters that don't decompose into a base letter and an accent
const letters: Record<string, string> = {
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ı: "i",
}

// a name as it's compared: lower case, plain letters and digits only
export function squash(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[øłđðþæœßı]/g, c => letters[c])
    .replace(/[^a-z0-9]/g, "")
}

// the words of a query, squashed; empty for a blank one
export function terms(query: string) {
  return query.split(/\s+/).map(squash).filter(Boolean)
}

// whether a squashed name has every term
export const hasAll = (squashed: string, ts: string[]) =>
  ts.every(t => squashed.includes(t))
