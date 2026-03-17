<script>
	import { onMount, onDestroy } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { getUser } from "$lib/utils/storage.js";
	import { createUpdateStore } from "$lib/utils/updates.js";
	import { calculateBalance } from "$lib/utils/mining.js";
	import { getLongestChainBlocks } from "$lib/utils/blockchain";

	// Get blockchain ID from URL
	const blockchainId = $page.params.id;

	// State
	let blockchain = null;

	let blocks = [];
	let minedBlocks = [];
	let longestChainBlocks = [];

	let users = [];
	let user = null;
	let balance = 0;
	let transactions = [];
	let pendingTransactions = [];
	let confirmedTransactions = [];
	let forkedTransactions = [];
	let isLoading = true;
	let error = null;

	// Transaction form
	let recipient = "";
	let amount = 0;
	let isSending = false;

	// Create update store
	const updateStore = createUpdateStore(blockchainId, {
		blocks: [],
		transactions: [],
	});

	// State for tracking the maximum block height
	let maxBlockHeight = 0;

	$: pendingTransactions = transactions.filter((tx) => tx.status === "pending");
	$: confirmedTransactions = transactions.filter((tx) => tx.status === "confirmed");
	$: forkedTransactions = transactions.filter((tx) => tx.status === "forked");

	// Subscribe to updates
	const unsubscribe = updateStore.subscribe((data) => {
		if (data && data.blocks && data.blocks.length > 0) {
			blocks = data.blocks;

			longestChainBlocks = getLongestChainBlocks(blocks);

			if (user) {
				minedBlocks = blocks
					.filter((block) => block.minerId === user.id)
					.map((block) => ({
						...block,
						inLongestChain: longestChainBlocks.includes(block.id),
						reward: blockchain?.blockReward || 0,
					}))
					.sort((a, b) => b.minedAt - a.minedAt);
			}

			updateBalance();
		}
		if (data && data.transactions) {
			updateTransactions();
		}
		if (data && data.maxHeight !== undefined) {
			maxBlockHeight = data.maxHeight;
		}
	});

	// Get data from server-side load function
	export let data;

	// Load blockchain and user data
	onMount(async () => {
		// Check if user exists for this blockchain
		user = getUser(blockchainId);

		if (!user) {
			goto(`/blockchain/${blockchainId}`);
			return;
		}

		try {
			// Use data from server-side load function
			blockchain = data.blockchain;
			users = data.users;
			
			// Initialize blocks from server data
			blocks = data.blocks;
			
			// Calculate longest chain blocks
			longestChainBlocks = getLongestChainBlocks(blocks);
			
			// Update mined blocks
			minedBlocks = blocks
				.filter((block) => block.minerId === user.id)
				.map((block) => ({
					...block,
					inLongestChain: longestChainBlocks.includes(block.id),
					reward: blockchain.blockReward,
				}))
				.sort((a, b) => b.minedAt - a.minedAt);

			// Update balance and transactions
			updateBalance();
			updateTransactions();

			isLoading = false;

			// Start polling for updates
			updateStore.start();
		} catch (err) {
			console.error("Error loading wallet data:", err);
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
						let status = "forked";
						if (longestChainBlocks.includes(block.id)) {
							status = "confirmed";
						}
						userTransactions.push({
							...tx,
							block,
							status: status,
							confirmations: getConfirmations(block),
						});
					}
				}
			}
		}

		// Get mempool transactions
		fetch(`/api/blockchain/${blockchainId}/transactions?mempool=true`)
			.then((response) => response.json())
			.then((mempoolTransactions) => {
				// Add mempool transactions for this user
				for (const tx of mempoolTransactions) {
					if (tx.senderId === user.id || tx.recipientId === user.id) {
						// Check if this transaction is already in the list (might have been confirmed)
						const existingTx = userTransactions.find(
							(t) => t.id === tx.id,
						);
						if (!existingTx) {
							userTransactions.push({
								...tx,
								status: "pending",
								confirmations: 0,
							});
						}
					}
				}

				// Sort by timestamp (newest first)
				transactions = userTransactions.sort(
					(a, b) => b.createdAt - a.createdAt,
				);
			})
			.catch((err) => {
				console.error("Error fetching mempool transactions:", err);
			});
	}

	// Calculate confirmations for a block
	function getConfirmations(block) {
		if (!block || block.height === undefined || block.height === null)
			return 0;

		// Use the maxBlockHeight from updates or calculate it from blocks
		let currentMaxHeight = maxBlockHeight;
		if (currentMaxHeight === 0 && blocks.length > 0) {
			currentMaxHeight = blocks.reduce((max, b) => {
				return b.height !== undefined &&
					b.height !== null &&
					b.height > max
					? b.height
					: max;
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
			error = "Recipient is required";
			return;
		}

		if (!amount || amount <= 0) {
			error = "Amount must be greater than 0";
			return;
		}

		if (amount > balance) {
			error = "Insufficient balance";
			return;
		}

		isSending = true;

		try {
			// Find recipient user
			const recipientUser = users.find((u) => u.username === recipient);

			if (!recipientUser) {
				throw new Error(`Recipient not found: ${recipient}`);
			}

			// Create transaction
			const transaction = {
				senderId: user.id,
				recipientId: recipientUser.id,
				amount: parseFloat(amount),
			};

			// Submit transaction
			const response = await fetch(
				`/api/blockchain/${blockchainId}/transactions`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(transaction),
				},
			);

			if (!response.ok) {
				const responseData = await response.json();
				error =
					responseData.error ||
					`Failed to send transaction: ${response.statusText}`;
				return;
			}

			// Get the new transaction
			const newTransaction = await response.json();

			// Add to transactions list
			transactions = [
				{
					...newTransaction,
					confirmed: false,
				},
				...transactions,
			];

			// Reset form
			recipient = "";
			amount = 0;
			error = null;
		} catch (err) {
			console.error("Error sending transaction:", err);
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

	function goToChain() {
		goto(`/blockchain/${blockchainId}`);
	}

	function getTransactionStageLabel(tx) {
		if (tx.status === "confirmed") {
			return `Added to the main chain (${tx.confirmations} confirmation${tx.confirmations === 1 ? "" : "s"})`;
		}

		if (tx.status === "pending") {
			return "Waiting in the mempool to be mined";
		}

		return "Included in a side branch (fork)";
	}

	function getTransactionStageTone(tx) {
		if (tx.status === "confirmed") return "text-green-400";
		if (tx.status === "pending") return "text-amber-300";
		return "text-red-400";
	}

	function getWalletNextAction() {
		if (!transactions.length) {
			return "Send a transaction to create something the class can watch move through the blockchain.";
		}

		if (transactions.some((tx) => tx.status === "pending")) {
			return "Go back to the blockchain page and point out that your transaction is now waiting in the mempool.";
		}

		if (transactions.some((tx) => tx.status === "confirmed")) {
			return "Open the blockchain page and show the block that confirmed your transaction.";
		}

		return "Use this page to compare what happened in your wallet with what the chain view shows.";
	}
</script>

<div class="py-6">
	{#if isLoading}
		<div class="flex justify-center items-center h-64">
			<div class="text-xl text-cyan-400">Loading wallet...</div>
		</div>
	{:else if error}
		<div class="bg-red-900 border border-red-700 text-red-300 p-4 rounded mb-6">
			{error}
			<button onclick={() => (error = null)} class="ml-2 text-red-300 hover:text-red-200">✕</button>
		</div>
	{:else}
		<div>
			<!-- Header -->
			<div class="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
				<h1 class="text-2xl font-bold cyberpunk-glow">Wallet</h1>
				<span class="text-sm text-cyan-600">@{user.username}</span>
				<span class="text-sm text-cyan-600">{blockchain?.name}</span>
				<div class="ml-auto flex items-center gap-4">
					<span class="text-2xl font-bold text-cyan-300 cyberpunk-glow">{balance.toFixed(4)} BTC</span>
				</div>
			</div>

			<div class="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
				<!-- Send Transaction -->
				<div class="cyberpunk-box rounded-lg p-4 border-l-2 border-l-green-700">
					<h2 class="text-lg font-bold mb-3">Send</h2>

					{#if users && users.length > 1}
						<div class="flex flex-wrap gap-2 mb-3">
							{#each users.filter((u) => u && u.id !== user.id) as otherUser}
								<button
									class="px-3 py-1 text-sm rounded-full transition-colors"
									class:bg-cyan-700={recipient === otherUser.username}
									class:text-white={recipient === otherUser.username}
									class:bg-gray-800={recipient !== otherUser.username}
									class:text-cyan-400={recipient !== otherUser.username}
									class:border-cyan-600={recipient !== otherUser.username}
									class:border={recipient !== otherUser.username}
									class:hover:bg-cyan-800={recipient !== otherUser.username}
									onclick={() => (recipient = otherUser.username)}
								>
									{otherUser.username}
								</button>
							{/each}
						</div>
					{/if}

					<div class="space-y-3">
						<div>
							<label for="recipient-wallet" class="block text-xs text-cyan-600 mb-1">Recipient</label>
							<input
								id="recipient-wallet"
								type="text"
								bind:value={recipient}
								placeholder="username"
								class="w-full p-2 bg-gray-800 border border-cyan-700 rounded text-cyan-300 placeholder-cyan-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
							/>
						</div>
						<div>
							<label for="send-amount" class="block text-xs text-cyan-600 mb-1">Amount (BTC)</label>
							<input
								id="send-amount"
								type="number"
								bind:value={amount}
								min="0.0001"
								step="0.0001"
								max={balance}
								placeholder="0.0000"
								class="w-full p-2 bg-gray-800 border border-cyan-700 rounded text-cyan-300 placeholder-cyan-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
							/>
						</div>
						<button
							onclick={sendTransaction}
							disabled={isSending || !recipient || !amount || amount <= 0 || amount > balance}
							class="w-full py-3 px-4 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors"
						>
							{isSending ? "Sending..." : "Send"}
						</button>
					</div>
				</div>

				<!-- Transaction History -->
				<div class="cyberpunk-box rounded-lg p-4 border-l-2 border-l-cyan-600">
					<h2 class="text-lg font-bold mb-3">Transactions</h2>

					{#if !transactions || transactions.length === 0}
						<p class="text-cyan-600 text-sm">No transactions yet.</p>
					{:else}
						<div class="overflow-x-auto">
							<table class="w-full text-left text-sm">
								<thead>
									<tr class="border-b border-cyan-800">
										<th class="p-2 text-cyan-600 font-normal">Type</th>
										<th class="p-2 text-cyan-600 font-normal">From/To</th>
										<th class="p-2 text-cyan-600 font-normal">Amount</th>
										<th class="p-2 text-cyan-600 font-normal">Status</th>
										<th class="p-2 text-cyan-600 font-normal">Block</th>
									</tr>
								</thead>
								<tbody>
									{#each transactions as tx (tx.id)}
										{@const isSender = tx.senderId === user.id}
										{@const isRecipient = tx.recipientId === user.id}
										<tr class="border-b border-cyan-900 hover:bg-gray-800">
											<td class="p-2">
												{#if isSender && isRecipient}
													<span class="text-cyan-400 text-xs">Self</span>
												{:else if isSender}
													<span class="text-red-400">↑ Sent</span>
												{:else if isRecipient}
													<span class="text-green-400">↓ Recv</span>
												{/if}
											</td>
											<td class="p-2 text-cyan-300">
												{#if isSender && isRecipient}
													{tx.recipientUsername}
												{:else if isSender}
													{tx.recipientUsername || "?"}
												{:else}
													{tx.senderUsername || "System"}
												{/if}
											</td>
											<td class="p-2 {tx.status === 'forked' ? 'opacity-40 line-through' : ''}">
												{#if isSender && !isRecipient}
													<span class="text-red-400">-{tx.amount}</span>
												{:else if isRecipient && !isSender}
													<span class="text-green-400">+{tx.amount}</span>
												{:else}
													<span class="text-cyan-400">{tx.amount}</span>
												{/if}
											</td>
											<td class="p-2">
												{#if tx.status === "confirmed"}
													<span class="inline-flex items-center gap-1 rounded bg-green-950 border border-green-700 px-1.5 py-0.5 text-xs text-green-400">✓ {tx.confirmations}×</span>
												{:else if tx.status === "pending"}
													<span class="inline-flex items-center gap-1 rounded bg-amber-950 border border-amber-700 px-1.5 py-0.5 text-xs text-amber-300">⏳ pending</span>
												{:else if tx.status === "forked"}
													<span class="inline-flex items-center gap-1 rounded bg-red-950 border border-red-800 px-1.5 py-0.5 text-xs text-red-400">⚡ forked</span>
												{/if}
											</td>
											<td class="p-2 text-cyan-600 font-mono text-xs">
												{#if tx.block}{tx.block.hash.substring(0, 8)}…{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			</div>

			<!-- Mined Blocks -->
			{#if minedBlocks && minedBlocks.length > 0}
				<div class="mt-6 cyberpunk-box rounded-lg p-4">
					<h2 class="text-lg font-bold mb-3">Blocks Mined</h2>
					<div class="overflow-x-auto">
						<table class="w-full text-left text-sm">
							<thead>
								<tr class="border-b border-cyan-800">
									<th class="p-2 text-cyan-600 font-normal">Height</th>
									<th class="p-2 text-cyan-600 font-normal">Time</th>
									<th class="p-2 text-cyan-600 font-normal">Hash</th>
									<th class="p-2 text-cyan-600 font-normal">Status</th>
									<th class="p-2 text-cyan-600 font-normal">Reward</th>
								</tr>
							</thead>
							<tbody>
								{#each minedBlocks as block (block.id)}
									<tr class="border-b border-cyan-900 hover:bg-gray-800">
										<td class="p-2 text-cyan-300">{block.height}</td>
										<td class="p-2 text-cyan-600">{timeAgo(block.minedAt)}</td>
										<td class="p-2 text-cyan-600 font-mono">{block.hash.substring(0, 10)}…</td>
										<td class="p-2">
											{#if block.inLongestChain}
												<span class="text-green-400">main chain</span>
											{:else}
												<span class="text-red-400">side branch</span>
											{/if}
										</td>
										<td class="p-2">
											{#if block.inLongestChain}
												<span class="text-green-400">{block.reward} BTC</span>
											{:else}
												<span class="text-red-400">—</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
