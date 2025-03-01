import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { blockchain, block, transaction, user } from '$lib/server/db/schema';
import { eq, and, gt, isNull, desc } from 'drizzle-orm';

// GET /api/blockchain/[id]/updates - Get updates for a blockchain
export async function GET({ params, url }) {
  try {
    const { id } = params;
    const lastUpdate = parseInt(url.searchParams.get('lastUpdate') || '0');
    
    // Get the blockchain from the database
    const blockchains = await db.select().from(blockchain).where(eq(blockchain.id, id));
    
    // Check if the blockchain exists
    if (blockchains.length === 0) {
      return json({ error: 'Blockchain not found' }, { status: 404 });
    }
    
    // Get new blocks since last update
    const blocks = await db.select()
      .from(block)
      .where(
        and(
          eq(block.blockchainId, id),
          gt(block.minedAt, lastUpdate)
        )
      );
    
    // Get new transactions since last update
    const transactions = await db.select()
      .from(transaction)
      .where(
        and(
          eq(transaction.blockchainId, id),
          gt(transaction.createdAt, lastUpdate)
        )
      );
    
    // Get mempool transactions
    const mempoolTransactions = await db.select()
      .from(transaction)
      .where(
        and(
          eq(transaction.blockchainId, id),
          isNull(transaction.blockId)
        )
      )
      .orderBy(desc(transaction.createdAt));
    
    // Get all users for the transactions
    const userIds = new Set();
    for (const tx of [...transactions, ...mempoolTransactions]) {
      if (tx.senderId) userIds.add(tx.senderId);
      if (tx.recipientId) userIds.add(tx.recipientId);
    }
    
    for (const b of blocks) {
      if (b.minerId) userIds.add(b.minerId);
    }
    
    let users = [];
    if (userIds.size > 0) {
      // Fetch users one by one since we can't use .in() operator
      for (const userId of userIds) {
        const userResults = await db.select().from(user).where(eq(user.id, userId));
        if (userResults.length > 0) {
          users.push(userResults[0]);
        }
      }
    }
    
    // Create a map of user IDs to usernames
    const userMap = {};
    for (const u of users) {
      userMap[u.id] = u.username;
    }
    
    // Group transactions by block
    const blockTransactions = {};
    for (const tx of transactions) {
      if (tx.blockId) {
        if (!blockTransactions[tx.blockId]) {
          blockTransactions[tx.blockId] = [];
        }
        blockTransactions[tx.blockId].push({
          ...tx,
          senderUsername: tx.senderId ? userMap[tx.senderId] : null,
          recipientUsername: tx.recipientId ? userMap[tx.recipientId] : null
        });
      }
    }
    
    // Add transactions to blocks and miner username
    const blocksWithTransactions = blocks.map(b => ({
      ...b,
      minerUsername: b.minerId ? userMap[b.minerId] : null,
      transactions: blockTransactions[b.id] || []
    }));
    
    // Calculate the highest block height for confirmation counts
    const maxHeight = blocks.reduce((max, b) => {
      return (b.height !== undefined && b.height !== null && b.height > max) ? b.height : max;
    }, 0);
    
    // Add usernames to mempool transactions
    const mempoolWithUsernames = mempoolTransactions.map(tx => ({
      ...tx,
      senderUsername: tx.senderId ? userMap[tx.senderId] : null,
      recipientUsername: tx.recipientId ? userMap[tx.recipientId] : null
    }));
    
    return json({
      blocks: blocksWithTransactions,
      transactions: transactions.map(tx => ({
        ...tx,
        senderUsername: tx.senderId ? userMap[tx.senderId] : null,
        recipientUsername: tx.recipientId ? userMap[tx.recipientId] : null
      })),
      mempool: mempoolWithUsernames,
      maxHeight, // Include the max height for confirmation calculations
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error fetching updates:', error);
    return json({ error: 'Failed to fetch updates' }, { status: 500 });
  }
}
