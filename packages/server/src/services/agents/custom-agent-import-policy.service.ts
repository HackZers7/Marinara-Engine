import type { CustomAgentImportPolicy } from "@marinara-engine/shared";
import type { DB } from "../../db/connection.js";
import { createAppSettingsStorage } from "../storage/app-settings.storage.js";

export const CUSTOM_AGENT_IMPORTS_SETTINGS_KEY = "custom-agent-imports-enabled";

export async function getCustomAgentImportPolicy(db: DB): Promise<CustomAgentImportPolicy> {
  return {
    enabled: (await createAppSettingsStorage(db).get(CUSTOM_AGENT_IMPORTS_SETTINGS_KEY)) === "true",
  };
}

export async function setCustomAgentImportsEnabled(db: DB, enabled: boolean): Promise<CustomAgentImportPolicy> {
  await createAppSettingsStorage(db).set(CUSTOM_AGENT_IMPORTS_SETTINGS_KEY, enabled ? "true" : "false");
  return { enabled };
}
