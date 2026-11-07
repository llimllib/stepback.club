# Predictions on the scores page

Written 2026-11-07. A first version, built while Bill was out from a short
conversation: the decisions below are mine, to review, and the questions
are open. Extends `2026-10-29-scores-design.md`.

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
BKN 111  ATL 119
            WIN   TODAY    FULL
BKN 2-6     28%    −6.2   −10.2
ATL 6-4     72%    −0.1    −1.0
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
2. **The default date is still yesterday.** Today and the days ahead are
   one Next away. See question 1.
3. **Today mixes both**: games played show their box score, the rest
   their prediction, in the NBA's order. Untested on a real mixed day, as
   none had started when this was built.
4. **Prev, Next and the date picker reach every predicted day**, to the
   season's last (April 11). Predicted days count as game days, so a date
   past the bucket's seasons links back to April 11.
5. **The score line is the expected points**, whole, the favorite bold,
   like a winner. When both round to the same number, one decimal
   (NYK 113.0, CLE 112.7).
6. **Three columns: Win, Today, Full.** Chance to win, and net rating per
   100 possessions against an average team with the expected lineup and
   at full strength. Today against Full says how much a team is missing;
   both were picked over expected possessions or the spread, which the
   score line already gives. The better value in each is bold, as in the
   box score.
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
11. **Failures**: with yarapm unreadable, a day with no played games says
    "Couldn't load predictions" with a retry; a played day shows its scores
    as before, and the prediction lines are left out.
12. **No link** on a predicted game; a box score's goes to its rotations,
    which don't exist yet.

## Questions

1. **Should the default be today** (tonight's predictions, then results as
   they come in) rather than yesterday? It would make the page a "tonight"
   page; the front page's "last night" box would keep yesterday.
2. **Today/Full** as column names: clear enough? "Now" and "Healthy" were
   the other candidates.
3. **The footer's data credit** is site-wide ("NBA.com · ESPN Analytics")
   and doesn't mention yarapm, which both the RAPM chart and this use.
   Add it to the site-wide line?
4. **How far ahead?** April's games are predicted with today's rosters.
   Cap the picker at a week or two, or leave it with the note?
5. **A running record**, "yarapm is 41–12 this season", from
   `live_metrics` or the log, somewhere on the page?
6. **The front page** could show tonight's predictions beside last night's
   scores. Wanted?
7. **Possessions or the total**, for anyone reading for the over/under?
   Left out; easy to add to the status line.
