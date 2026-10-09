export type { StellarNetwork } from "@zitian/stellar-sdk-helpers";
export type { SupportedStablecoin, ProtocolId } from "@zitian/shared";

export interface WalletState {
  publicKey: string | null;
  network: "testnet" | "mainnet";
  connected: boolean;
}
