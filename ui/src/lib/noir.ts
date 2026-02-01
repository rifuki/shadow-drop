/**
 * NoirJS Integration for Shadow Drop
 *
 * Provides browser-based ZK proof generation using Noir circuits
 * and Barretenberg proving backend.
 */

// Note: These imports will work after running `npm install`
// import { Noir } from "@noir-lang/noir_js";
// import { UltraHonkBackend } from "@aztec/bb.js";

/**
 * ZK Proof inputs for the Shadow Drop circuit
 */
export interface ZkClaimInputs {
  // Public inputs
  merkleRoot: string; // 32 bytes hex
  nullifierHash: string; // 32 bytes hex
  recipient: string; // Wallet pubkey as field

  // Private inputs
  amount: string; // Claim amount in lamports
  secret: string; // 32 bytes hex
  leafIndex: number;
  merklePath: string[]; // 8 sibling hashes
}

/**
 * Generated ZK proof
 */
export interface ZkProof {
  proof: Uint8Array;
  publicInputs: string[];
}

/**
 * NoirJS Prover for Shadow Drop circuit
 *
 * Generates ZK proofs in the browser using WebAssembly
 */
export class ShadowDropProver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private backend: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private noir: any = null;
  private initialized = false;

  /**
   * Initialize the prover with the compiled circuit
   * Call this once before generating proofs
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async initialize(circuitJson: any): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic imports for better code splitting
      const [{ Noir }, { UltraHonkBackend }] = await Promise.all([
        import("@noir-lang/noir_js"),
        import("@aztec/bb.js"),
      ]);

      this.noir = new Noir(circuitJson);
      this.backend = new UltraHonkBackend(circuitJson.bytecode);
      this.initialized = true;

      console.log("ShadowDropProver initialized successfully");
    } catch (error) {
      console.error("Failed to initialize ShadowDropProver:", error);
      throw new Error(`Failed to initialize ZK prover: ${error}`);
    }
  }

  /**
   * Generate a ZK proof for the given claim inputs
   */
  async generateProof(inputs: ZkClaimInputs): Promise<ZkProof> {
    if (!this.initialized || !this.noir || !this.backend) {
      throw new Error("Prover not initialized. Call initialize() first.");
    }

    console.log("Generating ZK proof for claim...");
    console.log("Inputs:", {
      merkleRoot: inputs.merkleRoot.slice(0, 20) + "...",
      nullifierHash: inputs.nullifierHash.slice(0, 20) + "...",
      leafIndex: inputs.leafIndex,
    });

    try {
      // Convert inputs to Noir format
      const noirInputs = {
        merkle_root: inputs.merkleRoot,
        nullifier_hash: inputs.nullifierHash,
        recipient: inputs.recipient,
        amount: inputs.amount,
        secret: inputs.secret,
        leaf_index: inputs.leafIndex.toString(),
        merkle_path: inputs.merklePath,
      };

      // Execute circuit to generate witness
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { witness } = await (this.noir as any).execute(noirInputs);
      console.log("Witness generated successfully");

      // Generate proof using backend
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proof = await (this.backend as any).generateProof(witness);
      console.log("Proof generated successfully");

      return {
        proof: proof.proof,
        publicInputs: proof.publicInputs,
      };
    } catch (error) {
      console.error("Failed to generate proof:", error);
      throw new Error(`Proof generation failed: ${error}`);
    }
  }

  /**
   * Verify a proof locally (for testing)
   */
  async verifyProof(proof: ZkProof): Promise<boolean> {
    if (!this.backend) {
      throw new Error("Prover not initialized");
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isValid = await (this.backend as any).verifyProof({
        proof: proof.proof,
        publicInputs: proof.publicInputs,
      });
      return isValid;
    } catch (error) {
      console.error("Proof verification failed:", error);
      return false;
    }
  }

  /**
   * Check if prover is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * Singleton prover instance
 */
let proverInstance: ShadowDropProver | null = null;

/**
 * Get or create the prover instance
 */
export function getProver(): ShadowDropProver {
  if (!proverInstance) {
    proverInstance = new ShadowDropProver();
  }
  return proverInstance;
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Format proof for on-chain submission
 * Returns proof bytes in the format expected by the Solana program
 */
export function formatProofForSolana(proof: ZkProof): {
  groth16Proof: number[];
  publicInputs: number[];
} {
  // Groth16 proof is 256 bytes (2 G1 + 1 G2 point)
  const proofBytes = Array.from(proof.proof.slice(0, 256));

  // Public inputs: merkle_root (32) + nullifier_hash (32) + recipient (32)
  const publicInputBytes: number[] = [];
  for (const input of proof.publicInputs.slice(0, 3)) {
    const inputBytes = hexToBytes(input);
    // Pad to 32 bytes
    const padded = new Uint8Array(32);
    padded.set(inputBytes.slice(0, 32), 32 - inputBytes.length);
    publicInputBytes.push(...Array.from(padded));
  }

  return {
    groth16Proof: proofBytes,
    publicInputs: publicInputBytes,
  };
}
