<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let publicBlockchain = null;
	let connectBlockchainName = '';
	let isLoading = true;
	let error = null;

	let newBlockchainName = '';
	let leadingZeros = 4;
	let blockReward = 3.125;
	let isCreating = false;
	let isConnecting = false;

	onMount(async () => {
		try {
			const response = await fetch('/api/blockchain');
			if (!response.ok) {
				throw new Error(`Failed to fetch blockchains: ${response.statusText}`);
			}

			const blockchains = await response.json();
			publicBlockchain = blockchains.find((blockchain) => blockchain.name === 'Public');
			isLoading = false;
		} catch (err) {
			console.error('Error fetching blockchains:', err);
			error = err.message;
			isLoading = false;
		}
	});

	function enterPublicBlockchain() {
		if (publicBlockchain) {
			goto(`/blockchain/${publicBlockchain.id}`);
			return;
		}

		error = 'Public blockchain not available';
	}

	async function connectToBlockchain() {
		if (!connectBlockchainName) {
			error = 'Blockchain name is required';
			return;
		}

		isConnecting = true;

		try {
			const response = await fetch(
				`/api/blockchain/name/${encodeURIComponent(connectBlockchainName)}`,
			);

			if (!response.ok) {
				if (response.status === 404) {
					throw new Error(
						`Blockchain not found. The blockchain with name "${connectBlockchainName}" may have been deleted or the database was reset.`,
					);
				}

				throw new Error(`Error connecting to blockchain: ${response.statusText}`);
			}

			const foundBlockchain = await response.json();
			goto(`/blockchain/${foundBlockchain.id}`);
		} catch (err) {
			console.error('Error connecting to blockchain:', err);
			error = err.message;
			isConnecting = false;
		}
	}

	async function createNewBlockchain() {
		if (!newBlockchainName) {
			error = 'Blockchain name is required';
			return;
		}

		isCreating = true;

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
			goto(`/blockchain/${newBlockchain.id}`);
		} catch (err) {
			console.error('Error creating blockchain:', err);
			error = err.message;
			isCreating = false;
		}
	}
</script>

<svelte:head>
	<title>Bitcoin Simulator</title>
</svelte:head>

<div class="landing">
	<div class="landing-copy">
		<p class="landing-kicker">Bitcoin Simulator</p>
		<h1 class="landing-title">Bitcoin, in motion.</h1>
		<p class="landing-sub">Create transactions, mine blocks, watch forks unfold.</p>
		<div class="landing-notes" aria-label="Highlights">
			<p><span>Observe</span><strong>Blocks, mempool activity, and wallet changes in real time.</strong></p>
			<p><span>Experiment</span><strong>Spin up a chain, tune difficulty, and test mining economics.</strong></p>
			<p><span>Understand</span><strong>See why private-key guessing is the wrong mental model for attacks.</strong></p>
		</div>
		<div class="landing-btns">
			<button type="button" class="ui-button" onclick={enterPublicBlockchain} disabled={isLoading}>
				{isLoading ? 'Loading...' : 'Open public chain'}
			</button>
			<a href="/osint" class="ui-button-secondary">OSINT desk</a>
			<a href="/odds" class="ui-button-ghost">Private key odds</a>
		</div>
	</div>

	<div class="landing-forms">
		{#if error}
			<div class="status-banner status-banner--danger">
				<span>{error}</span>
				<button type="button" class="ui-button-ghost" onclick={() => (error = null)}>Dismiss</button>
			</div>
		{/if}

		<div class="surface">
			<div class="surface-pad">
				<p class="eyebrow">Connect to existing chain</p>
				<input
					id="blockchain-name"
					type="text"
					bind:value={connectBlockchainName}
					placeholder="Chain name"
					class="ui-input"
				/>
				<button
					type="button"
					class="ui-button-secondary form-btn"
					onclick={connectToBlockchain}
					disabled={isConnecting || !connectBlockchainName}
				>
					{isConnecting ? 'Connecting...' : 'Connect'}
				</button>
			</div>
		</div>

		<div class="surface">
			<div class="surface-pad">
				<p class="eyebrow">Create new chain</p>
				<input
					id="new-blockchain-name"
					type="text"
					bind:value={newBlockchainName}
					placeholder="Chain name"
					class="ui-input"
				/>
				<div class="create-row">
					<div>
						<label class="ui-label" for="leading-zeros">Difficulty</label>
						<input
							id="leading-zeros"
							type="range"
							bind:value={leadingZeros}
							min="1"
							max="16"
							class="ui-range"
						/>
						<div class="range-meta">
							<span>1</span><strong>{leadingZeros}</strong><span>16</span>
						</div>
					</div>
					<div>
						<label class="ui-label" for="block-reward">Block reward</label>
						<input
							id="block-reward"
							type="number"
							bind:value={blockReward}
							min="0.1"
							step="0.1"
							class="ui-input"
						/>
					</div>
				</div>
				<button
					type="button"
					class="ui-button form-btn"
					onclick={createNewBlockchain}
					disabled={isCreating || !newBlockchainName}
				>
					{isCreating ? 'Creating...' : 'Create & enter'}
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.landing {
		display: grid;
		grid-template-columns: 1fr 1.15fr;
		gap: clamp(2rem, 6vw, 6rem);
		align-items: center;
		min-height: calc(100svh - 8rem);
		width: min(1280px, calc(100% - 1.5rem));
		margin: 0 auto;
		padding: 3rem 0;
	}

	.landing-title {
		margin: 0;
		max-width: 9ch;
		font-size: clamp(2.8rem, 5.5vw, 5.2rem);
		font-weight: 800;
		letter-spacing: -0.055em;
		line-height: 0.9;
		color: var(--text);
	}

	.landing-kicker {
		margin: 0 0 0.85rem;
		color: var(--success);
		font-family: 'SFMono-Regular', Consolas, monospace;
		font-size: 0.74rem;
		font-weight: 700;
		letter-spacing: 0.26em;
		text-transform: uppercase;
	}

	.landing-sub {
		max-width: 30rem;
		margin: 1rem 0 0;
		color: var(--text-muted);
		font-size: 1.08rem;
		line-height: 1.55;
	}

	.landing-notes {
		display: grid;
		gap: 0.85rem;
		margin-top: 1.75rem;
		padding-top: 1.15rem;
		border-top: 1px solid rgba(103, 232, 249, 0.1);
	}

	.landing-notes p {
		display: grid;
		gap: 0.22rem;
		margin: 0;
	}

	.landing-notes span {
		color: var(--text-faint);
		font-family: 'SFMono-Regular', Consolas, monospace;
		font-size: 0.76rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.landing-notes strong {
		max-width: 32rem;
		color: var(--text);
		font-size: 0.98rem;
		font-weight: 600;
		line-height: 1.45;
	}

	.landing-btns {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1.6rem;
	}

	.landing-forms {
		display: grid;
		gap: 0.75rem;
	}

	.form-btn {
		width: 100%;
		margin-top: 0.9rem;
	}

	.create-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-top: 1rem;
	}

	.range-meta {
		display: flex;
		justify-content: space-between;
		font-size: 0.76rem;
		color: var(--text-faint);
		font-family: 'SFMono-Regular', Consolas, monospace;
		margin-top: 0.35rem;
	}

	.range-meta strong {
		color: var(--text);
	}

	@media (max-width: 860px) {
		.landing {
			grid-template-columns: 1fr;
			min-height: auto;
			padding: 2rem 0;
		}
	}

	@media (max-width: 640px) {
		.landing {
			width: calc(100% - 1rem);
		}

		.landing-btns {
			flex-direction: column;
		}
	}
</style>
