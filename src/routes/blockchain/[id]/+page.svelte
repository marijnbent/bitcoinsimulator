<script>
	import { onMount, onDestroy } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { getUser, saveUser } from "$lib/utils/storage.js";
	import { createUpdateStore } from "$lib/utils/updates.js";
	import {
		calculateBlockHash,
		isValidHash,
		nameToUsername,
		generateKeyPair,
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


	// Create update store
	const updateStore = createUpdateStore(blockchainId, {
		blocks: [],
		mempool: [],
	});

	// Subscribe to updates
	const unsubscribe = updateStore.subscribe((data) => {
		if (data.blocks) {
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
		}
		if (data.mempool) mempool = data.mempool;
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
				throw new Error(
					`Failed to register user: ${response.statusText}`,
				);
			}

			user = await response.json();

			// Save user to localStorage
			saveUser(user);

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
		selectedPreviousBlock = block;
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
		<!-- User Registration/Login Form -->
		<div class="max-w-md mx-auto p-6 cyberpunk-box rounded-lg">
			<h2 class="text-2xl font-bold mb-6 text-center">Create or Login to Account</h2>

			<p class="mb-4 text-cyan-500">
				To interact with the blockchain, you need to create an account
				or login to an existing one.
			</p>

			<div class="mb-4">
				<label class="block text-sm text-cyan-500 mb-1">
					Your Name
				</label>
				<input
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
				{isRegistering ? "Logging in..." : "Login / Create Account"}
			</button>
		</div>
	{:else}
		<!-- Blockchain View -->
		<div>
			<div class="flex justify-between items-center mb-6">
				<h1 class="text-3xl font-bold cyberpunk-glow">
					{blockchain.name}
				</h1>

				<div class="text-cyan-500">
					<span class="mr-4"
						>Difficulty: {blockchain.leadingZeros} zeros</span
					>
					<span>Block Reward: {blockchain.blockReward} BTC</span>
				</div>
			</div>

			<!-- User Info -->
			<div class="mb-6 p-4 cyberpunk-box rounded-lg">
				<h2 class="text-xl font-bold mb-2">Your Account</h2>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<p class="text-cyan-500">
							Name: <span class="text-cyan-300">{user.name}</span>
						</p>
						<p class="text-cyan-500">
							Username: <span class="text-cyan-300"
								>{user.username}</span
							>
						</p>
					</div>
					<div>
						<p class="text-cyan-500">
							Public Key: <span
								class="text-cyan-300 text-xs break-all"
								>{user.publicKey}</span
							>
						</p>
					</div>
				</div>

				<!-- Active Users -->
				{#if users.length > 0}
					<div class="mt-4">
						<p class="text-cyan-500 mb-2">Active Users:</p>
						<div class="flex flex-wrap gap-2">
							{#each users.filter(u => u.id !== user.id) as otherUser}
								<span class="px-3 py-1 text-sm rounded-full bg-gray-800 text-cyan-400 border border-cyan-600">
									{otherUser.username}
								</span>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Blockchain Visualization Component -->
			<BlockchainVisualization
				{blocks}
				{expandedBlockId}
				{selectedPreviousBlock}
				{blockchainId}
				{toggleBlock}
				{timeAgo}
				{selectPreviousBlock}
			/>

			<!-- Mining Interface -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<!-- Mempool Transactions -->
				<div class="p-4 cyberpunk-box rounded-lg">
					<h2 class="text-xl font-bold mb-4">Mempool Transactions</h2>

					{#if mempool.length === 0}
						<p class="text-cyan-500">
							No pending transactions in the mempool.
						</p>
					{:else}
						<div
							class="space-y-2 max-h-[400px] overflow-y-auto pr-2"
						>
							{#each mempool as tx (tx.id)}
								<div
									class="p-3 border border-cyan-800 rounded flex justify-between items-center hover:bg-gray-800 cursor-pointer"
									class:bg-cyan-900={selectedTransactions.some(
										(t) => t.id === tx.id,
									)}
									aria-label="Add to block"
									onclick={() => toggleTransaction(tx)}
								>
									<div>
										<div class="text-sm">
											<span class="text-cyan-500"
												>From:</span
											>
											<span class="text-cyan-300"
												>{tx.senderUsername ||
													"Unknown"}</span
											>
										</div>
										<div class="text-sm">
											<span class="text-cyan-500"
												>To:</span
											>
											<span class="text-cyan-300"
												>{tx.recipientUsername ||
													"Unknown"}</span
											>
										</div>
									</div>
									<div class="text-cyan-300 font-bold">
										{tx.amount} BTC
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Mining Controls -->
				<div class="p-4 cyberpunk-box rounded-lg">
					<h2 class="text-xl font-bold mb-4">Mining Controls</h2>

					<!-- Selected Previous Block -->
					<div class="mb-4">
						<label class="block text-sm text-cyan-500 mb-1">
							Previous Block:
						</label>
						{#if selectedPreviousBlock}
							<div
								class="p-2 bg-gray-800 border border-purple-700 rounded text-xs"
							>
								<div class="flex justify-between items-center">
									<span class="text-cyan-300"
										>Hash: {selectedPreviousBlock.hash.substring(
											0,
											16,
										)}...</span
									>
									<span class="text-cyan-600"
										>Miner: {selectedPreviousBlock.minerUsername ||
											"Unknown"}</span
									>
								</div>
							</div>
						{:else}
							<div
								class="p-2 bg-gray-800 border border-red-700 rounded text-xs text-red-500"
							>
								No previous block selected. Please select a
								block from the blockchain.
							</div>
						{/if}
					</div>

					<!-- Nonce Input -->
					<div class="mb-4">
						<label class="block text-sm text-cyan-500 mb-1">
							Nonce:
						</label>
						<input
							type="number"
							bind:value={nonce}
							min="0"
							oninput={updateHash}
							disabled={isMining || autoMining}
							class="w-full p-2 bg-gray-800 border border-cyan-700 rounded text-cyan-300 focus:outline-none focus:ring-1 focus:ring-cyan-500"
						/>
					</div>

					<!-- Current Hash -->
					<div class="mb-4">
						<label class="block text-sm text-cyan-500 mb-1">
							Current Hash:
						</label>
						<div
							class="p-2 bg-gray-800 border rounded font-mono text-xs break-all"
							class:border-red-700={currentHash &&
								!isCurrentHashValid()}
							class:border-green-700={currentHash &&
								isCurrentHashValid()}
						>
							{currentHash ||
								'Click "Calculate Hash" to generate'}
						</div>
						<span class="text-xs"
							>Target: {blockchain.leadingZeros} leading zeros</span
						>
					</div>

					<span class="block mb-2">Selected: {selectedTransactions.length} transactions</span>

					<!-- Generated Hashes -->
					{#if generatedHashes.length > 0}
						<div class="mb-4">
							<label class="block text-sm text-cyan-500 mb-1">
								Recent Hashes:
							</label>
							<div class="max-h-[150px] overflow-y-auto">
								{#each generatedHashes as hashData}
									<div
										class="p-2 mb-1 bg-gray-800 border rounded font-mono text-xs break-all"
										class:border-green-700={isValidHash(
											hashData.hash,
											blockchain.leadingZeros,
										)}
										class:border-red-700={!isValidHash(
											hashData.hash,
											blockchain.leadingZeros,
										)}
									>
										<div class="flex justify-between">
											<span class="text-cyan-600"
												>Nonce: {hashData.nonce}</span
											>
											{#if isValidHash(hashData.hash, blockchain.leadingZeros)}
												<span class="text-green-500"
													>✓ Valid</span
												>
											{/if}
										</div>
										<div class="mt-1 text-cyan-300">
											{hashData.hash}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Mining Buttons -->
					<div class="flex space-x-4 mb-4">
						<button
							onclick={updateHash}
							disabled={isMining || autoMining}
							class="flex-1 py-2 px-4 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors"
						>
							Calculate Hash
						</button>

						<button
							onclick={autoMining
								? () => (autoMining = false)
								: autoMineBlock}
							disabled={isMining}
							class="flex-1 py-2 px-4 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors"
						>
							{autoMining ? "Stop Mining" : "Auto-Mine"}
						</button>
					</div>

					<!-- Broadcast Button -->
					<button
						onclick={mineBlock}
						disabled={isMining ||
							autoMining ||
							!isCurrentHashValid()}
						class="w-full py-2 px-4 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
					>
						Broadcast Block
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
