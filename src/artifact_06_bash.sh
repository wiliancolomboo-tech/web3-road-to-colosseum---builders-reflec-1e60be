# 1. Clone repository & install dependencies
git clone https://github.com/colosseum-chronicle/protocol.git
cd protocol
yarn install

# 2. Build Anchor Smart Program
anchor build

# 3. Synchronize Program ID (if redeploying)
anchor keys sync

# 4. Run full comprehensive test suite locally
anchor test

# 5. Deploy to Solana Devnet
solana config set --url https://api.devnet.solana.com
solana airdrop 2
anchor deploy --provider.cluster devnet