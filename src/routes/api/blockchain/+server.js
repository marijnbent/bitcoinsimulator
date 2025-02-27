import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { blockchain, user, block, transaction } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { generateKeyPair, nameToUsername, calculateBlockHash } from '$lib/utils/crypto.js';

// GET /api/blockchain - Get all blockchains
export async function GET() {
  try {
    const blockchains = await db.select().from(blockchain);
    
    // Check if we have a public blockchain
    const publicBlockchain = blockchains.find(b => b.name === 'Public');
    
    // If no public blockchain exists, create one
    if (!publicBlockchain) {
      const newPublicBlockchain = await createBlockchain({
        name: 'Public',
        leadingZeros: 8,
        blockReward: 3.125
      });
      
      blockchains.push(newPublicBlockchain);
    }
    
    return json(blockchains);
  } catch (error) {
    console.error('Error fetching blockchains:', error);
    return json({ error: 'Failed to fetch blockchains' }, { status: 500 });
  }
}

// POST /api/blockchain - Create a new blockchain
export async function POST({ request }) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.name) {
      return json({ error: 'Name is required' }, { status: 400 });
    }
    
    // Create a new blockchain with Genesis block and Satoshi user
    const newBlockchain = await createBlockchain({
      name: data.name,
      leadingZeros: data.leadingZeros || 10,
      blockReward: data.blockReward || 3.125
    });
    
    return json(newBlockchain, { status: 201 });
  } catch (error) {
    console.error('Error creating blockchain:', error);
    return json({ error: 'Failed to create blockchain' }, { status: 500 });
  }
}

// Helper function to create a blockchain with Genesis block and Satoshi user
async function createBlockchain(data) {
  // Create a new blockchain
  const newBlockchain = {
    id: crypto.randomUUID(),
    name: data.name,
    leadingZeros: data.leadingZeros || 10,
    blockReward: data.blockReward || 3.125,
    createdAt: Date.now()
  };
  
  // Insert the blockchain into the database
  await db.insert(blockchain).values(newBlockchain);
  
  // Create Satoshi user
  const { publicKey, privateKey } = generateKeyPair();
  const satoshiUser = {
    id: crypto.randomUUID(),
    name: 'Satoshi Nakamoto',
    username: 'satoshi',
    publicKey,
    privateKey,
    blockchainId: newBlockchain.id
  };
  
  // Insert Satoshi user into the database
  await db.insert(user).values(satoshiUser);
  
  // Create Genesis block
  const genesisBlock = {
    id: crypto.randomUUID(),
    blockchainId: newBlockchain.id,
    previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
    minerId: satoshiUser.id,
    nonce: 0,
    minedAt: Date.now(),
    hash: '' // Will be calculated
  };
  
  // Calculate hash for Genesis block
  genesisBlock.hash = calculateBlockHash(genesisBlock, []);
  
  // Insert Genesis block into the database
  await db.insert(block).values(genesisBlock);
  
  // Create coinbase transaction for Genesis block (block reward of 10 BTC)
  const coinbaseTransaction = {
    id: crypto.randomUUID(),
    blockchainId: newBlockchain.id,
    blockId: genesisBlock.id,
    senderId: null, // Coinbase transaction has no sender
    recipientId: satoshiUser.id,
    amount: 10, // Genesis block reward is 10 BTC
    createdAt: Date.now(),
    inMempool: false
  };
  
  // Insert coinbase transaction into the database
  await db.insert(transaction).values(coinbaseTransaction);
  
  return newBlockchain;
}
