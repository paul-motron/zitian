# @zitian/sdk

TypeScript SDK for building on Zitian: vault deposits and withdrawals, keeper transaction submission with retry and fee escalation, and the Blend adapter client. It runs on top of `@stellar/stellar-sdk`.

The package is at `0.1.0` and only exports `SDK_VERSION` for now. The keeper, adapter and vault modules are tracked in #803 to #807.

## Install

```bash
pnpm add @zitian/sdk @stellar/stellar-sdk
```

`@stellar/stellar-sdk` is a peer dependency, so your app and the SDK share one copy.

Inside this monorepo, depend on it through the workspace:

```json
{
  "dependencies": {
    "@zitian/sdk": "workspace:*"
  }
}
```

## Usage

The package ships both ESM and CommonJS builds with type declarations:

```ts
import { SDK_VERSION } from "@zitian/sdk";
```

```js
const { SDK_VERSION } = require("@zitian/sdk");
```

## Development

```bash
pnpm --filter @zitian/sdk build      # dist/ with .js, .cjs, .d.ts and .d.cts
pnpm --filter @zitian/sdk test
pnpm --filter @zitian/sdk typecheck
```

## Versioning

The SDK follows [Semantic Versioning](https://semver.org/). While the version is `0.x`, a minor bump may include breaking API changes; patch bumps never do. `SDK_VERSION` always matches the `version` field in `package.json`, and a test enforces this.

## License

MIT, see [LICENSE](./LICENSE).
