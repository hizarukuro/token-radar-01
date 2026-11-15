# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hizarukuro/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/hizarukuro/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar. It reads a sealed snapshot of every protocol DefiLlama tracks, accounts for all 758 of them in the open — 416 already tokenised, 342 pre-token, 144 of those set aside by a named rule, 198 priced — and ranks the priced set by what a launch would be worth, each with a farm plan netted to a FARM, THIN or SKIP verdict. The price is a log-log size curve fitted on the snapshot's 121 traded peers (value = 10^7.1031 × (TVL/$100M)^0.5831), chosen by a blind test the program runs on itself before it prices anything: leave-one-out over every peer and a pre/post-2024 time split, against five rival stages — the flat category multiple of this entry's first build (median miss ×5.12), the curve with category offsets (×3.49), with growth (×3.41), with seasoning (×3.31), and with all three (×3.51). The pure curve won both tests (×3.09, 49% of peers within 3×), so it ships alone, and its own blind residuals become the P10–P90 honesty band printed on every row. Each farm plan is written for its protocol's mechanism — fifteen plays — and costed line by line: expected slice of a 10%-to-depositors launch allocation, minus the plan's own gas and entry/exit fees, minus the T-bill yield the capital would have earned, over the plan's active hours. The dashboard shows the board with its bands and verdicts, a detail view with the curve's arithmetic, the traded peers and a capital-by-share sensitivity matrix for every protocol, a Method & backtest page that refits the curve in the browser and checks it against board.json row by row, the set-aside list with its rules, and the live-token evidence kept apart and never ranked.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

The program (Node 22, standard library only) reads the snapshot, writes `board.json` and `data.js`, copies `dashboard/` and `screenshots/` beside them, and writes `dossier.json` last. Open `out/dashboard/index.html` in a browser to read the radar. In the grader's container the snapshot is mounted at `/input/snapshot.json` and the output is `/output`, so no arguments are needed there.

---

<sub>Entered on [make.fun](https://make.fun/?ref=c23ct4sn&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
