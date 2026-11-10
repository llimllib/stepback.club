# The matchup page, reworked

Written 2026-11-10. Replaces decision 13 of
`2026-11-07-predictions-design.md`, the first matchup page.

## Why

The first page was two agate tables of six numbers a player (minutes,
chance to play, prior, rating, adds) and a four-line sum under each. Bill
found it dry, and couldn't tell what prior, rating and adds meant, or why
Queta rated above everyone. The story of BOS at PHI was in the sum's last
line: by box score the teams are even (+1.6 to +1.4); the 63% is all
on-court results.

## What

```
[EXPORT PNG]
[logo] BOSTON CELTICS 63% TO WIN          │      PHILADELPHIA 76ERS 37% TO WIN [logo]
                MIN  YARAPM   EPM  NET PTS │ YARAPM   EPM  NET PTS  MIN
Jayson Tatum     30    +3.7  +6.0    +6.0  │   +2.5  +2.6    +3.1   35   Tyrese Maxey
…the starters, then a small gap, then the bench
Mike Conley 70%  11    −0.1  +0.6       —  │ …
…every player with expected minutes, to <1
──────────────────────────────────────────────────────────────────────────────
TEAM                   +9.5 +11.3   +11.5  │   +3.1  +2.3    +4.7              TEAM
MIN / YARAPM / EPM / NET PTS / TEAM: a key under the table
```

## Decisions

1. **The table is the comparison.** One table, away team left and home
   right, mirrored around a rule. Each row pairs the players at the same
   place in their rotations, by expected minutes (Bill: by minutes, not
   by position, which the data doesn't have). A small gap after the top
   five sets the starters off from the bench: no rule or label (Bill took
   out a rule labeled "Bench").
2. **Three ratings a player, beside his minutes** (Bill, unsure of
   yarapm's ratings yet: Queta as the best player in the game was an
   embarrassing result). yarapm's rating; dunksandthrees' predictive EPM
   (`epm_predictive`, the latest, since a prediction is always the latest
   build's); and ESPN's net points per 100 possessions this season
   (`net_pts_season`, regular season: offense and defense each per 100 of
   their possessions, added, as ESPN does). Net points split a team's
   margin among its players (they add up to it exactly), so a good player
   on a losing team rates low: the key says so. Under 200 team
   possessions on the court a player's net points are "—" (Rupert was
   +45.3 on 6). Chance to play under 80% is beside the name. A missing
   EPM or net points file leaves its column blank rather than failing the
   page.
3. **Ratings are numbers, not bars**: signed, blue or red (`pos` /
   `neg`), so the sign reads in grayscale and the color at a glance.
   Three bars a player didn't fit. The alternative, which Bill liked but
   didn't pick: one small dot plot a player, a shape per model on a
   shared axis, which shows agreement at a glance but loses the values.
   The columns are in the same order on both sides.
4. **The whole bench**, every player yarapm gives expected minutes, down
   to "<1". (The first version folded players under 5 minutes into "+3
   more · 6 min"; Bill wanted them shown.)
5. **Each team's head is its band**: primary color with contrast-picked
   text (`bandColors`), the logo in a newsprint box inset in the band
   at its outside edge, yarapm's chance to win and expected points:
   "63% TO WIN · EXPECTED 113", whole points, or one decimal when both
   teams' round to the same. With those in the bands and the day and
   time in the box between them, the line under the title, which
   repeated them, is gone; it only reports failures. Under the players,
   the table's last row, labeled "Team" (not "Total", which promises a
   plain sum, or "Net", which reads as a subtotal of Net pts), **each
   team's net rating by all three**: each model's ratings weighted by
   yarapm's expected minutes, five on the floor, a blank counted as
   average; yarapm's is yarapm's own `net`. Checked over all 30 teams'
   next games: yarapm's average 0.0, net points' −0.1, EPM's +0.7,
   against a spread between teams of 5.6 (net points 8.7). EPM is left
   uncentered. Between the two bands, as in the export, an ink box like
   a scoreboard's: "AT" ("VS." at a neutral site), the day and the
   time. In the table it's the head's middle cell, over the middle
   rule; on a phone it's a bar between the two teams' tables.
6. **No generated text.** A lede built from the numbers (the gap by box
   score against the gap with results, the game's best players, the
   player furthest from his box score) was tried and taken out: it
   headlined the model's least believable claims, Queta as the best player
   on the floor, as findings.
7. **A key under the table** defines min, each rating and the team net
   rating in plain words, with links to yarapm and dunksandthrees.
8. **Phones** (under 760px) get one table a team, the away team's first:
   both sides' eight number columns don't fit beside names.
9. **Export PNG**, a button under the title: the table drawn again
   as SVG (`matchupFrame`), off screen, and exported with `toPng` like a
   tool's chart. No band or legend strip, which repeated the team bands
   (Bill): `buildBareFrame` in `kit/frame.ts` is the body and the footer
   alone, sharing `buildFrame`'s footer. The game's day and time are in an
   ink box between the two team bands, like a scoreboard's: "AT" ("VS." at
   a neutral site), "TUE, NOV 10", "8:00 PM ET". A dateline over the
   bands, with yarapm's expected score on its right, was tried beside it;
   the box won as the better use of space. The footer's source starts with
   the ratings' day, "As of Nov 10, 2026 · Data: yarapm · dunksandthrees ·
   ESPN Analytics", since they change every day;
   `billmill.org/nba/matchup` is on its right. One size (Fit), no
   annotations.

10. **Each team's record going in** leads its band's subhead: "8-2 · 63%
    TO WIN · EXPECTED 113", on the page and in the export. (After the
    name in the title it was too bold.) In the export a long name or
    subhead shrinks to fit beside the logo (Minnesota Timberwolves),
    since SVG text doesn't wrap.
11. **Four factors, by possession** (Bill: a team comparison; a table
    first, as a chart is a project): under the player table, a section
    headed "Four factors", with two tables, "When the Celtics have the
    ball" (the Celtics' offense against the 76ers' defense) and "When
    the 76ers have the ball". Rows are rating, eFG%, turnovers per 100
    possessions, offensive rebound % and FT rate (free throws made per
    field goal attempt, as in Team charts); a defense's are its
    opponents'. Each value has its rank among the 30 teams, 1st best
    on that side of the ball, and is blue or red, better or worse than
    the league's average from its totals. This regular season, from
    the NBA's team game logs (`src/scores/factors.ts`); left out if
    they can't be read or a team hasn't played. The key explains each
    row, one entry each. Not in the export. A chart (each factor a
    strip of 30 teams with the two marked) is the idea for later.

## Not done

A four factors chart; the four factors in the export.
