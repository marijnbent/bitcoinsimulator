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

	// Get blockchain ID from URL
	const blockchainId = $page.params.id;

	// State
	let blockchain = $state(null);
	let blocks = $state([]);
	let blockTree = $state([]); // Organized blocks with height and fork information
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
	const maxHashesToShow = 5;

	// State for controlling fork display
	let showAllForks = $state(false);

	// Build the block tree structure when blocks are loaded or updated
	$effect(() => {
		if (blocks.length > 0) {
			buildBlockTree();
		}
	});

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

	// Function to build the block tree structure with chains and forks
	function buildBlockTree() {
		// Create a map of blocks by hash for quick lookup
		const blocksByHash = {};
		blocks.forEach((block) => {
			blocksByHash[block.hash] = { 
				...block, 
				children: [], 
				height: -1,
				isInLongestChain: false, // Flag for blocks in the longest chain
				forkParent: null, // Hash of the block this fork branches from
				column: -1, // Column position in the grid (based on height)
				row: -1 // Row position in the grid (0 for main chain, 1+ for forks)
			};
		});

		// Find the genesis block (the one with no previous hash or self-referential)
		let genesisBlock = blocks.find(
			(block) => !block.previousHash || block.previousHash === block.hash,
		);

		if (!genesisBlock && blocks.length > 0) {
			// If no genesis block found, use the oldest block as genesis
			genesisBlock = blocks.reduce(
				(oldest, block) =>
					block.minedAt < oldest.minedAt ? block : oldest,
				blocks[0],
			);
		}

		// If no blocks, return empty tree
		if (!genesisBlock) {
			blockTree = [];
			return;
		}

		// Build the tree structure by connecting blocks through previousHash
		blocks.forEach((block) => {
			if (
				block.hash !== genesisBlock.hash &&
				block.previousHash &&
				blocksByHash[block.previousHash]
			) {
				blocksByHash[block.previousHash].children.push(
					blocksByHash[block.hash],
				);
			}
		});

		// Assign heights using BFS traversal
		const queue = [{ block: blocksByHash[genesisBlock.hash], height: 0 }];
		const processed = new Set();

		while (queue.length > 0) {
			const { block, height } = queue.shift();

			// Skip if already processed with a lower height
			if (processed.has(block.hash) && block.height <= height) {
				continue;
			}

			// Assign height and mark as processed
			block.height = height;
			block.column = height; // Column position is based on height
			processed.add(block.hash);

			// Add children to queue
			block.children.forEach((child) => {
				queue.push({ block: child, height: height + 1 });
			});
		}

		// Find the longest chain and mark blocks in it
		let longestChainTip = null;
		let maxHeight = -1;

		// Find the tip of the longest chain
		Object.values(blocksByHash).forEach(block => {
			if (block.height > maxHeight) {
				maxHeight = block.height;
				longestChainTip = block;
			}
		});

		// Mark all blocks in the longest chain
		if (longestChainTip) {
			let current = longestChainTip;
			while (current) {
				current.isInLongestChain = true;
				current.row = 0; // Main chain is always in row 0
				// Move to parent block
				current = current.previousHash && blocksByHash[current.previousHash];
			}
		}

		// Find fork points and assign rows to fork chains
		let nextForkRow = 1;
		const forkPoints = [];
		
		// Identify all fork points (blocks with multiple children)
		Object.values(blocksByHash).forEach(block => {
			if (block.children.length > 1) {
				// Sort children: longest chain first, then by height
				block.children.sort((a, b) => {
					if (a.isInLongestChain && !b.isInLongestChain) return -1;
					if (!a.isInLongestChain && b.isInLongestChain) return 1;
					return b.height - a.height;
				});
				
				// The first child is part of the main chain, the rest are forks
				const forkChildren = block.children.filter(child => !child.isInLongestChain);
				
				if (forkChildren.length > 0) {
					forkPoints.push({
						parent: block,
						forkChildren
					});
				}
			}
		});
		
		// Create a map to track which columns are occupied in each row
		// This helps us reuse rows when possible
		const occupiedPositions = new Map();
		
		// Helper function to check if a position is available
		const isPositionAvailable = (row, column) => {
			const key = `${row},${column}`;
			return !occupiedPositions.has(key);
		};
		
		// Helper function to mark a position as occupied
		const markPositionOccupied = (row, column) => {
			const key = `${row},${column}`;
			occupiedPositions.set(key, true);
		};
		
		// Helper function to find the first available row for a fork chain
		const findAvailableRow = (startColumn, endColumn) => {
			let row = 1;
			while (true) {
				let rowAvailable = true;
				
				// Check if all positions in this row from startColumn to endColumn are available
				for (let col = startColumn; col <= endColumn; col++) {
					if (!isPositionAvailable(row, col)) {
						rowAvailable = false;
						break;
					}
				}
				
				if (rowAvailable) {
					return row;
				}
				
				row++;
			}
		};
		
		// Process each fork point
		forkPoints.forEach(({ parent, forkChildren }) => {
			// Group forks by their end column (height)
			const forksByEndColumn = new Map();
			
			// First, determine the end column for each fork chain
			forkChildren.forEach(forkChild => {
				// Mark this fork child as a fork
				forkChild.forkParent = parent.hash;
				
				// Find the end of this fork chain
				let endColumn = forkChild.column;
				let current = forkChild;
				const processed = new Set([current.hash]);
				
				// Process all descendants of this fork to find the furthest one
				const queue = [current];
				while (queue.length > 0) {
					const block = queue.shift();
					
					if (block.column > endColumn) {
						endColumn = block.column;
					}
					
					// Process all children
					block.children.forEach(child => {
						if (!processed.has(child.hash)) {
							processed.add(child.hash);
							queue.push(child);
						}
					});
				}
				
				// Group by end column
				if (!forksByEndColumn.has(endColumn)) {
					forksByEndColumn.set(endColumn, []);
				}
				forksByEndColumn.get(endColumn).push({
					startBlock: forkChild,
					endColumn,
					blocks: Array.from(processed).map(hash => blocksByHash[hash])
				});
			});
			
			// Now assign rows to forks, trying to reuse rows when possible
			Array.from(forksByEndColumn.entries())
				.sort((a, b) => b[0] - a[0]) // Sort by end column descending (longest forks first)
				.forEach(([endColumn, forks]) => {
					forks.forEach(fork => {
						const startColumn = fork.startBlock.column;
						
						// Find an available row for this fork
						const rowForThisFork = findAvailableRow(startColumn, endColumn);
						
						// Mark all positions in this fork chain as occupied
						for (let col = startColumn; col <= endColumn; col++) {
							markPositionOccupied(rowForThisFork, col);
						}
						
						// Assign the row to all blocks in this fork chain
						fork.blocks.forEach(block => {
							block.row = rowForThisFork;
						});
					});
				});
		});
		
		// Create a grid structure for the blocks
		// First, determine the maximum height and row
		const maxColumn = maxHeight;
		
		// Find the maximum row used by any block
		let maxRow = 0;
		Object.values(blocksByHash).forEach(block => {
			if (block.row > maxRow) {
				maxRow = block.row;
			}
		});
		
		// Create a 2D grid with empty cells (ensure at least one row)
		const grid = Array(Math.max(maxRow + 1, 1)).fill().map(() => Array(maxColumn + 1).fill(null));
		
		// Place blocks in the grid
		Object.values(blocksByHash).forEach(block => {
			if (block.row >= 0 && block.column >= 0) {
				grid[block.row][block.column] = block;
			}
		});
		
		blockTree = {
			grid,
			maxRow,
			maxColumn,
			blocksByHash
		};
	}

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
		// Check if user exists for this blockchain
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
				on:click={() => (error = null)}
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
				on:click={registerUser}
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

			<!-- Blockchain Visualization -->
			<div class="mb-8">
				<h2 class="text-2xl font-bold mb-4">Blockchain</h2>

				{#if blocks.length === 0}
					<div class="p-6 cyberpunk-box rounded-lg text-center">
						<p class="text-cyan-500">
							No blocks in the blockchain yet. Mine the first
							block!
						</p>
					</div>
				{:else}
					<div class="overflow-x-auto pb-4">
						<div class="grid-container" style="min-width: max-content;">
							<!-- Check if blockTree is an array (old format) or object (new format) -->
							{#if Array.isArray(blockTree)}
								<!-- Old format - display chains as before -->
								<div class="flex flex-col space-y-6">
									{#each blockTree as chain}
										<div class="flex flex-col">
											<!-- Chain label -->
											<div class="mb-2 ml-2">
												{#if chain.isLongestChain}
													<span class="text-green-400 font-bold">Longest Chain</span>
												{:else}
													<span class="text-yellow-400">Fork Chain</span>
												{/if}
											</div>
											
											<!-- Chain blocks -->
											<div class="flex items-center">
												{#each chain.blocks as block, blockIndex}
													<!-- Connection line to previous block in same chain -->
													{#if blockIndex > 0}
														<div class="h-[2px] w-4 bg-cyan-600 self-center"></div>
													{/if}
													
													<!-- Block card -->
													<div
														class="cyberpunk-box rounded-lg p-4 min-w-[250px] hover:border-cyan-600 transition-colors relative"
														class:cyberpunk-box-selected={selectedPreviousBlock && selectedPreviousBlock.hash === block.hash}
														class:border-green-500={chain.isLongestChain}
														class:border-yellow-500={!chain.isLongestChain}
													>
														<div class="mb-2 flex justify-between items-center">
															<span class="font-bold text-cyan-400">Block {block.height}</span>
															<span class="text-xs text-cyan-600">{timeAgo(block.minedAt)}</span>
														</div>

														<div class="mb-2">
															<span class="text-cyan-500">Hash:</span>
															<span class="text-xs text-cyan-300 break-all">{block.hash.substring(0, 16)}...</span>
														</div>

														<div class="mb-2">
															<span class="text-cyan-500">Previous:</span>
															<span class="text-xs text-cyan-300 break-all">
																{block.previousHash.substring(0, 16)}...
															</span>
														</div>

														<div class="mb-2">
															<span class="text-cyan-500">Miner:</span>
															<span class="text-cyan-300">{block.minerUsername || "Unknown"}</span>
														</div>

														<div class="mb-2">
															<span class="text-cyan-500">Nonce:</span>
															<span class="text-cyan-300">{block.nonce}</span>
														</div>

														<div class="flex justify-between items-center">
															<div>
																<span class="text-cyan-500">Transactions:</span>
																<span class="text-cyan-300">{block.transactions ? block.transactions.length : 0}</span>
															</div>
															<div class="flex space-x-2">
																<button
																	on:click={() => toggleBlock(block.id)}
																	class="text-cyan-400 hover:text-cyan-300 focus:outline-none cursor-pointer"
																	title="View Transactions"
																>
																	<svg
																		xmlns="http://www.w3.org/2000/svg"
																		class="h-5 w-5"
																		viewBox="0 0 20 20"
																		fill="currentColor"
																	>
																		<path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
																		<path
																			fill-rule="evenodd"
																			d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
																			clip-rule="evenodd"
																		/>
																	</svg>
																</button>
																<button
																	on:click={() => (selectedPreviousBlock = block)}
																	class="text-purple-400 hover:text-purple-300 focus:outline-none cursor-pointer"
																	title="Select as Previous Block"
																	disabled={selectedPreviousBlock && selectedPreviousBlock.id === block.id}
																>
																	<svg
																		xmlns="http://www.w3.org/2000/svg"
																		class="h-5 w-5"
																		viewBox="0 0 20 20"
																		fill="currentColor"
																	>
																		<path
																			fill-rule="evenodd"
																			d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
																			clip-rule="evenodd"
																		/>
																	</svg>
																</button>
															</div>
														</div>
														
														<!-- Fork connection indicator -->
														{#if !chain.isLongestChain && blockIndex === 0 && chain.forkParent}
															<div class="absolute -top-6 left-1/2 transform -translate-x-1/2 h-6 w-[2px] bg-yellow-500"></div>
														{/if}
													</div>
												{/each}
											</div>
										</div>
									{/each}
								</div>
							{:else if blockTree && blockTree.grid}
								<!-- New format - grid layout -->
								<div class="grid" style="display: grid; grid-template-columns: repeat({blockTree.maxColumn + 1}, minmax(270px, 1fr)); gap: 1rem;">
									<!-- For each row in the grid -->
									{#each Array(blockTree.maxRow + 1) as _, rowIndex}
										<!-- For each column in the grid -->
										{#each Array(blockTree.maxColumn + 1) as _, colIndex}
											<!-- Cell for this position -->
											<div class="grid-cell" style="grid-row: {rowIndex + 1}; grid-column: {colIndex + 1}; min-height: 200px; position: relative;">
												<!-- If there's a block at this position -->
												{#if blockTree.grid[rowIndex] && blockTree.grid[rowIndex][colIndex]}
													{@const block = blockTree.grid[rowIndex][colIndex]}
													
													<!-- Horizontal connection line to previous block -->
													{#if colIndex > 0 && blockTree.grid[rowIndex] && blockTree.grid[rowIndex][colIndex - 1]}
														<div class="h-[2px] w-4 bg-cyan-600 absolute left-[-1rem] top-[100px]"></div>
													{/if}
													
													<!-- Vertical connection line to parent block if this is a fork -->
													{#if block.forkParent && rowIndex > 0}
														<div class="w-[2px] h-8 bg-yellow-500 absolute left-[50%] top-[-2rem]"></div>
													{/if}
													
													<!-- Block card -->
													<div
														class="cyberpunk-box rounded-lg p-4 hover:border-cyan-600 transition-colors"
														class:cyberpunk-box-selected={selectedPreviousBlock && selectedPreviousBlock.hash === block.hash}
														class:border-green-500={block.isInLongestChain}
														class:border-yellow-500={!block.isInLongestChain}
													>
													<div class="mb-2 flex justify-between items-center">
														<span class="font-bold text-cyan-400">Block {block.height}</span>
														<span class="text-xs text-cyan-600">{timeAgo(block.minedAt)}</span>
													</div>

													<div class="mb-2">
														<span class="text-cyan-500">Hash:</span>
														<span class="text-xs text-cyan-300 break-all">{block.hash.substring(0, 16)}...</span>
													</div>

													<div class="mb-2">
														<span class="text-cyan-500">Previous:</span>
														<span class="text-xs text-cyan-300 break-all">
															{block.previousHash.substring(0, 16)}...
														</span>
													</div>

													<div class="mb-2">
														<span class="text-cyan-500">Miner:</span>
														<span class="text-cyan-300">{block.minerUsername || "Unknown"}</span>
													</div>

													<div class="mb-2">
														<span class="text-cyan-500">Nonce:</span>
														<span class="text-cyan-300">{block.nonce}</span>
													</div>

													<div class="flex justify-between items-center">
														<div>
															<span class="text-cyan-500">Transactions:</span>
															<span class="text-cyan-300">{block.transactions ? block.transactions.length : 0}</span>
														</div>
														<div class="flex space-x-2">
															<button
																on:click={() => toggleBlock(block.id)}
																class="text-cyan-400 hover:text-cyan-300 focus:outline-none cursor-pointer"
																title="View Transactions"
															>
																<svg
																	xmlns="http://www.w3.org/2000/svg"
																	class="h-5 w-5"
																	viewBox="0 0 20 20"
																	fill="currentColor"
																>
																	<path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
																	<path
																		fill-rule="evenodd"
																		d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
																		clip-rule="evenodd"
																	/>
																</svg>
															</button>
															<button
																on:click={() => (selectedPreviousBlock = block)}
																class="text-purple-400 hover:text-purple-300 focus:outline-none cursor-pointer"
																title="Select as Previous Block"
																disabled={selectedPreviousBlock && selectedPreviousBlock.id === block.id}
															>
																<svg
																	xmlns="http://www.w3.org/2000/svg"
																	class="h-5 w-5"
																	viewBox="0 0 20 20"
																	fill="currentColor"
																>
																	<path
																		fill-rule="evenodd"
																		d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
																		clip-rule="evenodd"
																	/>
																</svg>
															</button>
														</div>
													</div>
												</div>
												{/if}
											</div>
										{/each}
									{/each}
								</div>
							{/if}
						</div>
					</div>

					<!-- Expanded Block Transactions -->
					{#if expandedBlockId}
						{@const expandedBlock = blocks.find(
							(b) => b.id === expandedBlockId,
						)}
						{#if expandedBlock}
							<div class="mt-4 p-4 cyberpunk-box rounded-lg">
								<h3 class="text-xl font-bold mb-4">
									Transactions in Block
								</h3>

								{#if expandedBlock.transactions && expandedBlock.transactions.length > 0}
									<div class="overflow-x-auto">
										<table class="w-full text-left">
											<thead>
												<tr
													class="border-b border-cyan-800"
												>
													<th
														class="p-2 text-cyan-500"
														>From</th
													>
													<th
														class="p-2 text-cyan-500"
														>To</th
													>
													<th
														class="p-2 text-cyan-500"
														>Amount</th
													>
												</tr>
											</thead>
											<tbody>
												{#each expandedBlock.transactions as tx (tx.id)}
													<tr
														class="border-b border-cyan-900"
													>
														<td
															class="p-2 text-cyan-300"
															>{tx.senderUsername ||
																"System"}</td
														>
														<td
															class="p-2 text-cyan-300"
															>{tx.recipientUsername ||
																"Unknown"}</td
														>
														<td
															class="p-2 text-cyan-300"
															>{tx.amount} BTC</td
														>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{:else}
									<p class="text-cyan-500">
										No transactions in this block.
									</p>
								{/if}
							</div>
						{/if}
					{/if}
				{/if}
			</div>

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
							class="space-y-2 max-h-[300px] overflow-y-auto pr-2"
						>
							{#each mempool as tx (tx.id)}
								<div
									class="p-3 border border-cyan-800 rounded flex justify-between items-center hover:bg-gray-800 cursor-pointer"
									class:bg-cyan-900={selectedTransactions.some(
										(t) => t.id === tx.id,
									)}
									on:click={() => toggleTransaction(tx)}
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
							on:input={updateHash}
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

					Selected: {selectedTransactions.length} transactions

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
							on:click={updateHash}
							disabled={isMining || autoMining}
							class="flex-1 py-2 px-4 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors"
						>
							Calculate Hash
						</button>

						<button
							on:click={autoMining
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
						on:click={mineBlock}
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
