# 1. Clone repository and install dependencies
git clone https://github.com/solana-bounty/colosseum-chronicle.git
cd colosseum-chronicle
npm install

# 2. Build Anchor Smart Contracts
anchor build

# 3. Launch Localnet Solana Validator & run end-to-end tests
anchor test

# 4. Deploy to Solana Devnet
solana config set --url https://api.devnet.solana.com
anchor deploy --provider.cluster devnet