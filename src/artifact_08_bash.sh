# 1. Build Solana Program
anchor build

# 2. Synchronize Program ID
solana address -k target/deploy/colosseum_log-keypair.json
# Replace declare_id!("...") in programs/colosseum-log/src/lib.rs

# 3. Deploy to Solana Devnet
solana program deploy \
  --provider.cluster devnet \
  target/deploy/colosseum_log.so

# 4. Run Full Anchor Test Matrix
anchor test

# 5. Launch Off-Chain Production Indexer
docker compose up -d --build
docker compose logs -f