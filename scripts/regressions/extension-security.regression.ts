import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DB } from "../../packages/server/src/db/connection.js";
import { createFileNativeDB } from "../../packages/server/src/db/file-backed-store.js";
import { appSettings, installedExtensions } from "../../packages/server/src/db/schema/index.js";
import { purgeRetiredExtensionData } from "../../packages/server/src/services/setup/retired-extension-cleanup.js";

const clientThemeSource = readFileSync(
  new URL("../../packages/client/src/components/layout/CustomThemeInjector.tsx", import.meta.url),
  "utf8",
);
const clientAppSource = readFileSync(new URL("../../packages/client/src/App.tsx", import.meta.url), "utf8");
const clientSettingsSource = readFileSync(
  new URL("../../packages/client/src/components/panels/SettingsPanel.tsx", import.meta.url),
  "utf8",
);
const clientStoreSource = readFileSync(
  new URL("../../packages/client/src/stores/ui.store.ts", import.meta.url),
  "utf8",
);
const routeIndexSource = readFileSync(new URL("../../packages/server/src/routes/index.ts", import.meta.url), "utf8");
const cleanupSource = readFileSync(
  new URL("../../packages/server/src/services/setup/retired-extension-cleanup.ts", import.meta.url),
  "utf8",
);
const securityHeadersSource = readFileSync(
  new URL("../../packages/server/src/middleware/security-headers.ts", import.meta.url),
  "utf8",
);

assert.match(clientThemeSource, /useThemes/u);
assert.doesNotMatch(
  clientThemeSource,
  /useExtensions|InstalledExtension|ExtensionCssInjector|EXTENSION_STYLE_PREFIX|createObjectURL|@vite-ignore/u,
);
assert.doesNotMatch(clientAppSource, /useLegacyExtensionCleanup|use-extensions/u);
assert.doesNotMatch(clientSettingsSource, /Legacy Extension Cleanup|useExtensions|useDeleteExtension/u);
assert.match(clientStoreSource, /delete persisted\.installedExtensions/u);
assert.match(clientStoreSource, /delete persisted\.hasMigratedExtensionsToServer/u);
assert.doesNotMatch(routeIndexSource, /extensionsRoutes|\/api\/extensions/u);
assert.doesNotMatch(cleanupSource, /node:vm|runInContext|new vm\.Script/u);
assert.doesNotMatch(securityHeadersSource, /script-src[^"\n]*\bblob:/u);

const storageDir = mkdtempSync(join(tmpdir(), "marinara-extension-security-"));
process.env.FILE_STORAGE_DIR = storageDir;
const fileDb = await createFileNativeDB();
const db = fileDb as unknown as DB;
try {
  const timestamp = new Date(0).toISOString();
  await db.insert(installedExtensions).values({
    id: "persisted-enabled-css-extension",
    name: "Persisted enabled CSS extension",
    description: "Regression fixture",
    runtime: "client",
    css: "#must-never-apply { display: block; }",
    js: "globalThis.__mustNeverRun = true;",
    serverJs: "throw new Error('must never execute');",
    enabled: "true",
    installedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.insert(appSettings).values([
    { key: "extension-storage:persisted-enabled-css-extension", value: "payload", updatedAt: timestamp },
    { key: "extension-storage:orphaned-extension", value: "orphaned payload", updatedAt: timestamp },
    { key: "unrelated-setting", value: "keep", updatedAt: timestamp },
  ]);

  const cleanup = await purgeRetiredExtensionData(db);
  assert.deepEqual(cleanup, { extensionRecordsRemoved: 1, extensionSettingsRemoved: 2 });
  assert.deepEqual(await db.select().from(installedExtensions), []);

  const remainingSettings = await db.select().from(appSettings);
  assert.deepEqual(
    remainingSettings.map((row) => row.key),
    ["unrelated-setting"],
  );

  const repeatedCleanup = await purgeRetiredExtensionData(db);
  assert.deepEqual(repeatedCleanup, { extensionRecordsRemoved: 0, extensionSettingsRemoved: 0 });
} finally {
  await fileDb._fileStore.close();
  rmSync(storageDir, { recursive: true, force: true });
}

console.log("Extension removal security regression passed.");
