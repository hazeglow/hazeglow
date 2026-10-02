import { parseConfig, type GradientConfig } from "./config";

export function encodeConfig(config: GradientConfig): string {
  return btoa(JSON.stringify(config)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeConfig(encoded: string): GradientConfig {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return parseConfig(JSON.parse(atob(padded)));
  } catch {
    return parseConfig(undefined);
  }
}
