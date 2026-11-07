# OAA Protocol – Website

Official website of OAA Protocol ($OAA) on Base: orchestrated autonomous SI (super intelligence) agents.

- Website: https://oaap.si (also https://oaaprotocol.netlify.app)
- Token: `0x70107c4AA2DC031eF7afc350e03784c2325aBE29` ([BaseScan](https://basescan.org/token/0x70107c4AA2DC031eF7afc350e03784c2325aBE29))
- Treasury (Safe multisig): `0xC394d05d8Da6d1414F1A1b0e8d31fec77FAeB834`
- X: https://x.com/oaaprotocol
- Telegram: https://t.me/oaaprotocol

## Agent Exchange

SI agents you can hire per job on the website (Agentverse):

| Agent | What it does | Price |
|---|---|---|
| Sentinel | Token risk grade A–F (honeypot simulation, taxes, owner and mint rights, holders, liquidity) | $0.10 |
| Guardian | Wallet safety report on Base (token grades, spam airdrops, risky approvals) | $0.50 |
| Radar | Newest Uniswap V2 and Aerodrome pools on Base, each graded | $0.25 |
| Whale | Largest holders of a token and their 24 h moves, plus the biggest transfers | $0.30 |
| Decoder | Plain-language explanation of a verified smart contract | $0.50 |
| Tally | Supply split, locks and vesting, unlocked-supply estimate | $0.40 |
| Pulse | 24 h volume, unique buyers and sellers, trend and wash-trading check | $0.20 |
| Scribe | One-page brief combining Sentinel, Tally and Pulse | $0.35 |

- Free daily runs are available.
- Missions combine several agents and run them together.
- Paid runs go directly to the OAA Treasury Safe on Base, paid either in USDC via the x402 standard (no network fee) or in ETH on Base (one transaction, which can cover a whole mission).
- If the agent returns no result, nothing is charged.
- Every result includes an answer hash.
- Results are automatic checks of public on-chain data. They are not an audit and not financial advice.

## Launchpad and Portal

- `/launch/` – launch a token on Base: 1,000,000,000 supply, 100% of the liquidity locked forever in the launchpad contract as three Uniswap V3 positions (1% fee tier) (50% / 30% / 20%, from a $30k up to a $1B market cap, 1% fee tier). Every token's on-chain name carries the tag "by OAA" (e.g. "Velvet Cat by OAA"), so wallets, BaseScan, DexScreener and the Portal show where it was launched. Optional first buy in the same transaction, max $500 in ETH (Chainlink price).
- Every trade pays 1%. Buys (fee in WETH): 0.4% to the creator, 0.3% to the OAA Treasury Safe, 0.3% buys $OAA on Uniswap V4 and sends it to the burn address. Sells (fee in the token): 0.4% to the creator, 0.6% to the Treasury Safe. The buyback has a price guard (max ~3% above a slow reference price), otherwise the ETH waits in the contract and is spent later. Anyone can pay out the collected fees (`collectFees`, button "Collect fees" in the Portal).
- `/portal/` – all tokens launched on OAA with price, volume, market cap and a Sentinel risk grade, by category. Buy button swaps ETH on Uniswap with the visitor's own wallet. Paid placements (boosts, banners) are paid in ETH to the Treasury Safe and are always marked.
- Data: the launchpad contract on Base (read through the Sia worker at `sia.oaaprotocol.workers.dev/lp/*`) and DexScreener for volume.
- Contract sources: `contracts/OAALaunchpad.sol`, `contracts/OAAToken.sol` (solc 0.7.6, optimizer 200 runs), verified on Sourcify after deployment.
- `/deploy-launchpad/` – internal page (noindex) used once to deploy the contract with a wallet.

## Deployment

Static site, no build step. Netlify deploys this repository automatically (`netlify.toml`, publish directory `.`). The Content-Security-Policy in `netlify.toml` also allows `api.dexscreener.com`, `sourcify.dev` (connect) and `dexscreener.com` (chart frame) for the Portal.
