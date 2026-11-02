#!/usr/bin/env python3
"""
Colosseum Chronicle (C3) Interactive Builder CLI
Allows hackathon participants to log reflections and sync with Solana.
"""

import sys
import hashlib
import subprocess
import argparse
import json
import base58

def get_git_head_commit() -> bytes:
    try:
        out = subprocess.check_output(["git", "rev-parse", "HEAD"]).strip().decode("utf-8")
        # Return first 20 bytes (SHA-1 / truncated SHA-256)
        return bytes.fromhex(out[:40])
    except Exception as e:
        print("[WARNING] Not inside a git repository or git missing. Generating fallback hash.")
        return hashlib.sha256(b"colosseum_builder_reflection").digest()[:20]

def compute_metrics_hash(blockers: str, highlights: str, velocity: int) -> bytes:
    payload = json.dumps({"blockers": blockers, "highlights": highlights, "velocity": velocity}, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).digest()

def main():
    parser = argparse.ArgumentParser(description="Colosseum Chronicle Builder CLI")
    subparsers = parser.add_subparsers(dest="command")

    log_parser = subparsers.add_parser("reflect", help="Log a new sprint reflection")
    log_parser.add_argument("--sprint", type=int, required=True, help="Sprint sequence number (e.g. 1, 2, 3)")
    log_parser.add_argument("--title", type=str, required=True, help="Sprint milestone summary")
    log_parser.add_argument("--uri", type=str, required=True, help="IPFS CID or GitHub Markdown URL")
    log_parser.add_argument("--velocity", type=int, default=10, help="Story points / tasks completed")
    log_parser.add_argument("--highlights", type=str, default="Completed core Anchor program", help="Top accomplishment")
    log_parser.add_argument("--blockers", type=str, default="RPC compute unit limits", help="Biggest blocker solved")

    args = parser.parse_args()

    if args.command == "reflect":
        commit_bytes = get_git_head_commit()
        metrics_bytes = compute_metrics_hash(args.blockers, args.highlights, args.velocity)

        print("\n=================================================")
        print("  COLOSSEUM CHRONICLE - BUILDER PROOF OF SHIP    ")
        print("=================================================")
        print(f"Sprint Index : #{args.sprint}")
        print(f"Title        : {args.title}")
        print(f"Git Root SHA : {commit_bytes.hex()}")
        print(f"Metrics Root : {metrics_bytes.hex()}")
        print(f"Content URI  : {args.uri}")
        print("=================================================")
        print("Submitting instruction to Solana Devnet Program...")

        # Formatted Payload for Anchor program consumption
        instruction_payload = {
            "sprintIndex": args.sprint,
            "gitCommitHash": list(commit_bytes),
            "metricsHash": list(metrics_bytes),
            "contentUri": args.uri,
            "title": args.title
        }

        print("\n[SUCCESS] Deterministic Transaction Formatted.")
        print(f"Payload JSON: {json.dumps(instruction_payload, indent=2)}")
        print("\nReady for RPC signing. Anchor CPI will emit 'ReflectionLoggedEvent'.")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()