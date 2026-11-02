# 1. Clone repository & configure workspace
git clone https://github.com/solana-builders/colosseum-chronicle.git
cd colosseum-chronicle

# 2. Build Anchor Smart Contract
anchor build

# 3. Synchronize Devnet Program ID
solana address -k target/deploy/colosseum_reflect-keypair.json
# (Replace declare_id! with generated keypair in programs/colosseum_reflect/src/lib.rs)
anchor build

# 4. Deploy to Solana Devnet
solana config set --url https://api.devnet.solana.com
solana airdrop 3 ~/.config/solana/id.json
anchor deploy --provider.cluster devnet

# 5. Initialize Program IDL on-chain
anchor idl init --filepath target/idl/colosseum_reflect.json RefLecT111111111111111111111111111111111111

# 6. Run Comprehensive Test Suite
yarn install
anchor test