# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hizarukuro/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/hizarukuro/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar. It reads a sealed snapshot of every protocol DefiLlama tracks, finds the ones that record no token yet and are not a wrapped or staked product of one that trades, and ranks them by what a launch would be worth — each with a concrete plan for farming it. The implied value is calibrated, not asserted: the model reads the market cap against TVL of the protocols in the snapshot whose token already trades, takes the median ratio per category, and prices each pre-token protocol with its own category's multiple, adjusted for its 7-day TVL growth and for how long it has run with no token. The dashboard shows the ranked board, a detail view with the model's arithmetic for every protocol, filters and sorting, and the live-token set the calibration comes from, kept apart and never ranked.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

The program (Node 22, standard library only) reads the snapshot, writes `board.json` and `data.js`, copies `dashboard/` and `screenshots/` beside them, and writes `dossier.json` last. Open `out/dashboard/index.html` in a browser to read the radar. In the grader's container the snapshot is mounted at `/input/snapshot.json` and the output is `/output`, so no arguments are needed there.

---

<sub>Entered on [make.fun](https://make.fun/?ref=c23ct4sn&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
