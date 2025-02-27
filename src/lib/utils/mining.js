/**
 * Utility functions for mining operations in the Bitcoin simulator
 */

import { calculateBlockHash, isValidHash } from './crypto.js';

// Mine a block with the given transactions and difficulty
export async function mineBlock(block, transactions, leadingZeros) {
  let nonce = 0;
  let hash = '';
  
  while (true) {
    // Create a temporary block with the current nonce
    const tempBlock = {
      ...block,
      nonce
    };
    
    // Calculate the hash
    hash = calculateBlockHash(tempBlock, transactions);
    
    // Check if the hash is valid
    if (isValidHash(hash, leadingZeros)) {
      break;
    }
    
    // Increment the nonce
    nonce++;
    
    // Allow UI updates every 100 attempts
    if (nonce % 100 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  return { hash, nonce };
}

// Calculate the balance for a user in a blockchain
export function calculateBalance(userId, blocks, blockReward) {
  let balance = 0;
  
  // Process all blocks
  for (const block of blocks) {
    // Add block rewards for blocks mined by this user
    if (block.minerId === userId) {
      balance += blockReward;
    }
    
    // Process all transactions in this block
    for (const tx of block.transactions || []) {
      // Subtract amounts sent by this user
      if (tx.senderId === userId) {
        balance -= tx.amount;
      }
      
      // Add amounts received by this user
      if (tx.recipientId === userId) {
        balance += tx.amount;
      }
    }
  }
  
  return balance;
}

// Get all transactions for a user (sent or received)
export function getUserTransactions(userId, blocks) {
  const transactions = [];
  
  // Process all blocks
  for (const block of blocks) {
    // Process all transactions in this block
    for (const tx of block.transactions || []) {
      // Include transactions where this user is sender or recipient
      if (tx.senderId === userId || tx.recipientId === userId) {
        transactions.push({
          ...tx,
          block
        });
      }
    }
  }
  
  return transactions;
}
