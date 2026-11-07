import { expect, test } from "claude-code/testing";
import type { On } from "claude-code";

// A /clear starts a new session with empty state and fires no `session.start` for it: these tests start with no
// session.start at all, which is the same thing as far as the meter can tell.

const PANE = {
  plugin: "cost-meter",
  component: "Pane",
  requestId: "cost-meter",
  surface: "terminal",
  props: {
    title: "Cost meter",
    isFocused: false,
    bodyColumns: 72,
    placement: "dock",
    scroll: { offset: 0, bodyRows: 18 },
    view: {},
  },
} as const;

/** The engine beneath the plugin: each hook answers a call on `$` with `{ value }`, an event with its own result. */
function engine(on: On): void {
  on("session.usage", () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [], cost: { usd: 0 } },
  }));
  on("clock.now", () => ({ value: 1_000 }));
  on("store.get", () => ({ value: undefined }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("command.register", () => ({ value: { command: "show-meter" } }));
  on("command.run", () => ({ text: "" }));
  on("turn.start", (_, e) => ({ turnId: e.turnId }));
}

test("after a /clear, /show-meter opens a panel with a meter in it, not an empty one", async ($, on) => {
  engine(on);

  await $.command.run({
    command: "show-meter",
    args: "panel",
    origin: { kind: "composer" },
    presentation: { isFullscreen: true, columns: 120 },
  });

  const ui = await $.ui.mount(PANE);
  expect((await ui.find({ type: "Text", text: /cost meter/ }))?.text).toContain("cost meter");
  await ui.unmount();
});

test("after a /clear, the next prompt starts the meter again", async ($, on) => {
  engine(on);

  await $.turn.start({ text: "hello", turnId: "t1" });

  const ui = await $.ui.mount(PANE);
  expect(await ui.find({ type: "Text", text: /Nothing counted yet/ })).toBeUndefined();
  expect((await ui.find({ type: "Text", text: /cost meter/ }))?.text).toContain("cost meter");
  await ui.unmount();
});
