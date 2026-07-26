// ──────────────────────────────────────────────
// Retired extension data cleanup
// ──────────────────────────────────────────────
// Extensions no longer exist. Keep this startup purge while v2-era installs
// may still contain payload-bearing rows or per-extension settings.
import type { DB } from "../../db/connection.js";
import { like } from "../../db/file-query.js";
import { appSettings, installedExtensions } from "../../db/schema/index.js";

const RETIRED_EXTENSION_SETTING_PATTERN = "extension-storage:%";

export type RetiredExtensionCleanupResult = {
  extensionRecordsRemoved: number;
  extensionSettingsRemoved: number;
};

export async function purgeRetiredExtensionData(db: DB): Promise<RetiredExtensionCleanupResult> {
  const result = await db.transaction(async (tx) => {
    const extensionRecords = await tx.select().from(installedExtensions);
    const extensionSettings = await tx
      .select()
      .from(appSettings)
      .where(like(appSettings.key, RETIRED_EXTENSION_SETTING_PATTERN));

    if (extensionRecords.length > 0) {
      await tx.delete(installedExtensions);
    }
    if (extensionSettings.length > 0) {
      await tx.delete(appSettings).where(like(appSettings.key, RETIRED_EXTENSION_SETTING_PATTERN));
    }

    return {
      extensionRecordsRemoved: extensionRecords.length,
      extensionSettingsRemoved: extensionSettings.length,
    };
  });

  if (result.extensionRecordsRemoved > 0 || result.extensionSettingsRemoved > 0) {
    await db._fileStore.flush();
  }

  return result;
}
