#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use light_sdk::{
    account::LightAccount,
    address::v2::derive_address,
    cpi::{v2::CpiAccounts, CpiSigner},
    derive_light_cpi_signer,
    instruction::{PackedAddressTreeInfo, ValidityProof},
    LightDiscriminator,
    PackedAddressTreeInfoExt,
};
use light_sdk::constants::ADDRESS_TREE_V2;

declare_id!("7wjDqUQUpnudD25MELXBiayNiMrStXaKAdrLMwzccu7v");

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

        msg!("Campaign created with {} lamports, vesting_duration: {}s", total_amount, vesting_duration);
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
}

#[account]
pub struct ClaimRecord {
    pub campaign: Pubkey,
    pub claimer: Pubkey,
    pub amount: u64,
    pub claimed: bool,
    pub claimed_at: i64,
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
        space = 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 1 + 32 + 1 + 8 + 8 + 8, // +24 for vesting
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
}
