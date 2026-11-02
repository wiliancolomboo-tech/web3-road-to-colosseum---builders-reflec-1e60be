# 1. Clone repository & install dependencies
git clone https://github.com/solana-bounty/colosseum-echo.git
cd colosseum-echo
yarn install

# 2. Build Anchor Program
anchor build

# 3. Deploy to Solana Devnet
solana config set --url https://api.devnet.solana.com
anchor deploy --provider.cluster devnet

# 4. Configure environment variables
cp .env.example .env
# Edit .env with your RESEND_API_KEY, DISCORD_WEBHOOK_URL, and PROGRAM_ID