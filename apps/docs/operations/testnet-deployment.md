# Testnet Deployment

Zitian ships two deploy scripts, both in `scripts/`. Which one you need depends on what you're doing:

| Script                              | Use when                                                                                                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/deploy-testnet.sh`         | Standing up a brand new environment: vault, a `BlendAdapter`, and the mUSDC share token (a custom SEP-41 contract, [#578](https://github.com/drydocs/meridian/issues/578)), all initialized and wired together. |
| `scripts/redeploy-blend-adapter.sh` | Pushing new adapter code (e.g. a fix to `accrue()`, `get_pool()`, `get_protocol()`) onto an **already-live** vault, without redeploying the vault itself.                                                       |

Neither script requires manual `stellar contract invoke` steps. Read them before running if you want to understand exactly what they do; they're short and heavily commented.

## Prerequisites

- Stellar CLI: `cargo install stellar-cli` (the CLI binary is `stellar`, not `soroban`, since the older `soroban-cli` is deprecated)
- Rust with the `wasm32v1-none` target: `rustup target add wasm32v1-none`. Note `stellar contract build` targets `wasm32v1-none`, not `wasm32-unknown-unknown`. If you've followed older Soroban tutorials, this is the one place that trips people up.

## The `DEPLOYER` / `ADMIN` split

Both scripts require a `DEPLOYER` secret key, funded via [Friendbot](https://friendbot.stellar.org/). `DEPLOYER` only pays transaction fees and signs the setup calls. It does **not** need to be kept around afterward, and can be thrown away once the script finishes.

`deploy-testnet.sh` additionally accepts an optional `ADMIN` **public key**. This becomes the deployed vault's permanent admin, the only address that can ever call `transfer_admin`, `set_paused`, `set_adapter`, or `migrate_adapter` on it. `ADMIN` is deliberately independent of `DEPLOYER` as an identity, though not as a _signer_. The vault takes `admin`/`usdc`/`musdc`/`adapter` as **constructor arguments** ([#551](https://github.com/drydocs/meridian/issues/551), same fix [#505](https://github.com/drydocs/meridian/issues/505)/#550 already applied to the adapters/mUSDC), so its state is set inside its own deploying transaction with no separate `initialize()` step to front-run. Unlike the adapters/mUSDC's constructor arguments, `admin` is a human-held key, not a programmatically-derived contract address, so the constructor calls `admin.require_auth()` too, and Soroban only honors that inside a constructor for the transaction's own source account. So when `ADMIN` differs from `DEPLOYER`, pass the `ADMIN` signing key as `ADMIN_KEY` (a secret key, or a `stellar keys` alias) alongside it, and the script sources the vault's deploy transaction with `ADMIN_KEY` itself rather than `DEPLOYER`. `ADMIN_KEY` is validated up front: if it resolves to an address other than `ADMIN`, the script exits before building anything. If you don't set `ADMIN`, the script defaults it (and `ADMIN_KEY`) to `DEPLOYER`'s own address/key. That default is fine for a quick throwaway test, but you should always set `ADMIN` explicitly to a separate, durable key for anything you intend to keep testing against, and it **must** be set explicitly ahead of any mainnet deployment.

**Set `ADMIN_KEY` whenever the key is on the machine running the script.** Without it, the script cannot source the vault's deploy transaction itself, so it deploys `BlendAdapter` and mUSDC (both already wired to the vault's precomputed address) and then prints the vault's own deploy command, using that same precomputed address's salt, for the `ADMIN` key holder to run. Unlike the old two-step deploy-then-`initialize()` flow this replaced, there is no "deployed but claimable" window in that case: the vault simply does not exist on-chain at all until that command is run, by `ADMIN` specifically.

Save the `ADMIN` secret key somewhere durable (a password manager, not a plaintext file) the moment you deploy with it. There is no recovery path if it's lost. `transfer_admin`/`set_paused`/`set_adapter` become permanently inaccessible, and since adapters have no in-place upgrade path, that also means the vault can never be pointed at fixed adapter code again.

## Standing up a fresh environment

```bash
# Generate and fund a throwaway deployer key
stellar keys generate my-deployer --fund --network testnet
DEPLOYER_ADDR=$(stellar keys address my-deployer)

# Generate and fund a separate, durable admin key (keep this one). It must be
# funded too: it sources the vault's own deploy transaction, see below.
stellar keys generate my-admin --fund --network testnet
ADMIN_ADDR=$(stellar keys address my-admin)

# ADMIN_KEY lets the script source the vault's deploy transaction itself, so
# the vault is never left undeployed and waiting on a second manual step.
DEPLOYER=my-deployer ADMIN=$ADMIN_ADDR ADMIN_KEY=my-admin bash scripts/deploy-testnet.sh
```

This builds all four contract crates (`vault`, `blend-adapter`, `defindex-adapter`, `musdc-token`), uploads and deploys the vault, a `BlendAdapter`, and mUSDC, a custom SEP-41 token ([#578](https://github.com/drydocs/meridian/issues/578)) rather than a Stellar Asset Contract, and wires everything together:

1. Reserves the vault's contract address up front via `stellar contract id wasm --source-account $ADMIN_ADDR --salt`, without deploying anything yet. Soroban contract IDs are deterministic from (network, source account, salt) alone, independent of the wasm deployed, so this address is known before the vault itself exists. The source account used here must match whichever account actually sources the vault's own deploy in step 4, since the computed address depends on it.
2. Deploys the `BlendAdapter` with that reserved vault address, Blend's testnet pool, and USDC passed as **constructor arguments**, so the adapter is wired inside the transaction that creates it. There is no separate adapter `initialize()` step: that gap was front-runnable ([#505](https://github.com/drydocs/meridian/issues/505)). See "Adapter deployment and initialization" in [`architecture/vault-contract.md`](../architecture/vault-contract.md).
3. Deploys mUSDC with that same reserved vault address, decimals, name, and symbol passed as **constructor arguments** too, for the same reason: mUSDC's `admin` is set inside the transaction that creates it, so it's never observable on-ledger with the wrong admin.
4. Deploys the vault itself, sourced by `ADMIN_KEY` and using the same salt from step 1 so it lands at the address already reserved and handed to the two contracts above, with `admin`, `usdc`, `musdc`, and `adapter` passed as constructor arguments. Its own state is set inside this deploying transaction the same way, so there is no deploy-then-initialize gap here either ([#551](https://github.com/drydocs/meridian/issues/551)), and `admin.require_auth()` inside the constructor proves `ADMIN`'s key genuinely exists and its holder consents.

It prints the three contract IDs you need at the end:

```text
VAULT_CONTRACT_ID=...
BLEND_ADAPTER_CONTRACT_ID=...
MUSDC_CONTRACT_ID=...
```

USDC and the Blend pool address default to the existing testnet contracts (`USDC_ID`, `BLEND_POOL_ID` env vars override them if you need to point somewhere else).

## Updating the app to use the new deployment

The frontend and API discover the vault and mUSDC contract addresses from two places, and both need updating:

```typescript
// packages/stellar-sdk-helpers/src/known-pools.ts
KNOWN_POOLS.testnet["zitian-usdc"].contractId = "..."; // VAULT_CONTRACT_ID

// packages/shared/src/constants.ts
CONTRACT_ADDRESSES.testnet.vault = "..."; // VAULT_CONTRACT_ID
CONTRACT_ADDRESSES.testnet.musdc = "..."; // MUSDC_CONTRACT_ID
```

The adapter contract address is **not** hardcoded anywhere in the app. The frontend discovers the active adapter live via `vault.get_adapter()`, and that adapter's `get_pool()`/`get_protocol()`, rather than tracking it in config. This is deliberate: it means the app self-updates if the adapter is ever swapped via `set_adapter` or `migrate_adapter`, with nothing that could drift out of sync.

## Verifying the deployment

```bash
stellar contract invoke --network testnet --source my-deployer \
  --id $VAULT_CONTRACT_ID -- get_total_assets
```

`0` confirms the contract is initialized and responding (a fresh vault has no deposits yet). You can also confirm the full adapter chain resolves correctly:

```bash
stellar contract invoke --network testnet --source my-deployer \
  --id $VAULT_CONTRACT_ID -- get_adapter
# -> BLEND_ADAPTER_CONTRACT_ID

stellar contract invoke --network testnet --source my-deployer \
  --id $BLEND_ADAPTER_CONTRACT_ID -- get_pool
# -> the Blend pool address

stellar contract invoke --network testnet --source my-deployer \
  --id $BLEND_ADAPTER_CONTRACT_ID -- get_protocol
# -> "blend"
```

This is exactly the call chain the frontend uses to discover live APY (`vault.get_adapter()` → `adapter.get_pool()`/`get_protocol()`). If any of these calls fail with `HostError: Error(WasmVm, MissingValue)`, the deployed contract predates the functions you're calling, which means you're pointed at a stale vault rather than this one.

## Pushing new adapter code to a live vault

Adapter contracts have no in-place upgrade path. To get new adapter code (a bug fix, a new feature) onto an already-live vault, deploy a fresh adapter and swap the vault onto it:

```bash
# VAULT_ID is required: the vault address is a constructor argument, baked into
# the adapter permanently by the deploying transaction.
VAULT_ID=$VAULT_CONTRACT_ID DEPLOYER=my-deployer bash scripts/redeploy-blend-adapter.sh
```

This builds and deploys a new `BlendAdapter`, wired to the same vault/pool/USDC through its constructor arguments, and then **prints, but does not run**, the final swap command. Which command it prints depends on whether the vault already has depositors, so check that first:

```bash
stellar contract invoke --network testnet --source my-deployer \
  --id $VAULT_CONTRACT_ID -- get_total_shares
```

### Vault with depositors (`get_total_shares > 0`): use `migrate_adapter`

```bash
stellar contract invoke --network testnet --source $DEPLOYER \
  --id $VAULT_ID -- migrate_adapter --new-adapter $NEW_ADAPTER_ID --max-slippage-bps 100
```

`migrate_adapter` moves the vault's entire position from the old adapter to the new one atomically, comparing the value that lands on the new adapter against the old adapter's value before extraction and reverting if the difference exceeds `--max-slippage-bps` (basis points, max `500` as of [#557](https://github.com/drydocs/meridian/issues/557); previously `10000`). Per-depositor bookkeeping is denominated in vault shares, not adapter shares, so it is left untouched, meaning **no depositor has to withdraw first**. It fails with `SameAdapter` if the new adapter is the one already installed, and with `NoAdapterPosition` if the vault holds no adapter position at all (which is the zero-depositor case below).

### Fresh vault, no depositors yet (`get_total_shares == 0`): use `set_adapter`

```bash
stellar contract invoke --network testnet --source $DEPLOYER \
  --id $VAULT_ID -- set_adapter --new-adapter $NEW_ADAPTER_ID
```

`set_adapter` is simpler but it only resets the vault's adapter-share accounting (`ADPT_SH`) to zero and moves no funds. On a vault that _does_ hold a position, anything deposited through the current adapter becomes unreachable through the vault's normal withdraw flow the moment you swap. That is why `migrate_adapter` exists and is the correct choice there.

Both commands are deliberately left for you to run by hand, and both require `admin.require_auth()`, so the `--source` key must be the vault's actual admin. The script prints them with `--source $DEPLOYER`, so if your deployer key is not the vault admin, substitute the admin key before running.

## Getting testnet USDC

Blend's testnet pool uses USDC issued by Blend's own controlled test key, not Circle's testnet USDC. The two are different Stellar assets that happen to share an asset code. Fund a testnet wallet from [Blend's public faucet](https://testnet.blend.capital) or via its API endpoint (`fundFromBlendFaucet()` in `apps/web/src/hooks/useBlendFaucet.ts` calls this automatically when a depositing wallet has no USDC balance). In practice the default faucet call reliably grants BLND/wETH/wBTC but has not reliably granted USDC in testing. If a deposit fails with a missing-trustline or insufficient-balance error, you may need to fund the wallet directly through Blend's own faucet UI.

## Run the signing flow end-to-end

With the contracts deployed and `known-pools.ts`/`constants.ts` updated:

1. Open the app, connect your wallet (testnet mode).
2. Enter a USDC amount and click **Deposit**.
3. Your wallet displays the transaction details; verify the contract address matches `VAULT_CONTRACT_ID`.
4. Approve the transaction.
5. After ~5 seconds, the position summary updates with your deposited amount.
