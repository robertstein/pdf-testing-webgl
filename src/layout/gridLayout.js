const DEFAULT_GAP_X = 0.2;
const DEFAULT_GAP_Y = 0.3;
const BASE_WORLD_WIDTH = 1;

export function computeGridLayout(pageMetadata, viewportWidthPx, targetCardPx = 220) {
  if (!pageMetadata.length) {
    return {
      pages: [],
      columns: 0,
      rows: 0,
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }
    };
  }

  const columns = Math.max(1, Math.floor(viewportWidthPx / targetCardPx));
  const rows = Math.ceil(pageMetadata.length / columns);

  const rowHeights = Array.from({ length: rows }, () => 0);
  const pagesWithSize = pageMetadata.map((page) => {
    const worldWidth = BASE_WORLD_WIDTH;
    const worldHeight = worldWidth * page.aspect;
    return { ...page, worldWidth, worldHeight };
  });

  for (let index = 0; index < pagesWithSize.length; index += 1) {
    const row = Math.floor(index / columns);
    rowHeights[row] = Math.max(rowHeights[row], pagesWithSize[index].worldHeight);
  }

  const colWidth = BASE_WORLD_WIDTH + DEFAULT_GAP_X;
  const totalWidth = columns * BASE_WORLD_WIDTH + (columns - 1) * DEFAULT_GAP_X;
  const totalHeight = rowHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, rows - 1) * DEFAULT_GAP_Y;

  const left = -totalWidth / 2;
  const top = totalHeight / 2;

  let yCursor = top;
  const rowCenterY = [];
  for (let row = 0; row < rows; row += 1) {
    rowCenterY[row] = yCursor - rowHeights[row] / 2;
    yCursor -= rowHeights[row] + DEFAULT_GAP_Y;
  }

  const pages = pagesWithSize.map((page, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const worldX = left + col * colWidth + page.worldWidth / 2;
    const worldY = rowCenterY[row];

    return {
      ...page,
      pageIndex: page.pageIndex,
      worldX,
      worldY,
      row,
      col
    };
  });

  return {
    pages,
    columns,
    rows,
    bounds: {
      minX: left,
      maxX: left + totalWidth,
      minY: top - totalHeight,
      maxY: top
    }
  };
}

export function expandVisibleIndicesWithRing(visibleIndices, pageLookup, columns, ring = 1) {
  if (!visibleIndices.size || ring <= 0) {
    return new Set(visibleIndices);
  }

  const expanded = new Set(visibleIndices);
  for (const idx of visibleIndices) {
    const page = pageLookup[idx];
    if (!page) {
      continue;
    }

    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        const row = page.row + dy;
        const col = page.col + dx;
        if (row < 0 || col < 0) {
          continue;
        }
        const neighborIndex = row * columns + col;
        if (pageLookup[neighborIndex]) {
          expanded.add(neighborIndex);
        }
      }
    }
  }

  return expanded;
}
