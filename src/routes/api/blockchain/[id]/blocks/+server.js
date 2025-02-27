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
    console.log('Received data:', data);

    // Validate required fields
    if (!data.minerId) {
      console.log('Error: Miner ID is required');
      return json({ error: 'Miner ID is required' }, { status: 400 });
    }

    if (!data.nonce && data.nonce !== 0) {
      console.log('Error: Nonce is required');
      return json({ error: 'Nonce is required' }, { status: 400 });
    }

    // Get the blockchain from the database
    const blockchains = await db.select().from(blockchain).where(eq(blockchain.id, id));

    // Check if the blockchain exists
    if (blockchains.length === 0) {
      return json({ error: 'Blockchain not found' }, { status: 404 });
    }

    const currentBlockchain = blockchains[0];

     // Validate the hash (only if there are transactions)
     if (!isValidHash(data.hash, currentBlockchain.leadingZeros)) {
      return json({ error: 'Invalid hash' }, { status: 400 });
    }

    // Get the latest block
    const blocks = await db.select()
      .from(block)
      .where(eq(block.blockchainId, id))
      .orderBy(block.minedAt, 'desc')
      .limit(1);

    // Find the block with matching hash to data.previousHash
    const previousBlock = await db.select()
      .from(block)
      .where(
        and(
          eq(block.blockchainId, id),
          eq(block.hash, data.previousHash)
        )
      )
      .limit(1);

    if (previousBlock.length === 0) {
      return json({ error: 'Previous block not found' }, { status: 400 });
    }

    const previousHash = previousBlock[0].hash;
    
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
    console.log('Transaction IDs:', transactionIds);

    const includedTransactions = mempoolTransactions.filter(tx => {
      const include = transactionIds.includes(tx.id);
      console.log(`Transaction ${tx.id} included: ${include}`);
      return include;
    });

    // Create a new block
    const timestamp = Date.now();
    const newBlock = {
      id: crypto.randomUUID(),
      blockchainId: id,
      previousHash,
      minerId: data.minerId,
      nonce: data.nonce,
      minedAt: timestamp,
      hash: data.hash
    };

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
