# Four factors: design

Dean Oliver's four factors for every team at once: four scatterplots in a
2×2 grid, each the team's offense against its opponents' in one factor.
Team charts (`src/tools/teams.ts`) already has the four as separate pairs;
this puts them side by side so a team's profile, and the league's, reads
at a glance. Written 2026-11-17 from a design conversation.

## The chart

A new tool and page, `/fourfactors`, "Four factors". It's a new tool, not
a Team charts pair: a pair is one x and one y.

**Panels.** Two by two in Oliver's order: eFG% and turnovers on top,
offensive rebounding and free throw rate below. Each panel is the Team
charts pair as it is: team on x, opponents on y, turnovers forced on x so
x − y stays the margin, the league average's crosshair splitting it into
quadrants, and the pair's corner names ("Protects the ball", "Offensive
glass", …). Each panel keeps its own scale.

Not done: weighting the panels by how much each factor matters (eFG%
most, free throws least), e.g. by converting each margin to points per
100 on one shared scale. It's a good chart, but a different one.

**Marks.** As in Team charts: a dot at each team's exact value and its
logo as a callout, placed by `placeLogos` per panel, smaller than Team
charts' so 30 fit in a quarter of the frame. It's crowded on purpose:
every team, four times. Each team is a `Mark` in every panel, so a click
labels it and notes and arrows attach to it, as everywhere else. A
tooltip gives the team's four margins and their ranks.

**A team.** With a team picked, the header band takes its colors and
logo, and in all four panels its logo is in full color, a little larger,
placed first so it's never moved, and drawn on top. The other 29 go
grayscale (an SVG `feColorMatrix` filter, which survives export) at about
40% opacity. The legend strip says which team is in color. With no team,
every logo is in color and the band is ink.

**Headline and deck.** "The four factors", or "Boston's four factors"
with a team. The deck is the season and window: "2025–26, last 10 games:
each team's offense against its defense".

## Controls

Season, playoffs (once the season has them), last n games, team. Four of
five. Clicking a logo doesn't pick the team, because a click labels a
mark.

## Data

The same as Team charts' game log pairs: `stats/team_game_logs` and
`stats/games`, each team's games in the window summed and joined to its
opponents'. One read gives every panel, so the four always cover the same
games. Changing the team re-renders without reloading.

`loadLogs`, its `counts`, the windows and the four factors' `Stat`s move
out of `teams.ts` into a shared module, which both tools import. Team
charts doesn't change.

## Width

The tool page is 720px of chart beside the controls, and every frame size
is 720 wide. This one needs the whole column on desktop.

- `Tool.wide`: the page puts the controls above the chart, as the narrow
  layout already does under 900px, and the chart takes the full width
- Two wide frame sizes, offered only by wide tools: landscape, about
  1440×1000, the default, and square, about 1080×1080, for posting
- On a phone the panels stack, one column of four

## Checking

`scripts/fourfactors-check.mjs`, like the team and scores checks: desktop
and phone widths, with and without a team, a last-n window and the
playoffs; saves `shots/fourfactors-<width>.png`. `npm run shot` for both
export sizes, and `mise run lint`.
