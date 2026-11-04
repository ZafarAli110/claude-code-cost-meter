# Cost meter for Claude Code

See what the work is costing while Claude Code does it: the estimated cost, the tokens and how many came from the
cache, how full the context window is, the model calls, and every subagent with its own time, tokens and cost.

```
cost meter │ ⏱ 18m 04s │ ⚙ security-reviewer
cost     ●●●●○○○○○○  $4.20/$10.00 est.
tokens   ●●●●●●●●●○  90% from cache · 3.0M in all
context  ●●●○○○○○○○  30% 60k of 200k window
calls                41 to the model
agents               3 run · 690k tokens, $1.74 in all
         security-reviewer      running    80k tokens  $0.03
         verifier                1m 35s   400k tokens  $1.10
         architect                  47s   210k tokens  $0.61
```

The full meter opens in a panel beside the conversation. A one-line summary sits above the prompt, and grows to the
full meter when your terminal has the rows for it.

## Install

At the Claude Code prompt (the same on Windows, macOS and Linux):

```
/plugin install cost-meter --marketplace ZafarAli110/claude-code-cost-meter
```

Answer `y` to add the marketplace, then pick a scope: **user** for every project, **project** to share it with
everyone who works in this repository. Or from a terminal:

```
claude plugin install cost-meter --marketplace ZafarAli110/claude-code-cost-meter
```

## Use

| Command | Does |
| --- | --- |
| `/show-meter` | opens the full meter beside the conversation |
| `/show-meter reset` | counts from zero: run it just before a task you want to measure |
| `/show-meter budget 20` | the cost bar is full at $20 (default $10); remembered across sessions |
| `/show-meter hide`, `/show-meter show` | hides or shows the line above the prompt |

Ctrl+X then Ctrl+A also collapses and restores the line above the prompt.

## What the numbers are

- **cost** is Claude Code's own estimate at list price, the same figure `/usage` shows. On a subscription plan it
  is what the work would cost on the API, not what you pay. It turns red once it passes the budget.
- **tokens** counts every model call since the reset, the main conversation's and every subagent's: input, output,
  cache reads and cache writes. The bar is the share read from the cache, which is billed at a fraction of the price.
- **context** is how full the context window was at the last response, as the status line shows it.
- **agents** lists each subagent: running ones first, then the last 20 that finished. A subagent's cost is the cost
  of the model calls it made.

The counts belong to one Claude Code session: a new session starts from zero.

## Requirements

Claude Code 2.1.287 or later (mods, October 2026). The plugin runs inside Claude Code: nothing to install besides
it, and no data leaves your machine.

## Licence

MIT
