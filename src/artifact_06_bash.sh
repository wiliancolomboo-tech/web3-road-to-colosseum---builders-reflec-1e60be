# 1. Clone repository and navigate to root
git clone https://github.com/solana-colosseum/colosseum-reflect.git
cd colosseum-reflect

# 2. Install TypeScript dependencies
yarn install

# 3. Build the Anchor program to generate IDL and program keypair
anchor build

# 4. Sync Program ID (if different from declared ID)
anchor keys sync

# 5. Run the full integration test suite on local validator
anchor test