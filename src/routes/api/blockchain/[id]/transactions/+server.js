import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { blockchain, transaction, user } from '$lib/server/db/schema';
import { eq, and, isNull, inArray, desc } from 'drizzle-orm';

// GET /api/blockchain/[id]/transactions - Get all transactions for a blockchain
export async function GET({ params, url }) {
  try {
    const { id } = params;
    const mempoolOnly = url.searchParams.get('mempool') === 'true';

    // Get the blockchain from the database
    const blockchains = await db.select().from(blockchain).where(eq(blockchain.id, id));

    // Check if the blockchain exists
    if (blockchains.length === 0) {
      return json({ error: 'Blockchain not found' }, { status: 404 });
    }

    let transactions = await db.select().from(transaction).where(eq(transaction.blockchainId, id)).orderBy(desc(transaction.createdAt));


    // Get all transactions for the blockchain
    if (mempoolOnly) {
      transactions = transactions.filter(tx => tx.blockId === null);
    }

    // Get all users for the transactions
    const userIds = new Set();
    for (const tx of transactions) {
      if (tx.senderId) userIds.add(tx.senderId);
      if (tx.recipientId) userIds.add(tx.recipientId);
    }

    const users = await db.select().from(user).where(
      userIds.size > 0
        ? inArray(user.id, [...userIds])
        : undefined
    );

    // Create a map of user IDs to usernames
    const userMap = {};
    for (const u of users) {
      userMap[u.id] = u.username;
    }

    // Add usernames to transactions
    const transactionsWithUsernames = transactions.map(tx => ({
      ...tx,
      senderUsername: tx.senderId ? userMap[tx.senderId] : null,
      recipientUsername: tx.recipientId ? userMap[tx.recipientId] : null
    }));

    return json(transactionsWithUsernames);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}

// POST /api/blockchain/[id]/transactions - Create a new transaction
export async function POST({ params, request }) {
  try {
    const { id } = params;
    const data = await request.json();

    // Validate required fields
    if (!data.senderId) {
      return json({ error: 'Sender ID is required' }, { status: 400 });
    }

    if (!data.recipientId) {
      return json({ error: 'Recipient ID is required' }, { status: 400 });
    }

    if (!data.amount || data.amount <= 0) {
      return json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    if (typeof data.senderId !== 'string') {
      return json({ error: 'Sender ID must be a string' }, { status: 400 });
    }

    if (typeof data.recipientId !== 'string') {
      return json({ error: 'Recipient ID must be a string' }, { status: 400 });
    }

    if (typeof data.amount !== 'number') {
      return json({ error: 'Amount must be a number' }, { status: 400 });
    }
    
    // Get the blockchain from the database
    const blockchains = await db.select().from(blockchain).where(eq(blockchain.id, id));

    // Check if the blockchain exists
    if (blockchains.length === 0) {
      return json({ error: 'Blockchain not found' }, { status: 404 });
    }

    // Get the sender
    const senders = await db.select().from(user).where(eq(user.id, data.senderId));

    // Check if the sender exists
    if (senders.length === 0) {
      return json({ error: 'Sender not found' }, { status: 404 });
    }

    // Get the recipient
    const recipients = await db.select().from(user).where(eq(user.id, data.recipientId));

    // Check if the recipient exists
    if (recipients.length === 0) {
      return json({ error: 'Recipient not found' }, { status: 404 });
    }

    // Create a new transaction
    const newTransaction = {
      id: crypto.randomUUID(),
      blockchainId: id,
      senderId: data.senderId,
      recipientId: data.recipientId,
      amount: data.amount,
      createdAt: Date.now()
    };

    // Insert the transaction into the database
    await db.insert(transaction).values(newTransaction);

    // Return the new transaction with usernames
    return json({
      ...newTransaction,
      senderUsername: senders[0].username,
      recipientUsername: recipients[0].username
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating transaction:', error);
    return json({ error: 'Failed to create transaction' }, { status: 500 });
  }
}
