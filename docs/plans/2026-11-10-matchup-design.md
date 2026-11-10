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
   at its outside edge, and the chance to win, which is yarapm's (the
   status line says so: "yarapm: BOS 63% – 37% PHI"). Under the
   players, the table's last row, labeled "Team" (not "Total", which
   promises a plain sum, or "Net", which reads as a subtotal of Net
   pts), **each team's net rating by all three**: each model's ratings
   weighted by yarapm's expected minutes, five on the floor, a blank
   counted as average; yarapm's is yarapm's own `net`. Checked over all
   30 teams' next games: yarapm's average 0.0, net points' −0.1, EPM's
   +0.7, against a spread between teams of 5.6 (net points 8.7). EPM is
   left uncentered.
6. **No generated text.** A lede built from the numbers (the gap by box
   score against the gap with results, the game's best players, the
   player furthest from his box score) was tried and taken out: it
   headlined the model's least believable claims, Queta as the best player
   on the floor, as findings.
7. **A key under the table** defines min, each rating and the team net
   rating in plain words, with links to yarapm and dunksandthrees.
8. **Phones** (under 760px) get one table a team, the away team's first:
   both sides' eight number columns don't fit beside names.
9. **Export PNG**, a button under the status line: the table drawn again
   as SVG in the kit's frame (`matchupFrame`), off screen, and exported
   with `toPng` like a tool's chart. An ink band, "Celtics at 76ers", with
   the time and yarapm's expected score as the deck; each team's band,
   logo and chance, the team net ratings and the three ratings in the
   body; a legend strip for the value colors; "Data: yarapm ·
   dunksandthrees · ESPN Analytics" and `billmill.org/nba/matchup` in the
   footer. One size (Fit),
   no annotations.

## Not done

Charts under the table: Bill suggested them as a possible addition.
