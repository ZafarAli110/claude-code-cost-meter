import { expect, test } from "claude-code/testing";

import { describe as meter, rows } from "../hooks/register";

const base = {
  startedAt: 0,
  baseUsd: 1,
  usd: 5.2,
  input: 10_000,
  output: 90_000,
  cacheRead: 2_700_000,
  cacheWrite: 200_000,
  calls: 41,
  running: {},
  agentTokens: {},
  agentUsd: {},
  agentsRun: 3,
  finished: [
    { type: "architect", ms: 47_000, tokens: 210_000, usd: 0.61 },
    { type: "verifier", ms: 95_000, tokens: 400_000, usd: 1.1 },
  ],
  updatedAt: 1_084_000,
};
const context = { tokens: 60_000, window: 200_000, percent: 30 };

test("the full meter: a header, a row each, and a line per subagent, newest first", async () => {
  expect(meter(base, 10, "full", context)).toBe(
    [
      "cost meter │ ⏱ 18m 04s │ ⚙ main",
      "cost     ●●●●○○○○○○  $4.20/$10.00 est.",
      "tokens   ●●●●●●●●●○  90% from cache · 3.0M sent in 41 calls",
      "context  ●●●○○○○○○○  30% 60k of 200k window",
      "calls                41 to the model",
      "agents               3 run · 610k tokens, $1.71 in all",
      "         verifier                1m 35s   400k tokens  ≈$1.10",
      "         architect                  47s   210k tokens  ≈$0.61",
    ].join("\n"),
  );
});

test("the header names every running subagent", async () => {
  const running = { a1: "security-reviewer", a2: "performance-reviewer" };
  expect(meter({ ...base, running })).toContain("⚙ security-reviewer, performance-reviewer");
});

test("the cost turns red only once it passes the budget", async () => {
  const cost = (usd: number) => rows({ ...base, baseUsd: 0, usd }, 10)[0]?.valueColor;
  expect(cost(9.99)).toBe("success");
  expect(cost(10.5)).toBe("error");
});

test("the context row turns amber from 80%", async () => {
  expect(rows(base, 10, { ...context, percent: 85 })[2]?.valueColor).toBe("warning");
});

test("a cache share just under 100% never reads as 100%", async () => {
  expect(meter({ ...base, input: 1, output: 0, cacheWrite: 0, cacheRead: 999 })).toContain("99% from cache");
});

test("the short forms keep a few words per row, with no bars, so they never wrap", async () => {
  expect(meter(base, 10, "two", context).split("\n")).toEqual([
    "cost meter │ ⏱ 18m 04s │ ⚙ main",
    "$4.20 │ 3.0M sent │ context 30% │ 41 calls │ 3 agents",
  ]);
  expect(meter(base, 10, "one", context)).toBe(
    "cost meter │ ⏱ 18m 04s │ ⚙ main │ $4.20 │ 3.0M sent │ context 30% │ 41 calls │ 3 agents",
  );
});

test("a running subagent comes first, with what it has used so far", async () => {
  const running = { a1: "security-reviewer" };
  const text = meter({ ...base, running, agentTokens: { a1: 80_000 }, agentUsd: { a1: 0.03 } });
  expect(text).toContain("security-reviewer      running    80k tokens  ≈$0.03\n");
  expect(text).toContain("690k tokens, $1.74 in all");
});

test("a subagent's cost under a cent reads <$0.01, never $0.00", async () => {
  const finished = [{ type: "git", ms: 17_000, tokens: 43_000, usd: 0.004 }];
  const text = meter({ ...base, finished });
  expect(text).toContain("17s    43k tokens  <$0.01");
  expect(text).toContain("43k tokens, <$0.01 in all");
});

test("the time is read at the moment of drawing, not at the last call", async () => {
  expect(meter(base, 10, "one", undefined, 1_200_000)).toContain("⏱ 20m 00s");
});

test("past an hour the time reads in hours and minutes", async () => {
  expect(meter(base, 10, "one", undefined, 31_250_000)).toContain("⏱ 8h 40m");
});
