import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@zitian/stellar-sdk-helpers", () => ({
  resolvePositions: vi.fn(async () => [
    {
      vaultId: "blend-usdc-fixed",
      shares: 1,
      deposited: 1,
      earned: 0,
      entryTime: 0,
    },
  ]),
}));

import { handleGetPositions } from "./positions";
import { resolvePositions } from "@zitian/stellar-sdk-helpers";

const PUBKEY = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

beforeEach(() => vi.clearAllMocks());

describe("handleGetPositions", () => {
  it("rejects a malformed public key with 400", async () => {
    const result = await handleGetPositions("too-short");
    expect(result.status).toBe(400);
    expect(resolvePositions).not.toHaveBeenCalled();
  });

  it("rejects a missing public key with 400", async () => {
    const result = await handleGetPositions(undefined);
    expect(result.status).toBe(400);
  });

  it("returns the resolved positions for a valid key", async () => {
    const result = await handleGetPositions(PUBKEY);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      positions: [
        {
          vaultId: "blend-usdc-fixed",
          shares: 1,
          deposited: 1,
          earned: 0,
          entryTime: 0,
        },
      ],
    });
    expect(resolvePositions).toHaveBeenCalledOnce();
  });

  it("returns 503 when the position read throws", async () => {
    const err = new Error("rpc down");
    vi.mocked(resolvePositions).mockRejectedValueOnce(err);
    const result = await handleGetPositions(PUBKEY);
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: "Failed to read positions" });
    expect(result.error).toBe(err);
  });
});
