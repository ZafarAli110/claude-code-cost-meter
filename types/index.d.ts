/** A subagent that finished: what it was, how long it ran, and the tokens and estimated cost of its calls. */
export type FinishedAgent = { type: string; ms: number; tokens: number; usd: number };

/** What the meter shows, counted from the last reset. */
export type Meter = {
  /** When counting started, in ms from `$.clock.now()`. */
  startedAt: number;
  /** The session's cost in US dollars when counting started, and now: the meter shows the difference. */
  baseUsd: number;
  usd: number;
  /** Token counts summed over every model call since the reset, the main loop's and every subagent's. */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Model calls since the reset. */
  calls: number;
  /** The subagents running now: agent id → subagent type. */
  running: Record<string, string>;
  /** Tokens each running subagent has used so far: agent id → tokens. */
  agentTokens: Record<string, number>;
  /** The estimated cost of each running subagent's calls so far: agent id → US dollars. */
  agentUsd: Record<string, number>;
  /** Subagents started since the reset. */
  agentsRun: number;
  /** The subagents that finished since the reset, oldest first (the last 20). */
  finished: FinishedAgent[];
  /** When the counts last changed, in ms. */
  updatedAt: number;
};

declare module "claude-code" {
  interface PluginState {
    "cost-meter": { meter: Shaped<Meter | null>; isHidden: boolean; budget: number };
  }
}
