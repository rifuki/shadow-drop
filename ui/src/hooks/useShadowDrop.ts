import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMemo } from "react";
import idl from "../idl.json";

// Program ID from environment variable or hardcoded fallback
const PROGRAM_ID_STRING = import.meta.env.VITE_PROGRAM_ID || "7wjDqUQUpnudD25MELXBiayNiMrStXaKAdrLMwzccu7v";
export const PROGRAM_ID = new PublicKey(PROGRAM_ID_STRING);

export function useShadowDrop() {
    const { connection } = useConnection();
    const wallet = useWallet();

    const program = useMemo(() => {
        if (!wallet.publicKey) return null;

        const provider = new AnchorProvider(
            connection,
            wallet as any,
            { commitment: "confirmed" }
        );

        return new Program(idl as any, provider);
    }, [connection, wallet]);

    return {
        program,
        programId: PROGRAM_ID,
        connected: wallet.connected,
        publicKey: wallet.publicKey,
        connection
    };
}

// Helper to convert bytes to Pubkey (for merkle root)
export function bytesToPubkey(bytes: Uint8Array): PublicKey {
    return new PublicKey(bytes);
}

// Helper to create merkle root from hex string
export function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}
