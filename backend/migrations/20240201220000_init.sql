-- Add migration script here
CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    address TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    merkle_root TEXT NOT NULL,
    total_amount DOUBLE PRECISION NOT NULL,
    creator_wallet TEXT NOT NULL,
    tx_signature TEXT,
    vault_address TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    airdrop_type TEXT NOT NULL,
    vesting_start BIGINT NOT NULL,
    vesting_cliff_seconds BIGINT NOT NULL,
    vesting_duration_seconds BIGINT NOT NULL,
    token_mint TEXT,
    token_symbol TEXT,
    token_decimals SMALLINT
);

CREATE TABLE IF NOT EXISTS recipients (
    id SERIAL PRIMARY KEY,
    campaign_address TEXT NOT NULL REFERENCES campaigns(address) ON DELETE CASCADE,
    wallet TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    claimed BOOLEAN NOT NULL DEFAULT FALSE,
    claimed_at TIMESTAMPTZ,
    UNIQUE(campaign_address, wallet)
);
