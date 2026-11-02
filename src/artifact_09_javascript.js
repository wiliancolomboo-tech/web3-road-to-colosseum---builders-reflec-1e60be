const program = anchor.workspace.ColosseumRetrospect;
const [profilePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("builder_profile"), provider.wallet.publicKey.toBuffer()],
  program.programId
);

await program.methods
  .initializeBuilder("ColosseumAlphaDev", "Infrastructure")
  .accounts({
    builderProfile: profilePda,
    authority: provider.wallet.publicKey,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();

console.log("Builder Profile Registered at:", profilePda.toBase58());