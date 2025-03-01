<script>
	import { onMount, afterUpdate } from 'svelte';
	import * as d3 from 'd3';

	// Props
	export let blocks = [];
	export let blockTree = [];
	export let expandedBlockId = null;
	export let selectedPreviousBlock = null;

	// Functions that need to be passed from parent
	export let toggleBlock;
	export let timeAgo;

	// D3 visualization elements
	let svg;
	let container;
	let width = 1200;
	let height = 700;
	let margin = { top: 0, right: 0, bottom: 0, left: 0 };
	let innerWidth = width - margin.left - margin.right;
	let innerHeight = height - margin.top - margin.bottom;
	
	// Block sizing
	const blockWidth = 280;
	const blockHeight = 160;
	const blockSpacingX = 30; // Horizontal spacing between blocks
	const blockSpacingY = 30; // Vertical spacing between rows
	
	// Responsive sizing - but allow horizontal scrolling for large chains
	let containerWidth;
	$: if (containerWidth) {
		// Only adjust height based on container, allow horizontal scrolling
		height = Math.max(700, containerWidth * 0.6);
		innerHeight = height - margin.top - margin.bottom;
	}

	// Render the D3 tree visualization
	function renderTree() {
		if (!container || !blocks || blocks.length === 0) return;

		// Clear previous visualization
		d3.select(container).selectAll("*").remove();
		
		renderGridTree();
	}
	
	// Render using the grid-based blockTree format
	function renderGridTree() {
		// Create SVG with a larger width to allow horizontal scrolling
		svg = d3.select(container)
			.append("svg")
			.attr("width", Math.max(width, (blockTree.maxColumn + 1) * (blockWidth + blockSpacingX) + margin.left + margin.right))
			.attr("height", height)
			.append("g")
			.attr("transform", `translate(${margin.left},${margin.top})`);
			
		const grid = blockTree.grid;
		const maxRow = blockTree.maxRow;
		const maxColumn = blockTree.maxColumn;
		
		// Create a group for all connections
		const linksGroup = svg.append("g").attr("class", "links");
		
		// First pass: Draw all chain links (horizontal connections)
		for (let row = 0; row <= maxRow; row++) {
			// Find all blocks in this row
			const rowBlocks = [];
			for (let col = 0; col <= maxColumn; col++) {
				if (grid[row] && grid[row][col]) {
					rowBlocks.push({ block: grid[row][col], col });
				}
			}

			// Sort blocks by column
			rowBlocks.sort((a, b) => a.col - b.col);

			// Draw connections between consecutive blocks in the same row
			for (let i = 0; i < rowBlocks.length - 1; i++) {
				const source = rowBlocks[i];
				const target = rowBlocks[i + 1];

				// Only render if both blocks are in the longest chain
				if (!source.block.isInLongestChain || !target.block.isInLongestChain) continue;

				// Calculate positions
				const x1 = source.col * (blockWidth + blockSpacingX) + blockWidth;
				const y1 = row * (blockHeight + blockSpacingY) + blockHeight / 2;
				const x2 = target.col * (blockWidth + blockSpacingX);
				const y2 = y1;

				// Draw chain link
				const color = "#10b981"; // Green for main chain
				// Draw a chain-like connection
				const linkWidth = x2 - x1;
				const linkHeight = 10;
				const linkSpacing = 6;
				const numLinks = Math.max(1, Math.floor(linkWidth / (linkSpacing * 2)));

				for (let j = 0; j < numLinks; j++) {
					const linkX = x1 + (j * linkWidth / numLinks);
					const linkWidth2 = linkWidth / numLinks - 2;

					linksGroup.append("rect")
						.attr("x", linkX)
						.attr("y", y1 - linkHeight / 2)
						.attr("width", linkWidth2)
						.attr("height", linkHeight)
						.attr("rx", 2)
						.attr("ry", 2)
						.attr("fill", color)
						.attr("opacity", 0.8);
				}
			}
		}
		
		for (let row = 0; row <= maxRow; row++) {
			for (let col = 0; col <= maxColumn; col++) {
				const block = grid[row] && grid[row][col];
				if (!block || !block.forkParent) continue;

				// Find the parent block
				let parentBlock = null;
				let parentRow = -1;
				let parentCol = -1;

				// Search for the parent block
				for (let r = 0; r < row; r++) {
					for (let c = 0; c <= maxColumn; c++) {
						if (grid[r] && grid[r][c] && grid[r][c].hash === block.forkParent) {
							parentBlock = grid[r][c];
							parentRow = r;
							parentCol = c;
							break;
						}
					}
					if (parentBlock) break;
				}

				if (parentBlock) {
					// Calculate positions - now starting from bottom right of parent block
					const x1 = parentCol * (blockWidth + blockSpacingX) + blockWidth; // Right side of parent
					const y1 = parentRow * (blockHeight + blockSpacingY) + blockHeight; // Bottom of parent
					const x2 = col * (blockWidth + blockSpacingX); // Left side of child
					const y2 = row * (blockHeight + blockSpacingY); // Top of child block

					// Draw a curved path for the fork connection
					const path = d3.path();
					path.moveTo(x1, y1);

					// Control points for the curve
					const midY = y1 + (y2 - y1) / 2;

					// Create an S-curve
					path.bezierCurveTo(
						x1, midY, // First control point
						x2, midY, // Second control point
						x2, y2    // End point
					);

					linksGroup.append("path")
						.attr("d", path.toString())
						.attr("fill", "none")
						.attr("stroke", "#eab308") // Yellow for forks
						.attr("stroke-width", 3)
						.attr("stroke-dasharray", "5,5") // Dashed line for forks
						.attr("opacity", 0.8);
				}
			}
		}
		
		// Draw blocks
		for (let row = 0; row <= maxRow; row++) {
			for (let col = 0; col <= maxColumn; col++) {
				const block = grid[row] && grid[row][col];
				if (!block) continue;
				
				const isSelected = selectedPreviousBlock && selectedPreviousBlock.hash === block.hash;
				const borderClass = block.isInLongestChain ? "border-green-500" : "border-yellow-500";
				const selectedClass = isSelected ? "cyberpunk-box-selected" : "";
				
				// Create block node
				const blockGroup = svg.append("g")
					.attr("transform", `translate(${col * (blockWidth + blockSpacingX)},${row * (blockHeight + blockSpacingY)})`)
					.attr("cursor", "pointer");
				
				blockGroup.append("foreignObject")
					.attr("width", blockWidth)
					.attr("height", blockHeight)
					.html(`
						<div class="cyberpunk-box rounded-lg p-3 hover:border-cyan-600 transition-colors ${borderClass} ${selectedClass}" style="width: 100%; height: 100%; overflow: hidden;">
							<div class="mb-1 flex justify-between items-center">
								<span class="font-bold text-cyan-400">Block ${block.height}</span>
								<span class="text-xs text-cyan-600">${timeAgo(block.minedAt)}</span>
							</div>
							<div class="mb-1">
								<span class="text-cyan-500">Hash:</span>
								<span class="text-xs text-cyan-300 break-all">${block.hash.substring(0, 8)}...</span>
							</div>
							<div class="mb-1">
								<span class="text-cyan-500">Previous:</span>
								<span class="text-xs text-cyan-300 break-all">${block.previousHash.substring(0, 8)}...</span>
							</div>
							<div class="mb-1">
								<span class="text-cyan-500">Miner:</span>
								<span class="text-cyan-300">${block.minerUsername || "Unknown"}</span>
							</div>
							<div class="flex justify-between items-center">
								<div>
									<span class="text-cyan-500">Tx:</span>
									<span class="text-cyan-300">${block.transactions ? block.transactions.length : 0}</span>
								</div>
								<div class="flex space-x-2">
									<button
										class="text-cyan-400 hover:text-cyan-300 focus:outline-none cursor-pointer view-tx-btn"
										data-block-id="${block.id}"
										title="View Transactions"
									>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
											<path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
											<path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
										</svg>
									</button>
									<button
										class="text-purple-400 hover:text-purple-300 focus:outline-none cursor-pointer select-block-btn"
										data-block-hash="${block.hash}"
										title="Select as Previous Block"
									>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
											<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
										</svg>
									</button>
								</div>
							</div>
						</div>
					`);
			}
		}
		
		// Add event listeners for buttons
		d3.selectAll(".view-tx-btn").on("click", function() {
			const blockId = d3.select(this).attr("data-block-id");
			toggleBlock(blockId);
		});

		d3.selectAll(".select-block-btn").on("click", function() {
			const blockHash = d3.select(this).attr("data-block-hash");
			const block = blocks.find(b => b.hash === blockHash);
			if (block) {
				selectedPreviousBlock = block;
			}
		});
	}
	

	// Initialize and update visualization
	onMount(() => {
		if (blocks && blocks.length > 0) {
			renderTree();
		}
	});

	afterUpdate(() => {
		if (blocks && blocks.length > 0) {
			renderTree();
		}
	});
</script>

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
			<div bind:this={container} bind:clientWidth={containerWidth} class="d3-container" style="min-height: 700px; overflow-x: auto;"></div>
		</div>

		<!-- Expanded Block Transactions -->
		{#if expandedBlockId}
			{@const expandedBlock = blocks.find(
				(b) => b.id === expandedBlockId,
			)}
			{#if expandedBlock}
				<div class="mt-4 p-4 cyberpunk-box rounded-lg">
					<h3 class="text-xl font-bold mb-4">
						Transactions in Block {expandedBlock.height}
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

<style>
	.d3-container {
		border-radius: 0.5rem;
		padding: 1rem;
		width: 100%;
	}
</style>
