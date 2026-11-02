npm run build
node dist/index.js init-builder -h "solana_samurai" -p "ChronoReflect" -r "https://github.com/solana-labs/solana"
node dist/index.js share-reflection -i 0 -t "DEVNET_ALPHA" -m "Zero Copy Optimization" -s "Implemented accounts realloc and fixed CPI rent refund issues"