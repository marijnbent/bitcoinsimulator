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

	// State for showing all rows or limiting to 2
	let showAllRows = false;

	// D3 visualization elements
	let svg;
	let container;
	let width = 1200;
	let height = 300;
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
		height = Math.max(300, containerWidth * 0.6);
		innerHeight = height - margin.top - margin.bottom;
	}

	// Render the D3 tree visualization
	function renderTree() {
		if (!container || !blocks || blocks.length === 0) return;

		// Clear previous visualization
		d3.select(container).selectAll("*").remove();
		
		renderGridTree();
	}
	
	// Toggle function for showing all rows
	function toggleShowAllRows() {
		showAllRows = !showAllRows;
		renderTree();
	}

	// Render using the grid-based blockTree format
	function renderGridTree() {
		// Create SVG with a larger width to allow horizontal scrolling
		svg = d3.select(container)
			.append("svg")
			.attr("width", Math.max(width, (blockTree.maxColumn + 1) * (blockWidth + blockSpacingX) + margin.left + margin.right))
			.append("g")
			.attr("transform", `translate(${margin.left},${margin.top})`);
			
		const grid = blockTree.grid;
		const maxRow = blockTree.maxRow;
		const maxColumn = blockTree.maxColumn;
		
		// Determine visible rows based on showAllRows state
		const visibleMaxRow = showAllRows ? maxRow : Math.min(1, maxRow);
		
		// Calculate height based on visible rows and update SVG height
		const calculatedHeight = (visibleMaxRow + 1) * (blockHeight + blockSpacingY) + margin.top + margin.bottom;
		d3.select(svg.node().parentNode).attr("height", calculatedHeight);
		
		// Create a group for all connections
		const linksGroup = svg.append("g").attr("class", "links");
		
		// First pass: Draw all chain links (horizontal connections)
		for (let row = 0; row <= visibleMaxRow; row++) {
			// Find all blocks in this row
			const rowBlocks = [];
			for (let col = 0; col <= maxColumn; col++) {
				if (grid[row] && grid[row][col]) {
					rowBlocks.push({ block: grid[row][col], col });
				}
			}

			// Find all blocks in the longest chain in this row
			const longestChainBlocks = rowBlocks.filter(rb => rb.block.isInLongestChain);
			
			// Sort by height to ensure correct order
			longestChainBlocks.sort((a, b) => a.block.height - b.block.height);
			
			longestChainBlocks.forEach((rb, idx) => {
			});
			
			// Draw connections between consecutive blocks in the longest chain
			for (let i = 0; i < longestChainBlocks.length - 1; i++) {
				const source = longestChainBlocks[i];
				const target = longestChainBlocks[i + 1];
				
				// Calculate positions with reversed columns
				const reversedSourceCol = maxColumn - source.col;
				const reversedTargetCol = maxColumn - target.col;
				
				// In reversed order, source is on the right and target is on the left
				// (since we're displaying newest blocks on the left)
				const x1 = reversedSourceCol * (blockWidth + blockSpacingX) + blockWidth; // Right side of source
				const y1 = row * (blockHeight + blockSpacingY) + blockHeight / 2; // Center of block
				const x2 = reversedTargetCol * (blockWidth + blockSpacingX); // Left side of target
				const y2 = y1; // Same y-coordinate for a straight line

				// Draw a simple line for the main chain connection
				const color = "#10b981"; // Green for main chain
				
				// Calculate the actual space between blocks (excluding the blocks themselves)
				// In our reversed layout, x1 is the right edge of the source block and x2 is the left edge of the target block
				// We want to draw the line only in this space
				
				// Draw a line only in the space between blocks
				if (x1 !== x2) { // Only draw if there's space between blocks
					linksGroup.append("line")
						.attr("x1", x1)
						.attr("y1", y1)
						.attr("x2", x2)
						.attr("y2", y2)
						.attr("stroke", color)
						.attr("stroke-width", 5)
						.attr("opacity", 0.8);
						
					// Add chain-like decorations only in the space between blocks
					const linkDistance = Math.abs(x2 - x1);
					const numDecorations = Math.max(2, Math.floor(linkDistance / 40));
					const step = linkDistance / numDecorations;
					
					// Determine direction (left to right or right to left)
					const direction = x1 < x2 ? 1 : -1;
					
					for (let j = 1; j < numDecorations; j++) {
						const decorX = x1 + (direction * j * step);
						
						linksGroup.append("circle")
							.attr("cx", decorX)
							.attr("cy", y1)
							.attr("r", 3)
							.attr("fill", color)
							.attr("opacity", 0.8);
					}
				}
			}
		}
		
		for (let row = 0; row <= visibleMaxRow; row++) {
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
					// Calculate positions with reversed columns
					const reversedParentCol = maxColumn - parentCol;
					const reversedCol = maxColumn - col;
					
					// In reversed order, child is to the right of parent
					const x1 = reversedParentCol * (blockWidth + blockSpacingX); // Left side of parent
					const y1 = parentRow * (blockHeight + blockSpacingY) + blockHeight; // Bottom of parent
					const x2 = reversedCol * (blockWidth + blockSpacingX) + blockWidth; // Right side of child
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
		for (let row = 0; row <= visibleMaxRow; row++) {
			for (let col = 0; col <= maxColumn; col++) {
				const block = grid[row] && grid[row][col];
				if (!block) continue;
				
				const isSelected = selectedPreviousBlock && selectedPreviousBlock.hash === block.hash;
				const borderClass = block.isInLongestChain ? "border-green-500" : "border-yellow-500";
				const selectedClass = isSelected ? "cyberpunk-box-selected" : "";
				
				// Calculate reversed x position (newest blocks on left)
				const reversedCol = maxColumn - col;
				
				// Create block node
				const blockGroup = svg.append("g")
					.attr("transform", `translate(${reversedCol * (blockWidth + blockSpacingX)},${row * (blockHeight + blockSpacingY)})`)
					.attr("cursor", "pointer");
				
				blockGroup.append("foreignObject")
					.attr("width", blockWidth)
					.attr("height", blockHeight)
					.html(`
						<div class="cyberpunk-box bg-gray-900 rounded-lg p-3 hover:border-cyan-600 transition-colors ${borderClass} ${selectedClass}" style="width: 100%; height: 100%; overflow: hidden;">
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
		
		// Button moved outside the canvas
		
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
		<div class="relative">
			{#if blockTree.maxRow > 1}
				<button
					on:click={toggleShowAllRows}
					class="absolute -top-10 right-2 z-10 px-3 py-2 rounded-md bg-slate-800 border border-cyan-500 text-cyan-400 hover:bg-slate-700 transition-colors text-xs"
				>
					{showAllRows ? 'Hide Forks' : 'Show All Forks'}
				</button>
			{/if}
			<div class="overflow-x-auto pb-4">
				<div bind:this={container} bind:clientWidth={containerWidth} class="d3-container" style="overflow-x: auto;"></div>
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
