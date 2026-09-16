// Portfolio excerpt from Shalev CRM (src/lib/ai/approval-token.ts). Shown for reading only; not runnable on its own.
// Imports point at modules not included in this repository.

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/config/env";
import type { ProposedAction } from "@/lib/ai/engine";

/**
 * Stateless, signed approval-plan token (docs/DECISIONS.md ADR-023). The
 * proposed action list travels to the client and back unpersisted; this
 * token is tamper-evidence that what comes back on approval is exactly what
 * was proposed, not a substitute for re-validating each action against its
 * own Zod schema and the approval policy at execution time — see
 * src/lib/ai/execute.ts, which does both regardless of a valid signature.
 */

const TOKEN_TTL_MS = 5 * 60 * 1000;

type TokenPayload = {
  actions: ProposedAction[];
  expiresAt: number;
};

function getSecret(): string {
  const secret = getServerEnv().AI_APPROVAL_TOKEN_SECRET;
  if (!secret) {
    throw new Error(
      "AI_APPROVAL_TOKEN_SECRET is not set. See .env.example — required before any mutating AI action can be proposed.",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function signApprovalPlan(actions: ProposedAction[]): string {
  const payload: TokenPayload = { actions, expiresAt: Date.now() + TOKEN_TTL_MS };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson, "utf8").toString("base64url");
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

export type VerifyFailureReason = "malformed" | "signature_mismatch" | "expired";

export type VerifyResult =
  | { valid: true; actions: ProposedAction[] }
  | { valid: false; reason: VerifyFailureReason };

export function verifyApprovalToken(token: string): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed" };
  const [payloadB64, signature] = parts;

  const expectedSignature = sign(payloadB64);
  const signatureBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (
    signatureBuf.length !== expectedBuf.length ||
    !timingSafeEqual(signatureBuf, expectedBuf)
  ) {
    return { valid: false, reason: "signature_mismatch" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (typeof payload.expiresAt !== "number" || !Array.isArray(payload.actions)) {
    return { valid: false, reason: "malformed" };
  }
  if (Date.now() > payload.expiresAt) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, actions: payload.actions };
}
