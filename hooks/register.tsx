// The cost meter: rows above the prompt, in the status line's style, with what the work since the last reset has
// used: time, the estimated cost against a budget, tokens (and how many came from the cache), the context window,
// model calls, and the subagents: which are running now, how many have run, and the last one's time and tokens.
// Counts the main loop and every subagent. The cost is the session's own estimate at list price, as /usage shows it.
import { atom, read, update } from "claude-code";
import type { Color, EngineInterface, Register, RenderSurface, Timer } from "claude-code";

import type { Meter } from "../types";

type Elements = ReturnType<EngineInterface["ui"]["resolve"]>;

const COMMAND = "show-meter";
const PANE = "cost-meter";
const LABEL_WIDTH = 9;
const BAR_CELLS = 10;
const KEPT_AGENTS = 20;

// Change the tag when Meter's fields change: it declines what an earlier version stored, which outlives a reload.
const meter = atom({ plugin: "cost-meter", key: "meter" } as const, null, { shape: "meter-4" });
const isHidden = atom({ plugin: "cost-meter", key: "isHidden" } as const, false);
const budget = atom({ plugin: "cost-meter", key: "budget" } as const, 10);

async function sessionUsd($: EngineInterface): Promise<number> {
  return (await $.session.usage()).cost?.usd ?? 0;
}

async function fresh($: EngineInterface): Promise<Meter> {
  const now = await $.clock.now();
  const usd = await sessionUsd($);
  return {
    startedAt: now,
    baseUsd: usd,
    usd,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    calls: 0,
    running: {},
    agentTokens: {},
    agentUsd: {},
    agentsRun: 0,
    finished: [],
    updatedAt: now,
  };
}

function tokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${Math.round(count / 1_000)}k`;
  }
  return String(count);
}

function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

/** Ten cells, like the status line's: one filled cell per tenth of the share, drawn green; the rest empty. */
export type Bar = { filled: string; empty: string };

function bar(share: number): Bar {
  const filled = Math.min(BAR_CELLS, Math.max(0, Math.floor(share * BAR_CELLS)));
  return { filled: "●".repeat(filled), empty: "○".repeat(BAR_CELLS - filled) };
}

const NO_BAR: Bar = { filled: "", empty: " ".repeat(BAR_CELLS) };

/** One row: a label, a bar (or blank), the value, a quieter detail, and the few words the one-line form keeps. */
export type Row = { label: string; bar: Bar; value: string; valueColor: Color; detail: string; brief: string };

/** The live context window, as the status line reads it: absent until the window's first response. */
export type Context = { tokens?: number; window: number; percent?: number };

/** The header row: the time since the reset, and what is running now. */
export type Header = { time: string; now: string; isAgent: boolean };

export function header(m: Meter, now = m.updatedAt): Header {
  const agents = Object.values(m.running);
  return {
    time: elapsed(now - m.startedAt),
    now: agents.length > 0 ? agents.join(", ") : "main",
    isAgent: agents.length > 0,
  };
}

export function rows(m: Meter, budgetUsd: number, context?: Context): Row[] {
  const total = m.input + m.output + m.cacheRead + m.cacheWrite;
  const cached = total > 0 ? m.cacheRead / total : 0;
  const usd = m.usd - m.baseUsd;
  const percent = context?.percent;
  const spent = agentLines(m).reduce((sum, line) => ({ tokens: sum.tokens + line.tokens, usd: sum.usd + line.usd }), {
    tokens: 0,
    usd: 0,
  });
  return [
    {
      label: "cost",
      bar: bar(budgetUsd > 0 ? usd / budgetUsd : 0),
      value: `$${usd.toFixed(2)}`,
      valueColor: usd > budgetUsd ? "error" : "success",
      detail: `/$${budgetUsd.toFixed(2)} est.`,
      brief: `$${usd.toFixed(2)}`,
    },
    {
      label: "tokens",
      bar: bar(cached),
      value: `${Math.floor(cached * 100)}%`,
      valueColor: "success",
      detail: `from cache · ${tokens(total)} sent in ${m.calls} calls`,
      brief: `${tokens(total)} sent`,
    },
    {
      label: "context",
      bar: bar((percent ?? 0) / 100),
      value: percent === undefined ? "–" : `${percent}%`,
      valueColor: (percent ?? 0) >= 80 ? "warning" : "success",
      detail: context ? `${tokens(context.tokens ?? 0)} of ${tokens(context.window)} window` : "window",
      brief: `context ${percent === undefined ? "–" : `${percent}%`}`,
    },
    {
      label: "calls",
      bar: NO_BAR,
      value: String(m.calls),
      valueColor: "success",
      detail: "to the model",
      brief: `${m.calls} calls`,
    },
    {
      label: "agents",
      bar: NO_BAR,
      value: String(m.agentsRun),
      valueColor: "success",
      detail:
        m.agentsRun === 0
          ? "run"
          : `run · ${tokens(spent.tokens)} tokens, ${spent.usd < 0.005 ? "<$0.01" : `$${spent.usd.toFixed(2)}`} in all`,
      brief: `${m.agentsRun} agents`,
    },
  ];
}

/** One subagent under the agents row: running ones first, then the finished, newest first. */
export type AgentLine = { name: string; time: string; tokens: number; usd: number; isRunning: boolean };

export function agentLines(m: Meter): AgentLine[] {
  const running = Object.entries(m.running).map(([id, name]) => ({
    name,
    time: "running",
    tokens: m.agentTokens[id] ?? 0,
    usd: m.agentUsd[id] ?? 0,
    isRunning: true,
  }));
  const done = [...m.finished].reverse().map((agent) => ({
    name: agent.type,
    time: elapsed(agent.ms),
    tokens: agent.tokens,
    usd: agent.usd,
    isRunning: false,
  }));
  return [...running, ...done];
}

/** A subagent's cost: about, since parallel subagents' calls can land in each other's readings; never a bare $0.00. */
function about(usd: number): string {
  return usd < 0.005 ? "<$0.01" : `≈$${usd.toFixed(2)}`;
}

function agentText(line: AgentLine): string {
  return `${line.name.padEnd(22)} ${line.time.padStart(7)}  ${tokens(line.tokens).padStart(5)} tokens  ${about(line.usd)}`;
}

/** The meter's three shapes: every row, or a header and one line, or one line. */
export type Mode = "full" | "two" | "one";

function gap(detail: string): string {
  return detail.startsWith("/") ? "" : " ";
}

/** The shape that fits `maxRows` rows: the full meter needs a header, five rows and a line per subagent. */
export function layout(maxRows: number, m: Meter): Mode {
  if (maxRows >= 6 + agentLines(m).length) {
    return "full";
  }
  return maxRows >= 2 ? "two" : "one";
}

/** The meter as plain text: what the tests read, and the shape the band draws. */
export function describe(m: Meter, budgetUsd = 10, mode: Mode = "full", context?: Context, now = m.updatedAt): string {
  const top = header(m, now);
  const head = `cost meter │ ⏱ ${top.time} │ ⚙ ${top.now}`;
  const all = rows(m, budgetUsd, context);
  if (mode === "full") {
    const body = all.map(
      (row) =>
        `${row.label.padEnd(LABEL_WIDTH)}${row.bar.filled}${row.bar.empty}  ${row.value}${gap(row.detail)}${row.detail}`,
    );
    const agents = agentLines(m).map((line) => `${" ".repeat(LABEL_WIDTH)}${agentText(line)}`);
    return [head, ...body, ...agents].join("\n");
  }
  const brief = all.map((row) => row.brief).join(" │ ");
  return mode === "two" ? `${head}\n${brief}` : `${head} │ ${brief}`;
}

/** The meter as an element tree: the full rows, or two lines, or one, drawn with the surface's own elements. */
export async function draw($: EngineInterface, ui: Elements, m: Meter, mode: Mode) {
  const budgetUsd = await read($, budget);
  // The clock is read at every draw, and a timer redraws once a second, so the time never looks frozen.
  const top = header(m, await $.clock.now());
  const all = rows(m, budgetUsd, (await $.session.usage()).context);
  const { Box, Text } = ui;
  const separator = (key: string) => (
    <Text key={key} dimColor>
      {" │ "}
    </Text>
  );
  const head = [
    <Text key="name" color="suggestion">
      cost meter
    </Text>,
    separator("s1"),
    <Text key="time">⏱ {top.time}</Text>,
    separator("s2"),
    <Text key="now" color={top.isAgent ? "permission" : undefined} dimColor={!top.isAgent}>
      ⚙ {top.now}
    </Text>,
  ];
  if (mode === "full") {
    return (
      <Box flexDirection="column">
        <Text>{head}</Text>
        {all.map((row) => (
          <Text key={row.label}>
            <Text>{row.label.padEnd(LABEL_WIDTH)}</Text>
            <Text color="success">{row.bar.filled}</Text>
            <Text dimColor>{row.bar.empty}</Text>
            <Text>{"  "}</Text>
            <Text color={row.valueColor}>{row.value}</Text>
            <Text dimColor>
              {gap(row.detail)}
              {row.detail}
            </Text>
          </Text>
        ))}
        {agentLines(m).map((line, index) => (
          <Text
            key={`agent-${String(index)}`}
            color={line.isRunning ? "permission" : undefined}
            dimColor={!line.isRunning}
          >
            {" ".repeat(LABEL_WIDTH)}
            {agentText(line)}
          </Text>
        ))}
      </Box>
    );
  }
  const brief = all.map((row, index) => (
    <Text key={row.label}>
      {index > 0 ? separator(`b${String(index)}`) : null}
      <Text color={row.valueColor}>{row.brief}</Text>
    </Text>
  ));
  return mode === "two" ? (
    <Box flexDirection="column">
      <Text>{head}</Text>
      <Text>{brief}</Text>
    </Box>
  ) : (
    <Text>
      {head}
      {separator("s3")}
      {brief}
    </Text>
  );
}

/** The full meter as text, on the clipboard: for a meter taller than its panel, or to paste into a ticket or a chat. */
export async function copyMeter($: EngineInterface, surface?: RenderSurface): Promise<boolean> {
  const m = await read($, meter);
  if (m === null) {
    return false;
  }
  const text = describe(m, await read($, budget), "full", (await $.session.usage()).context, await $.clock.now());
  return (await $.ui.copy(surface === undefined ? { text } : { text, surface })).isCopied;
}

let tick: Timer | undefined;

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    // Redraw once a second so the time ticks; a reload starts a new timer and stops the old one.
    tick?.cancel();
    tick = $.clock.every(1000, () => $.ui.invalidate("ui.render"));
    await $.command.register({
      name: COMMAND,
      description:
        "Open the cost meter beside the chat; `copy` puts it on the clipboard; `reset`; `budget <dollars>`; `hide` or `show`",
    });
    if ((await read($, meter)) === null) {
      const started = await fresh($);
      await update($, meter, () => started);
    }
    // The budget outlives the session: set it once, and every later session starts with it.
    const saved = Number(await $.store.get("budget"));
    if (saved > 0) {
      await update($, budget, () => saved);
    }
    return next(e);
  });

  on("command.run", { command: COMMAND }, async ($, e) => {
    try {
      const [word = "", amount = ""] = e.args.trim().toLowerCase().split(/\s+/);
      if (word === "hide" || word === "show") {
        await update($, isHidden, () => word === "hide");
        return { text: `Cost meter ${word === "hide" ? "hidden" : "shown"}.` };
      }
      if (word === "" || word === "panel") {
        const opened = await $.ui.open({ id: PANE, title: "Cost meter", columns: 64 });
        return { text: opened.isPlaced ? "Cost meter opened." : "The cost meter waits for a wider terminal." };
      }
      if (word === "budget") {
        const dollars = Number(amount.replace("$", ""));
        if (!(dollars > 0)) {
          return { text: `Give the budget in dollars, e.g. /${COMMAND} budget 10.` };
        }
        await update($, budget, () => dollars);
        await $.store.set("budget", dollars);
        return { text: `Cost meter budget: $${dollars.toFixed(2)}.` };
      }
      if (word === "copy") {
        const isCopied = await copyMeter($);
        return { text: isCopied ? "Cost meter copied: paste it anywhere." : "Could not reach the clipboard here." };
      }
      if (word === "reset") {
        const started = await fresh($);
        await update($, meter, () => started);
        await update($, isHidden, () => false);
        return { text: "Cost meter reset: counting from now." };
      }
      return { text: `Unknown: ${word}. Try /${COMMAND}, /${COMMAND} reset, budget 20, hide or show.` };
    } catch {
      return { text: "The cost meter could not do that." };
    }
  });

  // Every model call, the main loop's and each subagent's: add its tokens and read the session's cost.
  on("turn.step", async function* ($, e, next) {
    const result = yield* next(e);
    const usage = result?.usage;
    // The meter never stands in a model call's way: a failure here leaves the result as it was.
    if (usage) {
      try {
        const spent =
          usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens;
        const agentId = e.agentId;
        const usd = await sessionUsd($);
        const now = await $.clock.now();
        await update($, meter, (m) =>
          m === null
            ? m
            : {
                ...m,
                input: m.input + usage.input_tokens,
                output: m.output + usage.output_tokens,
                cacheRead: m.cacheRead + usage.cache_read_input_tokens,
                cacheWrite: m.cacheWrite + usage.cache_creation_input_tokens,
                calls: m.calls + 1,
                agentTokens:
                  agentId === undefined
                    ? m.agentTokens
                    : { ...m.agentTokens, [agentId]: (m.agentTokens[agentId] ?? 0) + spent },
                // The cost since the previous call's reading is this call's: it goes to the agent that made it.
                agentUsd:
                  agentId === undefined
                    ? m.agentUsd
                    : { ...m.agentUsd, [agentId]: (m.agentUsd[agentId] ?? 0) + Math.max(0, usd - m.usd) },
                usd,
                updatedAt: now,
              },
        );
      } catch {
        // Counted wrong, never blocked.
      }
    }
    return result;
  });

  on("agent.spawn", async ($, e, next) => {
    const started = await next(e);
    const agentId = started.agentId;
    // The meter never stands in a subagent's way: a failure here leaves the spawn as it was.
    if (agentId) {
      try {
        await update($, meter, (m) =>
          m === null ? m : { ...m, agentsRun: m.agentsRun + 1, running: { ...m.running, [agentId]: e.subagentType } },
        );
      } catch {
        // Counted wrong, never blocked.
      }
    }
    return started;
  });

  // A subagent's run ends: it leaves the running list and becomes the last one, with its time and tokens.
  on("turn.complete", async ($, e, next) => {
    const agentId = e.agentId;
    if (agentId) {
      try {
        const now = await $.clock.now();
        await update($, meter, (m) => {
          if (m === null || !(agentId in m.running)) {
            return m;
          }
          const { [agentId]: type = "subagent", ...running } = m.running;
          const { [agentId]: spent = 0, ...agentTokens } = m.agentTokens;
          const { [agentId]: usd = 0, ...agentUsd } = m.agentUsd;
          const finished = [...m.finished, { type, ms: e.durationMs, tokens: spent, usd }].slice(-KEPT_AGENTS);
          return { ...m, running, agentTokens, agentUsd, finished, updatedAt: now };
        });
      } catch {
        // Counted wrong, never blocked.
      }
    }
    return next(e);
  });

  // The band above the prompt: as much of the meter as its rows hold.
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const m = await read($, meter);
    if (e.props.hasSurvey || m === null || (await read($, isHidden))) {
      return next(e);
    }
    return draw($, $.ui.resolve(e), m, layout(e.props.maxRows, m));
  });

  // The panel beside the chat (`/show-meter`): always the full meter.
  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const m = await read($, meter);
    const ui = $.ui.resolve(e);
    if (m === null) {
      return <ui.Text dimColor>Nothing counted yet.</ui.Text>;
    }
    const { Box, Button } = ui;
    return (
      <Box flexDirection="column">
        <Box>
          <Button key="copy" label="Copy" onPress={(press) => copyMeter($, press.surface)} />
        </Box>
        {await draw($, ui, m, "full")}
      </Box>
    );
  });
};
