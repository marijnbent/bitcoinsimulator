/**
 * Utility functions for cryptographic operations in the Bitcoin simulator
 */

import { sha256 as jsSha256 } from 'js-sha256';

// SHA-256 hash function
export function sha256(data) {
  return jsSha256(JSON.stringify(data));
}

// Calculate hash for a block
export function calculateBlockHash(block, transactions) {
  return sha256({
    index: block.id,
    previousHash: block.previousHash,
    timestamp: block.minedAt,
    transactions,
    nonce: block.nonce
  });
}

// Generate a key pair
export function generateKeyPair() {
  // For educational purposes, we'll use a simplified approach
  const privateKey = crypto.randomUUID();
  const publicKey = sha256(privateKey);
  return { privateKey, publicKey };
}

// Validate a block hash has required leading zeros
export function isValidHash(hash, leadingZeros) {
  const prefix = '0'.repeat(leadingZeros);
  return hash.startsWith(prefix);
}

// Convert a name to a username (lowercase, spaces to underscores)
export function nameToUsername(name) {
  return name.toLowerCase().replace(/\s+/g, '_');
}
