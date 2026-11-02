# 1. Clone repository & change directory
git clone https://github.com/your-username/colosseum-reflect.git
cd colosseum-reflect

# 2. Install NPM dependencies
yarn install

# 3. Build Anchor program and generate IDL types
anchor build

# 4. Synchronize Program ID
# Copy the program ID from target/deploy/colosseum_reflect-keypair.json and update:
# - programs/colosseum-reflect/src/lib.rs (declare_id!)
# - Anchor.toml [programs.localnet]
anchor keys sync

# 5. Run local test validator & execute test suite
anchor test