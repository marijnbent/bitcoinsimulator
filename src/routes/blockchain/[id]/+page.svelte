<script>
	import { onMount, onDestroy } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { getUser, saveUser } from "$lib/utils/storage.js";
	import { createUpdateStore } from "$lib/utils/updates.js";
	import { getLongestChainBlocks } from "$lib/utils/blockchain.js";
import { calculateBalance } from "$lib/utils/mining.js";
	import {
		calculateBlockHash,
		isValidHash,
		nameToUsername,
	} from "$lib/utils/crypto.js";
	import BlockchainVisualization from "$lib/components/BlockchainVisualization.svelte";

	// Get blockchain ID from URL
	const blockchainId = $page.params.id;

	// State
	let blockchain = $state(null);
	let blocks = $state([]);
	let mempool = $state([]);
	let users = $state([]);
	let user = $state(null);
	let isLoading = $state(true);
	let error = $state(null);
	let expandedBlockId = $state(null);

	// User registration
	let userName = $state("");
	let isRegistering = $state(false);

	// Mining interface
	let selectedTransactions = $state([]);
	let nonce = $state(0);
	let currentHash = $state("");
	let isMining = $state(false);
	let autoMining = $state(false);
	let selectedPreviousBlock = $state(null);
	let generatedHashes = $state([]);
	const maxHashesToShow = 4;
	let workshopMode = $state(true);
	let recentEvent = $state(null);
	let latestBlock = $state(null);
	let longestChainBlockIds = $state([]);
	let userPendingTransactions = $state([]);
	let userConfirmedTransactions = $state([]);
	let userMinedBlocks = $state([]);
	let workshopEventTimeout = null;

	// Balance
	let balance = $state(0);
	$effect(() => {
		if (user && blockchain && blocks.length > 0) {
			balance = calculateBalance(user.id, blocks, blockchain.blockReward);
		}
	});

	// Difficulty editing
	let editingDifficulty = $state(false);
	let newDifficulty = $state(4);
	let isSavingDifficulty = $state(false);

	async function saveDifficulty() {
		if (!blockchain) return;
		isSavingDifficulty = true;
		try {
			const response = await fetch(`/api/blockchain/${blockchainId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ leadingZeros: newDifficulty }),
			});
			if (!response.ok) throw new Error('Failed to update difficulty');
			blockchain = await response.json();
			editingDifficulty = false;
		} catch (err) {
			error = err.message;
		} finally {
			isSavingDifficulty = false;
		}
	}

	// Set the latest block as the default previous block when blocks are loaded
	$effect(() => {
		if (blocks.length > 0 && !selectedPreviousBlock) {
			// Find the latest block
			selectedPreviousBlock = blocks.reduce(
				(latest, block) =>
					block.height > latest.height ? block : latest,
				blocks[0],
			);
		}
	});

	$effect(() => {
		if (blocks.length > 0) {
			latestBlock = blocks.reduce(
				(latest, block) =>
					block.height > latest.height ? block : latest,
				blocks[0],
			);
			longestChainBlockIds = getLongestChainBlocks(blocks);
		} else {
			latestBlock = null;
			longestChainBlockIds = [];
		}
	});

	$effect(() => {
		if (!user) {
			userPendingTransactions = [];
			userConfirmedTransactions = [];
			userMinedBlocks = [];
			return;
		}

		const longestChainSet = new Set(longestChainBlockIds);
		userPendingTransactions = mempool.filter(
			(tx) => tx.senderId === user.id || tx.recipientId === user.id,
		);

		const confirmedTransactions = [];
		for (const block of blocks) {
			for (const tx of block.transactions || []) {
				if (
					(tx.senderId === user.id || tx.recipientId === user.id) &&
					longestChainSet.has(block.id)
				) {
					confirmedTransactions.push(tx);
				}
			}
		}

		userConfirmedTransactions = confirmedTransactions;
		userMinedBlocks = blocks.filter(
			(block) =>
				block.minerId === user.id && longestChainSet.has(block.id),
		);
	});


	// Create update store
	const updateStore = createUpdateStore(blockchainId, {
		blocks: [],
		mempool: [],
	});

	// Subscribe to updates
	const unsubscribe = updateStore.subscribe((data) => {
		if (data.blocks) {
			const previousBlockCount = blocks.length;
			// Preserve user information when updating blocks
			if (blocks.length > 0 && data.blocks.length > 0) {
				// Create a map of existing blocks with their miner usernames
				const existingBlockInfo = {};
				blocks.forEach((block) => {
					if (block.minerUsername) {
						existingBlockInfo[block.id] = {
							minerUsername: block.minerUsername,
						};
					}
				});

				// Apply existing miner usernames to new blocks if missing
				blocks = data.blocks.map((block) => {
					if (
						!block.minerUsername &&
						existingBlockInfo[block.id]?.minerUsername
					) {
						return {
							...block,
							minerUsername:
								existingBlockInfo[block.id].minerUsername,
						};
					}
					return block;
				});
			} else {
				blocks = data.blocks;
			}

			if (previousBlockCount > 0 && data.blocks.length > previousBlockCount) {
				const incomingBlock = data.blocks.reduce(
					(latest, block) =>
						block.height > latest.height ? block : latest,
					data.blocks[0],
				);
				announceWorkshopEvent(
					`New block added at height ${incomingBlock.height}. The chain view just updated for everyone.`,
					"green",
				);
			}
		}
		if (data.mempool) {
			const previousMempoolCount = mempool.length;
			mempool = data.mempool;
			if (previousMempoolCount >= 0 && data.mempool.length > previousMempoolCount) {
				announceWorkshopEvent(
					"A new transaction is waiting in the mempool. This is the next thing a miner can include.",
					"amber",
				);
			}
		}
	});

	// Load blockchain and user data
	onMount(async () => {

		user = getUser(blockchainId);

		try {
			// Fetch blockchain data
			const blockchainResponse = await fetch(
				`/api/blockchain/${blockchainId}`,
			);
			if (!blockchainResponse.ok) {
				throw new Error(
					`Failed to fetch blockchain: ${blockchainResponse.statusText}`,
				);
			}
			blockchain = await blockchainResponse.json();

			// Fetch blocks
			const blocksResponse = await fetch(
				`/api/blockchain/${blockchainId}/blocks`,
			);
			if (!blocksResponse.ok) {
				throw new Error(
					`Failed to fetch blocks: ${blocksResponse.statusText}`,
				);
			}
			blocks = await blocksResponse.json();

			// Fetch mempool transactions
			const mempoolResponse = await fetch(
				`/api/blockchain/${blockchainId}/transactions?mempool=true`,
			);
			if (!mempoolResponse.ok) {
				throw new Error(
					`Failed to fetch mempool: ${mempoolResponse.statusText}`,
				);
			}
			mempool = await mempoolResponse.json();

			// Fetch users
			const usersResponse = await fetch(`/api/blockchain/${blockchainId}/users`);
			if (!usersResponse.ok) {
				throw new Error(
					`Failed to fetch users: ${usersResponse.statusText}`,
				);
			}
			users = await usersResponse.json();

			isLoading = false;

			// Start polling for updates
			updateStore.start();
		} catch (err) {
			console.error("Error loading blockchain data:", err);
			error = err.message;
			isLoading = false;
		}
	});

	// Clean up on destroy
	onDestroy(() => {
		unsubscribe();
		updateStore.stop();
		if (workshopEventTimeout) {
			clearTimeout(workshopEventTimeout);
		}
	});

	// Register a new user
	async function registerUser() {
		if (!userName) {
			error = "Name is required";
			return;
		}

		isRegistering = true;

		try {
			console.log("Registering user with name:", userName);

			const response = await fetch(
				`/api/blockchain/${blockchainId}/users`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						name: userName,
					}),
				},
			);

			if (!response.ok) {
				const responseData = await response.json();
				error = responseData.error || `Failed to register user: ${response.statusText}`;
				return;
			}

			user = await response.json();

			// Save user to localStorage
			saveUser(user);
			announceWorkshopEvent(
				"You're connected. Next, open your wallet and send a transaction so the room can watch it move through the chain.",
				"cyan",
			);

			// Clear form
			userName = "";
			error = null;
		} catch (err) {
			console.error("Error registering user:", err);
			error = err.message;
		} finally {
			isRegistering = false;
		}
	}

	// Toggle transaction selection for mining
	function toggleTransaction(tx) {
		const index = selectedTransactions.findIndex((t) => t.id === tx.id);
		if (index === -1) {
			selectedTransactions = [...selectedTransactions, tx];
		} else {
			selectedTransactions = selectedTransactions.filter(
				(t) => t.id !== tx.id,
			);
		}
		updateHash();
	}

	// Update the hash based on current nonce and selected transactions
	function updateHash() {
		if (!blockchain || !user || !selectedPreviousBlock) return;

		const previousHash = selectedPreviousBlock.hash;

		// Create a temporary block without random UUID or current time
		const tempBlock = {
			blockchainId,
			previousHash,
			minerId: user.id,
			nonce,
		};

		// Calculate the hash
		currentHash = calculateBlockHash(tempBlock, selectedTransactions);
	}

	// Check if the current hash is valid
	function isCurrentHashValid() {
		if (!blockchain || !currentHash) return false;
		return isValidHash(currentHash, blockchain.leadingZeros);
	}

	// Mine a block
	async function mineBlock() {
		if (!blockchain || !user || !selectedPreviousBlock) return;

		isMining = true;

		try {
			// Create a new block
			const newBlock = {
				minerId: user.id,
				nonce,
				hash: currentHash,
				previousHash: selectedPreviousBlock.hash,
				transactionIds: selectedTransactions.map((tx) => tx.id),
			};

			// Submit the block
			const response = await fetch(
				`/api/blockchain/${blockchainId}/blocks`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(newBlock),
				},
			);

			if (!response.ok) {
				const responseData = await response.json();
				error =
					responseData.error ||
					`Failed to mine block: ${response.statusText}`;
				return;
			}

			// Reset mining interface
			selectedTransactions = [];
			nonce = 0;
			currentHash = "";
			generatedHashes = [];

			// Get the new block
			const minedBlock = await response.json();

			// Add the block to the list
			blocks = [...blocks, minedBlock];

			// Set the new block as the selected previous block
			selectedPreviousBlock = minedBlock;

			// Remove mined transactions from mempool
			mempool = mempool.filter(
				(tx) => !newBlock.transactionIds.includes(tx.id),
			);
			announceWorkshopEvent(
				`Block ${minedBlock.height} was broadcast. Watch the chain and wallet views update together.`,
				"green",
			);
		} catch (err) {
			console.error("Error mining block:", err);
			error = err.message;
		} finally {
			isMining = false;
			autoMining = false;
		}
	}

	// Auto-mine a block
	async function autoMineBlock() {
		if (!blockchain || !user || isMining || !selectedPreviousBlock) return;

		autoMining = true;
		generatedHashes = [];

		try {
			const previousHash = selectedPreviousBlock.hash;

			// Create a temporary block
			const tempBlock = {
				blockchainId,
				previousHash,
				minerId: user.id,
				nonce: 0,
			};

			let validNonce = 0;
			let validHash = "";

			// Mine until we find a valid hash
			while (autoMining) {
				// Calculate the hash
				const hash = calculateBlockHash(
					{ ...tempBlock, nonce: validNonce },
					selectedTransactions,
				);

				// Check if the hash is valid
				if (isValidHash(hash, blockchain.leadingZeros)) {
					validHash = hash;
					break;
				}

				// Increment the nonce
				validNonce++;

				// Update UI every 100 attempts
				if (validNonce % 100 === 0) {
					nonce = validNonce;
					currentHash = hash;

					// Add to generated hashes (keep only the most recent ones)
					generatedHashes = [
						{ nonce: validNonce, hash },
						...generatedHashes.slice(0, maxHashesToShow - 1),
					];

					await new Promise((resolve) => setTimeout(resolve, 0));
				}
			}

			// If we found a valid hash, update the UI but don't mine automatically
			if (validHash) {
				nonce = validNonce;
				currentHash = validHash;

				// Add the valid hash to the list
				generatedHashes = [
					{ nonce: validNonce, hash: validHash },
					...generatedHashes.slice(0, maxHashesToShow - 1),
				];

				autoMining = false;
			}
		} catch (err) {
			console.error("Error auto-mining block:", err);
			error = err.message;
		} finally {
			autoMining = false;
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

	async function selectPreviousBlock(block) {
		if (!block) {
			return;
		}

		selectedPreviousBlock = block;
		const isOnMainChain = longestChainBlockIds.includes(block.id);
		announceWorkshopEvent(
			isOnMainChain
				? `Building on block ${block.height} · main chain`
				: `Building on block ${block.height} · side branch`,
			isOnMainChain ? "cyan" : "amber",
		);
	}

	// Toggle block expansion
	async function toggleBlock(blockId) {
		if (expandedBlockId === blockId) {
			expandedBlockId = null;
		} else {
			expandedBlockId = blockId;

			// Fetch the latest block data to ensure we have up-to-date transaction information
			try {
				const response = await fetch(`/api/blockchain/${blockchainId}/blocks`);
				if (response.ok) {
					const updatedBlocks = await response.json();

					// Update only the expanded block to ensure it has the latest transaction data
					const updatedBlock = updatedBlocks.find(b => b.id === blockId);
					if (updatedBlock) {
						// Find the block in the current blocks array and update it
						blocks = blocks.map(b => b.id === blockId ? updatedBlock : b);
					}
				}
			} catch (err) {
				console.error("Error fetching updated block data:", err);
			}
		}
	}

	$effect(() => {
		if (error) {
			window.scrollTo({ top: 0, behavior: "smooth" });
		}
	});

	function announceWorkshopEvent(message, tone = "cyan") {
		recentEvent = { message, tone };
		if (workshopEventTimeout) {
			clearTimeout(workshopEventTimeout);
		}
		workshopEventTimeout = setTimeout(() => {
			recentEvent = null;
		}, 6000);
	}

	function getLeadingZeroCount(hash) {
		if (!hash) return 0;
		const match = hash.match(/^0+/);
		return match ? match[0].length : 0;
	}

	function getHashTone() {
		if (!currentHash) return "text-cyan-500";
		return isCurrentHashValid() ? "text-green-400" : "text-amber-400";
	}

	function getHashExplanation() {
		if (!currentHash) {
			return "Pick transactions and calculate a hash to start the mining demo.";
		}

		const matchedZeros = getLeadingZeroCount(currentHash);
		if (isCurrentHashValid()) {
			return `This hash starts with ${matchedZeros} zero${matchedZeros === 1 ? "" : "s"}, so it satisfies the current difficulty and can be broadcast.`;
		}

		return `This hash only starts with ${matchedZeros} zero${matchedZeros === 1 ? "" : "s"}. Keep changing the nonce until it reaches ${blockchain.leadingZeros}.`;
	}

	function getNextAction() {
		if (!user) {
			return "Create an account so you can join the workshop chain.";
		}

		if (
			userPendingTransactions.length === 0 &&
			userConfirmedTransactions.length === 0
		) {
			return "Open your wallet and send a transaction. That gives the room something to watch move through the system.";
		}

		if (mempool.length > 0 && !currentHash) {
			return "Select the waiting transactions you want to include, then calculate a hash.";
		}

		if (currentHash && !isCurrentHashValid()) {
			return "Keep changing the nonce or use auto-mine until the hash has enough leading zeros.";
		}

		if (isCurrentHashValid()) {
			return "Broadcast the valid block so everyone can see the mempool empty and the chain grow.";
		}

		return "Watch the chain state update, then repeat with another transaction or another miner.";
	}

	function getWorkshopSteps() {
		return [
			{
				label: "Join the chain",
				description: "Create your account on the shared workshop chain.",
				done: Boolean(user),
			},
			{
				label: "Create a transaction",
				description: "Use the wallet to send or receive something.",
				done:
					userPendingTransactions.length > 0 ||
					userConfirmedTransactions.length > 0,
			},
			{
				label: "See it waiting",
				description: "Watch the transaction sit in the mempool.",
				done: userPendingTransactions.length > 0,
			},
			{
				label: "Mine a block",
				description: "Find a valid hash and add a block.",
				done: userMinedBlocks.length > 0,
			},
			{
				label: "See a confirmation",
				description: "Watch your transaction land on the main chain.",
				done: userConfirmedTransactions.length > 0,
			},
		];
	}

	function goToWallet() {
		goto(`/wallet/${blockchainId}`);
	}
</script>

<div class="py-6">
	{#if error}
		<div
			class="bg-red-900 border border-red-700 text-red-300 p-4 rounded mb-6 flex justify-between items-center"
		>
			<div>{error}</div>
			<button
				aria-label="Dismiss"
				onclick={() => (error = null)}
				class="text-red-300 hover:text-red-200"
				title="Dismiss"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					viewBox="0 0 20 20"
					fill="currentColor"
				>
					<path
						fill-rule="evenodd"
						d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
						clip-rule="evenodd"
					/>
				</svg>
			</button>
		</div>
	{/if}
	{#if isLoading}
		<div class="flex justify-center items-center h-64">
			<div class="text-xl text-cyan-400">Loading blockchain data...</div>
		</div>
	{:else if !user}
		<div class="max-w-md mx-auto p-6 cyberpunk-box rounded-lg">
			<h2 class="text-2xl font-bold mb-6 text-center">Join This Workshop Chain</h2>

			<div class="mb-4">
				<label for="workshop-user-name" class="block text-sm text-cyan-500 mb-1">
					Your Name
				</label>
				<input
					id="workshop-user-name"
					type="text"
					bind:value={userName}
					placeholder="Enter your name"
					class="w-full p-2 bg-gray-800 border border-cyan-700 rounded text-cyan-300 placeholder-cyan-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
				/>
				<p class="mt-1 text-xs text-cyan-600">
					This will be converted to a username: {userName
						? nameToUsername(userName)
						: "example_username"}
				</p>
			</div>

			<button
				aria-label="Login"
				onclick={registerUser}
				disabled={!userName || isRegistering}
				class="w-full py-2 px-4 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors"
			>
				{isRegistering ? "Joining..." : "Join Chain"}
			</button>
		</div>
	{:else}
		<div>
			<!-- Header bar -->
			<div class="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2">
				<h1 class="text-2xl font-bold cyberpunk-glow">{blockchain.name}</h1>
				<span class="text-sm text-cyan-600">@{user.username}</span>
				<div class="flex flex-wrap items-center gap-2 text-xs">
					<span class="bg-gray-800 border border-cyan-900 rounded px-2 py-0.5 text-cyan-500">{users.length} participants</span>
					<span class="bg-gray-800 border border-cyan-900 rounded px-2 py-0.5 text-cyan-500">{mempool.length} mempool</span>
					<span class="bg-gray-800 border border-cyan-900 rounded px-2 py-0.5 text-cyan-500">height: {latestBlock ? latestBlock.height : 0}</span>
					{#if editingDifficulty}
						<span class="flex items-center gap-1 bg-gray-800 border border-cyan-600 rounded px-1 py-0.5">
							<span class="text-cyan-600 px-1">diff:</span>
							<button onclick={() => { if (newDifficulty > 1) newDifficulty -= 1; }} class="w-6 h-6 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-cyan-300 font-bold text-sm">−</button>
							<span class="text-cyan-300 w-6 text-center font-bold">{newDifficulty}</span>
							<button onclick={() => { if (newDifficulty < 16) newDifficulty += 1; }} class="w-6 h-6 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-cyan-300 font-bold text-sm">+</button>
							<button onclick={saveDifficulty} disabled={isSavingDifficulty} class="ml-2 px-3 py-1 rounded bg-green-700 hover:bg-green-600 text-white text-xs font-bold">Save</button>
							<button onclick={() => (editingDifficulty = false)} class="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-cyan-300 text-xs font-bold">Cancel</button>
						</span>
					{:else}
						<button
							onclick={() => { newDifficulty = blockchain.leadingZeros; editingDifficulty = true; }}
							class="bg-gray-800 border border-cyan-900 rounded px-2 py-0.5 text-cyan-500 hover:border-cyan-600 hover:text-cyan-300 transition-colors cursor-pointer"
							title="Click to change difficulty"
						>diff: {blockchain.leadingZeros} ✎</button>
					{/if}
					<span class="bg-gray-800 border border-cyan-900 rounded px-2 py-0.5 text-cyan-300 font-bold">{balance.toFixed(4)} BTC</span>
				</div>
			</div>

			{#if recentEvent}
				<div class="mb-4 rounded border px-3 py-2 text-sm {recentEvent.tone === 'green' ? 'border-green-700 bg-green-950/40 text-green-300' : recentEvent.tone === 'amber' ? 'border-amber-700 bg-amber-950/40 text-amber-200' : 'border-cyan-700 bg-gray-900 text-cyan-200'}">
					{recentEvent.message}
				</div>
			{/if}

			<BlockchainVisualization
				{blocks}
				{expandedBlockId}
				{selectedPreviousBlock}
				{blockchainId}
				{toggleBlock}
				{timeAgo}
				{selectPreviousBlock}
			/>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<!-- Mempool -->
				<div class="p-4 cyberpunk-box rounded-lg border-l-2 border-l-cyan-600">
					<h2 class="text-lg font-bold mb-3">Mempool <span class="text-sm font-normal text-cyan-600">({mempool.length})</span></h2>

					{#if mempool.length === 0}
						<p class="text-cyan-600 text-sm">No transactions waiting.</p>
					{:else}
						<div class="space-y-2 max-h-[420px] overflow-y-auto pr-2">
							{#each mempool as tx (tx.id)}
								<button
									type="button"
									class="w-full p-3 border border-cyan-800 rounded hover:bg-gray-800 cursor-pointer text-left transition-colors"
									class:bg-cyan-900={selectedTransactions.some((t) => t.id === tx.id)}
									class:ring-1={selectedTransactions.some((t) => t.id === tx.id)}
									class:ring-cyan-500={selectedTransactions.some((t) => t.id === tx.id)}
									aria-label="Toggle transaction"
									onclick={() => toggleTransaction(tx)}
								>
									<div class="flex items-center justify-between gap-4">
										<span class="text-sm text-cyan-300">{tx.senderUsername || "Unknown"} → {tx.recipientUsername || "Unknown"}</span>
										<div class="text-right shrink-0">
											<span class="text-cyan-300 font-bold">{tx.amount} BTC</span>
											{#if selectedTransactions.some((t) => t.id === tx.id)}
												<span class="ml-2 text-xs text-cyan-500">✓</span>
											{/if}
										</div>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Mining -->
				<div class="p-4 cyberpunk-box rounded-lg border-l-2 border-l-cyan-600">
					<div class="flex items-center justify-between mb-3">
						<h2 class="text-lg font-bold">Mine</h2>
						<span class="text-xs text-cyan-600">{selectedTransactions.length} tx selected</span>
					</div>

					<!-- Parent block -->
					<div class="mb-3">
						{#if selectedPreviousBlock}
							<div class="p-2 bg-gray-800 border rounded text-xs flex items-center justify-between {longestChainBlockIds.includes(selectedPreviousBlock.id) ? 'border-purple-700' : 'border-amber-700'}">
								<span class="text-cyan-400">Building on block {selectedPreviousBlock.height}</span>
								<span class="{longestChainBlockIds.includes(selectedPreviousBlock.id) ? 'text-green-400' : 'text-amber-400'}">
									{longestChainBlockIds.includes(selectedPreviousBlock.id) ? 'main chain' : 'side branch'}
								</span>
							</div>
						{:else}
							<div class="p-2 bg-gray-800 border border-red-800 rounded text-xs text-red-400">
								Select a block in the chain above to mine on top of it.
							</div>
						{/if}
					</div>

					<!-- Nonce -->
					<div class="mb-3">
						<label for="mining-nonce" class="block text-xs text-cyan-600 mb-1">Nonce</label>
						<input
							id="mining-nonce"
							type="number"
							bind:value={nonce}
							min="0"
							oninput={updateHash}
							disabled={isMining || autoMining}
							class="w-full p-2 bg-gray-800 border border-cyan-700 rounded text-cyan-300 focus:outline-none focus:ring-1 focus:ring-cyan-500"
						/>
					</div>

					<!-- Hash display -->
					<div class="mb-3">
						<div class="p-2 bg-gray-800 border rounded font-mono text-xs break-all"
							class:border-cyan-800={!currentHash}
							class:border-red-700={currentHash && !isCurrentHashValid()}
							class:border-green-700={currentHash && isCurrentHashValid()}
						>
							{currentHash || '—'}
						</div>
						<div class="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-gray-800">
							<div
								class="{isCurrentHashValid() ? 'bg-green-500' : 'bg-amber-500'} h-full transition-all"
								style={`width: ${Math.min((getLeadingZeroCount(currentHash) / blockchain.leadingZeros) * 100, 100)}%`}
							></div>
						</div>
						<div class="mt-1 flex justify-between text-xs">
							<span class="text-cyan-600">need {blockchain.leadingZeros} zeros</span>
							<span class={getHashTone()}>{getLeadingZeroCount(currentHash)} matched</span>
						</div>
					</div>

					<!-- Hash attempts -->
					{#if generatedHashes.length > 0}
						<div class="mb-3 max-h-[120px] overflow-y-auto space-y-1">
							{#each generatedHashes as hashData}
								<div class="p-1.5 bg-gray-800 border rounded font-mono text-xs flex gap-2"
									class:border-green-700={isValidHash(hashData.hash, blockchain.leadingZeros)}
									class:border-gray-700={!isValidHash(hashData.hash, blockchain.leadingZeros)}
								>
									<span class="text-cyan-600 shrink-0">{hashData.nonce}</span>
									<span class="text-cyan-300 truncate">{hashData.hash}</span>
									{#if isValidHash(hashData.hash, blockchain.leadingZeros)}
										<span class="text-green-500 shrink-0">✓</span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					<!-- Buttons -->
					<div class="flex gap-2 mb-2">
						<button
							onclick={updateHash}
							disabled={isMining || autoMining}
							class="flex-1 py-2 px-3 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold rounded focus:outline-none transition-colors"
						>
							Calculate
						</button>
						<button
							onclick={autoMining ? () => (autoMining = false) : autoMineBlock}
							disabled={isMining}
							class="flex-1 py-2 px-3 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold rounded focus:outline-none transition-colors"
						>
							{autoMining ? "Stop" : "Auto-Mine"}
						</button>
					</div>

					<button
						onclick={mineBlock}
						disabled={isMining || autoMining || !isCurrentHashValid()}
						class="w-full py-3 px-4 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-base font-bold tracking-wide rounded focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
					>
						{isMining ? "Broadcasting..." : "Broadcast Block"}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
