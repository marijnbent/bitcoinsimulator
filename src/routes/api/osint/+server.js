import { json } from '@sveltejs/kit';
import { investigateEthereumAddress } from '$lib/server/osint.js';

export async function GET({ url }) {
	const address = url.searchParams.get('address');
	const network = url.searchParams.get('network') || 'ethereum';

	if (!address) {
		return json({ error: 'Ethereum address is required.' }, { status: 400 });
	}

	return runInvestigation(address, network);
}

export async function POST({ request }) {
	try {
		const data = await request.json();

		if (!data.address) {
			return json({ error: 'Ethereum address is required.' }, { status: 400 });
		}

		return runInvestigation(data.address, data.network || 'ethereum');
	} catch (error) {
		console.error('Error reading OSINT request:', error);
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}
}

async function runInvestigation(address, network) {
	try {
		const dossier = await investigateEthereumAddress(address, network);
		return json(dossier);
	} catch (error) {
		console.error('Error building OSINT dossier:', error);
		return json(
			{
				error: error.message || 'Failed to investigate the Ethereum address.'
			},
			{ status: error.status || 500 }
		);
	}
}
