import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { blockchain, block, transaction } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { calculateBlockHash, isValidHash } from '$lib/utils/crypto.js';

// GET /api/blockchain/[id]/blocks - Get all blocks for a blockchain
export async function GET({ params }) {
  try {
    const { id } = params;
    
    // Get the blockchain from the database
    const blockchains = await db.select().from(blockchain).where(eq(blockchain.id, id));
    
    // Check if the blockchain exists
    if (blockchains.length === 0) {
      return json({ error: 'Blockchain not found' }, { status: 404 });
    }
    
    // Get all blocks for the blockchain
    const blocks = await db.select().from(block).where(eq(block.blockchainId, id));
    
    // Get all transactions for the blocks
    const transactions = await db.select().from(transaction).where(eq(transaction.blockchainId, id));
    
    // Group transactions by block
    const blockTransactions = {};
    for (const tx of transactions) {
      if (tx.blockId) {
        if (!blockTransactions[tx.blockId]) {
          blockTransactions[tx.blockId] = [];
        }
        blockTransactions[tx.blockId].push(tx);
      }
    }
    
    // Add transactions to blocks
    const blocksWithTransactions = blocks.map(b => ({
      ...b,
      transactions: blockTransactions[b.id] || []
    }));
    
    return json(blocksWithTransactions);
  } catch (error) {
    console.error('Error fetching blocks:', error);
    return json({ error: 'Failed to fetch blocks' }, { status: 500 });
  }
}

// POST /api/blockchain/[id]/blocks - Create a new block
export async function POST({ params, request }) {
  try {
    const { id } = params;
    const data = await request.json();
    
    // Validate required fields
    if (!data.minerId) {
      return json({ error: 'Miner ID is required' }, { status: 400 });
    }
    
    if (!data.nonce && data.nonce !== 0) {
      return json({ error: 'Nonce is required' }, { status: 400 });
    }
    
    // Get the blockchain from the database
    const blockchains = await db.select().from(blockchain).where(eq(blockchain.id, id));
    
    // Check if the blockchain exists
    if (blockchains.length === 0) {
      return json({ error: 'Blockchain not found' }, { status: 404 });
    }
    
    const currentBlockchain = blockchains[0];
    
    // Get the latest block
    const blocks = await db.select()
      .from(block)
      .where(eq(block.blockchainId, id))
      .orderBy(block.minedAt, 'desc')
      .limit(1);
    
    const previousBlock = blocks.length > 0 ? blocks[0] : null;
    const previousHash = previousBlock ? previousBlock.hash : '0000000000000000000000000000000000000000000000000000000000000000';
    
    // Get transactions from mempool
    const mempoolTransactions = await db.select()
      .from(transaction)
      .where(
        and(
          eq(transaction.blockchainId, id),
          eq(transaction.inMempool, true)
        )
      );
    
    // Filter transactions to include in the block
    const transactionIds = data.transactionIds || [];
    const includedTransactions = mempoolTransactions.filter(tx => 
      transactionIds.includes(tx.id)
    );
    
    // Create a new block
    const timestamp = Date.now();
    const newBlock = {
      id: crypto.randomUUID(),
      blockchainId: id,
      previousHash,
      minerId: data.minerId,
      nonce: data.nonce,
      minedAt: timestamp,
      hash: '' // Will be calculated
    };
    
    // Calculate the hash
    const hash = calculateBlockHash(
      { ...newBlock, minedAt: timestamp },
      includedTransactions
    );
    
    // Validate the hash
    if (!isValidHash(hash, currentBlockchain.leadingZeros)) {
      return json({ error: 'Invalid hash' }, { status: 400 });
    }
    
    // Set the hash
    newBlock.hash = hash;
    
    // Insert the block into the database
    await db.insert(block).values(newBlock);
    
    // Update transactions to include them in the block
    for (const tx of includedTransactions) {
      await db.update(transaction)
        .set({
          blockId: newBlock.id,
          inMempool: false
        })
        .where(eq(transaction.id, tx.id));
    }
    
    // Return the new block with transactions
    return json({
      ...newBlock,
      transactions: includedTransactions
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating block:', error);
    return json({ error: 'Failed to create block' }, { status: 500 });
  }
}
