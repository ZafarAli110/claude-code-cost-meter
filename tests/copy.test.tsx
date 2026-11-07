import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";

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

/** The engine beneath the plugin, with a clipboard that copies or not, and the toasts it was asked to show. */
function engine(on: On, isCopied: boolean): string[] {
  const toasts: string[] = [];
  on("session.usage", () => ({
    value: {
      startedAt: 0,
      context: { window: 200_000 },
      rateLimits: [],
      cost: { usd: 0 },
    },
  }));
  on("store.get", () => ({ value: undefined }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("command.register", () => ({ value: { command: "show-meter" } }));
  on("command.run", () => ({ text: "" }));
  on("ui.copy", () => ({
    value: isCopied
      ? { isCopied: true }
      : { isCopied: false, reason: "no-clipboard" },
  }));
  on("ui.toast", (_, e) => {
    toasts.push(e.text);
    return { value: undefined };
  });
  return toasts;
}

const OPEN_PANEL = {
  command: "show-meter",
  args: "panel",
  origin: { kind: "composer" },
  presentation: { isFullscreen: true, columns: 120 },
} as const;

/** The Copy button's label, read until it reads `label` (a press draws again a moment after it lands). */
async function labelAsync(
  ui: {
    find: (q: {
      key: string;
    }) => Promise<{ props: Record<string, unknown> } | undefined>;
    drawn: () => Promise<unknown>;
  },
  label: string,
): Promise<unknown> {
  let shown: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    shown = (await ui.find({ key: "copy" }))?.props["label"];
    if (shown === label) {
      return shown;
    }
    await ui.drawn();
  }
  return shown;
}

test("Copy says it copied: a toast, and the button reads Copied for two seconds", async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 });
  const toasts = engine(on, true);
  await $.command.run(OPEN_PANEL);
  const ui = await $.ui.mount(PANE);

  // The press settles only once the button has gone back to Copy, two seconds later on the test's clock.
  const pressed = ui.press({ key: "copy" });
  expect(await labelAsync(ui, "Copied ✓")).toBe("Copied ✓");
  expect(toasts).toEqual(["Cost meter copied: paste it anywhere."]);
  await clock.advance(2_000);
  await pressed;
  expect(await labelAsync(ui, "Copy")).toBe("Copy");
  await ui.unmount();
});

test("Copy that cannot reach the clipboard says so, and the button stays Copy", async ($, on) => {
  mock.clock(on, { now: 1_000 });
  const toasts = engine(on, false);
  await $.command.run(OPEN_PANEL);
  const ui = await $.ui.mount(PANE);

  await ui.press({ key: "copy" });

  expect(toasts).toEqual(["Could not reach the clipboard here."]);
  expect((await ui.find({ key: "copy" }))?.props["label"]).toBe("Copy");
  await ui.unmount();
});
