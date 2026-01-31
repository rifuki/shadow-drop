import { PublicKey } from "@solana/web3.js";

// Program ID
export const PROGRAM_ID = new PublicKey("7wjDqUQUpnudD25MELXBiayNiMrStXaKAdrLMwzccu7v");

/**
 * Derive Campaign PDA address
 */
export function deriveCampaignPDA(authority: PublicKey, campaignId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [
            Buffer.from("campaign"),
            authority.toBuffer(),
            Buffer.from(campaignId),
        ],
        PROGRAM_ID
    );
}

/**
 * Derive Vault PDA address
 */
export function deriveVaultPDA(authority: PublicKey, campaignId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [
            Buffer.from("vault"),
            authority.toBuffer(),
            Buffer.from(campaignId),
        ],
        PROGRAM_ID
    );
}

/**
 * Derive Claim Record PDA address
 */
export function deriveClaimRecordPDA(campaign: PublicKey, claimer: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [
            Buffer.from("claim"),
            campaign.toBuffer(),
            claimer.toBuffer(),
        ],
        PROGRAM_ID
    );
}

/**
 * Generate a unique campaign ID (short, URL-friendly)
 */
export function generateCampaignId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
}

/**
 * Generate a simple merkle root from recipient list (placeholder)
 * In production, use a proper merkle tree library
 */
export function generateMerkleRoot(recipients: { wallet: string; amount: number }[]): Uint8Array {
    // Simple hash of recipients for demo - in production use proper merkle tree
    const data = recipients.map(r => `${r.wallet}:${r.amount}`).join("|");
    const encoder = new TextEncoder();
    const encoded = encoder.encode(data);

    // Create a 32-byte hash (simplified - use sha256 in production)
    const hash = new Uint8Array(32);
    for (let i = 0; i < encoded.length; i++) {
        hash[i % 32] ^= encoded[i];
    }
    return hash;
}
