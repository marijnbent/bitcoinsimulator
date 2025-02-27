import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { blockchain } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/blockchain/[id] - Get a specific blockchain
export async function GET({ params }) {
  try {
    const { id } = params;
    
    // Get the blockchain from the database
    const blockchains = await db.select().from(blockchain).where(eq(blockchain.id, id));
    
    // Check if the blockchain exists
    if (blockchains.length === 0) {
      return json({ error: 'Blockchain not found' }, { status: 404 });
    }
    
    return json(blockchains[0]);
  } catch (error) {
    console.error('Error fetching blockchain:', error);
    return json({ error: 'Failed to fetch blockchain' }, { status: 500 });
  }
}

// PUT /api/blockchain/[id] - Update a blockchain
export async function PUT({ params, request }) {
  try {
    const { id } = params;
    const data = await request.json();
    
    // Get the blockchain from the database
    const blockchains = await db.select().from(blockchain).where(eq(blockchain.id, id));
    
    // Check if the blockchain exists
    if (blockchains.length === 0) {
      return json({ error: 'Blockchain not found' }, { status: 404 });
    }
    
    // Update the blockchain
    await db.update(blockchain)
      .set({
        name: data.name || blockchains[0].name,
        leadingZeros: data.leadingZeros || blockchains[0].leadingZeros,
        blockReward: data.blockReward || blockchains[0].blockReward
      })
      .where(eq(blockchain.id, id));
    
    // Get the updated blockchain
    const updatedBlockchains = await db.select().from(blockchain).where(eq(blockchain.id, id));
    
    return json(updatedBlockchains[0]);
  } catch (error) {
    console.error('Error updating blockchain:', error);
    return json({ error: 'Failed to update blockchain' }, { status: 500 });
  }
}

// DELETE /api/blockchain/[id] - Delete a blockchain
export async function DELETE({ params }) {
  try {
    const { id } = params;
    
    // Delete the blockchain
    await db.delete(blockchain).where(eq(blockchain.id, id));
    
    return json({ success: true });
  } catch (error) {
    console.error('Error deleting blockchain:', error);
    return json({ error: 'Failed to delete blockchain' }, { status: 500 });
  }
}
