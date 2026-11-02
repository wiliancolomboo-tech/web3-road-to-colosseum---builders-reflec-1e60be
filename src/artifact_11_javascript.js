const id = "colosseum-radar-2024";
const [hackathonPda] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("hackathon"), Buffer.from(id)],
  pg.program.programId
);

await pg.program.methods
  .initializeHackathon(id, "https://arweave.net/colosseum_radar_manifest")
  .accounts({
    hackathon: hackathonPda,
    authority: pg.wallet.publicKey,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();

console.log("Initialized Hackathon PDA:", hackathonPda.toBase58());