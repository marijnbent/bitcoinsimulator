export function withComputedBlockHeights(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return [];
  }

  const blocksByHash = new Map();
  const childrenByHash = new Map();

  for (const block of blocks) {
    blocksByHash.set(block.hash, { ...block, height: -1 });
    childrenByHash.set(block.hash, []);
  }

  for (const block of blocks) {
    if (
      block.previousHash &&
      block.previousHash !== block.hash &&
      childrenByHash.has(block.previousHash)
    ) {
      childrenByHash.get(block.previousHash).push(block.hash);
    }
  }

  let roots = blocks.filter(
    (block) =>
      !block.previousHash ||
      block.previousHash === block.hash ||
      !blocksByHash.has(block.previousHash),
  );

  if (roots.length === 0) {
    roots = [
      blocks.reduce((oldest, block) =>
        block.minedAt < oldest.minedAt ? block : oldest,
      ),
    ];
  }

  roots = [...roots].sort((a, b) => a.minedAt - b.minedAt);

  for (const root of roots) {
    const rootBlock = blocksByHash.get(root.hash);
    if (!rootBlock || rootBlock.height >= 0) {
      continue;
    }

    rootBlock.height = 0;
    const queue = [root.hash];

    while (queue.length > 0) {
      const currentHash = queue.shift();
      const currentBlock = blocksByHash.get(currentHash);
      const childHashes = childrenByHash.get(currentHash) || [];

      for (const childHash of childHashes) {
        const childBlock = blocksByHash.get(childHash);
        const nextHeight = currentBlock.height + 1;

        if (childBlock && nextHeight > childBlock.height) {
          childBlock.height = nextHeight;
          queue.push(childHash);
        }
      }
    }
  }

  for (const block of blocksByHash.values()) {
    if (block.height < 0) {
      block.height = 0;
    }
  }

  return blocks.map((block) => blocksByHash.get(block.hash) || block);
}

export function getLongestChainBlocks(blocks) {
  const normalizedBlocks = withComputedBlockHeights(blocks);

  if (normalizedBlocks.length === 0) {
    return [];
  }

  let maxHeight = -1;
  for (const block of normalizedBlocks) {
    if (block.height > maxHeight) {
      maxHeight = block.height;
    }
  }

  const highestBlocks = normalizedBlocks.filter((block) => block.height === maxHeight);
  const blocksByHash = new Map(normalizedBlocks.map((block) => [block.hash, block]));
  const blockIds = [];

  for (const highestBlock of highestBlocks) {
    let currentBlock = highestBlock;
    while (currentBlock) {
      blockIds.push(currentBlock.id);
      currentBlock = blocksByHash.get(currentBlock.previousHash);
    }
  }

  return [...new Set(blockIds)];
}
