// The tools, for the pages that list them. `hook` and `pitch` are for the
// front page: the headline it shows until a live one loads, and why you'd
// open the tool
export const catalog = [
  {
    href: "standings",
    name: "Standings",
    blurb:
      "Each conference's standings, with every team's offense, defense and net rating, and how good its players are by yarapm and EPM.",
    takes: ["Season"],
  },
  {
    href: "scatter",
    name: "Player charts",
    blurb:
      "One player stat against another: shooting, playmaking, rebounding, steals and blocks, and offense against defense.",
    takes: ["Stats", "Seasons", "Games", "Team", "Top %"],
  },
  {
    href: "teams",
    name: "Team charts",
    blurb:
      "One team stat against another: efficiency, pace, luck, shooting at both ends, playmaking, rebounding and defense.",
    hook: "Who's winning more than they should?",
    pitch:
      "Any two team stats against each other: luck, pace, shooting at both ends, rebounding and defense.",
    takes: ["Stats", "Season", "Playoffs", "Games"],
  },
  {
    href: "fourfactors",
    name: "Four factors",
    blurb:
      "Dean Oliver's four factors for every team at once: shooting, turnovers, offensive rebounding and free throws, each at both ends.",
    takes: ["Season", "Team", "Playoffs", "Games"],
  },
  {
    href: "playoffs",
    name: "Playoff net points",
    blurb: "Every player's net points in every playoff game, by team.",
    takes: ["Season", "Team", "Min. MPG"],
  },
  {
    href: "cumulative",
    name: "Cumulative stats",
    blurb:
      "The running total of a stat, game by game, for players over a season or a career.",
    hook: "Settle the argument",
    pitch:
      "Put any players' running totals side by side, game by game, over one season or whole careers.",
    takes: ["Seasons", "Playoffs", "Stat", "Players"],
  },
  {
    href: "rapm",
    name: "RAPM over time",
    blurb:
      "A player's RAPM on each game day, as the model saw it then, over a season or a career.",
    hook: "Watch a rating move",
    pitch:
      "A player's RAPM on every game day, as the model saw it then: see a breakout, or a slump, take shape.",
    takes: ["Seasons", "Rating", "Players"],
  },
  {
    href: "efficiency",
    name: "Team efficiency",
    blurb:
      "Every team's offense and defense against the average, ranked, with the gaps to scale: from its results, or from its players' RAPM or EPM.",
    hook: "Who's actually good, and by how much",
    pitch:
      "Points per 100 posessions shows you how good or bad each team is on each side of the ball",
    takes: ["Season", "Source", "Playoffs", "Games", "Sort"],
  },
  {
    href: "rotations",
    name: "Rotations",
    blurb:
      "Who played when in a game for both teams, the score margin in each stint, and the game's margin between them.",
    hook: "Who closed the game?",
    pitch:
      "Every stint on the game clock for both teams: who sat during the run that decided it, and how the margin moved with each lineup.",
    takes: ["Season", "Team", "Game"],
  },
]
