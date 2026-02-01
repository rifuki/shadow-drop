/**
 * Light Protocol helpers for compressed claims
 * Uses same pattern as test.ts for proper CPI account setup
 * Now supports real validity proof fetching from Light RPC
 */

import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import type { AccountMeta } from "@solana/web3.js";
import {
    defaultTestStateTreeAccounts,
    defaultStaticAccountsStruct,
    LightSystemProgram,
    createRpc,
    bn,
    deriveAddress,
    deriveAddressSeed,
} from "@lightprotocol/stateless.js";


// Program ID for Shadow Drop
const PROGRAM_ID = new PublicKey("7wjDqUQUpnudD25MELXBiayNiMrStXaKAdrLMwzccu7v");

/**
 * System Account Pubkeys for Light Protocol
 */
class SystemAccountPubkeys {
    static default() {
        const staticAccounts = defaultStaticAccountsStruct();
        return {
            lightSystemProgram: LightSystemProgram.programId,
            systemProgram: PublicKey.default,
            accountCompressionProgram: staticAccounts.accountCompressionProgram,
            accountCompressionAuthority: staticAccounts.accountCompressionAuthority,
            registeredProgramPda: staticAccounts.registeredProgramPda,
            noopProgram: staticAccounts.noopProgram,
        };
    }
}

/**
 * Get Light System Account Metas with proper CPI signer
 * This is the key to fixing "unauthorized signer" errors!
 */
function getLightSystemAccountMetas(selfProgram: PublicKey): AccountMeta[] {
    // Derive CPI signer PDA from "cpi_authority" seed
    const signerSeed = new TextEncoder().encode("cpi_authority");
    const [cpiSigner] = PublicKey.findProgramAddressSync(
        [signerSeed],
        selfProgram
    );

    const defaults = SystemAccountPubkeys.default();

    const metas: AccountMeta[] = [
        { pubkey: defaults.lightSystemProgram, isSigner: false, isWritable: false },
        { pubkey: cpiSigner, isSigner: false, isWritable: false },
        { pubkey: defaults.registeredProgramPda, isSigner: false, isWritable: false },
        { pubkey: defaults.noopProgram, isSigner: false, isWritable: false },
        { pubkey: defaults.accountCompressionAuthority, isSigner: false, isWritable: false },
        { pubkey: defaults.accountCompressionProgram, isSigner: false, isWritable: false },
        { pubkey: selfProgram, isSigner: false, isWritable: false },
        { pubkey: defaults.systemProgram, isSigner: false, isWritable: false },
    ];

    return metas;
}

/**
 * PackedAccounts class - matches the pattern from test.ts
 * Properly orders system accounts before tree accounts
 */
export class PackedAccounts {
    private systemAccounts: AccountMeta[] = [];
    private packedAccounts: AccountMeta[] = [];
    private accountMap: Map<string, number> = new Map();
    private nextIndex: number = 0;

    constructor(programId: PublicKey) {
        // Add system accounts first
        this.systemAccounts = getLightSystemAccountMetas(programId);
    }

    /**
     * Insert or get index of a pubkey in packed accounts
     * Returns the index relative to the START of packed accounts (after system accounts)
     */
    insertOrGet(pubkey: PublicKey): number {
        const key = pubkey.toBase58();
        const existing = this.accountMap.get(key);
        if (existing !== undefined) {
            return existing;
        }

        const index = this.nextIndex++;
        this.accountMap.set(key, index);
        this.packedAccounts.push({
            pubkey,
            isSigner: false,
            isWritable: true,
        });

        return index;
    }

    /**
     * Get all remaining accounts in correct order
     */
    toAccountMetas(): { remainingAccounts: AccountMeta[]; packedStart: number } {
        return {
            remainingAccounts: [...this.systemAccounts, ...this.packedAccounts],
            packedStart: this.systemAccounts.length,
        };
    }
}

/**
 * Get default test tree accounts from Light Protocol
 */
export function getTestTreeAccounts() {
    return defaultTestStateTreeAccounts();
}

/**
 * Create PackedAccounts with proper Light Protocol setup
 * Uses program ID to derive CPI signer
 */
export function createPackedAccountsForClaim(): {
    packedAccounts: PackedAccounts;
    treeIndices: {
        outputStateTreeIndex: number;
        addressTreeAccountIndex: number;
        addressQueueAccountIndex: number;
    };
} {
    const packedAccounts = new PackedAccounts(PROGRAM_ID);
    const trees = defaultTestStateTreeAccounts();

    // Add tree accounts and get their indices
    const outputStateTreeIndex = packedAccounts.insertOrGet(trees.merkleTree);
    const addressTreeAccountIndex = packedAccounts.insertOrGet(trees.addressTree);
    const addressQueueAccountIndex = packedAccounts.insertOrGet(trees.addressQueue);

    return {
        packedAccounts,
        treeIndices: {
            outputStateTreeIndex,
            addressTreeAccountIndex,
            addressQueueAccountIndex,
        },
    };
}

/**
 * Convert nullifier hash hex string to bytes
 */
export function nullifierFromHex(hex: string): Uint8Array {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/**
 * Get compute budget instruction for Light Protocol (needs ~1M CU)
 */
export function getComputeBudgetInstruction() {
    return ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 });
}

/**
 * Default empty validity proof for new address creation
 */
export function getEmptyValidityProof() {
    return {
        compressedProof: {
            a: new Array(32).fill(0),
            b: new Array(64).fill(0),
            c: new Array(32).fill(0),
        },
        roots: [],
        rootIndices: [],
        leafIndices: [],
        leaves: [],
        merkleTrees: [],
        nullifierQueues: [],
        addressTrees: [],
    };
}

/**
 * Get VALIDITY PROOF from Light RPC for new address creation
 * This is crucial for avoiding 0x1799 error!
 */
export async function getValidityProofForNewAddress(
    nullifier: Uint8Array,
    programId: PublicKey
) {
    // Light RPC endpoint (localhost)
    const RPC_URL = "http://localhost:8784";
    const rpc = createRpc(RPC_URL, RPC_URL, RPC_URL);
    const trees = defaultTestStateTreeAccounts();

    console.log("Deriving compressed address for nullifier...");

    // Derive address seed using the same logic as the contract
    // Contract: derive_address(&[b"nullifier", &nullifier], &address_tree, &program_id)
    const seedPrefix = new TextEncoder().encode("nullifier");

    // In JS SDK we use deriveAddressSeed helper which handles the hashing
    // Note: deriveAddressSeed expects array of buffers as seeds
    const addressSeed = deriveAddressSeed(
        [seedPrefix, nullifier],
        programId
    );

    // Derive the final compressed address
    const addressTree = new PublicKey(trees.addressTree);
    const address = deriveAddress(addressSeed, addressTree);

    console.log("Derived compressed address:", address.toBase58());

    console.log("Fetching validity proof from Light RPC...");
    // Call getValidityProofV0 to get the proof that this address is new (or existing)
    const proofRpcResult = await rpc.getValidityProofV0(
        [], // no input compressed accounts
        [
            {
                tree: addressTree,
                queue: new PublicKey(trees.addressQueue),
                address: bn(address.toBytes()),
            },
        ]
    );

    return {
        proof: proofRpcResult,
        addressSeed: addressSeed
    };
}
