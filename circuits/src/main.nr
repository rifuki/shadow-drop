// Shadow Drop - Merkle Claim Circuit
// Uses Poseidon hashing for ZK-friendly merkle proofs
// Compatible with Sunspot for Solana on-chain verification

use poseidon::poseidon2::Poseidon2;

// Merkle tree depth (supports up to 2^8 = 256 recipients for demo)
// Can increase for production
global TREE_DEPTH: u32 = 8;

// Main circuit for proving airdrop claim eligibility
// Proves: "I know a valid leaf in the merkle tree for this recipient"
fn main(
    // Public inputs (visible on-chain)
    merkle_root: pub Field,          // The merkle root stored on-chain
    nullifier_hash: pub Field,       // Prevents double claiming
    recipient: pub Field,            // Recipient address (as field)

    // Private inputs (hidden, only prover knows)
    amount: Field,                   // Claim amount
    secret: Field,                   // User's secret for nullifier
    leaf_index: Field,               // Position in merkle tree (0 to 2^depth - 1)
    merkle_path: [Field; TREE_DEPTH] // Sibling hashes for merkle proof
) {
    // 1. Compute the leaf hash: hash(recipient, amount, secret)
    let leaf = Poseidon2::hash([recipient, amount, secret], 3);

    // 2. Verify merkle proof - compute root from leaf and path
    let computed_root = compute_merkle_root(leaf, leaf_index, merkle_path);
    assert(computed_root == merkle_root, "Invalid merkle proof");

    // 3. Verify nullifier - hash(secret, leaf_index) must match
    // This prevents double claiming while maintaining privacy
    let computed_nullifier = Poseidon2::hash([secret, leaf_index], 2);
    assert(computed_nullifier == nullifier_hash, "Invalid nullifier");
}

// Compute merkle root from leaf and proof path
fn compute_merkle_root(
    leaf: Field,
    index: Field,
    path: [Field; TREE_DEPTH]
) -> Field {
    let mut current = leaf;
    let mut idx = index as u64;

    for i in 0..TREE_DEPTH {
        let sibling = path[i];
        let is_right = idx % 2;

        // Hash order depends on position (left or right child)
        if is_right == 1 {
            // Current is right child, sibling is left
            current = Poseidon2::hash([sibling, current], 2);
        } else {
            // Current is left child, sibling is right
            current = Poseidon2::hash([current, sibling], 2);
        }

        idx = idx / 2;
    }

    current
}

// Helper to compute leaf hash (can be used for testing)
fn compute_leaf(recipient: Field, amount: Field, secret: Field) -> Field {
    Poseidon2::hash([recipient, amount, secret], 3)
}

// Helper to compute nullifier (can be used for testing)
fn compute_nullifier(secret: Field, leaf_index: Field) -> Field {
    Poseidon2::hash([secret, leaf_index], 2)
}

#[test]
fn test_leaf_computation() {
    let recipient = 0x1234;
    let amount = 1000;
    let secret = 0x9999;

    let leaf = compute_leaf(recipient, amount, secret);
    // Just verify it doesn't panic
    assert(leaf != 0);
}

#[test]
fn test_nullifier_computation() {
    let secret = 0x9999;
    let leaf_index = 5;

    let nullifier = compute_nullifier(secret, leaf_index);
    // Same inputs should produce same nullifier
    let nullifier2 = compute_nullifier(secret, leaf_index);
    assert(nullifier == nullifier2);

    // Different index should produce different nullifier
    let nullifier3 = compute_nullifier(secret, 6);
    assert(nullifier != nullifier3);
}

