# 1. Clone repository & install dependencies
git clone https://github.com/colomirror/colomirror-protocol.git
cd colomirror-protocol
npm install

# 2. Build Anchor smart contract
anchor build

# 3. Deploy to Solana Devnet / Mainnet
solana config set --url https://api.devnet.solana.com
solana airdrop 2
anchor deploy --provider.cluster devnet

# 4. Initialize Protocol
npm run cli -- init -k ~/.config/solana/id.json -r https://api.devnet.solana.com

# 5. Launch Background Syndication Worker
npm run worker