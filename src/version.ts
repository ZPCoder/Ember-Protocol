import type { ProtocolVersion } from "./generated/contracts.js";

export const CURRENT_PROTOCOL_VERSION = "1.0" satisfies ProtocolVersion;

export interface ProtocolCompatibility {
  readonly compatible: boolean;
  readonly updateRequired: boolean;
  readonly reason?: "invalid-version" | "unsupported-major" | "unsupported-minor";
}

function parse(value: string): readonly [number, number] | null {
  const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.exec(value);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/** Accepts the server's current and immediately previous minor version. */
export function checkProtocolVersion(
  requested: string,
  current: ProtocolVersion = CURRENT_PROTOCOL_VERSION,
): ProtocolCompatibility {
  const requestedParts = parse(requested);
  const currentParts = parse(current);
  if (!requestedParts || !currentParts) return { compatible: false, updateRequired: true, reason: "invalid-version" };
  if (requestedParts[0] !== currentParts[0]) return { compatible: false, updateRequired: true, reason: "unsupported-major" };
  const minimumMinor = Math.max(0, currentParts[1] - 1);
  if (requestedParts[1] < minimumMinor || requestedParts[1] > currentParts[1]) {
    return { compatible: false, updateRequired: true, reason: "unsupported-minor" };
  }
  return { compatible: true, updateRequired: false };
}
