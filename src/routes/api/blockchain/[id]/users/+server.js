import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { blockchain, user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { generateKeyPair, nameToUsername } from '$lib/utils/crypto.js';

// GET /api/blockchain/[id]/users - Get all users for a blockchain
export async function GET({ params }) {
  try {
    const { id } = params;
    
    // Get the blockchain from the database
    const blockchains = await db.select().from(blockchain).where(eq(blockchain.id, id));
    
    // Check if the blockchain exists
    if (blockchains.length === 0) {
      return json({ error: 'Blockchain not found' }, { status: 404 });
    }
    
    // Get all users for the blockchain
    const users = await db.select({
      id: user.id,
      name: user.name,
      username: user.username,
      publicKey: user.publicKey,
      blockchainId: user.blockchainId
    }).from(user).where(eq(user.blockchainId, id));
    
    return json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

// POST /api/blockchain/[id]/users - Create a new user
export async function POST({ params, request }) {
  try {
    const { id } = params;
    const data = await request.json();
    
    // Validate required fields
    if (!data.name) {
      return json({ error: 'Name is required' }, { status: 400 });
    }
    
    // Get the blockchain from the database
    const blockchains = await db.select().from(blockchain).where(eq(blockchain.id, id));
    
    // Check if the blockchain exists
    if (blockchains.length === 0) {
      return json({ error: 'Blockchain not found' }, { status: 404 });
    }
    
    // Generate a key pair
    const { publicKey, privateKey } = generateKeyPair();
    
    // Convert name to username
    const username = nameToUsername(data.name);
    
    // Create a new user
    const newUser = {
      id: crypto.randomUUID(),
      name: data.name,
      username,
      publicKey,
      privateKey,
      blockchainId: id
    };
    
    // Insert the user into the database
    await db.insert(user).values(newUser);
    
    // Return the new user (without private key)
    return json({
      id: newUser.id,
      name: newUser.name,
      username: newUser.username,
      publicKey: newUser.publicKey,
      blockchainId: newUser.blockchainId,
      privateKey: newUser.privateKey // Include private key in response for client storage
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return json({ error: 'Failed to create user' }, { status: 500 });
  }
}
