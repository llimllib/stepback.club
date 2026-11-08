# Predictions on the scores page

Written 2026-11-07. A first version was built while Bill was out; his
review the same evening changed the headline and the table, and added the
front page's predictions. Extends `2026-10-29-scores-design.md`.

## What

The scores page shows yarapm's prediction for every game not played yet:
pick today or a day ahead and each game is a block like a box score's,
with the expected score, each team's chance to win and ratings, and who
each is likely without. A played game gets one more line, what yarapm
predicted for it before tip-off and whether it was right. A prediction and
a result are the same game at different times, so they share the page,
its dates and its layout.

```
7:30 PM ET · PREDICTION
BKN 28% – 72% ATL
EXPECTED SCORE: BKN 111, ATL 119
          Net rating per 100 possessions
           Expected lineup    Full roster
BKN 2-6               −6.2          −10.2
ATL 6-4               −0.1           −1.0
BKN: DËMIN 20% · SARAF 15% · POWELL 23% TO PLAY
ATL: JOHNSON 21% · LANDALE 21% TO PLAY
```

And under a played game's net points line:

```
PREDICTED ATL BY 8 · 73% · RIGHT
```

## Data

All from yarapm's bucket prefix (`~/code/nba-rapm/docs/DATA.md`), read
like nba_data's through `kit/data.ts`; each file is under 90KB:

- `predictions`: every game from yarapm's latest build's day to the end of
  the season. Expected points, home win probability, start time.
- `team_ratings_daily`, the build's day: each team's net rating with the
  expected lineup (`net`) and at full strength (`full_net`).
- `team_players_daily`, the build's day: who's missing, as the players
  whose expected minutes are 8 or more under their minutes at full
  strength (one to four a team), with their chance to play.
- `prediction_log`: for played games, the last `rapm` prediction made
  before the start.

Every day ahead is predicted with the build's day's ratings and
availability: a player's chance to play is the same for every game ahead
(checked: no player's varies). The page says so above the games:
"Predicted Sat, Nov 7, from the games before it. Chance to play is from
each team's last 10 games."

## Decisions

1. **On the scores page, not a new page or tool.** Recommended before, and
   built without an answer.
2. **The default date is still yesterday** (Bill: the NBA's results don't
   come in fast enough, and the data updates every 4 hours). Today and the
   days ahead are one Next away.
3. **Today mixes both**: games played show their box score, the rest
   their prediction, in the NBA's order. Untested on a real mixed day, as
   none had started when this was built.
4. **Prev, Next and the date picker reach every predicted day**, to the
   season's last (April 11). Predicted days count as game days, so a date
   past the bucket's seasons links back to April 11.
5. **The headline is each team's chance to win**, "BKN 28% – 72% ATL",
   the favorite bold. The first version headlined the expected score,
   which read as a result. The expected score is the line under it,
   whole points, or one decimal when both round to the same number
   (NYK 113.0, CLE 112.7).
6. **Two columns under one header, "Net rating per 100 possessions":
   "Expected lineup" and "Full roster"**, against an average team. The
   first version's "Win / Today / Full" needed explaining. The two against
   each other say how much a team is missing. The better value in each is
   bold, as in the box score.
7. **The record is the team's going in**, in games of the kind; for a day
   ahead, today's record.
8. **Who's missing is by minutes lost, not chance to play**, so a deep
   bench player at 8% isn't listed, and a starter at 50% is. Last names,
   or full names where two share one (Jalen and Jaylin Williams).
   "Both at full strength" when no one's missing.
9. **The time is US Eastern** ("7:30 PM ET"), the NBA's. Neutral-site
   games say so in the status line.
10. **The prediction line on played games is "Right" or "Wrong"**, by the
    favorite, in words (bold when right) rather than color or a check. It
    shows for games logged before tip-off, which is from November 4, 2026.
11. **On the front page**, under last night's scores: the next night's
    games (tonight's not played yet, or the next day with games), closest
    first, so the games worth watching lead: "NYK 51% – 49% CLE", the
    favorite bold, in one column since it's ranked. Hidden if it can't
    load. `PREDICTIONS →` goes to that day on the scores page.
12. **Failures**: with yarapm unreadable, a day with no played games says
    "Couldn't load predictions" with a retry; a played day shows its scores
    as before, and the prediction lines are left out.
13. **No link** on a predicted game; a box score's goes to its rotations,
    which don't exist yet.

## Answered

- The default stays yesterday. The footer's credit stays as it is:
  yarapm is this site's own model, from the NBA's data. No running record
  of right and wrong. The expected score stays, under the chances.

## Open: injuries ahead

Bill wants predictions to the end of the season, with each player's
chance to play moving toward a full roster's as the games get further
off, so the last games of the season assume everyone's back. yarapm
publishes one chance to play per player for every game ahead, so this is
a change to yarapm's minutes projection, not the site; the site shows
what yarapm publishes.
