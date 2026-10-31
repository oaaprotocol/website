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

## Deployment

Static site, no build step. Netlify deploys this repository automatically (`netlify.toml`, publish directory `.`).
