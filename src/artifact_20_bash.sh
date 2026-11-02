# Set Solana cluster configuration
solana config set --url https://api.devnet.solana.com

# Generate or verify deployer keypair
solana-keygen new --outfile deployer-keypair.json --no-bip39-passphrase --force
solana airdrop 2 deployer-keypair.json

# Build the binary
anchor build

# Get Program ID and sync keys
solana address -k target/deploy/colosseum_reflect_engine-keypair.json
anchor keys sync

# Recompile with verified program ID and deploy
anchor build
anchor deploy --provider.cluster devnet --provider.wallet deployer-keypair.json