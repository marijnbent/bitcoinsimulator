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
	let recentEvent = $state(null);
	let latestBlock = $state(null);
	let longestChainBlockIds = $state([]);
	let userPendingTransactions = $state([]);
	let userConfirmedTransactions = $state([]);
	let userMinedBlocks = $state([]);
	let recentEventTimeout = null;

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
		if (blocks.length === 0) {
			selectedPreviousBlock = null;
			return;
		}

		if (!selectedPreviousBlock?.hash) {
			selectedPreviousBlock = blocks.reduce(
				(latest, block) =>
					block.height > latest.height ? block : latest,
				blocks[0],
			);
			return;
		}

		const refreshedSelectedBlock = blocks.find(
			(block) => block.hash === selectedPreviousBlock.hash,
		);

		if (refreshedSelectedBlock) {
			selectedPreviousBlock = refreshedSelectedBlock;
			return;
		}

		selectedPreviousBlock = blocks.reduce(
			(latest, block) =>
				block.height > latest.height ? block : latest,
			blocks[0],
		);
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
			announceChainEvent(
				`New block added at height ${incomingBlock.height}. The chain view just updated for everyone.`,
				"green",
			);
			}
		}
		if (data.mempool) {
			const previousMempoolCount = mempool.length;
			mempool = data.mempool;
			if (previousMempoolCount >= 0 && data.mempool.length > previousMempoolCount) {
				announceChainEvent(
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
		if (recentEventTimeout) clearTimeout(recentEventTimeout);
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
			announceChainEvent(
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
			announceChainEvent(
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

	function announceChainEvent(message, tone = "cyan") {
		recentEvent = { message, tone };
		if (recentEventTimeout) {
			clearTimeout(recentEventTimeout);
		}
		recentEventTimeout = setTimeout(() => {
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

	function goToWallet() {
		goto(`/wallet/${blockchainId}`);
	}
</script>

<div class="blockchain-page">
	{#if error}
		<div class="status-banner status-banner--danger page-banner">
			<span>{error}</span>
			<button type="button" class="ui-button-ghost" onclick={() => (error = null)}>Dismiss</button>
		</div>
	{/if}

	{#if isLoading}
		<div class="surface surface-pad page-loader">
			<p class="eyebrow">Loading</p>
			<h2 class="section-title">Syncing chain state</h2>
		</div>
	{:else if !user}
		<section class="join-shell surface">
			<div class="surface-pad join-grid">
				<div>
					<p class="eyebrow">Join</p>
					<h1 class="section-title join-title">{blockchain?.name || 'Blockchain'}</h1>
					<div class="join-stats">
						<div class="metric">
							<span class="metric-label">Difficulty</span>
							<span class="metric-value">{blockchain?.leadingZeros ?? 0} zeros</span>
						</div>
						<div class="metric">
							<span class="metric-label">Block reward</span>
							<span class="metric-value">{blockchain?.blockReward ?? 0} BTC</span>
						</div>
					</div>
				</div>
				<div class="surface-muted join-form">
					<div class="surface-pad">
						<label class="ui-label" for="chain-user-name">Your name</label>
						<input
							id="chain-user-name"
							type="text"
							bind:value={userName}
							placeholder="Satoshi Student"
							class="ui-input"
						/>
						<p class="join-preview mono">@{userName ? nameToUsername(userName) : 'username'}</p>
						<button
							type="button"
							class="ui-button join-button"
							onclick={registerUser}
							disabled={!userName || isRegistering}
						>
							{isRegistering ? 'Joining...' : 'Join chain'}
						</button>
					</div>
				</div>
			</div>
		</section>
	{:else}
		<div class="workspace-stack">
			<section class="surface">
				<div class="surface-pad chain-header">
					<div class="chain-id">
						<span class="eyebrow">Live</span>
						<h1 class="chain-name">{blockchain.name}</h1>
					</div>

					<div class="chain-stats">
						<div class="cstat">
							<span class="cstat-l">Participants</span>
							<span class="cstat-v">{users.length}</span>
						</div>
						<div class="cstat">
							<span class="cstat-l">Mempool</span>
							<span class="cstat-v">{mempool.length}</span>
						</div>
						<div class="cstat">
							<span class="cstat-l">Height</span>
							<span class="cstat-v">{latestBlock ? latestBlock.height : 0}</span>
						</div>
						<div class="cstat">
							<span class="cstat-l">Balance</span>
							<span class="cstat-v mono">{balance.toFixed(4)}</span>
						</div>
						<div class="cstat">
							<span class="cstat-l">Difficulty</span>
							{#if editingDifficulty}
								<div class="diff-edit">
									<button type="button" class="ui-button-ghost mini-button" onclick={() => { if (newDifficulty > 1) newDifficulty -= 1; }}>−</button>
									<span class="mono diff-val">{newDifficulty}</span>
									<button type="button" class="ui-button-ghost mini-button" onclick={() => { if (newDifficulty < 16) newDifficulty += 1; }}>+</button>
									<button type="button" class="ui-button-secondary" onclick={saveDifficulty} disabled={isSavingDifficulty}>{isSavingDifficulty ? '...' : 'Save'}</button>
									<button type="button" class="ui-button-ghost" onclick={() => (editingDifficulty = false)}>Cancel</button>
								</div>
							{:else}
								<button type="button" class="cstat-v cstat-edit" onclick={() => { newDifficulty = blockchain.leadingZeros; editingDifficulty = true; }}>
									{blockchain.leadingZeros}
								</button>
							{/if}
						</div>
					</div>

					<div class="chain-actions">
						<button type="button" class="ui-button" onclick={goToWallet}>Open wallet</button>
						<a href="/odds" class="ui-button-ghost">Odds</a>
					</div>
				</div>
			</section>

			{#if recentEvent}
				<div
					class="status-banner page-banner"
					class:status-banner--success={recentEvent.tone === 'green'}
					class:status-banner--warn={recentEvent.tone === 'amber'}
					class:status-banner--info={recentEvent.tone === 'cyan'}
				>
					<span>{recentEvent.message}</span>
				</div>
			{/if}

			<section class="surface chain-view-shell">
				<div class="surface-pad chain-view-pad">
					<div class="section-head">
						<div>
							<p class="eyebrow">Chain View</p>
							<h2 class="section-title">Main chain and side branches</h2>
						</div>
						<p class="body-copy section-note">Select a block to mine on top of it.</p>
					</div>

					<BlockchainVisualization
						{blocks}
						{expandedBlockId}
						{selectedPreviousBlock}
						{blockchainId}
						{toggleBlock}
						{timeAgo}
						{selectPreviousBlock}
					/>
				</div>
			</section>

			<div class="workspace-columns">
				<section class="surface">
					<div class="surface-pad">
						<div class="section-head">
							<div>
								<p class="eyebrow">Mempool</p>
								<h2 class="section-title">Waiting transactions</h2>
							</div>
							<span class="chip mono">{mempool.length} queued</span>
						</div>

						{#if mempool.length === 0}
							<p class="body-copy empty-copy">No transactions waiting.</p>
						{:else}
							<div class="queue-list">
								{#each mempool as tx (tx.id)}
									<button
										type="button"
										class="queue-item"
										class:is-selected={selectedTransactions.some((t) => t.id === tx.id)}
										onclick={() => toggleTransaction(tx)}
									>
										<div>
											<p class="queue-path">{tx.senderUsername || 'Unknown'} → {tx.recipientUsername || 'Unknown'}</p>
											<p class="queue-meta mono">#{tx.id.slice(0, 8)}</p>
										</div>
										<div class="queue-amount">
											<strong>{tx.amount} BTC</strong>
											{#if selectedTransactions.some((t) => t.id === tx.id)}
												<span class="status-pill status-pill--info">Selected</span>
											{/if}
										</div>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</section>

				<section class="surface">
					<div class="surface-pad">
						<div class="section-head">
							<div>
								<p class="eyebrow">Mine</p>
								<h2 class="section-title">Build a block</h2>
							</div>
							<span class="chip mono">{selectedTransactions.length} tx selected</span>
						</div>

						<div class="surface-muted mining-parent">
							<div class="surface-pad">
								<p class="ui-label">Parent block</p>
								{#if selectedPreviousBlock}
									<div class="parent-row">
										<strong>Block {selectedPreviousBlock.height}</strong>
										<span
											class:status-pill--success={longestChainBlockIds.includes(selectedPreviousBlock.id)}
											class:status-pill--warn={!longestChainBlockIds.includes(selectedPreviousBlock.id)}
											class="status-pill"
										>
											{longestChainBlockIds.includes(selectedPreviousBlock.id) ? 'Main chain' : 'Side branch'}
										</span>
									</div>
								{:else}
									<p class="body-copy">Select a block above first.</p>
								{/if}
							</div>
						</div>

						<label class="ui-label" for="mining-nonce">Nonce</label>
						<input
							id="mining-nonce"
							type="number"
							bind:value={nonce}
							min="0"
							oninput={updateHash}
							disabled={isMining || autoMining}
							class="ui-input mono"
						/>

						<div class="hash-shell">
							<p class="ui-label">Current hash</p>
							<div class="hash-output mono" class:is-valid={currentHash && isCurrentHashValid()}>
								{currentHash || '—'}
							</div>
							<div class="hash-progress">
								<div
									class="hash-progress__fill"
									class:is-valid={currentHash && isCurrentHashValid()}
									style={`width: ${Math.min((getLeadingZeroCount(currentHash) / blockchain.leadingZeros) * 100, 100)}%`}
								></div>
							</div>
							<div class="hash-meta">
								<span class="mono">Need {blockchain.leadingZeros} zeros</span>
								<span class={getHashTone()}>{getLeadingZeroCount(currentHash)} matched</span>
							</div>
						</div>

						{#if generatedHashes.length > 0}
							<div class="attempt-list">
								{#each generatedHashes as hashData}
									<div class="attempt-item" class:is-valid={isValidHash(hashData.hash, blockchain.leadingZeros)}>
										<span class="mono">{hashData.nonce}</span>
										<span class="mono attempt-hash">{hashData.hash}</span>
									</div>
								{/each}
							</div>
						{/if}

						<div class="mining-actions">
							<button type="button" class="ui-button-secondary" onclick={updateHash} disabled={isMining || autoMining}>
								Calculate
							</button>
							<button type="button" class="ui-button-ghost" onclick={autoMining ? () => (autoMining = false) : autoMineBlock} disabled={isMining}>
								{autoMining ? 'Stop' : 'Auto-mine'}
							</button>
						</div>

						<button
							type="button"
							class="ui-button mine-submit"
							onclick={mineBlock}
							disabled={isMining || autoMining || !isCurrentHashValid()}
						>
							{isMining ? 'Broadcasting...' : 'Broadcast block'}
						</button>
					</div>
				</section>
			</div>
		</div>
	{/if}
</div>

<style>
	.blockchain-page,
	.workspace-stack {
		display: grid;
		gap: 1rem;
	}

	.blockchain-page {
		width: 100%;
		max-width: 100%;
		min-width: 0;
		overflow-x: hidden;
	}

	.workspace-stack,
	.workspace-stack > *,
	.workspace-columns > * {
		min-width: 0;
	}

	.page-banner {
		margin-bottom: 0.1rem;
	}

	.page-loader {
		max-width: 520px;
		margin: 2rem auto 0;
	}

	/* Join */
	.join-shell {
		max-width: 820px;
		margin: 1rem auto 0;
	}

	.join-grid {
		display: grid;
		grid-template-columns: 1fr minmax(280px, 0.85fr);
		gap: 1.5rem;
		align-items: start;
	}

	.join-stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	.join-title {
		font-size: clamp(1.4rem, 2vw, 2rem);
		margin-top: 0.25rem;
	}

	.join-preview {
		margin: 0.7rem 0 0;
		color: var(--text-faint);
		font-size: 0.86rem;
	}

	.join-button {
		width: 100%;
		margin-top: 1rem;
	}

	/* Chain header */
	.chain-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 2rem;
	}

	.chain-id {
		flex-shrink: 0;
	}

	.chain-name {
		margin: 0.15rem 0 0;
		font-size: clamp(1.2rem, 2vw, 1.75rem);
		letter-spacing: -0.03em;
	}

	.chain-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.5rem;
		flex: 1;
	}

	.cstat {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.cstat-l {
		color: var(--text-faint);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.cstat-v {
		color: var(--text);
		font-size: 1rem;
		font-weight: 700;
	}

	.cstat-edit {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		color: var(--text);
		font-size: 1rem;
		font-weight: 700;
		text-decoration: underline dotted rgba(103, 232, 249, 0.4);
		text-underline-offset: 3px;
	}

	.diff-edit {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.1rem;
	}

	.diff-val {
		color: var(--text);
		font-weight: 700;
		min-width: 1.5rem;
		text-align: center;
	}

	.chain-actions {
		display: flex;
		gap: 0.7rem;
		flex-shrink: 0;
	}

	/* Workspace */
	.workspace-columns {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
		gap: 1rem;
		min-width: 0;
	}

	.chain-view-shell {
		width: 100%;
		max-width: 100%;
		overflow: hidden;
	}

	.chain-view-pad {
		min-width: 0;
	}

	.section-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		margin-bottom: 1rem;
	}

	.section-note {
		font-size: 0.88rem;
	}

	/* Queue */
	.queue-list {
		display: grid;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.queue-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.7rem 0.9rem;
		border: 1px solid rgba(103, 232, 249, 0.1);
		border-radius: 0.75rem;
		background: rgba(8, 18, 28, 0.6);
		color: var(--text-muted);
		text-align: left;
		cursor: pointer;
		transition: border-color 160ms ease, background 160ms ease;
	}

	.queue-item.is-selected {
		border-color: rgba(103, 232, 249, 0.35);
		background: rgba(12, 28, 42, 0.82);
	}

	.queue-path,
	.queue-meta,
	.parent-row strong {
		margin: 0;
	}

	.queue-path {
		color: var(--text);
		font-size: 0.9rem;
		font-weight: 600;
	}

	.queue-meta {
		margin-top: 0.2rem;
		color: var(--text-faint);
		font-size: 0.76rem;
	}

	.queue-amount {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.3rem;
		font-size: 0.9rem;
		color: var(--text);
	}

	.empty-copy {
		margin-top: 0.75rem;
	}

	/* Mining */
	.mining-parent {
		margin-top: 0.25rem;
		margin-bottom: 1rem;
	}

	.parent-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.4rem;
	}

	.hash-shell {
		margin-top: 1rem;
	}

	.hash-output {
		margin-top: 0.4rem;
		padding: 0.7rem 0.9rem;
		border: 1px solid rgba(103, 232, 249, 0.14);
		border-radius: 0.75rem;
		background: rgba(7, 17, 27, 0.88);
		font-size: 0.8rem;
		word-break: break-all;
		color: var(--text-muted);
		line-height: 1.5;
		transition: border-color 200ms ease, color 200ms ease;
	}

	.hash-output.is-valid {
		border-color: rgba(134, 239, 172, 0.4);
		color: #d9ffe4;
	}

	.hash-progress {
		height: 0.35rem;
		margin-top: 0.5rem;
		background: rgba(103, 232, 249, 0.08);
		border-radius: 999px;
		overflow: hidden;
	}

	.hash-progress__fill {
		height: 100%;
		background: linear-gradient(90deg, #facc15, #fb923c);
		transition: width 100ms ease;
	}

	.hash-progress__fill.is-valid {
		background: linear-gradient(90deg, #86efac, #4ade80);
	}

	.hash-meta {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 0.4rem;
		font-size: 0.78rem;
		color: var(--text-faint);
	}

	.attempt-list {
		display: grid;
		gap: 0.25rem;
		margin-top: 0.75rem;
	}

	.attempt-item {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.7rem;
		padding: 0.4rem 0.7rem;
		border: 1px solid rgba(103, 232, 249, 0.08);
		border-radius: 0.5rem;
		background: rgba(8, 18, 28, 0.55);
		font-size: 0.76rem;
		color: var(--text-faint);
	}

	.attempt-item.is-valid {
		border-color: rgba(134, 239, 172, 0.26);
		color: #a8ffbc;
	}

	.attempt-hash {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.mining-actions {
		display: flex;
		gap: 0.7rem;
		margin-top: 1rem;
	}

	.mine-submit {
		width: 100%;
		margin-top: 0.75rem;
	}

	.mini-button {
		width: 2rem;
		height: 2rem;
		padding: 0;
	}

	@media (max-width: 860px) {
		.join-grid,
		.workspace-columns {
			grid-template-columns: 1fr;
		}

		.chain-header {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
