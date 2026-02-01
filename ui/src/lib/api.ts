const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface RecipientInput {
    wallet: string;
    amount: number;
}

export interface CreateCampaignRequest {
    address: string;
    name: string;
    merkle_root: string;
    total_amount: number;
    creator_wallet: string;
    tx_signature?: string;
    vault_address?: string; // PDA vault address for claims
    recipients: RecipientInput[];
    // Vesting fields (optional)
    airdrop_type?: string;
    vesting_start?: number;
    vesting_cliff_seconds?: number;
    vesting_duration_seconds?: number;
    // Token fields (optional, None = SOL campaign)
    token_mint?: string;
    token_symbol?: string;
    token_decimals?: number;
}

export interface CampaignInfo {
    id: string;
    address: string;
    name: string;
    total_amount: number;
    total_recipients: number;
    claimed_count: number;
    creator_wallet: string;
    vault_address?: string; // PDA vault address for claims
    tx_signature?: string;
    created_at: string;
    // Vesting fields
    airdrop_type?: string;
    vesting_start?: number;
    vesting_cliff_seconds?: number;
    vesting_duration_seconds?: number;
    // Token fields (optional, None = SOL)
    token_mint?: string;
    token_symbol?: string;
    token_decimals?: number;
}

export interface EligibilityResponse {
    eligible: boolean;
    amount: number | null;
    already_claimed: boolean;
}

export interface ProofResponse {
    merkle_root: string;
    nullifier_hash: string;
    leaf_index: number;
    merkle_path: string[];
    amount: number;
    secret: string;
}

/**
 * ZK Proof response from Sunspot prover
 */
export interface ZkProofResponse {
    groth16_proof: string;      // 256 bytes hex
    public_inputs: string;       // 108 bytes hex (12 header + 96 data)
    nullifier_hash: string;      // 32 bytes hex
    nullifier: string;           // 32 bytes hex (for contract)
    amount: number;              // in lamports
    secret: string;              // 32 bytes hex
    merkle_root: string;         // 32 bytes hex
    leaf_index: number;
}

export interface EligibleCampaign {
    address: string;
    name: string;
    amount: number;
    total_amount: number;
    total_recipients: number;
    vault_address?: string;
    created_at: string;
    token_symbol?: string;
    token_decimals?: number;
}

interface ApiResponse<T> {
    success: boolean;
    code: number;
    data?: T;
    message: string;
}

/**
 * Create a new campaign
 */
export async function createCampaign(data: CreateCampaignRequest): Promise<CampaignInfo> {
    const response = await fetch(`${API_BASE}/api/v1/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    const result: ApiResponse<CampaignInfo> = await response.json();
    if (!result.success || !result.data) {
        throw new Error(result.message || 'Failed to create campaign');
    }
    return result.data;
}

/**
 * Get campaign info by address
 */
export async function getCampaign(address: string): Promise<CampaignInfo | null> {
    const response = await fetch(`${API_BASE}/api/v1/campaigns/${address}`);
    const result: ApiResponse<CampaignInfo> = await response.json();
    if (!result.success) {
        return null;
    }
    return result.data || null;
}

/**
 * Get all campaigns created by a wallet
 */
export async function getCampaignsByWallet(wallet: string): Promise<CampaignInfo[]> {
    const response = await fetch(`${API_BASE}/api/v1/campaigns/wallet/${wallet}`);
    const result: ApiResponse<CampaignInfo[]> = await response.json();
    if (!result.success || !result.data) {
        return [];
    }
    return result.data;
}

/**
 * Check eligibility for a wallet in a campaign
 */
export async function checkEligibility(address: string, wallet: string): Promise<EligibilityResponse> {
    const response = await fetch(`${API_BASE}/api/v1/campaigns/${address}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet }),
    });
    const result: ApiResponse<EligibilityResponse> = await response.json();
    if (!result.success || !result.data) {
        throw new Error(result.message || 'Failed to check eligibility');
    }
    return result.data;
}

/**
 * Mark a claim as completed
 */
export async function markClaimed(address: string, wallet: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/v1/campaigns/${address}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet }),
    });
    const result: ApiResponse<void> = await response.json();
    if (!result.success) {
        throw new Error(result.message || 'Failed to mark as claimed');
    }
}

/**
 * Generate ZK proof for a claim
 */
export async function generateProof(address: string, wallet: string): Promise<ProofResponse> {
    const response = await fetch(`${API_BASE}/api/v1/proofs/${address}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet }),
    });
    const result: ApiResponse<ProofResponse> = await response.json();
    if (!result.success || !result.data) {
        throw new Error(result.message || 'Failed to generate proof');
    }
    return result.data;
}

/**
 * Get all campaigns where wallet is eligible to claim
 */
export async function getEligibleCampaigns(wallet: string): Promise<EligibleCampaign[]> {
    const response = await fetch(`${API_BASE}/api/v1/campaigns/eligible/${wallet}`);
    const result: ApiResponse<EligibleCampaign[]> = await response.json();
    if (!result.success || !result.data) {
        return [];
    }
    return result.data;
}

/**
 * Generate Sunspot ZK proof for a claim (Groth16)
 * This proof can be verified on-chain by the Sunspot verifier program
 */
export async function generateZkProof(address: string, wallet: string): Promise<ZkProofResponse> {
    const response = await fetch(`${API_BASE}/api/v1/zk-proofs/${address}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet }),
    });
    const result: ApiResponse<ZkProofResponse> = await response.json();
    if (!result.success || !result.data) {
        throw new Error(result.message || 'Failed to generate ZK proof');
    }
    return result.data;
}
