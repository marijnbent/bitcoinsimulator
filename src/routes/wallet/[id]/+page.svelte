<script>
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getUser, saveUser } from '$lib/utils/storage.js';
	import { createUpdateStore } from '$lib/utils/updates.js';
	import { calculateBalance } from '$lib/utils/mining.js';
	
	// Get blockchain ID from URL
	const blockchainId = $page.params.id;
	
	// State
	let blockchain = null;
	let blocks = [];
	let users = [];
	let user = null;
	let balance = 0;
	let transactions = [];
	let isLoading = true;
	let error = null;
	
	// Transaction form
	let recipient = '';
	let amount = 0;
	let isSending = false;
	
	// Create update store
	const updateStore = createUpdateStore(blockchainId, { blocks: [], transactions: [] });
	
	// State for tracking the maximum block height
	let maxBlockHeight = 0;
	
	// Subscribe to updates
	const unsubscribe = updateStore.subscribe(data => {
		if (data.blocks) {
			blocks = data.blocks;
			updateBalance();
		}
		if (data.transactions) {
			updateTransactions();
		}
		if (data.maxHeight !== undefined) {
			maxBlockHeight = data.maxHeight;
		}
	});
	
	// Load blockchain and user data
	onMount(async () => {
		// Check if user exists for this blockchain
		user = getUser(blockchainId);
		
		if (!user) {
			// Redirect to blockchain page to create/login user
			goto(`/blockchain/${blockchainId}`);
			return;
		}
		
		try {
			// Fetch blockchain data
			const blockchainResponse = await fetch(`/api/blockchain/${blockchainId}`);
			if (!blockchainResponse.ok) {
				throw new Error(`Failed to fetch blockchain: ${blockchainResponse.statusText}`);
			}
			blockchain = await blockchainResponse.json();
			
			// Fetch blocks
			const blocksResponse = await fetch(`/api/blockchain/${blockchainId}/blocks`);
			if (!blocksResponse.ok) {
				throw new Error(`Failed to fetch blocks: ${blocksResponse.statusText}`);
			}
			blocks = await blocksResponse.json();
			
			// Fetch users
			const usersResponse = await fetch(`/api/blockchain/${blockchainId}/users`);
			if (!usersResponse.ok) {
				throw new Error(`Failed to fetch users: ${usersResponse.statusText}`);
			}
			users = await usersResponse.json();
			
			// Update balance and transactions
			updateBalance();
			updateTransactions();
			
			isLoading = false;
			
			// Start polling for updates
			updateStore.start();
		} catch (err) {
			console.error('Error loading wallet data:', err);
			error = err.message;
			isLoading = false;
		}
	});
	
	// Clean up on destroy
	onDestroy(() => {
		unsubscribe();
		updateStore.stop();
	});
	
	// Update user balance
	function updateBalance() {
		if (!blockchain || !user || !blocks) return;
		
		balance = calculateBalance(user.id, blocks, blockchain.blockReward);
	}
	
	// Update user transactions
	function updateTransactions() {
		if (!user || !blocks) return;
		
		// Get all transactions for this user
		const userTransactions = [];
		
		// Get confirmed transactions from blocks
		for (const block of blocks) {
			if (block.transactions) {
				for (const tx of block.transactions) {
					if (tx.senderId === user.id || tx.recipientId === user.id) {
						userTransactions.push({
							...tx,
							block,
							confirmed: true,
							confirmations: getConfirmations(block)
						});
					}
				}
			}
		}
		
		// Get mempool transactions
		fetch(`/api/blockchain/${blockchainId}/transactions?mempool=true`)
			.then(response => response.json())
			.then(mempoolTransactions => {
				// Add mempool transactions for this user
				for (const tx of mempoolTransactions) {
					if (tx.senderId === user.id || tx.recipientId === user.id) {
						// Check if this transaction is already in the list (might have been confirmed)
						const existingTx = userTransactions.find(t => t.id === tx.id);
						if (!existingTx) {
							userTransactions.push({
								...tx,
								confirmed: false,
								confirmations: 0
							});
						}
					}
				}
				
				// Sort by timestamp (newest first)
				transactions = userTransactions.sort((a, b) => b.createdAt - a.createdAt);
			})
			.catch(err => {
				console.error('Error fetching mempool transactions:', err);
			});
	}
	
	// Calculate confirmations for a block
	function getConfirmations(block) {
		if (!block || block.height === undefined || block.height === null) return 0;
		
		// Use the maxBlockHeight from updates or calculate it from blocks
		let currentMaxHeight = maxBlockHeight;
		if (currentMaxHeight === 0 && blocks.length > 0) {
			currentMaxHeight = blocks.reduce((max, b) => {
				return (b.height !== undefined && b.height !== null && b.height > max) ? b.height : max;
			}, 0);
		}
		
		// Calculate confirmations (current chain height - block height + 1)
		return currentMaxHeight - block.height + 1;
	}
	
	// Send a transaction
	async function sendTransaction() {
		if (!blockchain || !user) return;
		
		// Validate form
		if (!recipient) {
			error = 'Recipient is required';
			return;
		}
		
		if (!amount || amount <= 0) {
			error = 'Amount must be greater than 0';
			return;
		}
		
		if (amount > balance) {
			error = 'Insufficient balance';
			return;
		}
		
		isSending = true;
		
		try {
			// Find recipient user
			const recipientUser = users.find(u => u.username === recipient);
			
			if (!recipientUser) {
				throw new Error(`Recipient not found: ${recipient}`);
			}
			
			// Create transaction
			const transaction = {
				senderId: user.id,
				recipientId: recipientUser.id,
				amount: parseFloat(amount)
			};
			
			// Submit transaction
			const response = await fetch(`/api/blockchain/${blockchainId}/transactions`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(transaction)
			});
			
			if (!response.ok) {
				throw new Error(`Failed to send transaction: ${response.statusText}`);
			}
			
			// Get the new transaction
			const newTransaction = await response.json();
			
			// Add to transactions list
			transactions = [
				{
					...newTransaction,
					confirmed: false
				},
				...transactions
			];
			
			// Reset form
			recipient = '';
			amount = 0;
			error = null;
		} catch (err) {
			console.error('Error sending transaction:', err);
			error = err.message;
		} finally {
			isSending = false;
		}
	}
	
	// Format time ago
	function timeAgo(timestamp) {
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		
		if (seconds < 60) return `${seconds} seconds ago`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
		if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
		return `${Math.floor(seconds / 86400)} days ago`;
	}
</script>

<div class="py-6">
	{#if isLoading}
		<div class="flex justify-center items-center h-64">
			<div class="text-xl text-cyan-400">Loading wallet data...</div>
		</div>
	{:else if error}
		<div class="bg-red-900 border border-red-700 text-red-300 p-4 rounded mb-6">
			{error}
			<button 
				on:click={() => error = null} 
				class="ml-2 text-red-300 hover:text-red-200"
			>
				✕
			</button>
		</div>
	{:else}
		<!-- Wallet View -->
		<div>
			<div class="flex justify-between items-center mb-6">
				<h1 class="text-3xl font-bold cyberpunk-glow">
					Wallet
				</h1>
				
				<div class="text-cyan-500">
					<span>Blockchain: {blockchain.name}</span>
				</div>
			</div>
			
			<!-- User Info & Balance -->
			<div class="mb-6 p-6 cyberpunk-box rounded-lg">
				<div class="flex flex-col md:flex-row justify-between items-center">
					<div>
						<h2 class="text-xl font-bold mb-2">Your Account</h2>
						<p class="text-cyan-500">Name: <span class="text-cyan-300">{user.name}</span></p>
						<p class="text-cyan-500">Username: <span class="text-cyan-300">{user.username}</span></p>
					</div>
					
					<div class="mt-4 md:mt-0 text-center">
						<h2 class="text-xl font-bold mb-2">Balance</h2>
						<p class="text-4xl font-bold text-cyan-300">{balance.toFixed(4)} BTC</p>
					</div>
				</div>
			</div>
			
			<!-- Send Transaction -->
			<div class="mb-8 p-6 cyberpunk-box rounded-lg">
				<h2 class="text-xl font-bold mb-4">Send Transaction</h2>

				<div class="flex flex-wrap gap-2 mb-6">
					{#each users.filter(u => u.id !== user.id) as otherUser}
						<button 
							class="px-3 py-1 text-sm rounded-full transition-colors"
							class:bg-cyan-700={recipient === otherUser.username}
							class:text-white={recipient === otherUser.username}
							class:bg-gray-800={recipient !== otherUser.username}
							class:text-cyan-400={recipient !== otherUser.username}
							class:border-cyan-600={recipient !== otherUser.username}
							class:border={recipient !== otherUser.username}
							class:hover:bg-cyan-800={recipient !== otherUser.username}
							on:click={() => recipient = otherUser.username}
						>
							{otherUser.username}
						</button>
					{/each}
				</div>
				
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label class="block text-sm text-cyan-500 mb-1">
							Recipient Username
						</label>
						<input 
							type="text" 
							bind:value={recipient} 
							placeholder="Enter recipient username" 
							class="w-full p-2 bg-gray-800 border border-cyan-700 rounded text-cyan-300 placeholder-cyan-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
						/>
					</div>
					
					<div>
						<label class="block text-sm text-cyan-500 mb-1">
							Amount (BTC)
						</label>
						<input 
							type="number" 
							bind:value={amount} 
							min="0.0001" 
							step="0.0001" 
							max={balance} 
							placeholder="0.0000" 
							class="w-full p-2 bg-gray-800 border border-cyan-700 rounded text-cyan-300 placeholder-cyan-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
						/>
					</div>
				</div>
				
				<button 
					on:click={sendTransaction} 
					disabled={isSending || !recipient || !amount || amount <= 0 || amount > balance} 
					class="mt-4 py-2 px-4 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors"
				>
					{isSending ? 'Sending...' : 'Send Transaction'}
				</button>
			</div>
			
			<!-- Transaction History -->
			<div class="p-6 cyberpunk-box rounded-lg">
				<h2 class="text-xl font-bold mb-4">Transaction History</h2>
				
				{#if transactions.length === 0}
					<p class="text-cyan-500">No transactions yet.</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-left">
							<thead>
								<tr class="border-b border-cyan-800">
									<th class="p-2 text-cyan-500">Type</th>
									<th class="p-2 text-cyan-500">From/To</th>
									<th class="p-2 text-cyan-500">Amount</th>
									<th class="p-2 text-cyan-500">Time</th>
									<th class="p-2 text-cyan-500">Status</th>
								</tr>
							</thead>
							<tbody>
								{#each transactions as tx (tx.id)}
									{@const isSender = tx.senderId === user.id}
									{@const isRecipient = tx.recipientId === user.id}
									<tr class="border-b border-cyan-900 hover:bg-gray-800">
										<td class="p-2">
											{#if isSender}
												<span class="text-red-400">Sent</span>
											{:else if isRecipient}
												<span class="text-green-400">Received</span>
											{:else}
												<span class="text-cyan-400">Unknown</span>
											{/if}
										</td>
										<td class="p-2 text-cyan-300">
											{#if isSender}
												To: {tx.recipientUsername || 'Unknown'}
											{:else if isRecipient}
												From: {tx.senderUsername || 'System'}
											{/if}
										</td>
										<td class="p-2 font-bold" class:text-red-400={isSender} class:text-green-400={isRecipient}>
											{isSender ? '-' : '+'}{tx.amount} BTC
										</td>
										<td class="p-2 text-cyan-600">
											{timeAgo(tx.createdAt)}
										</td>
										<td class="p-2">
											{#if tx.confirmed}
												<span class="text-green-400">
													Confirmed ({tx.confirmations} {tx.confirmations === 1 ? 'confirmation' : 'confirmations'})
												</span>
											{:else}
												<span class="text-yellow-400">Pending (in mempool)</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
