// Shadow Drop - Merkle Claim Circuit
// This circuit proves that a user knows a valid leaf in a merkle tree
// without revealing which leaf they are claiming

use std::hash::poseidon2;

// Merkle tree depth (supports up to 2^20 = 1M recipients)
global TREE_DEPTH: u32 = 20;

// Main circuit for proving airdrop claim eligibility
fn main(
    // Public inputs
    merkle_root: pub Field,          // The merkle root stored on-chain
    nullifier_hash: pub Field,       // Prevents double claiming
    recipient_address: pub Field,    // Where tokens should be sent
    
    // Private inputs  
    amount: Field,                   // Claim amount (hidden)
    secret: Field,                   // User's secret (for nullifier)
    leaf_index: Field,               // Position in merkle tree
    merkle_path: [Field; TREE_DEPTH] // Siblings for merkle proof
) {
    // 1. Compute the leaf hash: hash(address, amount, secret)
    let leaf = poseidon2::Poseidon2::hash([recipient_address, amount, secret], 3);
    
    // 2. Verify merkle proof
    let computed_root = compute_merkle_root(leaf, leaf_index, merkle_path);
    assert(computed_root == merkle_root, "Invalid merkle proof");
    
    // 3. Verify nullifier to prevent double claiming
    // nullifier = hash(secret, leaf_index) - unique per claim
    let computed_nullifier = poseidon2::Poseidon2::hash([secret, leaf_index], 2);
    assert(computed_nullifier == nullifier_hash, "Invalid nullifier");
}

// Compute merkle root from leaf and proof path
fn compute_merkle_root(
    leaf: Field,
    index: Field,
    path: [Field; TREE_DEPTH]
) -> Field {
    let mut current = leaf;
    let mut idx = index;
    
    for i in 0..TREE_DEPTH {
        let sibling = path[i];
        let is_right = idx as u64 % 2;
        
        if is_right == 1 {
            // Current node is on the right, sibling is on left
            current = poseidon2::Poseidon2::hash([sibling, current], 2);
        } else {
            // Current node is on the left, sibling is on right
            current = poseidon2::Poseidon2::hash([current, sibling], 2);
        }
        
        idx = (idx as u64 / 2) as Field;
    }
    
    current
}

// Test the circuit with sample data
#[test]
fn test_merkle_claim() {
    // This would be populated with actual test data
    let merkle_root = 0x1234;
    let nullifier_hash = 0x5678;
    let recipient = 0xabcd;
    let amount = 1000;
    let secret = 0x9999;
    let leaf_index = 0;
    let merkle_path = [0; TREE_DEPTH];
    
    // Note: This test will fail with dummy data
    // Real tests need proper merkle tree construction
}
