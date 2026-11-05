# Cost meter for Claude Code

See what the work is costing while Claude Code does it: the estimated cost, the tokens and how many came from the
cache, how full the context window is, the model calls, and every subagent with its own time, tokens and cost.

```
cost meter │ ⏱ 18m 04s │ ⚙ security-reviewer
cost     ●●●●○○○○○○  $4.20/$10.00 est.
tokens   ●●●●●●●●●○  90% from cache · 3.0M sent in 41 calls
context  ●●●○○○○○○○  30% 60k of 200k window
calls                41 to the model
agents               3 run · 690k tokens, $1.74 in all
         security-reviewer      running    80k tokens  ≈$0.03
         verifier                1m 35s   400k tokens  ≈$1.10
         architect                  47s   210k tokens  ≈$0.61
```

## Where it shows

It shows in two places:

| Where | When | How |
| --- | --- | --- |
| **Above the prompt**, in the chat | on by default, as soon as the plugin is installed | a one-line summary; it grows to the full meter when the terminal has the rows. `/show-meter hide` and `/show-meter show` turn it off and on |
| **The panel**, beside the chat | only when you run `/show-meter panel` (or just `/show-meter`) | the full meter, every subagent, and a **Copy** button |

Type `/show-meter` and the menu lists every word it takes; `/show-meter panel` also prints them.

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

## Update

From a terminal, with no Claude session needed (the same in PowerShell):

```
claude plugin marketplace update claude-code-cost-meter
claude plugin update cost-meter@claude-code-cost-meter
```

The first line fetches the newest list from GitHub; the second installs the newest version. Then restart Claude Code:
an update takes effect in the next session. Inside a session, type `/plugin`, open **Installed**, pick `cost-meter`
and choose **Update**, or run the same command with a `!` in front:
`! claude plugin update cost-meter@claude-code-cost-meter`.

If you installed it for one project (the **project** scope), add `--scope project` to the update, from that project's
folder. A project install takes priority over a user install there, so an old project copy hides a newer user copy.

## Uninstall

```
claude plugin uninstall cost-meter@claude-code-cost-meter
```

That removes the user install. For a project install, run it from the project's folder with `--scope project`; it
also takes the plugin out of that project's `.claude/settings.json`. To forget the marketplace as well:
`claude plugin marketplace remove claude-code-cost-meter`. Inside a session: `/plugin`, **Installed**, `cost-meter`,
**Uninstall**.

## Use

| Command | Does |
| --- | --- |
| `/show-meter panel` | opens the full meter in a panel beside the chat, with a **Copy** button at the top (`/show-meter` alone does the same) |
| `/show-meter copy` | puts the full meter on the clipboard as text, to paste into a ticket or a chat |
| `/show-meter reset` | counts from zero: run it just before a task you want to measure |
| `/show-meter budget 20` | the cost bar is full at $20 (default $10); remembered across sessions |
| `/show-meter hide`, `/show-meter show` | hides or shows the line above the prompt |

Ctrl+X then Ctrl+A also collapses and restores the line above the prompt.

## What the numbers are

- **cost** is Claude Code's own estimate at list price, the same figure `/usage` shows. On a subscription plan it
  is what the work would cost on the API, not what you pay. It turns red once it passes the budget.
- **tokens** is everything sent to the model and back since the reset, over every call, the main conversation's and
  every subagent's. Each call sends the whole conversation again, so this total grows far past the context window:
  35 calls over a conversation of about 60k is about 2M. The bar is the share read from the cache, which is billed at
  a fraction of the price.
- **context** is different: how big the conversation is now, against the most one call can hold. That is the one
  that fills up; near the top, Claude Code summarises older messages to make room.
- **agents** lists each subagent: running ones first, then the last 20 that finished. A subagent's cost is the cost
  of the model calls it made.

The counts belong to one Claude Code session: a new session starts from zero.

## How exact it is

- **Exact:** the total cost (Claude Code's own running total: in a session where the meter was open from the start, it
  equals `/usage`'s Total cost), the context window, the number of calls and each subagent's name and time. The token
  count was checked against a session's own record: 13,211,406 tokens over 162 calls, against 13.2M on the meter.
- **About (≈):** a subagent's own cost. The meter reads the session's total after each call and gives the increase to
  the agent that made it; when subagents run at the same time, a call can land between another's readings, so the
  split between them can shift by a few cents. The total across them stays right.
- **Can be a little lower than `/usage`:** the token count. Claude Code's own background calls (compaction, prompt
  suggestions) are in the cost but may not reach the token count.

## Requirements

Claude Code 2.1.287 or later (mods, October 2026). The plugin runs inside Claude Code: nothing to install besides
it, and no data leaves your machine.

## Licence

MIT
