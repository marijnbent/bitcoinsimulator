const NETWORKS = {
	ethereum: {
		key: 'ethereum',
		label: 'Ethereum Mainnet',
		shortLabel: 'Ethereum',
		kind: 'mainnet',
		rpcUrl: 'https://ethereum-rpc.publicnode.com',
		blockscoutUrl: 'https://eth.blockscout.com/api/v2',
		explorerUrl: 'https://eth.blockscout.com'
	},
	base: {
		key: 'base',
		label: 'Base',
		shortLabel: 'Base',
		kind: 'l2',
		rpcUrl: 'https://base-rpc.publicnode.com',
		blockscoutUrl: 'https://base.blockscout.com/api/v2',
		explorerUrl: 'https://base.blockscout.com'
	},
	optimism: {
		key: 'optimism',
		label: 'Optimism',
		shortLabel: 'Optimism',
		kind: 'l2',
		rpcUrl: 'https://optimism-rpc.publicnode.com',
		blockscoutUrl: 'https://optimism.blockscout.com/api/v2',
		explorerUrl: 'https://optimism.blockscout.com'
	},
	arbitrum: {
		key: 'arbitrum',
		label: 'Arbitrum One',
		shortLabel: 'Arbitrum',
		kind: 'l2',
		rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
		blockscoutUrl: 'https://arbitrum.blockscout.com/api/v2',
		explorerUrl: 'https://arbitrum.blockscout.com'
	}
};
const RECENT_TRANSFER_SAMPLE = 50;
const EIP_1967_IMPLEMENTATION_SLOT =
	'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const EIP_1967_ADMIN_SLOT =
	'0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export async function investigateEthereumAddress(input, networkKey = 'ethereum') {
	const address = normalizeAddress(input);
	const network = getNetworkConfig(networkKey);
	validateEthereumAddress(address);

	const [balanceCall, nonceCall, codeCall, implementationCall, adminCall] = await rpcBatch(network, [
			{ method: 'eth_getBalance', params: [address, 'latest'] },
			{ method: 'eth_getTransactionCount', params: [address, 'latest'] },
			{ method: 'eth_getCode', params: [address, 'latest'] },
			{ method: 'eth_getStorageAt', params: [address, EIP_1967_IMPLEMENTATION_SLOT, 'latest'] },
			{ method: 'eth_getStorageAt', params: [address, EIP_1967_ADMIN_SLOT, 'latest'] }
		]);

	const balanceWei = hexToBigInt(balanceCall.result);
	const nonce = hexToNumber(nonceCall.result);
	const code = (codeCall.result || '0x').toLowerCase();

	const codeProfile = parseCodeProfile(code);
	const implementationAddress =
		codeProfile.entityKind === 'contract'
			? extractAddressFromStorage(implementationCall.result)
			: null;
	const adminAddress =
		codeProfile.entityKind === 'contract' ? extractAddressFromStorage(adminCall.result) : null;

	const [explorerProfile, recentTransfers] = await Promise.all([
		fetchBlockscoutAddress(network, address).catch(() => null),
		fetchBlockscoutTransfers(network, address).catch(() => [])
	]);

	const recentActivity = buildRecentActivity(recentTransfers, address);
	const windowLabel = recentActivity.windowLabel;

	const overview = {
		address,
		network: network.label,
		networkKey: network.key,
		investigatedAt: new Date().toISOString(),
		summary: buildSummary({
			address,
			balanceWei,
			nonce,
			codeProfile,
			recentActivity,
			windowLabel
		}),
		source: {
			label: `${network.shortLabel} public chain data`,
			rpcUrl: network.rpcUrl,
			explorerApiUrl: `${network.blockscoutUrl}/addresses/${address}`,
			explorerAddressUrl: `${network.explorerUrl}/address/${address}`,
			recentTransferSample: RECENT_TRANSFER_SAMPLE,
			recentWindowLabel: windowLabel
		}
	};

	const metrics = buildMetrics({
		address,
		balanceWei,
		nonce,
		codeProfile,
		recentActivity,
		implementationAddress,
		adminAddress,
		windowLabel
	});

	const findings = buildFindings({
		balanceWei,
		nonce,
		codeProfile,
		recentActivity,
		implementationAddress,
		adminAddress,
		windowLabel
	});

	const leadGroups = buildLeadGroups({
		network,
		codeProfile,
		implementationAddress,
		adminAddress,
		recentActivity,
		windowLabel
	});

	return {
		...overview,
		profile: {
			entityKind: codeProfile.entityKind,
			entityLabel: codeProfile.entityLabel,
			codeBytes: codeProfile.codeBytes,
			delegationTarget: codeProfile.delegationTarget,
			isMinimalProxy: codeProfile.isMinimalProxy,
			balanceWei: balanceWei.toString(),
			balanceDisplay: formatEth(balanceWei),
			nonce,
			implementationAddress,
			adminAddress,
			ensName: explorerProfile?.ens_domain_name || null,
			reputation: explorerProfile?.reputation || null,
			proxyType: explorerProfile?.proxy_type || null,
			implementationName: explorerProfile?.implementations?.[0]?.name || null
		},
		networkOptions: getNetworkOptions(network.key),
		metrics,
		findings,
		leadGroups,
		recentTransfers: buildTransferTimeline(recentTransfers, address, network),
		recentActivity: {
			inboundEvents: recentActivity.inboundEvents,
			outboundEvents: recentActivity.outboundEvents,
			totalEvents: recentActivity.totalEvents,
			uniqueCounterparties: recentActivity.counterpartyLeads.length,
			namedCounterparties: recentActivity.counterpartyLeads.filter(
				(lead) => lead.name || lead.tags?.length
			).length,
			uniqueTokenContracts: recentActivity.tokenContractLeads.length
		}
	};
}

async function rpcBatch(network, calls) {
	const payload = calls.map((call, index) => ({
		jsonrpc: '2.0',
		id: index + 1,
		method: call.method,
		params: call.params
	}));

	const response = await fetch(network.rpcUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(12000)
	});

	if (!response.ok) {
		throw makeHttpError('The Ethereum RPC endpoint did not respond in time.', 502);
	}

	const data = await response.json();
	const byId = new Map(data.map((item) => [item.id, item]));

	return payload.map((item) => {
		const result = byId.get(item.id);
		if (!result) {
			throw makeHttpError('The Ethereum RPC response was incomplete.', 502);
		}

		if (result.error) {
			throw makeHttpError(result.error.message || 'Ethereum RPC error.', 502);
		}

		return result;
	});
}

async function fetchBlockscoutAddress(network, address) {
	const response = await fetch(`${network.blockscoutUrl}/addresses/${address}`, {
		signal: AbortSignal.timeout(12000)
	});

	if (!response.ok) {
		throw new Error('Blockscout address lookup failed.');
	}

	return response.json();
}

async function fetchBlockscoutTransfers(network, address) {
	const response = await fetch(
		`${network.blockscoutUrl}/addresses/${address}/token-transfers?items_count=${RECENT_TRANSFER_SAMPLE}`,
		{
			signal: AbortSignal.timeout(12000)
		}
	);

	if (!response.ok) {
		throw new Error('Blockscout transfer lookup failed.');
	}

	const data = await response.json();
	return Array.isArray(data.items) ? data.items : [];
}

function buildRecentActivity(transfers, address) {
	const counterparties = new Map();
	const tokenContracts = new Map();
	let latestTimestamp = null;
	let oldestTimestamp = null;
	let inboundEvents = 0;
	let outboundEvents = 0;

	for (const transfer of transfers) {
		const fromAddress = normalizeAddress(transfer.from?.hash);
		const toAddress = normalizeAddress(transfer.to?.hash);
		const tokenAddress = normalizeAddress(transfer.token?.address_hash);
		const isInbound = toAddress === address;
		const isOutbound = fromAddress === address;

		if (isInbound && fromAddress) {
			inboundEvents += 1;
			accumulateLead(
				counterparties,
				fromAddress,
				'inbound',
				extractEntityName(transfer.from),
				extractEntityTags(transfer.from)
			);
		}

		if (isOutbound && toAddress) {
			outboundEvents += 1;
			accumulateLead(
				counterparties,
				toAddress,
				'outbound',
				extractEntityName(transfer.to),
				extractEntityTags(transfer.to)
			);
		}

		if ((isInbound || isOutbound) && tokenAddress) {
			accumulateLead(
				tokenContracts,
				tokenAddress,
				isOutbound ? 'outbound' : 'inbound',
				extractTokenName(transfer.token, transfer.token_type)
			);
		}

		if (transfer.timestamp) {
			const currentTimestamp = new Date(transfer.timestamp).getTime();
			if (Number.isFinite(currentTimestamp)) {
				latestTimestamp = latestTimestamp === null ? currentTimestamp : Math.max(latestTimestamp, currentTimestamp);
				oldestTimestamp = oldestTimestamp === null ? currentTimestamp : Math.min(oldestTimestamp, currentTimestamp);
			}
		}
	}

	return {
		inboundEvents,
		outboundEvents,
		totalEvents: transfers.length,
		counterpartyLeads: sortLeadMap(counterparties),
		tokenContractLeads: sortLeadMap(tokenContracts),
		windowLabel: formatTransferWindow(transfers.length, latestTimestamp, oldestTimestamp)
	};
}

function buildMetrics({
	address,
	balanceWei,
	nonce,
	codeProfile,
	recentActivity,
	implementationAddress,
	adminAddress,
	windowLabel
}) {
	const metrics = [
		{
			id: 'entity-profile',
			label: 'Entity profile',
			value: codeProfile.entityLabel,
			severity: codeProfile.entityKind === 'contract' ? 'warn' : 'info',
			summary: entitySummary(codeProfile),
			detail: entityDetail(codeProfile),
			significance:
				codeProfile.entityKind === 'delegated-eoa'
					? 'This account can still be user-controlled while delegating execution to another contract.'
					: codeProfile.entityKind === 'contract'
						? 'This address executes deployed bytecode directly, so its behavior is defined by code and storage.'
						: 'This address has no code attached, so the main signals come from balance, nonce, and visible transfer traces.',
			nextSteps:
				codeProfile.entityKind === 'delegated-eoa'
					? ['Inspect the delegation target next.', 'Check whether the delegation changes over time.']
					: codeProfile.entityKind === 'contract'
						? ['Inspect upgrade slots and counterparties.', 'Treat the code path as part of the identity.']
						: ['Follow recent counterparties.', 'Check whether activity is clustered or sporadic.'],
			facts: [
				{ label: 'Address', value: address },
				{ label: 'Code bytes', value: String(codeProfile.codeBytes) }
			]
		},
		{
			id: 'balance-posture',
			label: 'Balance posture',
			value: formatEth(balanceWei),
			severity: balanceSeverity(balanceWei),
			summary: balanceSummary(balanceWei),
			detail:
				'Balance comes from `eth_getBalance` at the latest block and only covers native ETH, not ERC-20 or NFT holdings.',
			significance:
				balanceWei === 0n
					? 'A zero balance can mean the address is dormant, emptied, or relies on sponsored execution.'
					: balanceWei >= 50n * 10n ** 18n
						? 'Larger balances usually justify closer handling, storage, and governance questions.'
						: 'Native balance helps size the address, but it does not tell you what tokens or permissions sit around it.',
			nextSteps: [
				'Compare native balance with recent transfer activity.',
				'Use counterparties and token contracts to see whether this is an operational address or a vault.'
			],
			facts: [{ label: 'Wei', value: balanceWei.toString() }]
		},
		{
			id: 'nonce-signal',
			label: codeProfile.entityKind === 'contract' ? 'Nonce signal' : 'Outbound count',
			value: String(nonce),
			severity: nonceSeverity(codeProfile.entityKind, nonce),
			summary: nonceSummary(codeProfile.entityKind, nonce),
			detail:
				codeProfile.entityKind === 'contract'
					? 'For contracts, nonce is mostly a technical trace and does not map cleanly to user intent.'
					: 'For EOAs and delegated EOAs, nonce roughly tracks how many transactions this account has originated.',
			significance:
				nonce === 0
					? 'An untouched nonce suggests a very fresh or passive account.'
					: nonce > 500
						? 'A high nonce often points to a long-lived operator or automation.'
						: 'Mid-range nonce tells you this address has history, but you still need relationship context to interpret it.',
			nextSteps: [
				'Cross-check nonce with recent token pulse.',
				'Look for concentrated counterparties instead of assuming broad network reach.'
			],
			facts: [{ label: 'Raw nonce', value: String(nonce) }]
		},
		{
			id: 'recent-token-pulse',
			label: 'Recent token pulse',
			value: `${recentActivity.totalEvents} events`,
			severity: recentActivity.totalEvents > 0 ? 'success' : 'info',
			summary:
				recentActivity.totalEvents > 0
					? `${recentActivity.counterpartyLeads.length} counterparties across ${recentActivity.tokenContractLeads.length} token contracts in the recent explorer sample (${windowLabel}).`
					: `No transfer-log hits in the recent explorer sample.`,
			detail:
				'This signal comes from recent `Transfer` logs only. It catches token and NFT-style transfers, not every ETH movement or internal call.',
			significance:
				recentActivity.totalEvents > 0
					? 'Recent transfer traces are the fastest way to grow a lead graph from one seed address.'
					: 'Silence in this window does not mean silence everywhere. It only means no recent `Transfer` events matched this address.',
			nextSteps:
				recentActivity.totalEvents > 0
					? ['Click into the most frequent counterparties.', 'Inspect the token contracts that keep reappearing.']
					: ['Use balance and entity type to decide whether the address still matters operationally.', 'Bring in a deeper-history explorer if this address becomes central.'],
			facts: [
				{ label: 'Inbound events', value: String(recentActivity.inboundEvents) },
				{ label: 'Outbound events', value: String(recentActivity.outboundEvents) }
			]
		}
	];

	if (codeProfile.entityKind === 'contract' && implementationAddress) {
		metrics.push({
			id: 'proxy-trace',
			label: 'Proxy trace',
			value: 'Upgradeable path',
			severity: 'warn',
			summary: `EIP-1967 implementation slot points to ${shortAddress(implementationAddress)}.`,
			detail:
				'This contract exposes a non-zero implementation slot, which strongly suggests upgradeable proxy behavior.',
			significance:
				'When the implementation can move, the live behavior of the address can change without the address itself changing.',
			nextSteps: [
				'Investigate the implementation address directly.',
				'Inspect the admin address if one is present.'
			],
			facts: [
				{ label: 'Implementation', value: implementationAddress },
				{ label: 'Admin', value: adminAddress || 'Not exposed' }
			]
		});
	}

	return metrics;
}

function buildFindings({
	balanceWei,
	nonce,
	codeProfile,
	recentActivity,
	implementationAddress,
	adminAddress,
	windowLabel
}) {
	const findings = [];

	if (codeProfile.entityKind === 'delegated-eoa' && codeProfile.delegationTarget) {
		findings.push({
			id: 'delegated-eoa-finding',
			title: 'Delegated execution path detected',
			severity: 'warn',
			summary: `This address carries an EIP-7702 delegation marker that points at ${shortAddress(codeProfile.delegationTarget)}.`,
			detail:
				'The account still looks like a user-controlled address, but execution can route through delegated code.',
			significance:
				'That means behavior may resemble a smart account even though the identity is still anchored to a user address.',
			nextSteps: [
				'Investigate the delegation target.',
				'Treat code and user behavior as two separate layers of identity.'
			]
		});
	}

	if (codeProfile.entityKind === 'contract' && implementationAddress) {
		findings.push({
			id: 'upgradeable-contract-finding',
			title: 'Upgradeable contract trail',
			severity: 'warn',
			summary: 'The storage layout exposes a live implementation address.',
			detail: adminAddress
				? `Implementation and admin slots are both populated, which is common in upgradeable proxy setups.`
				: 'The implementation slot is populated, which points toward proxy-style indirection.',
			significance:
				'Investigators should not stop at the proxy address. The implementation and admin relationships matter just as much.',
			nextSteps: [
				'Pivot into the implementation address.',
				'Review any admin or governor address next.'
			]
		});
	}

	if (balanceWei === 0n && recentActivity.totalEvents === 0) {
		findings.push({
			id: 'cold-address-finding',
			title: 'Cold surface right now',
			severity: 'info',
			summary: 'No native ETH and no recent transfer-log hits in the current explorer sample.',
			detail:
				'This does not prove irrelevance, but it does mean the address is currently leaving a small visible footprint.',
			significance:
				'Low-footprint addresses can be staging wallets, emptied addresses, or just abandoned accounts.',
			nextSteps: [
				'Inspect whether related leads still move.',
				'Use wider historical tooling if this address matters strategically.'
			]
		});
	}

	if (balanceWei >= 50n * 10n ** 18n) {
		findings.push({
			id: 'treasury-finding',
			title: 'Treasury-sized native balance',
			severity: 'success',
			summary: `${formatEth(balanceWei)} is large enough to justify treasury-style handling questions.`,
			detail:
				'Large balances raise the stakes around permissions, governance, and operational hygiene even before token holdings are considered.',
			significance:
				'Whether this is personal, institutional, or automated, the value concentration makes the address strategically important.',
			nextSteps: [
				'Inspect related contracts and admins.',
				'Follow recurring counterparties to see who touches this balance indirectly.'
			]
		});
	}

	if (nonce <= 2 && codeProfile.entityKind !== 'contract') {
		findings.push({
			id: 'fresh-operator-finding',
			title: 'Fresh operator history',
			severity: 'info',
			summary: 'Very few originated transactions suggest a new or tightly scoped account.',
			detail:
				'A low nonce is often what you see on burner wallets, staging accounts, or addresses created for one workflow.',
			significance:
				'Fresh accounts are easier to map because they have fewer branches, but they often hide behind larger coordinating entities.',
			nextSteps: [
				'Inspect counterparties first.',
				'Watch whether one contract or one sender dominates the activity.'
			]
		});
	}

	if (recentActivity.counterpartyLeads.length >= 4) {
		findings.push({
			id: 'dense-network-finding',
			title: 'Dense recent relationship graph',
			severity: 'success',
			summary: `${recentActivity.counterpartyLeads.length} counterparties appeared across the recent explorer sample (${windowLabel}).`,
			detail:
				'That many related addresses in a short span usually means the address sits inside an active workflow rather than acting as a dormant vault.',
			significance:
				'Relationship density is often a better investigative lead than raw balance or nonce alone.',
			nextSteps: [
				'Investigate the top counterparties by count.',
				'Compare which token contracts link the same cluster together.'
			]
		});
	}

	if (findings.length === 0) {
		findings.push({
			id: 'baseline-finding',
			title: 'Baseline address profile',
			severity: 'info',
			summary: 'The address exposes a readable on-chain fingerprint, but no single signal dominates yet.',
			detail:
				'This is the point where balance, nonce, code profile, and recent transfer traces all need to be interpreted together.',
			significance:
				'Good OSINT work starts by resisting overconfidence on thin data.',
			nextSteps: [
				'Use the relationship leads below to expand the graph.',
				'Keep the summary in view while you pivot between addresses.'
			]
		});
	}

	return findings;
}

function buildLeadGroups({
	network,
	codeProfile,
	implementationAddress,
	adminAddress,
	recentActivity,
	windowLabel
}) {
	const leadGroups = [];

	if (codeProfile.entityKind === 'delegated-eoa' && codeProfile.delegationTarget) {
		leadGroups.push({
			id: 'delegation-targets',
			title: 'Delegation target',
			copy: 'This user account delegates execution to the address below.',
			leads: [
				{
					id: `lead-${codeProfile.delegationTarget}`,
					address: codeProfile.delegationTarget,
					label: shortAddress(codeProfile.delegationTarget),
					name: null,
					explorerUrl: `${network.explorerUrl}/address/${codeProfile.delegationTarget}`,
					kicker: 'Delegated code',
					reason: 'Open the contract that shapes how this wallet executes.'
				}
			]
		});
	}

	if (implementationAddress || adminAddress) {
		const leads = [];
		if (implementationAddress) {
			leads.push({
				id: `lead-${implementationAddress}`,
				address: implementationAddress,
				label: shortAddress(implementationAddress),
				name: null,
				explorerUrl: `${network.explorerUrl}/address/${implementationAddress}`,
				kicker: 'Implementation',
				reason: 'This is where the live contract logic likely lives.'
			});
		}

		if (adminAddress) {
			leads.push({
				id: `lead-${adminAddress}`,
				address: adminAddress,
				label: shortAddress(adminAddress),
				name: null,
				explorerUrl: `${network.explorerUrl}/address/${adminAddress}`,
				kicker: 'Admin',
				reason: 'Administrative control may flow through this address.'
			});
		}

		leadGroups.push({
			id: 'proxy-leads',
			title: 'Upgrade trail',
			copy: 'These addresses shape or control the deployed behavior.',
			leads
		});
	}

	if (recentActivity.counterpartyLeads.length > 0) {
		leadGroups.push({
			id: 'counterparty-leads',
			title: 'Recent counterparties',
			copy: `Addresses seen in the recent transfer sample (${windowLabel}).`,
			leads: recentActivity.counterpartyLeads.slice(0, 8).map((lead) => ({
				id: `lead-${lead.address}`,
				address: lead.address,
				label: shortAddress(lead.address),
				name: lead.name || null,
				tags: lead.tags || [],
				explorerUrl: `${network.explorerUrl}/address/${lead.address}`,
				kicker: lead.name || `${lead.total} events`,
				reason: `${lead.inbound} inbound / ${lead.outbound} outbound transfer traces.`
			}))
		});
	}

	if (recentActivity.tokenContractLeads.length > 0) {
		leadGroups.push({
			id: 'token-contract-leads',
			title: 'Contracts touched',
			copy: `Token or NFT contracts touched in the recent transfer sample (${windowLabel}).`,
			leads: recentActivity.tokenContractLeads.slice(0, 8).map((lead) => ({
				id: `lead-${lead.address}`,
				address: lead.address,
				label: shortAddress(lead.address),
				name: lead.name || null,
				explorerUrl: `${network.explorerUrl}/address/${lead.address}`,
				kicker: lead.name || `${lead.total} hits`,
				reason: `${lead.inbound} inbound / ${lead.outbound} outbound log appearances.`
			}))
		});
	}

	return leadGroups;
}

function buildTransferTimeline(transfers, focusAddress, network) {
	return transfers.slice(0, 12).map((transfer, index) => {
		const fromAddress = normalizeAddress(transfer.from?.hash);
		const toAddress = normalizeAddress(transfer.to?.hash);
		const tokenAddress = normalizeAddress(transfer.token?.address_hash);
		const direction =
			toAddress === focusAddress ? 'inbound' : fromAddress === focusAddress ? 'outbound' : 'related';
		const counterpartyEntity = direction === 'inbound' ? transfer.from : transfer.to;
		const counterpartyAddress = direction === 'inbound' ? fromAddress : toAddress;
		const counterpartyName = extractEntityName(counterpartyEntity);
		const counterpartyTags = extractEntityTags(counterpartyEntity).filter(
			(tag) => tag !== counterpartyName
		);
		const counterpartyLabel = counterpartyName || shortAddress(counterpartyAddress || focusAddress);
		const transactionHash = normalizeHash(transfer.transaction_hash);
		const tokenName = extractTokenName(transfer.token, transfer.token_type);
		const tokenSymbol = transfer.token?.symbol || tokenName;
		const amountDisplay = formatTransferAmount(
			transfer.total?.value,
			transfer.total?.decimals,
			tokenSymbol
		);

		return {
			id: `${transactionHash || 'transfer'}-${transfer.log_index ?? index}`,
			direction,
			directionLabel:
				direction === 'inbound' ? 'Received' : direction === 'outbound' ? 'Sent' : 'Related',
			timestamp: transfer.timestamp || null,
			blockNumber: transfer.block_number || null,
			method: transfer.method || null,
			type: transfer.type || transfer.token_type || 'transfer',
			transactionHash,
			transactionUrl: transactionHash ? `${network.explorerUrl}/tx/${transactionHash}` : null,
			summary: buildTransferSummary({ direction, amountDisplay, counterpartyLabel }),
			counterparty: counterpartyAddress
				? {
						address: counterpartyAddress,
						label: shortAddress(counterpartyAddress),
						name: counterpartyName,
						tags: counterpartyTags,
						explorerUrl: `${network.explorerUrl}/address/${counterpartyAddress}`
					}
				: null,
			token: tokenAddress
				? {
						address: tokenAddress,
						label: tokenName,
						symbol: transfer.token?.symbol || null,
						type: transfer.token_type || transfer.token?.type || null,
						explorerUrl: `${network.explorerUrl}/address/${tokenAddress}`
					}
				: null,
			amountDisplay,
			rawAmount: transfer.total?.value || null
		};
	});
}

function getNetworkConfig(networkKey) {
	return NETWORKS[normalizeNetworkKey(networkKey)] || NETWORKS.ethereum;
}

function getNetworkOptions(currentKey) {
	return Object.values(NETWORKS).map((network) => ({
		key: network.key,
		label: network.label,
		shortLabel: network.shortLabel,
		kind: network.kind,
		isCurrent: network.key === currentKey
	}));
}

function buildSummary({ address, balanceWei, nonce, codeProfile, recentActivity, windowLabel }) {
	const activityLine =
		recentActivity.totalEvents > 0
			? `${recentActivity.totalEvents} recent transfer traces linked it to ${recentActivity.counterpartyLeads.length} counterparties across ${recentActivity.tokenContractLeads.length} token contracts in the current explorer sample (${windowLabel}).`
			: 'No recent transfer-log events matched this address in the current explorer sample.';

	return `${shortAddress(address)} profiles as a ${codeProfile.entityLabel.toLowerCase()} with ${formatEth(balanceWei)} on hand and a nonce of ${nonce}. ${activityLine}`;
}

function parseCodeProfile(code) {
	if (code === '0x') {
		return {
			entityKind: 'eoa',
			entityLabel: 'EOA',
			codeBytes: 0,
			delegationTarget: null,
			isMinimalProxy: false
		};
	}

	if (/^0xef0100[a-f0-9]{40}$/.test(code)) {
		return {
			entityKind: 'delegated-eoa',
			entityLabel: 'Delegated EOA',
			codeBytes: (code.length - 2) / 2,
			delegationTarget: `0x${code.slice(-40)}`,
			isMinimalProxy: false
		};
	}

	return {
		entityKind: 'contract',
		entityLabel: 'Smart contract',
		codeBytes: (code.length - 2) / 2,
		delegationTarget: null,
		isMinimalProxy: isMinimalProxyRuntime(code)
	};
}

function entitySummary(codeProfile) {
	if (codeProfile.entityKind === 'delegated-eoa') {
		return `Execution is delegated to ${shortAddress(codeProfile.delegationTarget)} via an EIP-7702-style marker.`;
	}

	if (codeProfile.entityKind === 'contract') {
		return codeProfile.isMinimalProxy
			? 'Runtime bytecode looks like a minimal proxy shell.'
			: `Deployed bytecode footprint: ${codeProfile.codeBytes} bytes.`;
	}

	return 'No code is attached to the address.';
}

function entityDetail(codeProfile) {
	if (codeProfile.entityKind === 'delegated-eoa') {
		return 'Modern Ethereum accounts can carry a delegation marker without becoming a traditional contract. That changes how you interpret code on the address.';
	}

	if (codeProfile.entityKind === 'contract') {
		return codeProfile.isMinimalProxy
			? 'Minimal proxies forward execution elsewhere, so the interesting behavior usually lives behind the shell.'
			: 'Contracts should be investigated through runtime behavior, storage slots, and related controller addresses.';
	}

	return 'Plain EOAs are best investigated through relationship mapping, timing, balance posture, and off-chain context.';
}

function balanceSummary(balanceWei) {
	if (balanceWei === 0n) {
		return 'No native ETH is sitting on the address right now.';
	}

	if (balanceWei < 10n ** 17n) {
		return 'Small native balance. This looks more operational than treasury-sized.';
	}

	if (balanceWei < 10n ** 18n) {
		return 'Sub-1 ETH balance. Enough to stay active, but not a large treasury signal.';
	}

	if (balanceWei < 50n * 10n ** 18n) {
		return 'Meaningful native balance with room for regular on-chain activity.';
	}

	return 'Large native balance. Handle this as a high-value address.';
}

function nonceSummary(entityKind, nonce) {
	if (entityKind === 'contract') {
		return nonce === 0
			? 'Nonce is quiet at the contract level.'
			: 'Contract nonce is populated, but it should be read as infrastructure detail rather than operator history.';
	}

	if (nonce === 0) {
		return 'No originated transactions on record at the latest block.';
	}

	if (nonce <= 2) {
		return 'Very light operator history.';
	}

	if (nonce <= 50) {
		return 'Some established activity without looking heavily automated.';
	}

	if (nonce <= 500) {
		return 'Longer-running operator history.';
	}

	return 'Heavy transaction history, possibly operational or automated.';
}

function balanceSeverity(balanceWei) {
	if (balanceWei === 0n) {
		return 'info';
	}

	if (balanceWei >= 50n * 10n ** 18n) {
		return 'success';
	}

	return 'warn';
}

function nonceSeverity(entityKind, nonce) {
	if (entityKind === 'contract') {
		return 'info';
	}

	if (nonce === 0 || nonce <= 2) {
		return 'info';
	}

	if (nonce > 500) {
		return 'success';
	}

	return 'warn';
}

function sortLeadMap(map) {
	return [...map.values()].sort((left, right) => right.total - left.total);
}

function accumulateLead(map, address, direction, name = null, tags = []) {
	if (!address || address === ZERO_ADDRESS) {
		return;
	}

	const existing = map.get(address) || {
		address,
		name,
		tags: [],
		inbound: 0,
		outbound: 0,
		total: 0
	};

	if (!existing.name && name) {
		existing.name = name;
	}

	for (const tag of tags) {
		if (tag && !existing.tags.includes(tag)) {
			existing.tags.push(tag);
		}
	}

	existing[direction] += 1;
	existing.total += 1;
	map.set(address, existing);
}

function extractAddressFromStorage(value) {
	if (!value || /^0x0+$/.test(value)) {
		return null;
	}

	return `0x${value.slice(-40).toLowerCase()}`;
}

function validateEthereumAddress(address) {
	if (!/^0x[a-f0-9]{40}$/.test(address)) {
		throw makeHttpError('Enter a valid Ethereum address starting with 0x.', 400);
	}
}

function normalizeAddress(value) {
	return String(value || '').trim().toLowerCase();
}

function normalizeNetworkKey(value) {
	return String(value || 'ethereum').trim().toLowerCase();
}

function normalizeHash(value) {
	return String(value || '').trim().toLowerCase() || null;
}

function hexToBigInt(value) {
	return BigInt(value || '0x0');
}

function hexToNumber(value) {
	return Number.parseInt(value || '0x0', 16);
}

function formatTransferWindow(count, latestTimestamp, oldestTimestamp) {
	if (count === 0) {
		return 'latest transfer traces';
	}

	if (count === 1 || latestTimestamp === null || oldestTimestamp === null) {
		return '1 recent transfer trace';
	}

	const spanSeconds = Math.max(0, Math.round((latestTimestamp - oldestTimestamp) / 1000));
	if (spanSeconds === 0) {
		return `${count} recent transfer traces`;
	}

	const hours = spanSeconds / 3600;
	if (hours < 24) {
		return `${count} traces across about ${trimNumber(hours.toFixed(1))} hours`;
	}

	const days = hours / 24;
	return `${count} traces across about ${trimNumber(days.toFixed(1))} days`;
}

function formatEth(wei, fractionDigits = 4) {
	const base = 10n ** 18n;
	const whole = wei / base;
	const fraction = (wei % base)
		.toString()
		.padStart(18, '0')
		.slice(0, fractionDigits)
		.replace(/0+$/, '');

	return `${whole}${fraction ? `.${fraction}` : ''} ETH`;
}

function trimNumber(value) {
	return value.replace(/\.0+$|(\.\d*[1-9])0+$/, '$1');
}

function shortAddress(address) {
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function extractEntityName(entity) {
	if (!entity) {
		return null;
	}

	return (
		entity.ens_domain_name ||
		entity.name ||
		entity.public_tags?.[0]?.display_name ||
		entity.public_tags?.[0]?.label ||
		entity.public_tags?.[0]?.name ||
		entity.metadata?.tags?.[0]?.name ||
		entity.implementations?.[0]?.name ||
		null
	);
}

function extractEntityTags(entity) {
	if (!entity) {
		return [];
	}

	const tags = [
		...(entity.metadata?.tags || []).map((tag) => tag?.name),
		...(entity.public_tags || []).map(
			(tag) => tag?.display_name || tag?.label || tag?.name || null
		),
		...(entity.private_tags || []).map(
			(tag) => tag?.display_name || tag?.label || tag?.name || null
		),
		...(entity.watchlist_names || []).map((tag) =>
			typeof tag === 'string' ? tag : tag?.display_name || tag?.label || tag?.name || null
		),
		entity.proxy_type ? `Proxy: ${entity.proxy_type}` : null
	].filter(Boolean);

	return [...new Set(tags)].slice(0, 4);
}

function extractTokenName(token, tokenType) {
	if (!token) {
		return tokenType || 'Token contract';
	}

	return token.name || token.symbol || tokenType || 'Token contract';
}

function isMinimalProxyRuntime(code) {
	return /^0x363d3d373d3d3d363d73[a-f0-9]{40}5af43d82803e903d91602b57fd5bf3$/.test(
		code
	);
}

function buildTransferSummary({ direction, amountDisplay, counterpartyLabel }) {
	if (direction === 'inbound') {
		return `${amountDisplay} arrived from ${counterpartyLabel}.`;
	}

	if (direction === 'outbound') {
		return `${amountDisplay} moved to ${counterpartyLabel}.`;
	}

	return `${amountDisplay} touched ${counterpartyLabel}.`;
}

function formatTransferAmount(value, decimals, symbol) {
	if (!value) {
		return symbol ? `Amount unavailable ${symbol}` : 'Amount unavailable';
	}

	const formatted = formatUnits(value, decimals);
	return symbol ? `${formatted} ${symbol}` : formatted;
}

function formatUnits(value, decimals, fractionDigits = 4) {
	const safeValue = String(value || '').trim();
	const safeDecimals = Math.max(0, Number.parseInt(decimals || '0', 10) || 0);

	if (!/^\d+$/.test(safeValue)) {
		return safeValue || '0';
	}

	if (safeDecimals === 0) {
		return safeValue;
	}

	const padded = safeValue.padStart(safeDecimals + 1, '0');
	const whole = padded.slice(0, -safeDecimals).replace(/^0+(?=\d)/, '') || '0';
	const fraction = padded.slice(-safeDecimals).slice(0, fractionDigits).replace(/0+$/, '');

	return `${whole}${fraction ? `.${fraction}` : ''}`;
}

function makeHttpError(message, status) {
	const error = new Error(message);
	error.status = status;
	return error;
}
