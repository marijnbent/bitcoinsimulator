<script>
	import { onMount, afterUpdate } from 'svelte';
	import * as d3 from 'd3';

	// Props
	export let blocks = [];
	export let expandedBlockId = null;
	export let selectedPreviousBlock = null;
	export let toggleBlock;
	export let selectPreviousBlock;
	export let timeAgo;

	// Internal state
	let blockTree = null;
	let showAllRows = false;
	
	// Watch for changes to blocks and rebuild the tree
	$: if (blocks.length > 0) {
		buildBlockTree();
	}
	
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
			blockTree = null;
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
		
		// Only render if blockTree has been built
		if (blockTree) {
			renderGridTree();
		}
	}
	
	// Toggle function for showing all rows
	function toggleShowAllRows() {
		showAllRows = !showAllRows;
		renderTree();
	}

	// Render using the grid-based blockTree format
	function renderGridTree() {
		if (!blockTree) return;
		
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
		
		// Draw horizontal connections between blocks
		for (let row = 0; row <= visibleMaxRow; row++) {
			// Find all blocks in this row
			const rowBlocks = [];
			for (let col = 0; col <= maxColumn; col++) {
				if (grid[row] && grid[row][col]) {
					rowBlocks.push({ block: grid[row][col], col });
				}
			}
		
			// Sort blocks by column to ensure correct order
			rowBlocks.sort((a, b) => a.col - b.col);
		
			// Draw individual connections between connected blocks in the row
			for (let i = 0; i < rowBlocks.length - 1; i++) {
				const source = rowBlocks[i];
				const target = rowBlocks[i + 1];
		
				// Check if these blocks are actually connected (target's previousHash points to source)
				if (target.block.previousHash === source.block.hash) {
					// Calculate positions with reversed columns
					const reversedSourceCol = maxColumn - source.col;
					const reversedTargetCol = maxColumn - target.col;
		
					// In reversed order, source is on the right and target is on the left
					// For individual connections, we want to connect the left side of the right block
					// to the right side of the left block
					const sourceBlockLeftX = reversedSourceCol * (blockWidth + blockSpacingX); // Left side of source (right block)
					const targetBlockRightX = reversedTargetCol * (blockWidth + blockSpacingX) + blockWidth; // Right side of target (left block)
					const y1 = row * (blockHeight + blockSpacingY) + blockHeight / 2; // Center of block
					const y2 = y1; // Same y-coordinate for a straight line
		
					// Determine color based on chain type
					const color = source.block.isInLongestChain && target.block.isInLongestChain
						? "#10b981" // Green for main chain
						: "#eab308"; // Yellow/orange for forked chains
		
					// Draw the connection line only if there's space between blocks
					if (sourceBlockLeftX !== targetBlockRightX) {
						// Calculate the actual line endpoints with a small gap on each end
						// to make it clear these are individual connections
						const gapSize = 5; // Size of the gap in pixels
						
						// Adjust start and end points to create gaps
						const adjustedX1 = sourceBlockLeftX + gapSize; // Add gap to left side of source
						const adjustedX2 = targetBlockRightX - gapSize; // Subtract gap from right side of target
						
						// Main connection line with gaps on both ends
						linksGroup.append("line")
							.attr("x1", adjustedX1)
							.attr("y1", y1)
							.attr("x2", adjustedX2)
							.attr("y2", y2)
							.attr("stroke", color)
							.attr("stroke-width", 5)
							.attr("opacity", 0.8);
		
						// Add chain-like decorations
						const linkDistance = Math.abs(adjustedX2 - adjustedX1);
						const numDecorations = Math.max(2, Math.floor(linkDistance / 40));
						const step = linkDistance / numDecorations;

						// Since we're going from right to left (source to target), direction is always -1
						const direction = adjustedX1 < adjustedX2 ? 1 : -1;
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
								<span class="text-xs text-cyan-300 break-all">${block.hash.substring(0, 10)}...</span>
							</div>
							<div class="mb-1">
								<span class="text-cyan-500">Previous:</span>
								<span class="text-xs text-cyan-300 break-all">${block.previousHash.substring(0, 10)}...</span>
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

			selectPreviousBlock(block);
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
			{#if blockTree && blockTree.maxRow > 1}
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
