<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let query = '';
	let dossier = null;
	let error = null;
	let isLoading = false;
	let selectedNetwork = 'ethereum';
	let selectedStepId = 'overview';

	const networkOptions = [
		{ key: 'ethereum', label: 'Ethereum', kind: 'Mainnet' },
		{ key: 'base', label: 'Base', kind: 'L2' },
		{ key: 'optimism', label: 'Optimism', kind: 'L2' },
		{ key: 'arbitrum', label: 'Arbitrum', kind: 'L2' }
	];

	const exampleCases = [
		{
			label: 'Vitalik',
			address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
			network: 'ethereum',
			copy: 'A useful example for labeled activity, delegation, and recent movement.'
		},
		{
			label: 'LI.FI Diamond',
			address: '0x1231DEB6f5749ef6Ce6943a275A1D3E7486F4EaE',
			network: 'arbitrum',
			copy: 'A busier contract trail with multiple nearby addresses to inspect.'
		}
	];

	const trustPoints = [
		'Public data only',
		'Click from transfer to address',
		'Spot named services when labels exist',
		'Compare the same address across networks'
	];

	const onboardingCards = [
		{
			title: 'Open any wallet or contract',
			copy: 'Start from a rumor, a screenshot, or your own address book. The chain is public.'
		},
		{
			title: 'Read the latest movements',
			copy: 'Each row is a recent transfer event you can open in the explorer and verify yourself.'
		},
		{
			title: 'Branch into the next address',
			copy: 'If money reaches an exchange, app, proxy admin, or a labeled wallet, click through and keep following.'
		}
	];

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const initialAddress = params.get('address');
		const initialNetwork = params.get('network');

		if (initialNetwork && networkOptions.some((option) => option.key === initialNetwork)) {
			selectedNetwork = initialNetwork;
		}

		if (initialAddress) {
			query = initialAddress;
			void investigate(initialAddress, { syncUrl: false, network: initialNetwork || selectedNetwork });
		}
	});

	$: visibleNetworks = dossier?.networkOptions || networkOptions;
	$: storySteps = dossier ? buildStorySteps(dossier) : [];
	$: highlightCards = dossier ? buildHighlightCards(dossier) : [];
	$: activePanel = dossier ? buildActivePanel(dossier, selectedStepId) : null;

	async function handleSubmit(event) {
		event.preventDefault();
		await investigate(query);
	}

	async function investigate(addressInput, { syncUrl = true, network = selectedNetwork } = {}) {
		const nextAddress = String(addressInput || '').trim();

		if (!nextAddress) {
			error = 'Enter an Ethereum-style address to start exploring.';
			dossier = null;
			selectedStepId = 'overview';
			return;
		}

		isLoading = true;
		error = null;

		try {
			const response = await fetch('/api/osint', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					address: nextAddress,
					network
				})
			});

			const data = await response.json().catch(() => ({}));

			if (!response.ok) {
				throw new Error(data.error || 'Could not open this address right now.');
			}

			dossier = data;
			query = data.address;
			selectedNetwork = data.networkKey || network;
			selectedStepId = 'overview';

			if (syncUrl) {
				await goto(
					`/osint?network=${encodeURIComponent(selectedNetwork)}&address=${encodeURIComponent(data.address)}`,
					{
						replaceState: true,
						noScroll: true,
						keepFocus: true
					}
				);
			}
		} catch (investigationError) {
			dossier = null;
			selectedStepId = 'overview';
			error = investigationError.message;
		} finally {
			isLoading = false;
		}
	}

	async function openExample(example) {
		selectedNetwork = example.network;
		query = example.address;
		await investigate(example.address, { network: example.network });
	}

	async function followLead(address) {
		if (isLoading) {
			return;
		}

		query = address;
		await investigate(address);
	}

	async function switchNetwork(networkKey) {
		if (isLoading || networkKey === selectedNetwork) {
			return;
		}

		selectedNetwork = networkKey;

		if (query.trim()) {
			await investigate(query, { network: networkKey });
			selectedStepId = 'trail';
			return;
		}

		await goto(`/osint?network=${encodeURIComponent(networkKey)}`, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	async function resetDesk() {
		query = '';
		dossier = null;
		error = null;
		selectedStepId = 'overview';

		await goto(`/osint?network=${encodeURIComponent(selectedNetwork)}`, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	function jumpToStep(stepId) {
		selectedStepId = stepId;
	}

	function formatTimestamp(value) {
		if (!value) {
			return 'Unknown time';
		}

		const date = new Date(value);

		if (Number.isNaN(date.getTime())) {
			return 'Unknown time';
		}

		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(date);
	}

	function isLayerTwo(kind) {
		return String(kind || '').toLowerCase() === 'l2';
	}

	function looksLikeAddress(value) {
		return /^0x[a-f0-9]{40}$/i.test(String(value || ''));
	}

	function shortHash(value) {
		if (!value) {
			return 'Unavailable';
		}

		return `${value.slice(0, 10)}...${value.slice(-8)}`;
	}

	function statusForDirection(direction) {
		if (direction === 'inbound') {
			return 'success';
		}

		if (direction === 'outbound') {
			return 'warn';
		}

		return 'info';
	}

	function readableEntityLabel(profile) {
		if (profile.entityKind === 'delegated-eoa') {
			return 'Delegated wallet';
		}

		if (profile.entityKind === 'contract') {
			return 'Smart contract';
		}

		return 'Likely a wallet';
	}

	function countLabeledTransfers(currentDossier) {
		return currentDossier.recentTransfers.filter(
			(transfer) => transfer.counterparty?.name || transfer.counterparty?.tags?.length
		).length;
	}

	function buildNamedLeadCard(currentDossier) {
		const namedTransfer = currentDossier.recentTransfers.find(
			(transfer) => transfer.counterparty?.name || transfer.counterparty?.tags?.length
		);

		if (!namedTransfer) {
			return {
				id: 'leads',
				kicker: 'Nearby addresses',
				title: `${currentDossier.recentActivity.uniqueCounterparties} addresses nearby`,
				copy: 'No strong public label yet, so the next step is following the busiest neighboring addresses.'
			};
		}

		const label =
			namedTransfer.counterparty?.name || namedTransfer.counterparty?.tags?.[0] || namedTransfer.counterparty?.label;
		const verb = namedTransfer.direction === 'outbound' ? 'moved to' : 'arrived from';

		return {
			id: 'leads',
			kicker: 'Named clue',
			title: label,
			copy: `Recent value ${verb} this labeled address. Open the transfer and decide what that label means.`
		};
	}

	function buildHighlightCards(currentDossier) {
		const entityMetric = currentDossier.metrics.find((metric) => metric.id === 'entity-profile');

		return [
			{
				id: 'overview',
				kicker: 'What it is',
				title: readableEntityLabel(currentDossier.profile),
				copy: entityMetric?.summary || currentDossier.summary
			},
			{
				id: 'trail',
				kicker: 'Latest trail',
				title: currentDossier.recentTransfers.length
					? `${currentDossier.recentTransfers.length} recent transfers`
					: 'No recent transfer trail',
				copy: currentDossier.recentTransfers.length
					? `The latest explorer sample spans ${currentDossier.source.recentWindowLabel}.`
					: 'Try another network, or open the explorer page to widen the search.'
			},
			buildNamedLeadCard(currentDossier)
		];
	}

	function buildStorySteps(currentDossier) {
		return [
			{
				id: 'overview',
				title: 'Start here',
				copy: readableEntityLabel(currentDossier.profile)
			},
			{
				id: 'trail',
				title: 'Money trail',
				copy: `${currentDossier.recentTransfers.length} events`
			},
			{
				id: 'leads',
				title: 'Addresses',
				copy: `${currentDossier.leadGroups.length} lead sets`
			},
			{
				id: 'findings',
				title: 'Findings',
				copy: `${currentDossier.findings.length} observations`
			},
			{
				id: 'raw',
				title: 'Raw data',
				copy: 'Underlying fields'
			},
			{
				id: 'cross-chain',
				title: 'Networks',
				copy: 'Same address elsewhere'
			}
		];
	}

	function buildActivePanel(currentDossier, stepId) {
		const baseFacts = [
			{ label: 'Address type', value: readableEntityLabel(currentDossier.profile) },
			{ label: 'Network', value: currentDossier.network },
			{ label: 'Native balance', value: currentDossier.profile.balanceDisplay },
			{ label: 'Sent tx count', value: String(currentDossier.profile.nonce) },
			{ label: 'Named leads', value: String(currentDossier.recentActivity.namedCounterparties || 0) },
			{ label: 'Recent sample', value: currentDossier.source.recentWindowLabel }
		];

		if (stepId === 'trail') {
			return {
				id: 'trail',
				kicker: 'Money trail',
				title: currentDossier.recentTransfers.length
					? 'Follow the latest movements'
					: 'No recent transfer events in this sample',
				summary: currentDossier.recentTransfers.length
					? `Each row below is public blockchain data. Open the transaction, inspect the other address, and keep following the path yourself.`
					: `This recent explorer sample did not return transfer events for the address on ${currentDossier.network}.`,
				facts: [
					{ label: 'Inbound', value: String(currentDossier.recentActivity.inboundEvents) },
					{ label: 'Outbound', value: String(currentDossier.recentActivity.outboundEvents) },
					{ label: 'Nearby addresses', value: String(currentDossier.recentActivity.uniqueCounterparties) },
					{ label: 'Named leads', value: String(currentDossier.recentActivity.namedCounterparties || 0) }
				],
				transfers: currentDossier.recentTransfers,
				explorerUrl: currentDossier.source.explorerAddressUrl,
				explorerLabel: 'Open address in explorer'
			};
		}

		if (stepId === 'leads') {
			return {
				id: 'leads',
				kicker: 'Next clicks',
				title: 'Inspect the addresses around it',
				summary:
					'The fastest way to learn from a wallet is usually opening the addresses right next to it and comparing patterns.',
				leadGroups: currentDossier.leadGroups,
				explorerUrl: currentDossier.source.explorerAddressUrl,
				explorerLabel: 'Open full explorer view'
			};
		}

		if (stepId === 'findings') {
			return {
				id: 'findings',
				kicker: 'What stands out',
				title: `${currentDossier.findings.length} observations worth checking`,
				summary:
					'These are starting points, not verdicts. Use them to decide which transfer, contract, or nearby address to open next.',
				findings: currentDossier.findings,
				metrics: currentDossier.metrics
			};
		}

		if (stepId === 'raw') {
			return {
				id: 'raw',
				kicker: 'Raw evidence',
				title: 'Inspect the underlying fields',
				summary:
					'If you want to verify every claim yourself, the raw address facts and dossier JSON are right here.',
				facts: buildRawFacts(currentDossier),
				rawJson: JSON.stringify(currentDossier, null, 2),
				explorerUrl: currentDossier.source.explorerAddressUrl,
				explorerLabel: 'Open address in explorer'
			};
		}

		if (stepId === 'cross-chain') {
			return {
				id: 'cross-chain',
				kicker: 'Compare networks',
				title: 'Open the same address on another chain',
				summary:
					'The same hex address can tell a completely different story on another network. Switch and compare the trail.',
				networks: visibleNetworks.filter((option) => option.key !== selectedNetwork)
			};
		}

		return {
			id: 'overview',
			kicker: 'Start here',
			title: readableEntityLabel(currentDossier.profile),
			summary: `${currentDossier.summary} Everything here comes from public blockchain data and explorer labels when available.`,
			facts: baseFacts,
			metrics: currentDossier.metrics,
			explorerUrl: currentDossier.source.explorerAddressUrl,
			explorerLabel: 'Open address in explorer'
		};
	}

	function buildRawFacts(currentDossier) {
		return [
			{ label: 'Address', value: currentDossier.address },
			{ label: 'Network', value: currentDossier.network },
			{ label: 'Entity', value: currentDossier.profile.entityLabel },
			{ label: 'ENS', value: currentDossier.profile.ensName || 'None' },
			{ label: 'Balance', value: currentDossier.profile.balanceDisplay },
			{ label: 'Balance wei', value: currentDossier.profile.balanceWei },
			{ label: 'Nonce', value: String(currentDossier.profile.nonce) },
			{ label: 'Code bytes', value: String(currentDossier.profile.codeBytes) },
			{ label: 'Proxy type', value: currentDossier.profile.proxyType || 'None' },
			{ label: 'Delegation target', value: currentDossier.profile.delegationTarget || 'None' },
			{ label: 'Implementation', value: currentDossier.profile.implementationAddress || 'None' },
			{ label: 'Admin', value: currentDossier.profile.adminAddress || 'None' },
			{ label: 'Recent transfers', value: String(currentDossier.recentTransfers.length) },
			{ label: 'Nearby addresses', value: String(currentDossier.recentActivity.uniqueCounterparties) }
		];
	}
</script>

<svelte:head>
	<title>On-chain Explorer | Bitcoin Simulator</title>
	<meta
		name="description"
		content="Paste a wallet or contract, inspect recent transfers, and follow the public blockchain trail yourself."
	/>
</svelte:head>

<div class="osint-redesign">
	<section class="osint-hero">
		<div class="osint-hero__copy">
			<p class="osint-brand">On-chain Explorer</p>
			<h1 class="osint-title">See where an address sends value.</h1>
			<p class="osint-subtitle">
				Paste a wallet or contract and read the public trail. Open recent transfers, inspect labeled
				addresses, and follow the money yourself.
			</p>

			<div class="osint-signal-row">
				{#each trustPoints as point}
					<span>{point}</span>
				{/each}
			</div>

			<div class="osint-network-row" aria-label="Networks">
				{#each visibleNetworks as option}
					<button
						type="button"
						class="osint-network-chip"
						class:is-active={selectedNetwork === option.key}
						onclick={() => switchNetwork(option.key)}
						disabled={isLoading}
					>
						<strong>{option.shortLabel || option.label}</strong>
						<small>{isLayerTwo(option.kind) ? 'L2' : 'Mainnet'}</small>
					</button>
				{/each}
			</div>
		</div>

		<div class="surface osint-hero__workspace">
			<div class="surface-pad osint-hero__workspace-pad">
				<div class="osint-intake">
					<p class="eyebrow">Open an address</p>
					<form class="osint-form" onsubmit={handleSubmit}>
						<input
							id="osint-address"
							type="text"
							bind:value={query}
							class="ui-input mono"
							placeholder="Paste an address: 0x..."
							autocomplete="off"
							spellcheck="false"
						/>

						<div class="osint-form__actions">
							<button type="submit" class="ui-button" disabled={isLoading || !query.trim()}>
								{isLoading ? 'Opening address...' : 'Follow this address'}
							</button>
							<button type="button" class="ui-button-ghost" onclick={resetDesk} disabled={isLoading}>
								Clear
							</button>
						</div>
					</form>

					<p class="osint-helper">
						Uses public RPC data and Blockscout labels when they exist. The goal is to keep the raw
						evidence one click away.
					</p>
				</div>

				<div class="osint-examples">
					<p class="eyebrow">Try one</p>
					{#each exampleCases as example}
						<button
							type="button"
							class="osint-example"
							onclick={() => openExample(example)}
							disabled={isLoading}
						>
							<div>
								<div class="osint-example__topline">
									<strong>{example.label}</strong>
									<small>{example.network}</small>
								</div>
								<p>{example.copy}</p>
							</div>
							<span class="mono">{example.address.slice(0, 8)}...{example.address.slice(-4)}</span>
						</button>
					{/each}
				</div>
			</div>
		</div>
	</section>

	{#if error}
		<div class="status-banner status-banner--danger osint-status">
			<span>{error}</span>
		</div>
	{/if}

	{#if isLoading}
		<div class="status-banner status-banner--info osint-status">
			<span>Reading the address, collecting recent transfers, and building the first click path.</span>
		</div>
	{/if}

	{#if dossier}
		<section class="osint-brief">
			<div class="osint-brief__header">
				<div class="osint-brief__copy">
					<p class="eyebrow">Current address</p>
					<h2 class="section-title">
						{dossier.profile.ensName || readableEntityLabel(dossier.profile)}
					</h2>
					<p class="body-copy">{dossier.summary}</p>
				</div>

				<div class="osint-brief__actions">
					<p class="osint-brief__address mono">{dossier.address}</p>
					{#if dossier.source.explorerAddressUrl}
						<a
							href={dossier.source.explorerAddressUrl}
							target="_blank"
							rel="noreferrer"
							class="ui-button-ghost"
						>
							Open in explorer
						</a>
					{/if}
				</div>
			</div>

			<div class="osint-clue-strip">
				{#each highlightCards as card}
					<button
						type="button"
						class="osint-clue"
						class:is-active={selectedStepId === card.id}
						onclick={() => jumpToStep(card.id)}
					>
						<span>{card.kicker}</span>
						<strong>{card.title}</strong>
						<p>{card.copy}</p>
					</button>
				{/each}
			</div>
		</section>

		<section class="osint-guided">
			<div class="osint-guided__rail">
				<p class="eyebrow">Walkthrough</p>
				{#each storySteps as step, index}
					<button
						type="button"
						class="osint-step"
						class:is-active={selectedStepId === step.id}
						onclick={() => jumpToStep(step.id)}
					>
						<span>{String(index + 1).padStart(2, '0')}</span>
						<div>
							<strong>{step.title}</strong>
							<p>{step.copy}</p>
						</div>
					</button>
				{/each}
			</div>

			<div class="surface osint-spotlight">
				<div class="surface-pad osint-spotlight__pad">
					{#if activePanel}
						<div class="osint-spotlight__intro">
							<div>
								<p class="eyebrow">{activePanel.kicker}</p>
								<h2 class="display-title osint-spotlight__title">{activePanel.title}</h2>
								<p class="body-copy osint-spotlight__summary">{activePanel.summary}</p>
							</div>

							{#if activePanel.explorerUrl}
								<a
									href={activePanel.explorerUrl}
									target="_blank"
									rel="noreferrer"
									class="ui-button-ghost"
								>
									{activePanel.explorerLabel || 'Open explorer'}
								</a>
							{/if}
						</div>

						{#if activePanel.facts?.length}
							<div class="osint-facts-row">
								{#each activePanel.facts as fact}
									<div class="osint-fact-inline">
										<span>{fact.label}</span>
										<strong class:mono={looksLikeAddress(fact.value)}>{fact.value}</strong>
									</div>
								{/each}
							</div>
						{/if}

						{#if activePanel.metrics?.length}
							<div class="osint-follow">
								<p class="osint-label">Signals</p>
								<div class="osint-signal-list">
									{#each activePanel.metrics as metric}
										<div class="osint-signal-item">
											<span class={`status-pill status-pill--${metric.severity}`}>{metric.label}</span>
											<strong>{metric.value}</strong>
											<p>{metric.summary}</p>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						{#if activePanel.transfers}
							<div class="osint-follow">
								<p class="osint-label">Recent transfer trail</p>

								{#if activePanel.transfers.length}
									<div class="osint-trail">
										{#each activePanel.transfers as transfer}
											<article class="osint-transfer">
												<div class="osint-transfer__header">
													<div class="osint-transfer__heading">
														<div class="osint-transfer__eyebrow">
															<span class={`status-pill status-pill--${statusForDirection(transfer.direction)}`}>
																{transfer.directionLabel}
															</span>
															<span class="osint-transfer__time">{formatTimestamp(transfer.timestamp)}</span>
														</div>
														<h3 class="osint-transfer__title">{transfer.summary}</h3>
													</div>

													<strong class="osint-transfer__amount">{transfer.amountDisplay}</strong>
												</div>

												<div class="osint-transfer__body">
													{#if transfer.counterparty}
														<div class="osint-transfer__focus">
															<span>Counterparty</span>
															<strong class:mono={!transfer.counterparty.name}>
																{transfer.counterparty.name || transfer.counterparty.label}
															</strong>
															{#if transfer.counterparty.name}
																<p class="osint-transfer__sub mono">{transfer.counterparty.label}</p>
															{/if}
														</div>
													{/if}

													<div class="osint-transfer__focus">
														<span>Transaction</span>
														<strong class="mono">{shortHash(transfer.transactionHash)}</strong>
														<p>{transfer.blockNumber ? `Block ${transfer.blockNumber}` : transfer.type}</p>
													</div>
												</div>

												{#if transfer.counterparty?.tags?.length || transfer.method || transfer.token?.symbol}
													<div class="chip-row osint-chip-row">
														{#if transfer.method}
															<span class="chip">{transfer.method}</span>
														{/if}
														{#if transfer.token?.symbol}
															<span class="chip">{transfer.token.symbol}</span>
														{/if}
														{#each transfer.counterparty?.tags || [] as tag}
															<span class="chip">{tag}</span>
														{/each}
													</div>
												{/if}

												<div class="osint-card-actions">
													{#if transfer.counterparty}
														<button
															type="button"
															class="ui-button-secondary"
															onclick={() => followLead(transfer.counterparty.address)}
															disabled={isLoading}
														>
															Inspect counterparty
														</button>
													{/if}

													{#if transfer.transactionUrl}
														<a
															href={transfer.transactionUrl}
															target="_blank"
															rel="noreferrer"
															class="ui-button-ghost"
														>
															Open transaction
														</a>
													{/if}

													{#if transfer.counterparty?.explorerUrl}
														<a
															href={transfer.counterparty.explorerUrl}
															target="_blank"
															rel="noreferrer"
															class="ui-button-ghost"
														>
															Open address
														</a>
													{/if}
												</div>
											</article>
										{/each}
									</div>
								{:else}
									<div class="surface-muted osint-empty-inline">
										<p>No recent transfer events were returned for this address on the selected network.</p>
									</div>
								{/if}
							</div>
						{/if}

						{#if activePanel.leadGroups?.length}
							<div class="osint-follow">
								<p class="osint-label">Next addresses to open</p>
								<div class="osint-lead-groups">
									{#each activePanel.leadGroups as group}
										<section class="osint-lead-group">
											<div class="osint-lead-group__header">
												<strong>{group.title}</strong>
												<p>{group.copy}</p>
											</div>

											<div class="osint-follow__grid">
												{#each group.leads as lead}
													<article class="osint-follow__lead">
														<span>{lead.kicker}</span>
														<strong class:mono={!lead.name}>{lead.name || lead.label}</strong>
														{#if lead.name}
															<p class="osint-follow__sub mono">{lead.label}</p>
														{/if}
														<p>{lead.reason}</p>

														{#if lead.tags?.length}
															<div class="chip-row osint-chip-row">
																{#each lead.tags as tag}
																	<span class="chip">{tag}</span>
																{/each}
															</div>
														{/if}

														<div class="osint-card-actions">
															<button
																type="button"
																class="ui-button-secondary"
																onclick={() => followLead(lead.address)}
																disabled={isLoading}
															>
																Inspect address
															</button>

															{#if lead.explorerUrl}
																<a
																	href={lead.explorerUrl}
																	target="_blank"
																	rel="noreferrer"
																	class="ui-button-ghost"
																>
																	Open explorer
																</a>
															{/if}
														</div>
													</article>
												{/each}
											</div>
										</section>
									{/each}
								</div>
							</div>
						{/if}

						{#if activePanel.findings?.length}
							<div class="osint-follow">
								<p class="osint-label">Observations</p>
								<div class="osint-signal-list">
									{#each activePanel.findings as finding}
										<div class="osint-signal-item">
											<span class={`status-pill status-pill--${finding.severity}`}>Observation</span>
											<strong>{finding.title}</strong>
											<p>{finding.summary}</p>

											{#if finding.nextSteps?.length}
												<div class="chip-row osint-chip-row">
													{#each finding.nextSteps as nextStep}
														<span class="chip">{nextStep}</span>
													{/each}
												</div>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}

						{#if activePanel.networks?.length}
							<div class="osint-follow">
								<p class="osint-label">Other networks</p>
								<div class="osint-follow__grid">
									{#each activePanel.networks as network}
										<article class="osint-follow__lead">
											<span>{isLayerTwo(network.kind) ? 'Layer 2' : 'Mainnet'}</span>
											<strong>{network.label}</strong>
											<p>Open the same address on {network.label} and compare the trail.</p>
											<div class="osint-card-actions">
												<button
													type="button"
													class="ui-button-secondary"
													onclick={() => switchNetwork(network.key)}
													disabled={isLoading}
												>
													Open {network.shortLabel || network.label}
												</button>
											</div>
										</article>
									{/each}
								</div>
							</div>
						{/if}

						{#if activePanel.rawJson}
							<details class="osint-raw-shell">
								<summary>Open raw dossier JSON</summary>
								<pre class="osint-raw-json mono">{activePanel.rawJson}</pre>
							</details>
						{/if}
					{/if}
				</div>
			</div>

			<div class="osint-guided__meta">
				<div class="surface-muted osint-meta-block">
					<span>Address type</span>
					<strong>{readableEntityLabel(dossier.profile)}</strong>
				</div>
				<div class="surface-muted osint-meta-block">
					<span>Native balance</span>
					<strong>{dossier.profile.balanceDisplay}</strong>
				</div>
				<div class="surface-muted osint-meta-block">
					<span>Labeled leads</span>
					<strong>{countLabeledTransfers(dossier)}</strong>
				</div>
				<div class="surface-muted osint-meta-block">
					<span>Reviewed</span>
					<strong>{formatTimestamp(dossier.investigatedAt)}</strong>
				</div>
			</div>
		</section>
	{:else}
		<section class="osint-empty">
			<div class="osint-empty__copy">
				<p class="eyebrow">How it works</p>
				<h2 class="section-title">Blockchain data is public. This page makes it easier to read.</h2>
				<p class="body-copy">
					Start from one address, inspect the latest visible movements, and branch into nearby
					addresses until the pattern becomes clear.
				</p>
			</div>

			<div class="osint-empty-grid">
				{#each onboardingCards as card}
					<article class="surface-muted osint-empty-card">
						<strong>{card.title}</strong>
						<p>{card.copy}</p>
					</article>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.osint-redesign {
		padding-bottom: 3.2rem;
	}

	.osint-hero {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr);
		gap: 2rem;
		min-height: calc(100svh - 5.5rem);
		padding: clamp(1.5rem, 4vw, 3rem) clamp(0.75rem, 2vw, 1.25rem) 1.5rem;
		overflow: hidden;
	}

	.osint-hero::before {
		content: '';
		position: absolute;
		inset: -12% auto auto 48%;
		width: 48rem;
		height: 48rem;
		border-radius: 999px;
		background: radial-gradient(circle, rgba(103, 232, 249, 0.12), transparent 64%);
		filter: blur(12px);
		pointer-events: none;
	}

	.osint-hero__copy,
	.osint-hero__workspace,
	.osint-brief,
	.osint-guided,
	.osint-empty {
		animation: rise-in 280ms ease;
	}

	.osint-hero__copy {
		position: relative;
		z-index: 1;
		align-self: center;
		padding-left: clamp(0rem, 2vw, 1rem);
	}

	.osint-brand {
		margin: 0;
		color: var(--success);
		font-family: 'SFMono-Regular', Consolas, monospace;
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.28em;
		text-transform: uppercase;
	}

	.osint-title {
		margin: 0.85rem 0 0;
		max-width: 8ch;
		color: var(--text);
		font-size: clamp(3rem, 8vw, 6.4rem);
		line-height: 0.9;
		letter-spacing: -0.06em;
		text-wrap: balance;
	}

	.osint-subtitle {
		max-width: 34rem;
		margin: 1rem 0 0;
		color: var(--text-muted);
		font-size: 1.06rem;
		line-height: 1.65;
	}

	.osint-signal-row,
	.osint-network-row,
	.osint-card-actions,
	.osint-transfer__eyebrow,
	.osint-example__topline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.65rem;
	}

	.osint-signal-row {
		max-width: 44rem;
		margin-top: 1.4rem;
	}

	.osint-signal-row span {
		padding: 0.55rem 0.8rem;
		border: 1px solid rgba(103, 232, 249, 0.1);
		border-radius: 999px;
		background: rgba(8, 18, 28, 0.42);
		color: var(--text-faint);
		font-size: 0.82rem;
	}

	.osint-network-row {
		margin-top: 1.4rem;
	}

	.osint-network-chip {
		display: inline-grid;
		gap: 0.12rem;
		padding: 0.8rem 0.95rem;
		border: 1px solid rgba(103, 232, 249, 0.12);
		border-radius: 1rem;
		background: rgba(8, 18, 28, 0.68);
		color: var(--text);
		cursor: pointer;
		transition:
			transform 160ms ease,
			border-color 160ms ease,
			background-color 160ms ease;
	}

	.osint-network-chip:hover {
		transform: translateY(-1px);
	}

	.osint-network-chip.is-active {
		border-color: rgba(103, 232, 249, 0.34);
		background: rgba(103, 232, 249, 0.1);
	}

	.osint-network-chip strong {
		font-size: 0.95rem;
	}

	.osint-network-chip small {
		color: var(--text-faint);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.osint-hero__workspace {
		position: relative;
		z-index: 1;
		align-self: center;
		min-height: 34rem;
	}

	.osint-hero__workspace-pad,
	.osint-intake,
	.osint-examples,
	.osint-brief__copy,
	.osint-guided__rail,
	.osint-spotlight__pad,
	.osint-follow,
	.osint-signal-list,
	.osint-trail,
	.osint-lead-groups,
	.osint-empty__copy,
	.osint-empty-card {
		display: grid;
		gap: 0.8rem;
	}

	.osint-hero__workspace-pad {
		gap: 1.4rem;
		height: 100%;
	}

	.osint-form {
		display: grid;
		gap: 0.85rem;
	}

	.osint-form__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
	}

	.osint-helper {
		margin: 0;
		color: var(--text-faint);
		font-size: 0.9rem;
		line-height: 1.55;
	}

	.osint-example {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		width: 100%;
		padding: 0.95rem 0;
		border: 0;
		border-top: 1px solid rgba(103, 232, 249, 0.08);
		background: transparent;
		color: var(--text);
		text-align: left;
		cursor: pointer;
		transition: color 160ms ease, transform 160ms ease;
	}

	.osint-example:hover {
		transform: translateX(4px);
	}

	.osint-example strong,
	.osint-lead-group__header strong {
		display: block;
		font-size: 1rem;
	}

	.osint-example small,
	.osint-transfer__time {
		color: var(--text-faint);
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.14em;
	}

	.osint-example p,
	.osint-clue p,
	.osint-step p,
	.osint-signal-item p,
	.osint-follow__lead p,
	.osint-lead-group__header p,
	.osint-empty-card p,
	.osint-transfer__focus p {
		margin: 0;
		color: var(--text-muted);
		line-height: 1.55;
	}

	.osint-status,
	.osint-brief,
	.osint-guided,
	.osint-empty {
		margin-inline: 1.25rem;
	}

	.osint-brief__header,
	.osint-spotlight__intro,
	.osint-transfer__header {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 1rem;
	}

	.osint-brief__actions {
		display: grid;
		align-content: start;
		justify-items: end;
		gap: 0.75rem;
	}

	.osint-brief__address {
		margin: 0;
		color: var(--text-faint);
		font-size: 0.92rem;
	}

	.osint-clue-strip,
	.osint-facts-row,
	.osint-guided__meta,
	.osint-empty-grid {
		display: grid;
		gap: 0.8rem;
	}

	.osint-clue-strip {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin-top: 1rem;
	}

	.osint-clue,
	.osint-step,
	.osint-signal-item,
	.osint-follow__lead,
	.osint-transfer {
		display: grid;
		gap: 0.45rem;
		padding: 1rem;
		border: 1px solid rgba(103, 232, 249, 0.1);
		border-radius: 1rem;
		background: rgba(8, 18, 28, 0.52);
		color: var(--text);
		text-align: left;
		transition:
			transform 160ms ease,
			border-color 160ms ease,
			background-color 160ms ease;
	}

	.osint-clue,
	.osint-step {
		cursor: pointer;
	}

	.osint-clue:hover,
	.osint-step:hover,
	.osint-network-chip:hover {
		transform: translateY(-1px);
	}

	.osint-clue.is-active,
	.osint-step.is-active {
		border-color: rgba(103, 232, 249, 0.34);
		background: rgba(103, 232, 249, 0.09);
	}

	.osint-clue span,
	.osint-label,
	.osint-transfer__focus span,
	.osint-fact-inline span,
	.osint-meta-block span,
	.osint-follow__lead span {
		color: var(--text-faint);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.osint-guided {
		display: grid;
		grid-template-columns: minmax(240px, 0.72fr) minmax(0, 1.28fr) minmax(190px, 0.52fr);
		gap: 1rem;
		padding-top: 1rem;
		align-items: start;
	}

	.osint-step {
		grid-template-columns: auto 1fr;
		align-items: start;
	}

	.osint-step > span {
		color: var(--accent);
		font-family: 'SFMono-Regular', Consolas, monospace;
		font-size: 0.82rem;
		font-weight: 700;
	}

	.osint-step strong,
	.osint-signal-item strong,
	.osint-follow__lead strong,
	.osint-transfer__focus strong {
		font-size: 0.98rem;
	}

	.osint-spotlight__title {
		max-width: 12ch;
		font-size: clamp(2.3rem, 5vw, 4.6rem);
	}

	.osint-spotlight__summary {
		max-width: 46rem;
	}

	.osint-facts-row {
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
	}

	.osint-fact-inline,
	.osint-meta-block,
	.osint-empty-card,
	.osint-empty-inline {
		padding: 0.95rem 1rem;
		border-radius: 1rem;
	}

	.osint-fact-inline {
		display: grid;
		gap: 0.3rem;
		border: 1px solid rgba(103, 232, 249, 0.08);
		background: rgba(8, 18, 28, 0.48);
	}

	.osint-fact-inline strong,
	.osint-meta-block strong,
	.osint-transfer__amount {
		color: var(--text);
		word-break: break-word;
	}

	.osint-follow__grid,
	.osint-empty-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.8rem;
	}

	.osint-follow__lead,
	.osint-transfer {
		align-content: start;
	}

	.osint-follow__sub,
	.osint-transfer__sub {
		color: var(--text-faint);
		font-size: 0.84rem;
	}

	.osint-card-actions {
		margin-top: 0.2rem;
	}

	.osint-chip-row {
		margin-top: 0.1rem;
	}

	.osint-transfer {
		gap: 0.9rem;
	}

	.osint-transfer__heading {
		display: grid;
		gap: 0.55rem;
	}

	.osint-transfer__title {
		margin: 0;
		font-size: 1.05rem;
		line-height: 1.35;
	}

	.osint-transfer__amount {
		font-size: 1rem;
		justify-self: end;
	}

	.osint-transfer__body {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.8rem;
	}

	.osint-transfer__focus {
		display: grid;
		gap: 0.28rem;
		padding: 0.85rem;
		border: 1px solid rgba(103, 232, 249, 0.08);
		border-radius: 0.95rem;
		background: rgba(6, 14, 23, 0.68);
	}

	.osint-guided__meta {
		position: sticky;
		top: 6rem;
	}

	.osint-raw-shell {
		border-top: 1px solid rgba(103, 232, 249, 0.08);
		padding-top: 1rem;
	}

	.osint-raw-shell summary {
		cursor: pointer;
		color: var(--text);
		font-weight: 700;
	}

	.osint-raw-json {
		overflow: auto;
		margin: 0.9rem 0 0;
		padding: 1rem;
		border: 1px solid rgba(103, 232, 249, 0.08);
		border-radius: 1rem;
		background: rgba(6, 14, 23, 0.9);
		color: var(--text-muted);
		font-size: 0.82rem;
		line-height: 1.6;
	}

	.osint-empty {
		display: grid;
		gap: 1rem;
		padding-top: 1rem;
	}

	.osint-empty-card {
		border: 1px solid rgba(103, 232, 249, 0.1);
	}

	.osint-empty-card strong {
		font-size: 1rem;
	}

	@keyframes rise-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}

		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 1100px) {
		.osint-hero,
		.osint-guided,
		.osint-clue-strip {
			grid-template-columns: 1fr;
		}

		.osint-guided__meta {
			position: static;
			grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		}

		.osint-brief__actions {
			justify-items: start;
		}
	}

	@media (max-width: 720px) {
		.osint-hero,
		.osint-status,
		.osint-brief,
		.osint-guided,
		.osint-empty {
			margin-inline: 0.75rem;
			padding-inline: 0;
		}

		.osint-hero {
			min-height: auto;
			padding-inline: 0.75rem;
		}

		.osint-title {
			max-width: 10ch;
			font-size: clamp(2.7rem, 14vw, 4.6rem);
		}

		.osint-form__actions,
		.osint-card-actions {
			flex-direction: column;
		}

		.osint-form__actions :global(button),
		.osint-card-actions :global(button),
		.osint-card-actions :global(a) {
			width: 100%;
		}

		.osint-example {
			flex-direction: column;
			align-items: flex-start;
		}

		.osint-transfer__amount {
			justify-self: start;
		}
	}
</style>
