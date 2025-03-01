import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const blockchain = sqliteTable('blockchain', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	leadingZeros: integer('leading_zeros').notNull().default(10),
	blockReward: real('block_reward').notNull().default(3.125),
	createdAt: integer('created_at').notNull()
});

export const block = sqliteTable('block', {
	id: text('id').primaryKey(),
	blockchainId: text('blockchain_id').notNull().references(() => blockchain.id),
	hash: text('hash').notNull(),
	previousHash: text('previous_hash'),
	minerId: text('miner_id').references(() => user.id),
	nonce: integer('nonce').notNull(),
	minedAt: integer('mined_at').notNull(),
	height: integer('height') // Block height (0 for genesis, increments for each block in the chain)
});

export const transaction = sqliteTable('transaction', {
	id: text('id').primaryKey(),
	blockchainId: text('blockchain_id').notNull().references(() => blockchain.id),
	blockId: text('block_id').references(() => block.id),
	senderId: text('sender_id').references(() => user.id),
	recipientId: text('recipient_id').references(() => user.id),
	amount: real('amount').notNull(),
	createdAt: integer('created_at').notNull(),
});

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	username: text('username').notNull(),
	publicKey: text('public_key').notNull(),
	privateKey: text('private_key').notNull(),
	blockchainId: text('blockchain_id').references(() => blockchain.id)
});
