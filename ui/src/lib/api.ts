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
}

export interface EligibilityResponse {
    eligible: boolean;
    amount: number | null;
    already_claimed: boolean;
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
