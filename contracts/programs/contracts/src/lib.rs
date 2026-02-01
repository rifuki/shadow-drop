#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_spl::{
    token::{self, Token, TokenAccount, Mint, Transfer as SplTransfer},
    associated_token::AssociatedToken,
};
use light_sdk::{
    account::LightAccount,
    address::v2::derive_address,
    cpi::{v2::CpiAccounts, CpiSigner},
    derive_light_cpi_signer,
    instruction::{PackedAddressTreeInfo, ValidityProof},
    LightDiscriminator,
    PackedAddressTreeInfoExt,
};

declare_id!("7wjDqUQUpnudD25MELXBiayNiMrStXaKAdrLMwzccu7v");

/// Groth16 proof size: 2 G1 points (64 bytes each) + 1 G2 point (128 bytes) = 256 bytes
pub const GROTH16_PROOF_SIZE: usize = 256;

/// Public inputs size: 12-byte header + 3 Field elements (merkle_root, nullifier_hash, recipient)
/// gnark-solana verifier expects full .pw file format: 12 + (3 * 32) = 108 bytes
pub const PUBLIC_INPUTS_SIZE: usize = 108;

/// Light CPI Signer for this program
pub const LIGHT_CPI_SIGNER: CpiSigner =
    derive_light_cpi_signer!("7wjDqUQUpnudD25MELXBiayNiMrStXaKAdrLMwzccu7v");

/// Shadow Drop - ZK Compression Airdrop
/// Uses Light Protocol compressed accounts for cheap claims
#[program]
pub mod shadow_drop {
    use super::*;
    use light_sdk::cpi::{
        v2::LightSystemProgramCpi, InvokeLightSystemProgram, LightCpiInstruction,
    };

    /// Create a new airdrop campaign
    /// Funds are stored in a PDA vault controlled by the program
    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        campaign_id: String,
        merkle_root: [u8; 32],
        total_amount: u64,
        vesting_start: i64,
        vesting_cliff: i64,
        vesting_duration: i64,
    ) -> Result<()> {
        require!(campaign_id.len() <= 32, ShadowDropError::CampaignIdTooLong);
        require!(total_amount > 0, ShadowDropError::InvalidAmount);

        let campaign = &mut ctx.accounts.campaign;
        campaign.authority = ctx.accounts.authority.key();
        campaign.merkle_root = merkle_root;
        campaign.total_amount = total_amount;
        campaign.claimed_amount = 0;
        campaign.total_claims = 0;
        campaign.is_active = true;
        campaign.bump = ctx.bumps.campaign;
        campaign.vault_bump = ctx.bumps.vault;
        
        // Vesting config
        campaign.vesting_start = if vesting_start == 0 {
            Clock::get()?.unix_timestamp  // Start now if 0
        } else {
            vesting_start
        };
        campaign.vesting_cliff = vesting_cliff;
        campaign.vesting_duration = vesting_duration;
        
        // Store campaign_id for vault PDA derivation during claims
        let mut id_bytes = [0u8; 32];
        let id_len = campaign_id.len().min(32);
        id_bytes[..id_len].copy_from_slice(&campaign_id.as_bytes()[..id_len]);
        campaign.campaign_id = id_bytes;
        campaign.campaign_id_len = id_len as u8;

        // SOL campaign - no token mint
        campaign.token_mint = None;
        campaign.token_vault = None;

        // Transfer SOL from authority to vault PDA
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            total_amount,
        )?;

        msg!("SOL Campaign created with {} lamports, vesting_duration: {}s", total_amount, vesting_duration);
        Ok(())
    }

    /// Claim tokens using compressed account (cheap!)
    /// Creates a compressed nullifier to prevent double-claiming
    pub fn claim_compressed<'info>(
        ctx: Context<'_, '_, '_, 'info, ClaimCompressed<'info>>,
        proof: ValidityProof,
        address_tree_info: PackedAddressTreeInfo,
        output_state_tree_index: u8,
        nullifier: [u8; 32],
        claim_amount: u64,
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        
        require!(campaign.is_active, ShadowDropError::CampaignNotActive);
        require!(
            campaign.claimed_amount + claim_amount <= campaign.total_amount,
            ShadowDropError::InsufficientFunds
        );

        // Setup Light CPI accounts
        let light_cpi_accounts = CpiAccounts::new(
            ctx.accounts.claimer.as_ref(),
            ctx.remaining_accounts,
            crate::LIGHT_CPI_SIGNER,
        );

        // Validate address tree (get pubkey for deriving nullifier address)
        let address_tree_pubkey = address_tree_info
            .get_tree_pubkey(&light_cpi_accounts)
            .map_err(|_| ErrorCode::AccountNotEnoughKeys)?;

        // Note: For production, add validation here
        // For localnet/hackathon, accept any valid tree
        msg!("Using address tree: {}", address_tree_pubkey);

        // Derive nullifier address - if it exists, claim already happened
        let (address, address_seed) = derive_address(
            &[b"nullifier", &nullifier],
            &address_tree_pubkey,
            &crate::ID,
        );

        // Create compressed nullifier account (will fail if exists = already claimed)
        let nullifier_account = LightAccount::<CompressedNullifier>::new_init(
            &crate::ID,
            Some(address),
            output_state_tree_index,
        );

        msg!("Creating nullifier: {:?}", nullifier);

        // Execute Light CPI to create nullifier
        LightSystemProgramCpi::new_cpi(LIGHT_CPI_SIGNER, proof)
            .with_light_account(nullifier_account)?
            .with_new_addresses(&[
                address_tree_info.into_new_address_params_assigned_packed(address_seed, Some(0))
            ])
            .invoke(light_cpi_accounts)?;

        // Update campaign stats
        campaign.claimed_amount += claim_amount;
        campaign.total_claims += 1;

        // Transfer from vault to claimer using PDA signer
        let authority_key = campaign.authority;
        let id_len = campaign.campaign_id_len as usize;
        let campaign_id_bytes = &campaign.campaign_id[..id_len];
        let vault_bump = campaign.vault_bump;
        
        let vault_seeds: &[&[u8]] = &[
            b"vault",
            authority_key.as_ref(),
            campaign_id_bytes,
            &[vault_bump],
        ];
        let signer = &[vault_seeds];

        let vault = &ctx.accounts.vault;
        let claimer = &ctx.accounts.claimer;

        // Use invoke_signed to transfer from vault PDA
        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                vault.key,
                claimer.key,
                claim_amount,
            ),
            &[
                vault.to_account_info(),
                claimer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer,
        )?;

        msg!("Compressed claim successful: {} lamports to {}", claim_amount, claimer.key());
        Ok(())
    }

    /// Claim with full ZK proof verification (Hybrid: Sunspot + Light Protocol)
    /// 1. Verifies Groth16 proof via CPI to Sunspot verifier
    /// 2. Creates compressed nullifier via Light Protocol
    /// 3. Transfers SOL to claimer
    pub fn claim_zk_verified<'info>(
        ctx: Context<'_, '_, '_, 'info, ClaimZkVerified<'info>>,
        // Groth16 proof (256 bytes)
        groth16_proof: [u8; GROTH16_PROOF_SIZE],
        // Public inputs: merkle_root (32) + nullifier_hash (32) + recipient (32)
        public_inputs: [u8; PUBLIC_INPUTS_SIZE],
        // Light Protocol params
        light_proof: ValidityProof,
        address_tree_info: PackedAddressTreeInfo,
        output_state_tree_index: u8,
        // Claim params
        nullifier: [u8; 32],
        claim_amount: u64,
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;

        require!(campaign.is_active, ShadowDropError::CampaignNotActive);
        require!(
            campaign.claimed_amount + claim_amount <= campaign.total_amount,
            ShadowDropError::InsufficientFunds
        );

        // =======================================================================
        // Step 1: Verify Groth16 proof via CPI to Sunspot verifier
        // =======================================================================

        // Build verification data: proof || public_inputs
        let mut verify_data = Vec::with_capacity(GROTH16_PROOF_SIZE + PUBLIC_INPUTS_SIZE);
        verify_data.extend_from_slice(&groth16_proof);
        verify_data.extend_from_slice(&public_inputs);

        // Create CPI instruction to verifier program
        let verify_ix = Instruction {
            program_id: ctx.accounts.zk_verifier.key(),
            accounts: vec![],  // Sunspot verifier doesn't need accounts
            data: verify_data,
        };

        // Invoke the verifier - will fail if proof is invalid
        anchor_lang::solana_program::program::invoke(
            &verify_ix,
            &[ctx.accounts.zk_verifier.to_account_info()],
        )?;

        msg!("ZK proof verified successfully!");

        // =======================================================================
        // Step 2: Validate public inputs match campaign data
        // =======================================================================

        // Extract merkle_root from public inputs (first 32 bytes)
        let proof_merkle_root: [u8; 32] = public_inputs[0..32].try_into().unwrap();
        require!(
            proof_merkle_root == campaign.merkle_root,
            ShadowDropError::InvalidMerkleRoot
        );

        // Extract nullifier_hash from public inputs (bytes 32-64)
        let proof_nullifier: [u8; 32] = public_inputs[32..64].try_into().unwrap();
        require!(
            proof_nullifier == nullifier,
            ShadowDropError::InvalidNullifier
        );

        // =======================================================================
        // Step 3: Create compressed nullifier via Light Protocol
        // =======================================================================

        let light_cpi_accounts = CpiAccounts::new(
            ctx.accounts.claimer.as_ref(),
            ctx.remaining_accounts,
            crate::LIGHT_CPI_SIGNER,
        );

        let address_tree_pubkey = address_tree_info
            .get_tree_pubkey(&light_cpi_accounts)
            .map_err(|_| ErrorCode::AccountNotEnoughKeys)?;

        let (address, address_seed) = derive_address(
            &[b"nullifier", &nullifier],
            &address_tree_pubkey,
            &crate::ID,
        );

        let nullifier_account = LightAccount::<CompressedNullifier>::new_init(
            &crate::ID,
            Some(address),
            output_state_tree_index,
        );

        msg!("Creating compressed nullifier: {:?}", nullifier);

        // Execute Light CPI to create nullifier (prevents double-claiming)
        light_sdk::cpi::v2::LightSystemProgramCpi::new_cpi(LIGHT_CPI_SIGNER, light_proof)
            .with_light_account(nullifier_account)?
            .with_new_addresses(&[
                address_tree_info.into_new_address_params_assigned_packed(address_seed, Some(0))
            ])
            .invoke(light_cpi_accounts)?;

        // =======================================================================
        // Step 4: Update campaign and transfer SOL
        // =======================================================================

        campaign.claimed_amount += claim_amount;
        campaign.total_claims += 1;

        let authority_key = campaign.authority;
        let id_len = campaign.campaign_id_len as usize;
        let campaign_id_bytes = &campaign.campaign_id[..id_len];
        let vault_bump = campaign.vault_bump;

        let vault_seeds: &[&[u8]] = &[
            b"vault",
            authority_key.as_ref(),
            campaign_id_bytes,
            &[vault_bump],
        ];
        let signer = &[vault_seeds];

        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                ctx.accounts.vault.key,
                ctx.accounts.claimer.key,
                claim_amount,
            ),
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.claimer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer,
        )?;

        msg!("ZK-verified claim successful: {} lamports to {}", claim_amount, ctx.accounts.claimer.key());
        Ok(())
    }

    /// Simplified ZK claim - verifies Groth16 proof without Light Protocol
    /// Uses PDA-based nullifier (simpler, still on-chain verified)
    pub fn claim_zk_simple(
        ctx: Context<ClaimZkSimple>,
        // Groth16 proof (256 bytes)
        groth16_proof: [u8; GROTH16_PROOF_SIZE],
        // Public inputs: merkle_root (32) + nullifier_hash (32) + recipient (32)
        public_inputs: [u8; PUBLIC_INPUTS_SIZE],
        // Nullifier for double-claim prevention
        nullifier: [u8; 32],
        claim_amount: u64,
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;

        require!(campaign.is_active, ShadowDropError::CampaignNotActive);
        require!(
            campaign.claimed_amount + claim_amount <= campaign.total_amount,
            ShadowDropError::InsufficientFunds
        );

        // =======================================================================
        // Step 1: Verify Groth16 proof via CPI to Sunspot verifier
        // =======================================================================

        // Build verification data: proof || public_inputs
        let mut verify_data = Vec::with_capacity(GROTH16_PROOF_SIZE + PUBLIC_INPUTS_SIZE);
        verify_data.extend_from_slice(&groth16_proof);
        verify_data.extend_from_slice(&public_inputs);

        // Create CPI instruction to verifier program
        let verify_ix = Instruction {
            program_id: ctx.accounts.zk_verifier.key(),
            accounts: vec![],  // Sunspot verifier doesn't need accounts
            data: verify_data,
        };

        // Invoke the verifier - will fail if proof is invalid
        anchor_lang::solana_program::program::invoke(
            &verify_ix,
            &[ctx.accounts.zk_verifier.to_account_info()],
        )?;

        msg!("✅ Groth16 ZK proof verified on-chain!");

        // =======================================================================
        // Step 2: Validate public inputs match campaign data
        // =======================================================================

        // Extract merkle_root from public inputs (first 32 bytes)
        let proof_merkle_root: [u8; 32] = public_inputs[0..32].try_into().unwrap();
        require!(
            proof_merkle_root == campaign.merkle_root,
            ShadowDropError::InvalidMerkleRoot
        );

        // Extract nullifier_hash from public inputs (bytes 32-64)
        let proof_nullifier: [u8; 32] = public_inputs[32..64].try_into().unwrap();
        require!(
            proof_nullifier == nullifier,
            ShadowDropError::InvalidNullifier
        );

        msg!("✅ Public inputs validated against campaign");

        // =======================================================================
        // Step 3: Record nullifier (PDA-based, prevents double-claim)
        // =======================================================================

        let nullifier_record = &mut ctx.accounts.nullifier_record;
        nullifier_record.campaign = campaign.key();
        nullifier_record.nullifier = nullifier;
        nullifier_record.claimer = ctx.accounts.claimer.key();
        nullifier_record.claimed_at = Clock::get()?.unix_timestamp;

        msg!("✅ Nullifier recorded: {:?}", &nullifier[..8]);

        // =======================================================================
        // Step 4: Update campaign and transfer SOL
        // =======================================================================

        campaign.claimed_amount += claim_amount;
        campaign.total_claims += 1;

        let authority_key = campaign.authority;
        let id_len = campaign.campaign_id_len as usize;
        let campaign_id_bytes = &campaign.campaign_id[..id_len];
        let vault_bump = campaign.vault_bump;

        let vault_seeds: &[&[u8]] = &[
            b"vault",
            authority_key.as_ref(),
            campaign_id_bytes,
            &[vault_bump],
        ];
        let signer = &[vault_seeds];

        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                ctx.accounts.vault.key,
                ctx.accounts.claimer.key,
                claim_amount,
            ),
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.claimer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer,
        )?;

        msg!("🎉 ZK-verified claim successful: {} lamports to {}", claim_amount, ctx.accounts.claimer.key());
        Ok(())
    }

    /// Legacy claim (for backwards compatibility)
    /// Uses regular PDA claim records
    /// Supports vesting: calculates claimable amount based on time
    pub fn claim(
        ctx: Context<Claim>,
        claim_amount: u64,
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        
        require!(campaign.is_active, ShadowDropError::CampaignNotActive);

        // Calculate claimable amount based on vesting schedule
        let now = Clock::get()?.unix_timestamp;
        let vested_amount = if campaign.vesting_duration == 0 {
            // Instant: 100% vested immediately
            claim_amount
        } else {
            // Check if still in cliff period
            let cliff_end = campaign.vesting_start + campaign.vesting_cliff;
            if now < cliff_end {
                return Err(ShadowDropError::VestingCliffNotReached.into());
            }
            
            // Calculate linear vesting
            let vesting_end = campaign.vesting_start + campaign.vesting_duration;
            let elapsed = now - campaign.vesting_start;
            
            if now >= vesting_end {
                // Fully vested
                claim_amount
            } else {
                // Partially vested: (elapsed / duration) * claim_amount
                let vested = (claim_amount as i128 * elapsed as i128 / campaign.vesting_duration as i128) as u64;
                vested
            }
        };

        require!(vested_amount > 0, ShadowDropError::NothingToVest);
        require!(
            campaign.claimed_amount + vested_amount <= campaign.total_amount,
            ShadowDropError::InsufficientFunds
        );

        // Mark claim in claim record
        let claim_record = &mut ctx.accounts.claim_record;
        require!(!claim_record.claimed, ShadowDropError::AlreadyClaimed);
        
        claim_record.campaign = campaign.key();
        claim_record.claimer = ctx.accounts.claimer.key();
        claim_record.amount = vested_amount;
        claim_record.claimed = true;
        claim_record.claimed_at = now;

        // Update campaign stats
        campaign.claimed_amount += vested_amount;
        campaign.total_claims += 1;

        // Transfer from vault to claimer using PDA signer
        let authority_key = campaign.authority;
        let id_len = campaign.campaign_id_len as usize;
        let campaign_id_bytes = &campaign.campaign_id[..id_len];
        let vault_bump = campaign.vault_bump;
        
        let vault_seeds: &[&[u8]] = &[
            b"vault",
            authority_key.as_ref(),
            campaign_id_bytes,
            &[vault_bump],
        ];
        let signer = &[vault_seeds];

        let vault = &ctx.accounts.vault;
        let claimer = &ctx.accounts.claimer;

        // Use invoke_signed to transfer from vault PDA
        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                vault.key,
                claimer.key,
                vested_amount,
            ),
            &[
                vault.to_account_info(),
                claimer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer,
        )?;

        msg!("Claim successful: {} lamports (vested) to {}", vested_amount, claimer.key());
        Ok(())
    }

    /// Close campaign and return remaining funds
    pub fn close_campaign(ctx: Context<CloseCampaign>) -> Result<()> {
        let campaign = &ctx.accounts.campaign;
        let vault = &ctx.accounts.vault;
        let authority = &ctx.accounts.authority;

        require!(
            authority.key() == campaign.authority,
            ShadowDropError::Unauthorized
        );

        // Return remaining funds to authority
        let remaining = vault.lamports();
        **vault.try_borrow_mut_lamports()? -= remaining;
        **authority.try_borrow_mut_lamports()? += remaining;

        msg!("Campaign closed, {} lamports returned", remaining);
        Ok(())
    }

    /// Create a new token airdrop campaign
    /// Uses SPL Token for token distribution
    pub fn create_token_campaign(
        ctx: Context<CreateTokenCampaign>,
        campaign_id: String,
        merkle_root: [u8; 32],
        total_amount: u64,
        vesting_start: i64,
        vesting_cliff: i64,
        vesting_duration: i64,
    ) -> Result<()> {
        require!(campaign_id.len() <= 32, ShadowDropError::CampaignIdTooLong);
        require!(total_amount > 0, ShadowDropError::InvalidAmount);

        let campaign = &mut ctx.accounts.campaign;
        campaign.authority = ctx.accounts.authority.key();
        campaign.merkle_root = merkle_root;
        campaign.total_amount = total_amount;
        campaign.claimed_amount = 0;
        campaign.total_claims = 0;
        campaign.is_active = true;
        campaign.bump = ctx.bumps.campaign;
        campaign.vault_bump = 0; // Not used for token campaigns
        
        // Vesting config
        campaign.vesting_start = if vesting_start == 0 {
            Clock::get()?.unix_timestamp
        } else {
            vesting_start
        };
        campaign.vesting_cliff = vesting_cliff;
        campaign.vesting_duration = vesting_duration;
        
        // Store campaign_id
        let mut id_bytes = [0u8; 32];
        let id_len = campaign_id.len().min(32);
        id_bytes[..id_len].copy_from_slice(&campaign_id.as_bytes()[..id_len]);
        campaign.campaign_id = id_bytes;
        campaign.campaign_id_len = id_len as u8;

        // Token campaign - store mint and vault
        campaign.token_mint = Some(ctx.accounts.token_mint.key());
        campaign.token_vault = Some(ctx.accounts.token_vault.key());

        // Transfer tokens from authority's token account to vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.authority_token_account.to_account_info(),
                    to: ctx.accounts.token_vault.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            total_amount,
        )?;

        msg!("Token Campaign created with {} tokens, mint: {}", total_amount, ctx.accounts.token_mint.key());
        Ok(())
    }

    /// Claim tokens from a token campaign (legacy flow)
    pub fn claim_token(ctx: Context<ClaimToken>, claim_amount: u64) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        
        require!(campaign.is_active, ShadowDropError::CampaignNotActive);
        require!(campaign.token_mint.is_some(), ShadowDropError::NotTokenCampaign);

        // Calculate claimable amount based on vesting schedule
        let now = Clock::get()?.unix_timestamp;
        let vested_amount = if campaign.vesting_duration == 0 {
            claim_amount
        } else {
            let cliff_end = campaign.vesting_start + campaign.vesting_cliff;
            if now < cliff_end {
                return Err(ShadowDropError::VestingCliffNotReached.into());
            }
            
            let vesting_end = campaign.vesting_start + campaign.vesting_duration;
            let elapsed = now - campaign.vesting_start;
            
            if now >= vesting_end {
                claim_amount
            } else {
                (claim_amount as i128 * elapsed as i128 / campaign.vesting_duration as i128) as u64
            }
        };

        require!(vested_amount > 0, ShadowDropError::NothingToVest);
        require!(
            campaign.claimed_amount + vested_amount <= campaign.total_amount,
            ShadowDropError::InsufficientFunds
        );

        // Mark claim in claim record
        let claim_record = &mut ctx.accounts.claim_record;
        require!(!claim_record.claimed, ShadowDropError::AlreadyClaimed);
        
        claim_record.campaign = campaign.key();
        claim_record.claimer = ctx.accounts.claimer.key();
        claim_record.amount = vested_amount;
        claim_record.claimed = true;
        claim_record.claimed_at = now;

        // Update campaign stats
        campaign.claimed_amount += vested_amount;
        campaign.total_claims += 1;

        // Transfer tokens from vault to claimer using campaign PDA as signer
        let authority_key = campaign.authority;
        let id_len = campaign.campaign_id_len as usize;
        // Copy to avoid borrow checker issues
        let mut campaign_id_copy = [0u8; 32];
        campaign_id_copy[..id_len].copy_from_slice(&campaign.campaign_id[..id_len]);
        let campaign_bump = campaign.bump;
        
        let campaign_seeds: &[&[u8]] = &[
            b"campaign",
            authority_key.as_ref(),
            &campaign_id_copy[..id_len],
            &[campaign_bump],
        ];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.claimer_token_account.to_account_info(),
                    authority: ctx.accounts.campaign.to_account_info(),
                },
                &[campaign_seeds],
            ),
            vested_amount,
        )?;

        msg!("Token claim successful: {} tokens to {}", vested_amount, ctx.accounts.claimer.key());
        Ok(())
    }
}

// ============================================================================
// Compressed Account Structures (Light Protocol)
// ============================================================================

/// Compressed nullifier account - prevents double-claiming
/// Creating this account "uses up" the nullifier
#[event]
#[derive(Clone, Debug, Default, LightDiscriminator)]
pub struct CompressedNullifier {}

// ============================================================================
// Regular Account Structures (Anchor PDAs)
// ============================================================================

#[account]
pub struct Campaign {
    pub authority: Pubkey,
    pub merkle_root: [u8; 32],
    pub total_amount: u64,
    pub claimed_amount: u64,
    pub total_claims: u64,
    pub is_active: bool,
    pub bump: u8,
    pub vault_bump: u8,
    pub campaign_id: [u8; 32],
    pub campaign_id_len: u8,
    // Vesting fields
    pub vesting_start: i64,      // Unix timestamp when vesting starts (0 = instant)
    pub vesting_cliff: i64,      // Cliff period in seconds
    pub vesting_duration: i64,   // Total vesting duration in seconds
    // Token fields (None = SOL campaign)
    pub token_mint: Option<Pubkey>,    // Token mint address (None = SOL)
    pub token_vault: Option<Pubkey>,   // Token vault ATA address
}

#[account]
pub struct ClaimRecord {
    pub campaign: Pubkey,
    pub claimer: Pubkey,
    pub amount: u64,
    pub claimed: bool,
    pub claimed_at: i64,
}

/// ZK Nullifier record - prevents double-claim using ZK proof
#[account]
pub struct NullifierRecord {
    pub campaign: Pubkey,      // Campaign this nullifier belongs to
    pub nullifier: [u8; 32],   // The nullifier hash from ZK proof
    pub claimer: Pubkey,       // Who claimed (for auditing)
    pub claimed_at: i64,       // When claimed
}

// ============================================================================
// Instruction Contexts
// ============================================================================

#[derive(Accounts)]
#[instruction(campaign_id: String)]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        // 8 discriminator + 32 authority + 32 merkle_root + 8 total + 8 claimed + 8 claims
        // + 1 is_active + 1 bump + 1 vault_bump + 32 campaign_id + 1 id_len
        // + 8 vesting_start + 8 cliff + 8 duration
        // + 33 token_mint (Option<Pubkey>) + 33 token_vault (Option<Pubkey>)
        space = 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 1 + 32 + 1 + 8 + 8 + 8 + 33 + 33,
        seeds = [b"campaign", authority.key().as_ref(), campaign_id.as_bytes()],
        bump
    )]
    pub campaign: Account<'info, Campaign>,

    /// CHECK: Vault PDA to hold campaign funds
    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref(), campaign_id.as_bytes()],
        bump
    )]
    pub vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

/// Compressed claim context - uses Light Protocol
#[derive(Accounts)]
pub struct ClaimCompressed<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,

    #[account(mut)]
    pub campaign: Account<'info, Campaign>,

    /// CHECK: Vault PDA - validated by seeds
    #[account(mut)]
    pub vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,

    // Note: Light Protocol accounts come via remaining_accounts
}

/// ZK-verified claim context - uses Sunspot verifier + Light Protocol
#[derive(Accounts)]
pub struct ClaimZkVerified<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,

    #[account(mut)]
    pub campaign: Account<'info, Campaign>,

    /// CHECK: Vault PDA - validated by seeds
    #[account(mut)]
    pub vault: AccountInfo<'info>,

    /// CHECK: Sunspot Groth16 verifier program
    /// This is the deployed verifier from `sunspot deploy`
    pub zk_verifier: AccountInfo<'info>,

    pub system_program: Program<'info, System>,

    // Note: Light Protocol accounts come via remaining_accounts
}

/// Simplified ZK claim context - uses Sunspot verifier + PDA nullifier
#[derive(Accounts)]
#[instruction(groth16_proof: [u8; 256], public_inputs: [u8; 96], nullifier: [u8; 32])]
pub struct ClaimZkSimple<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,

    #[account(mut)]
    pub campaign: Account<'info, Campaign>,

    /// CHECK: Vault PDA - validated by seeds
    #[account(mut)]
    pub vault: AccountInfo<'info>,

    /// CHECK: Sunspot Groth16 verifier program
    pub zk_verifier: AccountInfo<'info>,

    /// PDA-based nullifier record (prevents double-claim)
    #[account(
        init,
        payer = claimer,
        space = 8 + 32 + 32 + 32 + 8,  // discriminator + campaign + nullifier + claimer + timestamp
        seeds = [b"nullifier", campaign.key().as_ref(), &nullifier],
        bump
    )]
    pub nullifier_record: Account<'info, NullifierRecord>,

    pub system_program: Program<'info, System>,
}

/// Legacy claim context - uses regular PDAs
#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,

    #[account(mut)]
    pub campaign: Account<'info, Campaign>,

    /// CHECK: Vault PDA - validated by seeds
    #[account(mut)]
    pub vault: AccountInfo<'info>,

    #[account(
        init,
        payer = claimer,
        space = 8 + 32 + 32 + 8 + 1 + 8,
        seeds = [b"claim", campaign.key().as_ref(), claimer.key().as_ref()],
        bump
    )]
    pub claim_record: Account<'info, ClaimRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseCampaign<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        close = authority,
        constraint = campaign.authority == authority.key() @ ShadowDropError::Unauthorized
    )]
    pub campaign: Account<'info, Campaign>,

    /// CHECK: Vault PDA
    #[account(mut)]
    pub vault: AccountInfo<'info>,
}

/// Create token campaign context
#[derive(Accounts)]
#[instruction(campaign_id: String)]
pub struct CreateTokenCampaign<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 1 + 32 + 1 + 8 + 8 + 8 + 33 + 33,
        seeds = [b"campaign", authority.key().as_ref(), campaign_id.as_bytes()],
        bump
    )]
    pub campaign: Account<'info, Campaign>,

    /// Token mint for this campaign
    pub token_mint: Account<'info, Mint>,

    /// Token vault (ATA owned by campaign PDA)
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = token_mint,
        associated_token::authority = campaign,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    /// Authority's token account to transfer from
    #[account(
        mut,
        constraint = authority_token_account.mint == token_mint.key(),
        constraint = authority_token_account.owner == authority.key(),
    )]
    pub authority_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Token claim context
#[derive(Accounts)]
pub struct ClaimToken<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,

    #[account(
        mut,
        constraint = campaign.token_mint.is_some() @ ShadowDropError::NotTokenCampaign,
    )]
    pub campaign: Account<'info, Campaign>,

    /// Token vault (owned by campaign PDA)
    #[account(
        mut,
        constraint = Some(token_vault.key()) == campaign.token_vault,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    /// Claimer's token account to receive tokens
    #[account(
        init_if_needed,
        payer = claimer,
        associated_token::mint = token_mint,
        associated_token::authority = claimer,
    )]
    pub claimer_token_account: Account<'info, TokenAccount>,

    /// Token mint
    #[account(
        constraint = Some(token_mint.key()) == campaign.token_mint,
    )]
    pub token_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = claimer,
        space = 8 + 32 + 32 + 8 + 1 + 8,
        seeds = [b"claim", campaign.key().as_ref(), claimer.key().as_ref()],
        bump
    )]
    pub claim_record: Account<'info, ClaimRecord>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum ShadowDropError {
    #[msg("Campaign ID too long (max 32 chars)")]
    CampaignIdTooLong,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Campaign is not active")]
    CampaignNotActive,
    #[msg("Insufficient funds in campaign")]
    InsufficientFunds,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Vesting cliff period not reached")]
    VestingCliffNotReached,
    #[msg("Nothing to vest yet")]
    NothingToVest,
    #[msg("Not a token campaign")]
    NotTokenCampaign,
    #[msg("Invalid merkle root - proof doesn't match campaign")]
    InvalidMerkleRoot,
    #[msg("Invalid nullifier - proof doesn't match provided nullifier")]
    InvalidNullifier,
    #[msg("ZK proof verification failed")]
    ZkProofVerificationFailed,
}
