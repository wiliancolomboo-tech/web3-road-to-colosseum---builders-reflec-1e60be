# 1. Clone repository
git clone https://github.com/colosseum-org/chronicle-protocol.git
cd chronicle-protocol

# 2. Build Anchor Program
anchor build

# 3. Synchronize program address
solana address -k target/deploy/chronicle-keypair.json
# (Verify declare_id matches inside programs/chronicle/src/lib.rs)

# 4. Deploy to Solana Devnet / Mainnet
solana config set --url https://api.devnet.solana.com
anchor deploy --provider.cluster devnet

# 5. Initialize Protocol Global Config
npx ts-node client/src/cli.ts init-config -k ~/.config/solana/id.json