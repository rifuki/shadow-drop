#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("7wjDqUQUpnudD25MELXBiayNiMrStXaKAdrLMwzccu7v");

/// Shadow Drop - Production-Ready Airdrop Campaign
/// Uses PDAs to store campaign funds securely on-chain
#[program]
pub mod shadow_drop {
    use super::*;

    /// Create a new airdrop campaign
    /// Funds are stored in a PDA vault controlled by the program
    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        campaign_id: String,
        merkle_root: [u8; 32],
        total_amount: u64,
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

        msg!("Campaign created with {} lamports", total_amount);
        Ok(())
    }

    /// Claim tokens from campaign
    /// Backend verifies merkle proof, then calls this instruction
    pub fn claim(
        ctx: Context<Claim>,
        claim_amount: u64,
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        
        require!(campaign.is_active, ShadowDropError::CampaignNotActive);
        require!(
            campaign.claimed_amount + claim_amount <= campaign.total_amount,
            ShadowDropError::InsufficientFunds
        );

        // Mark claim in claim record
        let claim_record = &mut ctx.accounts.claim_record;
        require!(!claim_record.claimed, ShadowDropError::AlreadyClaimed);
        
        claim_record.campaign = campaign.key();
        claim_record.claimer = ctx.accounts.claimer.key();
        claim_record.amount = claim_amount;
        claim_record.claimed = true;
        claim_record.claimed_at = Clock::get()?.unix_timestamp;

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

        msg!("Claim successful: {} lamports to {}", claim_amount, claimer.key());
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
// Account Structures
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
    pub campaign_id: [u8; 32],  // Store campaign_id for vault PDA derivation
    pub campaign_id_len: u8,    // Actual length of campaign_id
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
        space = 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 1 + 32 + 1, // Campaign struct size + campaign_id + len
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
}
