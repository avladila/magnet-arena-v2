# Task 004 Collector balance

The original Collectors scored individual pieces, followed their changing positions, and reacquired a target as soon as a piece was collected or recycled. On the two reference routes they received 273–309 target assignments per minute, including the first target. All magnets in the comparison travel at up to 460 world units per second and use the shared collection, growth, and respawn rules.

The corrected Collectors score live scrap counts in 240-unit cells within 720 units. They take a fixed line through a productive cell and reevaluate after 2.3 seconds. A shorter route must have room for at least 1.5 seconds of travel before arrival. A consumed pickup leaves the route intact. At a decision, an empty or unreachable region gives way to another productive region or an exploration waypoint. Growth can invalidate a wall endpoint and trigger immediate recovery.

`src/config.ts` holds the provisional settings. Distance is discounted over 300 units, extra pieces in a cell add 0.28 to its base score, and a full reversal can reduce a score by 40%. Routes reserve 60 units beyond the bot's physical radius at walls. The arrival tolerance is 40% of physical radius. These bounds give Collectors space to travel through a patch and favor useful forward motion.

## Reference comparison

The baseline was rerun on `75da6bc` before editing and reproduced the repository's East and West totals. The expanded comparison ran the same original seeds and targets against both versions and added a center-crossing route at three seeds. Each scenario uses 60 seconds of fixed world targets at 30 Hz. Run `npm exec -- tsx scripts/measure-competition.ts` for pickups and scales at each checkpoint. Add `--json` after the script path for machine-readable output.

The shorter-window experiment used the same region scorer with 0.7-second decisions and a 0.5-second minimum route. It produced 85–86 target assignments per Collector on East and West, compared with 28 under the selected 2.3-second window. On West, combined Collector pickups went from 1,309 with the short window to 993 with the longer one, while player pickups went from 146 to 196. On East the corresponding values were 1,146 to 1,116 for the Collectors and 269 to 279 for the player.

## Player pickup checkpoints

The values are original → corrected in the five-magnet runs. The solo column gives the 60-second result with the same initial scrap.

| Route and seed | 10 s | 20 s | 40 s | 60 s | Solo 60 s |
| --- | ---: | ---: | ---: | ---: | ---: |
| East 2026 | 31 → 33 | 98 → 99 | 195 → 210 | 233 → 279 | 252 |
| West 3881 | 21 → 31 | 61 → 74 | 94 → 112 | 170 → 196 | 252 |
| Middle 912 | 16 → 17 | 19 → 38 | 47 → 101 | 109 → 160 | 168 |
| Middle 1549 | 14 → 14 | 41 → 40 | 52 → 71 | 86 → 93 | 166 |
| Middle 6021 | 27 → 30 | 53 → 40 | 122 → 100 | 150 → 116 | 160 |

## Bot pickups and physical scale at 60 seconds

Each cell shows original → corrected pickups, followed by physical scale in parentheses.

| Route and seed | Player scale | Copper | Spark | Drift | Orbit |
| --- | --- | --- | --- | --- | --- |
| East 2026 | 1.82× → 1.92× | 726 → 535 (2.63× → 2.37×) | 677 → 581 (2.57× → 2.43×) | 293 → 280 (1.95× → 1.92×) | 369 → 398 (2.09× → 2.14×) |
| West 3881 | 1.67× → 1.73× | 741 → 505 (2.65× → 2.32×) | 582 → 488 (2.44× → 2.29×) | 339 → 421 (2.04× → 2.18×) | 265 → 243 (1.89× → 1.84×) |
| Middle 912 | 1.49× → 1.64× | 615 → 545 (2.48× → 2.38×) | 611 → 570 (2.48× → 2.42×) | 192 → 229 (1.72× → 1.81×) | 284 → 377 (1.93× → 2.11×) |
| Middle 1549 | 1.42× → 1.44× | 591 → 576 (2.45× → 2.43×) | 284 → 489 (1.93× → 2.29×) | 258 → 255 (1.87× → 1.87×) | 300 → 388 (1.96× → 2.13×) |
| Middle 6021 | 1.61× → 1.51× | 525 → 447 (2.35× → 2.23×) | 776 → 511 (2.70× → 2.33×) | 321 → 386 (2.00× → 2.12×) | 283 → 265 (1.93× → 1.89×) |

## Navigation and contests

All four bots moved for 60.00 seconds and spent 0.00 seconds stationary in every measured run. The encounter times measure when a bot center first entered the calculated camera view. A contested pickup had two or more eligible magnets at collection.

| Route and seed | Copper targets | Spark targets | Contested / total | Desktop encounter | Portrait encounter |
| --- | ---: | ---: | --- | --- | --- |
| East 2026 | 294 → 28 | 297 → 28 | 17 / 2,298 → 8 / 2,073 | 4.70 → 4.70 s | 1.77 → 3.90 s |
| West 3881 | 309 → 28 | 273 → 28 | 87 / 2,097 → 0 / 1,853 | 1.53 → 1.53 s | 1.83 → 1.57 s |
| Middle 912 | 282 → 27 | 286 → 27 | 7 / 1,811 → 5 / 1,881 | 1.83 → 0.50 s | 2.20 → 0.77 s |
| Middle 1549 | 281 → 27 | 278 → 27 | 439 / 1,519 → 0 / 1,801 | 1.57 → 1.57 s | 1.87 → 1.87 s |
| Middle 6021 | 259 → 28 | 311 → 28 | 39 / 2,055 → 3 / 1,725 | 1.83 → 1.83 s | 2.17 → 2.17 s |

Combined Collector pickups fell 20.5% on East and 24.9% on West. The player gained more scrap on both routes at every checkpoint and on four of five routes by 60 seconds. The added runs show variation in the shared economy. Spark rose from 284 to 489 pickups on seed 1549 as contested collections fell from 439 to zero across the arena. The player's result on seed 6021 fell from 150 to 116 despite lower Collector totals. Use the [physical-phone checklist](../README.md#physical-phone-playtest) to assess routes through the middle, believable bot growth, and sustained frame pacing.
