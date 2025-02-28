<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	
	// State for blockchain selection
	let publicBlockchain = null;
	let connectBlockchainName = '';
	let isLoading = true;
	let error = null;
	
	// State for new blockchain creation
	let newBlockchainName = '';
	let leadingZeros = 4;
	let blockReward = 3.125;
	let isCreating = false;
	let isConnecting = false;
	let createdBlockchainId = null;
	
	// Fetch public blockchains on mount
	onMount(async () => {
		try {
			const response = await fetch('/api/blockchain');
			if (!response.ok) {
				throw new Error(`Failed to fetch blockchains: ${response.statusText}`);
			}
			const blockchains = await response.json();
			
			// Find the Public blockchain
			publicBlockchain = blockchains.find(b => b.name === 'Public');
			
			isLoading = false;
		} catch (err) {
			console.error('Error fetching blockchains:', err);
			error = err.message;
			isLoading = false;
		}
	});
	
	// Handle public blockchain selection
	function enterPublicBlockchain() {
		if (publicBlockchain) {
			goto(`/blockchain/${publicBlockchain.id}`);
		} else {
			error = 'Public blockchain not available';
		}
	}
	
	// Handle connect to existing blockchain
	async function connectToBlockchain() {
		if (!connectBlockchainName) {
			error = 'Blockchain name is required';
			return;
		}
		
		isConnecting = true;
		
		try {
			const response = await fetch(`/api/blockchain/name/${encodeURIComponent(connectBlockchainName)}`);
			if (!response.ok) {
				if (response.status === 404) {
					throw new Error(`Blockchain not found. The blockchain with name "${connectBlockchainName}" may have been deleted or the database was reset.`);
				} else {
					throw new Error(`Error connecting to blockchain: ${response.statusText}`);
				}
			}
			
			const foundBlockchain = await response.json();
			
			// Navigate to the blockchain page
			goto(`/blockchain/${foundBlockchain.id}`);
		} catch (err) {
			console.error('Error connecting to blockchain:', err);
			error = err.message;
			isConnecting = false;
		}
	}
	
	// Handle create new blockchain
	async function createNewBlockchain() {
		if (!newBlockchainName) {
			error = 'Blockchain name is required';
			return;
		}
		
		isCreating = true;
		createdBlockchainId = null;
		
		try {
			const response = await fetch('/api/blockchain', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					name: newBlockchainName,
					leadingZeros,
					blockReward
				})
			});
			
			if (!response.ok) {
				throw new Error(`Failed to create blockchain: ${response.statusText}`);
			}
			
			const newBlockchain = await response.json();
			createdBlockchainId = newBlockchain.id;
			
			// Redirect to the blockchain ID.
			goto(`/blockchain/${newBlockchain.id}`);
		} catch (err) {
			console.error('Error creating blockchain:', err);
			error = err.message;
			isCreating = false;
		}
	}
</script>

<div class="flex flex-col items-center justify-center py-12">
	<h1 class="text-4xl font-bold mb-8 cyberpunk-glow">Bitcoin Simulator</h1>
	
	{#if error}
		<div class="w-full max-w-md bg-red-900 border border-red-700 text-red-300 p-3 rounded mb-4">
			{error}
			<button 
				on:click={() => error = null} 
				class="ml-2 text-red-300 hover:text-red-200"
			>
				✕
			</button>
		</div>
	{/if}
	
	<div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
		<!-- Left Column: Public and Connect -->
		<div class="space-y-6">
			<!-- Public Blockchain -->
			<div class="p-6 cyberpunk-box rounded-lg">
				<h2 class="text-2xl font-bold mb-4 text-center">Public Blockchain</h2>
				
				{#if isLoading}
					<div class="text-center text-cyan-600 mb-4">Loading...</div>
				{:else if !publicBlockchain}
					<div class="text-center text-cyan-600 mb-4">Public blockchain not available</div>
				{:else}
					<div class="mb-4">
						<p class="text-cyan-500">Name: <span class="text-cyan-300">{publicBlockchain.name}</span></p>
						<p class="text-cyan-500">Difficulty: <span class="text-cyan-300">{publicBlockchain.leadingZeros} zeros</span></p>
						<p class="text-cyan-500">Block Reward: <span class="text-cyan-300">{publicBlockchain.blockReward} BTC</span></p>
					</div>
				{/if}
				
				<button 
					on:click={enterPublicBlockchain} 
					disabled={isLoading || !publicBlockchain} 
					class="w-full py-2 px-4 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors"
				>
					Enter Public Blockchain
				</button>
			</div>
			
			<!-- Connect to Existing Blockchain -->
			<div class="p-6 cyberpunk-box rounded-lg">
				<h2 class="text-2xl font-bold mb-4 text-center">Connect to Blockchain</h2>
				
				<div class="mb-4">
					<label for="blockchain-name" class="block text-sm text-cyan-500 mb-1">
						Blockchain Name
					</label>
					<input 
						id="blockchain-name"
						type="text" 
						bind:value={connectBlockchainName} 
						placeholder="Enter blockchain name" 
						class="w-full p-2 bg-gray-800 border border-cyan-700 rounded text-cyan-300 placeholder-cyan-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
					/>
				</div>
				
				<button 
					on:click={connectToBlockchain} 
					disabled={isConnecting || !connectBlockchainName} 
					class="w-full py-2 px-4 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors"
				>
					{isConnecting ? 'Connecting...' : 'Connect'}
				</button>
			</div>
		</div>
		
		<!-- Right Column: Create New Blockchain -->
		<div class="p-6 cyberpunk-box rounded-lg">
			<h2 class="text-2xl font-bold mb-4 text-center">Create New Blockchain</h2>
			
			<div class="space-y-4 mb-4">
				<div>
					<label for="new-blockchain-name" class="block text-sm text-cyan-500 mb-1">
						Blockchain Name
					</label>
				 	<input 
						id="new-blockchain-name"
						type="text" 
						bind:value={newBlockchainName} 
						placeholder="Enter a name for your blockchain" 
						class="w-full p-2 bg-gray-800 border border-cyan-700 rounded text-cyan-300 placeholder-cyan-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
					/>
				</div>
				
				<div>
					<label for="leading-zeros" class="block text-sm text-cyan-500 mb-1">
						Leading Zeros (Mining Difficulty)
					</label>
					<input 
						id="leading-zeros"
						type="range" 
						bind:value={leadingZeros} 
						min="1" 
						max="16" 
						class="w-full"
					/>
					<div class="flex justify-between text-xs text-cyan-600">
						<span>1 (Easy)</span>
						<span>{leadingZeros}</span>
						<span>16 (Hard)</span>
					</div>
				</div>
				
				<div>
					<label for="block-reward" class="block text-sm text-cyan-500 mb-1">
						Block Reward
					</label>
					<input 
						id="block-reward"
						type="number" 
						bind:value={blockReward} 
						min="0.1" 
						step="0.1" 
						class="w-full p-2 bg-gray-800 border border-cyan-700 rounded text-cyan-300 focus:outline-none focus:ring-1 focus:ring-cyan-500"
					/>
				</div>
			</div>
			
			{#if createdBlockchainId}
				
			{:else}
				<button 
					on:click={createNewBlockchain} 
					disabled={isCreating || !newBlockchainName} 
					class="w-full py-2 px-4 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
				>
					{isCreating ? 'Creating...' : 'Create & Enter'}
				</button>
			{/if}
			
			<div class="mt-4 text-xs text-cyan-600">
				<p>* A Genesis block with 10 BTC reward will be created automatically</p>
				<p>* The blockchain will include a Satoshi user who mines the first block</p>
			</div>
		</div>
	</div>

	<div class="flex flex-col items-center justify-center py-12 max-w-2xl text-center">
		<h1 class="text-4xl font-bold mb-8 cyberpunk-glow">About this Blockchain Simulator</h1>
	<p>Dive into cryptocurrency with our Bitcoin Simulator. It's a hands-on way to learn how blockchain works. You can try out Bitcoin without risking real money. See how digital currencies operate and get real experience with decentralized transactions.</p>

    <h2 class="text-2xl font-bold mt-6 mb-4 cyberpunk-glow">Blockchain Viewer: See the Network</h2>

    <p>Watch the blockchain in action. Our viewer shows you how blocks connect and how the network agrees on transactions. You'll see simulated mining and how confirmations verify each transaction. This helps you understand how the blockchain keeps records secure.</p>

    <h2 class="text-2xl font-bold mt-6 mb-4 cyberpunk-glow">Bitcoin Wallet: Practice Transactions</h2>

    <p>Use our simulated Bitcoin wallet to send and receive Bitcoin. You can check transaction statuses and watch confirmations add up. This gives you practical experience with how Bitcoin transactions are processed and verified.</p>

    <h2 class="text-2xl font-bold mt-6 mb-4 cyberpunk-glow">Learn Bitcoin: Hands-on Education</h2>

    <p>Our Bitcoin Simulator is a simple way to learn about cryptocurrency and blockchain. You can experiment and see how everything works. Whether you're a student or just curious, this simulator lets you explore Bitcoin and blockchain easily.</p>

</div>
</div>
