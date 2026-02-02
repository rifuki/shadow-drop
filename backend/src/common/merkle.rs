//! Merkle tree implementation with Poseidon hashing
//! 
//! This module provides a proper merkle tree for ZK proofs.
//! Uses a simplified Poseidon-like hash for demo (replace with light-poseidon for production).

use std::collections::HashMap;

/// Tree depth (supports 2^8 = 256 recipients)
pub const TREE_DEPTH: usize = 8;

/// Maximum number of leaves
pub const MAX_LEAVES: usize = 1 << TREE_DEPTH;

/// A 32-byte hash value
pub type Hash = [u8; 32];

/// Merkle tree structure
#[derive(Debug, Clone)]
pub struct MerkleTree {
    /// All nodes in the tree (bottom-up, left-to-right per level)
    nodes: Vec<Hash>,
    #[allow(dead_code)]
    leaf_count: usize,
    /// Leaf index by recipient wallet
    leaf_indices: HashMap<String, usize>,
}

/// Merkle proof for a single leaf
#[derive(Debug, Clone)]
pub struct MerkleProof {
    pub leaf_index: usize,
    pub siblings: Vec<Hash>,
    pub leaf: Hash,
}

impl MerkleTree {
    /// Build a merkle tree from recipient list
    pub fn from_recipients(recipients: &[(String, u64, [u8; 32])]) -> Self {
        let leaf_count = recipients.len();
        assert!(leaf_count <= MAX_LEAVES, "Too many recipients");
        
        // Compute leaves: hash(recipient, amount, secret)
        let mut leaves: Vec<Hash> = recipients
            .iter()
            .map(|(wallet, amount, secret)| {
                compute_leaf_hash(wallet, *amount, secret)
            })
            .collect();
        
        // Pad to power of 2
        let padded_size = (1 << TREE_DEPTH) as usize;
        while leaves.len() < padded_size {
            leaves.push([0u8; 32]); // Empty leaf
        }
        
        // Build leaf index map
        let mut leaf_indices = HashMap::new();
        for (i, (wallet, _, _)) in recipients.iter().enumerate() {
            leaf_indices.insert(wallet.clone(), i);
        }
        
        // Build tree bottom-up
        let mut nodes = leaves.clone();
        let mut current_level = leaves;
        
        for _ in 0..TREE_DEPTH {
            let mut next_level = Vec::new();
            for chunk in current_level.chunks(2) {
                let parent = hash_pair(&chunk[0], &chunk[1]);
                next_level.push(parent);
                nodes.push(parent);
            }
            current_level = next_level;
        }
        
        Self {
            nodes,
            leaf_count,
            leaf_indices,
        }
    }
    
    /// Get the merkle root
    pub fn root(&self) -> Hash {
        *self.nodes.last().unwrap_or(&[0u8; 32])
    }
    
    /// Get proof for a wallet
    pub fn get_proof(&self, wallet: &str) -> Option<MerkleProof> {
        let leaf_index = *self.leaf_indices.get(wallet)?;
        let leaf = self.nodes[leaf_index];
        
        let mut siblings = Vec::new();
        let mut idx = leaf_index;
        let mut level_start = 0;
        let mut level_size = 1 << TREE_DEPTH;
        
        for _ in 0..TREE_DEPTH {
            let sibling_idx = if idx % 2 == 0 { idx + 1 } else { idx - 1 };
            siblings.push(self.nodes[level_start + sibling_idx]);
            
            level_start += level_size;
            level_size /= 2;
            idx /= 2;
        }
        
        Some(MerkleProof {
            leaf_index,
            siblings,
            leaf,
        })
    }
    
    /// Get leaf index for a wallet
    pub fn get_leaf_index(&self, wallet: &str) -> Option<usize> {
        self.leaf_indices.get(wallet).copied()
    }
}

use ark_bn254::Fr;
use ark_ff::{PrimeField, BigInteger};
use taceo_poseidon2::bn254::t4 as poseidon2;

/// Compute leaf hash: hash(recipient, amount, secret)
/// Matches Noir circuit expectations: poseidon(recipient, amount, secret)
pub fn compute_leaf_hash(wallet: &str, amount: u64, secret: &[u8; 32]) -> Hash {
    // 1. Recipient (Wallet) -> Field Element
    // Must match `wallet_to_field` in zk_proofs.rs:
    // Decode Base58, take first 31 bytes, pad to 32 bytes (BE)
    let mut wallet_bytes = [0u8; 32];
    if let Ok(decoded) = bs58::decode(wallet).into_vec() {
         let len = decoded.len().min(31);
         // Place at the end for proper BE integer representation (if we view it as a number)
         wallet_bytes[32 - len..].copy_from_slice(&decoded[..len]);
    } else {
        // Fallback for tests/non-base58 (like "wallet1")
        // Just use bytes, fit at end
        let w_bytes = wallet.as_bytes();
        let len = w_bytes.len().min(31);
        wallet_bytes[32 - len..].copy_from_slice(&w_bytes[..len]);
    }

    // 2. Amount -> Field Element
    // Use raw u64 directly (already in correct units)
    let amount_lamports = amount;
    // To read as correct integer in BE, put bytes at end.
    let mut amount_arr = [0u8; 32];
    amount_arr[24..32].copy_from_slice(&amount_lamports.to_be_bytes());

    // 3. Secret is already [u8; 32], assuming it's random bytes valid for field.
    // If secret >= Modulus, from_be_bytes will modulo it. That's fine for a secret.

    // Poseidon hash 3 inputs
    poseidon_hash_3(&wallet_bytes, &amount_arr, secret)
}

/// Compute nullifier: hash(secret, leaf_index)
pub fn compute_nullifier(secret: &[u8; 32], leaf_index: usize) -> Hash {
    // Leaf index -> Field Element
    let index_u64 = leaf_index as u64;
    let mut index_arr = [0u8; 32];
    index_arr[24..32].copy_from_slice(&index_u64.to_be_bytes());

    poseidon_hash_2(secret, &index_arr)
}

/// Hash two nodes together
fn hash_pair(left: &Hash, right: &Hash) -> Hash {
    poseidon_hash_2(left, right)
}

/// Poseidon2 sponge hash for 2 inputs (BN254)
/// Matches Noir's Poseidon2::hash([a, b], 2)
/// 
/// Noir stdlib sponge construction:
/// - Initial state: [0, 0, 0, iv] where iv = message_length * 2^64
/// - Absorb inputs by adding to state[0..n]
/// - Permute and squeeze state[0]
fn poseidon_hash_2(a: &[u8; 32], b: &[u8; 32]) -> Hash {
    let a_field = bytes_to_field_element(a);
    let b_field = bytes_to_field_element(b);
    
    // iv = 2 * 2^64 = 36893488147419103232
    let two_pow_64 = Fr::from(18446744073709551616u128);
    let iv = Fr::from(2u64) * two_pow_64;
    
    // State after absorbing 2 inputs: [a, b, 0, iv]
    let mut state = [a_field, b_field, Fr::from(0u64), iv];
    
    // Apply permutation
    poseidon2::permutation_in_place(&mut state);
    
    // Output is state[0]
    field_element_to_bytes(state[0])
}

/// Poseidon2 sponge hash for 3 inputs (BN254)
/// Matches Noir's Poseidon2::hash([a, b, c], 3)
fn poseidon_hash_3(a: &[u8; 32], b: &[u8; 32], c: &[u8; 32]) -> Hash {
    let a_field = bytes_to_field_element(a);
    let b_field = bytes_to_field_element(b);
    let c_field = bytes_to_field_element(c);
    
    // iv = 3 * 2^64 = 55340232221128654848
    let two_pow_64 = Fr::from(18446744073709551616u128);
    let iv = Fr::from(3u64) * two_pow_64;
    
    // State after absorbing 3 inputs: [a, b, c, iv]
    let mut state = [a_field, b_field, c_field, iv];
    
    // Apply permutation
    poseidon2::permutation_in_place(&mut state);
    
    // Output is state[0]
    field_element_to_bytes(state[0])
}

// Helpers for light-poseidon conversion
// Use Big Endian to match Prover.toml hex strings (0x...)

fn bytes_to_field_element(bytes: &[u8; 32]) -> Fr {
    Fr::from_be_bytes_mod_order(bytes)
}

fn field_element_to_bytes(field: Fr) -> [u8; 32] {
    let bigint = field.into_bigint();
    let mut bytes = [0u8; 32];
    // Use Big Endian bytes
    bytes.copy_from_slice(&bigint.to_bytes_be());
    bytes
}

/// Generate a random secret for a recipient
/// Returns bytes that represent a valid BN254 field element (< modulus)
pub fn generate_secret() -> [u8; 32] {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    
    // Generate random-ish bytes
    let mut random_bytes = [0u8; 32];
    for (i, chunk) in random_bytes.chunks_mut(8).enumerate() {
        let val = now.wrapping_add(i as u128).to_le_bytes();
        chunk.copy_from_slice(&val[0..8]);
    }
    
    // Convert to field element (reduces mod field order) then back to bytes
    // This ensures the value is always < BN254 field modulus
    let field_element = Fr::from_be_bytes_mod_order(&random_bytes);
    field_element_to_bytes(field_element)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_merkle_tree_basic() {
        let secret1 = generate_secret();
        let secret2 = generate_secret();
        
        let recipients = vec![
            ("wallet1".to_string(), 1, secret1),
            ("wallet2".to_string(), 2, secret2),
        ];
        
        let tree = MerkleTree::from_recipients(&recipients);
        
        // Root should be non-zero
        let root = tree.root();
        assert_ne!(root, [0u8; 32]);
        
        // Should get proof for wallet1
        let proof = tree.get_proof("wallet1");
        assert!(proof.is_some());
        
        let proof = proof.unwrap();
        assert_eq!(proof.leaf_index, 0);
        assert_eq!(proof.siblings.len(), TREE_DEPTH);
    }
    
    #[test]
    fn test_nullifier_uniqueness() {
        let secret = generate_secret();
        
        let null1 = compute_nullifier(&secret, 0);
        let null2 = compute_nullifier(&secret, 1);
        
        assert_ne!(null1, null2);
    }
}
