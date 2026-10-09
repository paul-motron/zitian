import { describe, it, expect } from "vitest";
import { selectBestVault } from "./routing";
import type { ApiVault } from "./vaults";

function vault(
  p: Partial<Omit<ApiVault, "protocol">> & { protocol?: string }
): ApiVault {
  return {
    id: p.id ?? "v",
    protocol: (p.protocol ?? "zitian") as ApiVault["protocol"],
    asset: "USDC",
    name: "n",
    label: "l",
    apy: p.apy ?? 5,
    tvl: 1_000_000,
    userBalance: 0,
    riskLevel: p.riskLevel ?? "safe",
  };
}

describe("selectBestVault", () => {
  const opts = { defindexConfigured: true };

  it("picks the highest-APY routable vault", () => {
    const best = selectBestVault(
      [
        vault({ id: "a", protocol: "zitian", apy: 4 }),
        vault({ id: "b", protocol: "zitian", apy: 7 }),
        vault({ id: "c", protocol: "zitian", apy: 6 }),
      ],
      opts
    );
    expect(best?.id).toBe("b");
  });

  it("excludes non-depositable protocols (Blend, DeFindex, Ondo) even when they have the best APY", () => {
    const best = selectBestVault(
      [
        vault({ id: "ondo", protocol: "ondo", apy: 12 }),
        vault({ id: "blend", protocol: "blend", apy: 10 }),
        vault({ id: "dfx", protocol: "defindex", apy: 9 }),
        vault({ id: "zitian-usdc", protocol: "zitian", apy: 5 }),
      ],
      opts
    );
    expect(best?.id).toBe("zitian-usdc");
  });

  it("excludes third-party pools when no Zitian vault is present", () => {
    const best = selectBestVault(
      [
        vault({ id: "dfx", protocol: "defindex", apy: 9 }),
        vault({ id: "blend", protocol: "blend", apy: 5 }),
      ],
      opts
    );
    expect(best).toBeNull();
  });

  it("prefers a non-risky pool over a higher-APY risky one", () => {
    const best = selectBestVault(
      [
        vault({
          id: "risky",
          protocol: "zitian",
          apy: 15,
          riskLevel: "risky",
        }),
        vault({ id: "safe", protocol: "zitian", apy: 6, riskLevel: "safe" }),
      ],
      opts
    );
    expect(best?.id).toBe("safe");
  });

  it("falls back to the best risky pool when nothing safer is routable", () => {
    const best = selectBestVault(
      [
        vault({ id: "r1", protocol: "zitian", apy: 11, riskLevel: "risky" }),
        vault({ id: "r2", protocol: "zitian", apy: 14, riskLevel: "risky" }),
      ],
      opts
    );
    expect(best?.id).toBe("r2");
  });

  it("routes to the Zitian coordinator vault", () => {
    const best = selectBestVault(
      [vault({ id: "zitian-usdc", protocol: "zitian", apy: 8 })],
      opts
    );
    expect(best?.id).toBe("zitian-usdc");
  });

  it("returns null when nothing is routable", () => {
    expect(selectBestVault([vault({ protocol: "ondo" })], opts)).toBeNull();
    expect(selectBestVault([vault({ protocol: "blend" })], opts)).toBeNull();
    expect(selectBestVault([vault({ protocol: "defindex" })], opts)).toBeNull();
    expect(selectBestVault([], opts)).toBeNull();
  });

  it("breaks APY ties deterministically by vault id regardless of input order", () => {
    const a = vault({ id: "zitian-eurc", protocol: "zitian", apy: 5 });
    const b = vault({ id: "zitian-usdc", protocol: "zitian", apy: 5 });
    expect(selectBestVault([a, b], opts)?.id).toBe("zitian-eurc");
    expect(selectBestVault([b, a], opts)?.id).toBe("zitian-eurc");
  });
});
