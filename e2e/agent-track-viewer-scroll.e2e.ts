import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { seedUIState } from "./ui-state-fixture.js";

const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

// Large enough that both the readable tree and the raw JSON overflow the viewer panes.
function buildLargeResult() {
  return {
    results: Array.from({ length: 60 }, (_, index) => ({
      id: `item-${index}`,
      summary: `Result ${index}: ${"lorem ipsum dolor sit amet ".repeat(8)}`,
      tags: ["alpha", "beta", `tag-${index}`],
    })),
    meta: { generated: "2026-09-16T00:00:00Z", notes: "x".repeat(400) },
  };
}

async function openViewerModal(page: Page, data: unknown) {
  await page.evaluate((payload) => {
    void (async () => {
      const { useUIStore } = await import("/src/stores/ui.store.ts" as string);
      useUIStore.getState().openModal("agent-track-viewer", {
        title: "Agent result",
        content: JSON.stringify(payload, null, 2),
        data: payload,
      });
    })();
  }, data);
}

const scrollTop = (locator: Locator) => locator.evaluate((element) => element.scrollTop);

const overflowState = (locator: Locator) =>
  locator.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));

async function wheelOver(locator: Locator, deltaY: number) {
  // The panes can be much taller than the viewport, so target a point that is
  // both inside the element and comfortably inside the viewport.
  const point = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const y = Math.min(rect.top + 160, rect.bottom - 5, window.innerHeight - 20);
    return { x: rect.left + rect.width / 2, y };
  });
  await locator.page().mouse.move(point.x, point.y);
  await locator.page().mouse.wheel(0, deltaY);
}

test.describe("Agent track viewer scroll", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/app-settings/ui", (route) => route.fulfill({ json: { value: null } }));
    await page.addInitScript((appVersion) => {
      localStorage.setItem("marinara:whats-new:seen-version", appVersion);
    }, version);
    await seedUIState(
      page,
      { hasCompletedOnboarding: true, rightPanelOpen: false, sidebarOpen: false },
      "if-missing",
    );
    await page.goto("/");
  });

  test("mouse wheel scrolls the readable tree and raw JSON in fullscreen viewer", async ({ page }) => {
    await openViewerModal(page, buildLargeResult());
    const dialog = page.locator('[data-component="Modal"][role="dialog"]');
    await expect(dialog).toBeVisible();

    // Each mode's pane is the viewer's scroller; wheel over it must move its content.
    const readable = dialog.locator(".h-full > div.overflow-y-auto, .flex-1 > div.overflow-y-auto").first();
    await expect(readable).toBeVisible();
    const readableOverflow = await overflowState(readable);
    expect(readableOverflow.scrollHeight, "readable tree overflows its pane").toBeGreaterThan(
      readableOverflow.clientHeight,
    );

    await wheelOver(readable, 480);
    await expect
      .poll(() => scrollTop(readable), { timeout: 3000, message: "wheel must scroll the readable tree" })
      .toBeGreaterThan(0);

    // Same expectation for the raw JSON pane.
    await dialog.getByRole("button", { name: /raw/i }).click();
    const raw = dialog.locator(".h-full > pre, .flex-1 > pre").first();
    await expect(raw).toBeVisible();
    const rawOverflow = await overflowState(raw);
    expect(rawOverflow.scrollHeight, "raw JSON overflows its pane").toBeGreaterThan(rawOverflow.clientHeight);

    await wheelOver(raw, 480);
    await expect
      .poll(() => scrollTop(raw), { timeout: 3000, message: "wheel must scroll the raw JSON pane" })
      .toBeGreaterThan(0);
  });

  test("small payloads keep the toolbar and pane laid out", async ({ page }) => {
    await openViewerModal(page, { ok: true });
    const dialog = page.locator('[data-component="Modal"][role="dialog"]');
    await expect(dialog).toBeVisible();

    await expect(dialog.getByRole("button", { name: /readable/i })).toBeVisible();
    const readable = dialog.locator(".h-full > div.overflow-y-auto, .flex-1 > div.overflow-y-auto").first();
    await expect(readable).toBeVisible();
    await expect(readable.evaluate((element) => element.clientHeight)).resolves.toBeGreaterThan(0);
  });
});
