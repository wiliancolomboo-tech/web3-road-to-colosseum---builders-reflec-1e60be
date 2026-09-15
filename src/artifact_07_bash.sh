# Set Solana CLI config to Devnet
solana config set --url https://api.devnet.solana.com

# Airdrop deployment SOL (or use faucet)
solana airdrop 2

# Deploy to Solana Devnet
anchor deploy --provider.cluster devnet

# Verify program deployment
solana program show RefL7vP6dZ3m14fWw5F8pGjUuYk2B4x9s8VnMqQk7X1