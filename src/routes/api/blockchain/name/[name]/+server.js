import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { blockchain } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/blockchain/name/[name] - Get a blockchain by name
export async function GET({ params }) {
  try {
    const { name } = params;
    
    // Get the blockchain from the database by name
    const blockchains = await db.select().from(blockchain).where(eq(blockchain.name, name));
    
    // Check if the blockchain exists
    if (blockchains.length === 0) {
      return json({ error: 'Blockchain not found' }, { status: 404 });
    }
    
    return json(blockchains[0]);
  } catch (error) {
    console.error('Error fetching blockchain by name:', error);
    return json({ error: 'Failed to fetch blockchain' }, { status: 500 });
  }
}
