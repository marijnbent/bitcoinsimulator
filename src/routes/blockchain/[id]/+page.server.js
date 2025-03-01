import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { blockchain, block, transaction, user } from '$lib/server/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';

export async function load({ params }) {
	try {
		const { id } = params;
		
		// Get the blockchain
		const blockchains = await db.select().from(blockchain).where(eq(blockchain.id, id));
		
		if (blockchains.length === 0) {
			throw error(404, 'Blockchain not found');
		}
		
		// Get all blocks for the blockchain
		const blocks = await db.select().from(block).where(eq(block.blockchainId, id));

		// Get all transactions for the blockchain
		const transactions = await db.select()
			.from(transaction)
			.where(eq(transaction.blockchainId, id))
			.orderBy(desc(transaction.createdAt));
		
		// Get all users for the blockchain
		const users = await db.select({
			id: user.id,
			name: user.name,
			username: user.username,
			publicKey: user.publicKey,
			blockchainId: user.blockchainId
		}).from(user).where(eq(user.blockchainId, id));

		// Get mempool transactions for this blockchain only
		const mempool = transactions.filter(tx => tx.blockId === null);

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
		
		// Create a map of user IDs to usernames
		const userMap = {};
		for (const u of users) {
			userMap[u.id] = u.username;
		}
		
		// Add transactions and usernames to blocks
		const blocksWithTransactions = blocks.map(b => ({
			...b,
			minerUsername: b.minerId ? userMap[b.minerId] : null,
			transactions: (blockTransactions[b.id] || []).map(tx => ({
				...tx,
				senderUsername: tx.senderId ? userMap[tx.senderId] : null,
				recipientUsername: tx.recipientId ? userMap[tx.recipientId] : null
			}))
		}));
		
		// Add usernames to mempool transactions
		const mempoolWithUsernames = mempool.map(tx => ({
			...tx,
			senderUsername: tx.senderId ? userMap[tx.senderId] : null,
			recipientUsername: tx.recipientId ? userMap[tx.recipientId] : null
		}));
		
		return {
			blockchain: blockchains[0],
			blocks: blocksWithTransactions,
			mempool: mempoolWithUsernames,
			users
		};
	} catch (err) {
		console.error('Error loading blockchain data:', err);
		throw error(500, err.message);
	}
}
