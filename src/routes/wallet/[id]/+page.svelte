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
</script>

<div class="wallet-page">
	{#if isLoading}
		<div class="surface surface-pad page-loader">
			<p class="eyebrow">Loading</p>
			<h2 class="section-title">Syncing wallet</h2>
		</div>
	{:else if error}
		<div class="status-banner status-banner--danger">
			<span>{error}</span>
			<button type="button" class="ui-button-ghost" onclick={() => (error = null)}>Dismiss</button>
		</div>
	{:else}
		<div class="wallet-stack">
			<section class="surface">
				<div class="surface-pad wallet-header">
					<div class="wallet-id">
						<span class="eyebrow">Wallet</span>
						<h1 class="wallet-name">@{user.username}</h1>
					</div>
					<div class="wallet-balance-block">
						<span class="ui-label">Balance</span>
						<div class="wallet-balance__value">{balance.toFixed(4)} BTC</div>
					</div>
					<div class="wallet-actions-group">
						<button type="button" class="ui-button-secondary" onclick={goToChain}>Chain</button>
						<a href="/odds" class="ui-button-ghost">Odds</a>
					</div>
				</div>
			</section>

			<section class="metric-grid">
				<div class="metric">
					<span class="metric-label">Pending</span>
					<span class="metric-value">{pendingTransactions.length}</span>
				</div>
				<div class="metric">
					<span class="metric-label">Confirmed</span>
					<span class="metric-value">{confirmedTransactions.length}</span>
				</div>
				<div class="metric">
					<span class="metric-label">Forked</span>
					<span class="metric-value">{forkedTransactions.length}</span>
				</div>
				<div class="metric">
					<span class="metric-label">Blocks mined</span>
					<span class="metric-value">{minedBlocks.length}</span>
				</div>
			</section>

			<div class="wallet-grid">
				<section class="surface">
					<div class="surface-pad">
						<div class="section-head">
							<div>
								<p class="eyebrow">Send</p>
								<h2 class="section-title">New transaction</h2>
							</div>
						</div>

						{#if users && users.length > 1}
							<div class="recipient-row">
								{#each users.filter((u) => u && u.id !== user.id) as otherUser}
									<button
										type="button"
										class="recipient-pill"
										class:is-selected={recipient === otherUser.username}
										onclick={() => (recipient = otherUser.username)}
									>
										{otherUser.username}
									</button>
								{/each}
							</div>
						{/if}

						<div class="panel-grid">
							<div>
								<label class="ui-label" for="recipient-wallet">Recipient</label>
								<input
									id="recipient-wallet"
									type="text"
									bind:value={recipient}
									placeholder="username"
									class="ui-input"
								/>
							</div>
							<div>
								<label class="ui-label" for="send-amount">Amount (BTC)</label>
								<input
									id="send-amount"
									type="number"
									bind:value={amount}
									min="0.0001"
									step="0.0001"
									max={balance}
									placeholder="0.0000"
									class="ui-input mono"
								/>
							</div>
						</div>

						<button
							type="button"
							class="ui-button send-button"
							onclick={sendTransaction}
							disabled={isSending || !recipient || !amount || amount <= 0 || amount > balance}
						>
							{isSending ? 'Sending...' : 'Send transaction'}
						</button>
					</div>
				</section>

				<section class="surface">
					<div class="surface-pad">
						<div class="section-head">
							<div>
								<p class="eyebrow">Transactions</p>
								<h2 class="section-title">History</h2>
							</div>
						</div>

						{#if !transactions || transactions.length === 0}
							<p class="body-copy empty-copy">No activity yet.</p>
						{:else}
							<div class="table-shell">
								<table class="ui-table">
									<thead>
										<tr>
											<th>Type</th>
											<th>Counterparty</th>
											<th>Amount</th>
											<th>Status</th>
											<th>Block</th>
										</tr>
									</thead>
									<tbody>
										{#each transactions as tx (tx.id)}
											{@const isSender = tx.senderId === user.id}
											{@const isRecipient = tx.recipientId === user.id}
											<tr>
												<td>
													{#if isSender && isRecipient}
														<span class="status-pill status-pill--info">Self</span>
													{:else if isSender}
														<span class="status-pill status-pill--danger">Sent</span>
													{:else if isRecipient}
														<span class="status-pill status-pill--success">Received</span>
													{/if}
												</td>
												<td>
													{#if isSender && isRecipient}
														{tx.recipientUsername}
													{:else if isSender}
														{tx.recipientUsername || '?'}
													{:else}
														{tx.senderUsername || 'System'}
													{/if}
												</td>
												<td class:wallet-amount-forked={tx.status === 'forked'}>
													{#if isSender && !isRecipient}
														<span class="wallet-out">-{tx.amount}</span>
													{:else if isRecipient && !isSender}
														<span class="wallet-in">+{tx.amount}</span>
													{:else}
														<span>{tx.amount}</span>
													{/if}
												</td>
												<td>
													{#if tx.status === 'confirmed'}
														<span class="status-pill status-pill--success">{tx.confirmations}× confirmed</span>
													{:else if tx.status === 'pending'}
														<span class="status-pill status-pill--warn">Pending</span>
													{:else}
														<span class="status-pill status-pill--danger">Forked</span>
													{/if}
												</td>
												<td class="mono">
													{#if tx.block}{tx.block.hash.substring(0, 8)}…{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</div>
				</section>
			</div>

			{#if minedBlocks && minedBlocks.length > 0}
				<section class="surface">
					<div class="surface-pad">
						<div class="section-head">
							<div>
								<p class="eyebrow">Mining</p>
								<h2 class="section-title">Blocks mined</h2>
							</div>
						</div>

						<div class="table-shell">
							<table class="ui-table">
								<thead>
									<tr>
										<th>Height</th>
										<th>Time</th>
										<th>Hash</th>
										<th>Status</th>
										<th>Reward</th>
									</tr>
								</thead>
								<tbody>
									{#each minedBlocks as block (block.id)}
										<tr>
											<td>{block.height}</td>
											<td>{timeAgo(block.minedAt)}</td>
											<td class="mono">{block.hash.substring(0, 10)}…</td>
											<td>
												{#if block.inLongestChain}
													<span class="status-pill status-pill--success">Main chain</span>
												{:else}
													<span class="status-pill status-pill--danger">Side branch</span>
												{/if}
											</td>
											<td>
												{#if block.inLongestChain}
													<span class="wallet-in">{block.reward} BTC</span>
												{:else}
													<span class="wallet-amount-forked">—</span>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</section>
			{/if}
		</div>
	{/if}
</div>

<style>
	.wallet-page,
	.wallet-stack {
		display: grid;
		gap: 1rem;
	}

	.page-loader {
		max-width: 520px;
		margin: 2rem auto 0;
	}

	.wallet-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 2rem;
	}

	.wallet-id {
		flex-shrink: 0;
	}

	.wallet-name {
		margin: 0.15rem 0 0;
		font-size: clamp(1.3rem, 2.4vw, 2rem);
		letter-spacing: -0.03em;
	}

	.wallet-balance-block {
		flex: 1;
	}

	.wallet-balance__value {
		margin-top: 0.3rem;
		font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: clamp(1.7rem, 3vw, 2.8rem);
		font-weight: 700;
		letter-spacing: -0.05em;
		line-height: 1;
	}

	.wallet-actions-group {
		display: flex;
		gap: 0.7rem;
		flex-shrink: 0;
	}

	.wallet-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
		gap: 1rem;
	}

	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.recipient-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.recipient-pill {
		padding: 0.45rem 0.8rem;
		border: 1px solid rgba(103, 232, 249, 0.12);
		border-radius: 999px;
		background: rgba(8, 18, 28, 0.58);
		color: var(--text-muted);
		font-size: 0.85rem;
		cursor: pointer;
		transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
	}

	.recipient-pill:hover,
	.recipient-pill.is-selected {
		border-color: rgba(103, 232, 249, 0.32);
		background: rgba(12, 28, 42, 0.82);
		color: var(--text);
	}

	.send-button {
		width: 100%;
		margin-top: 1rem;
	}

	.empty-copy {
		margin-top: 0.75rem;
	}

	.wallet-out {
		color: #ffb6b6;
	}

	.wallet-in {
		color: #c8ffd8;
	}

	.wallet-amount-forked {
		opacity: 0.45;
		text-decoration: line-through;
	}

	@media (max-width: 860px) {
		.wallet-header,
		.wallet-grid {
			grid-template-columns: 1fr;
		}

		.wallet-header {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
