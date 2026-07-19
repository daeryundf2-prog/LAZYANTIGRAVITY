import {
  DEFAULT_POSTHOG_API_KEY,
  DEFAULT_POSTHOG_HOST,
} from "./product-identity.js"

function normalizeEnvValue(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase()
}

function isDisableFlag(value: string | undefined): boolean {
  const normalized = normalizeEnvValue(value)
  return normalized === "1" || normalized === "true"
}

import { existsSync } from "node:fs";
import { join } from "node:path";
import { getActivityStateDir } from "./data-path.js";

function isOptInFlag(value: string | undefined): boolean {
  const normalized = normalizeEnvValue(value)
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on"
}

export function isTelemetryOptedIn(): boolean {
  if (
    isOptInFlag(process.env["OMO_SEND_ANONYMOUS_TELEMETRY"]) ||
    isOptInFlag(process.env["OMO_CODEX_SEND_ANONYMOUS_TELEMETRY"]) ||
    isOptInFlag(process.env["LAZYANTIGRAVITY_TELEMETRY_OPT_IN"])
  ) {
    return true;
  }
  try {
    const optInFilePath = join(getActivityStateDir(), ".telemetry-opt-in");
    return existsSync(optInFilePath);
  } catch {
    return false;
  }
}

export function shouldDisablePostHog(): boolean {
  if (!isTelemetryOptedIn()) {
    return true;
  }
  return (
    isDisableFlag(process.env["OMO_DISABLE_POSTHOG"]) ||
    isDisableFlag(process.env["OMO_CODEX_DISABLE_POSTHOG"]) ||
    isDisableFlag(process.env["LAZYANTIGRAVITY_TELEMETRY_DISABLE"])
  );
}

export function getPostHogApiKey(): string {
  const explicit = process.env["POSTHOG_API_KEY"]
  if (explicit === undefined) {
    return DEFAULT_POSTHOG_API_KEY
  }
  return explicit.trim()
}

export function hasPostHogApiKey(): boolean {
  return getPostHogApiKey().length > 0
}

export function getPostHogHost(): string {
  return process.env["POSTHOG_HOST"]?.trim() || DEFAULT_POSTHOG_HOST
}
