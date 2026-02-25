const SQRT2 = Math.sqrt(2);

export function routeVineThroughWhitespace({
  mask,
  pageWidth,
  pageHeight,
  startLocal,
  endLocal,
  minLength = 0.03,
  snapRadiusCells = 14
}) {
  const startCell = snapToFreeCell(mask, localToCell(mask, pageWidth, pageHeight, startLocal), snapRadiusCells);
  const endCell = snapToFreeCell(mask, localToCell(mask, pageWidth, pageHeight, endLocal), snapRadiusCells);

  if (!startCell || !endCell) {
    return { status: "no_route", pointsLocal: [] };
  }

  const pathCells = findPath(mask, startCell, endCell);
  if (!pathCells.length) {
    return { status: "no_route", pointsLocal: [] };
  }

  const rawPoints = pathCells.map((cell) => cellToLocal(mask, pageWidth, pageHeight, cell));
  const simplified = simplifyPolyline(rawPoints, 0.01);
  const smoothed = smoothPolylineChaikin(simplified, 2);

  if (polylineLength(smoothed) < minLength) {
    return { status: "too_short", pointsLocal: smoothed };
  }

  if (!isPolylineWhitespace(mask, pageWidth, pageHeight, smoothed, 1)) {
    return { status: "no_route", pointsLocal: [] };
  }

  return { status: "ok", pointsLocal: smoothed };
}

export function isLocalPointInWhitespace(mask, pageWidth, pageHeight, localPoint, paddingPx = 0) {
  const cell = localToCell(mask, pageWidth, pageHeight, localPoint);
  const radiusCells = Math.max(0, Math.ceil(paddingPx / mask.cellSizePx));

  for (let dy = -radiusCells; dy <= radiusCells; dy += 1) {
    for (let dx = -radiusCells; dx <= radiusCells; dx += 1) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      if (!isInside(mask, nx, ny)) {
        return false;
      }
      if (mask.occupied[ny * mask.maskWidth + nx]) {
        return false;
      }
    }
  }

  return true;
}

function localToCell(mask, pageWidth, pageHeight, point) {
  const u = clamp(point.x / pageWidth + 0.5, 0, 0.999999);
  const v = clamp(0.5 - point.y / pageHeight, 0, 0.999999);

  return {
    x: Math.floor(u * mask.maskWidth),
    y: Math.floor(v * mask.maskHeight)
  };
}

function cellToLocal(mask, pageWidth, pageHeight, cell) {
  const u = (cell.x + 0.5) / mask.maskWidth;
  const v = (cell.y + 0.5) / mask.maskHeight;

  return {
    x: (u - 0.5) * pageWidth,
    y: (0.5 - v) * pageHeight
  };
}

function snapToFreeCell(mask, startCell, maxRadius) {
  if (!isOccupied(mask, startCell.x, startCell.y)) {
    return startCell;
  }

  const visited = new Uint8Array(mask.maskWidth * mask.maskHeight);
  const queue = [startCell];
  visited[startCell.y * mask.maskWidth + startCell.x] = 1;

  while (queue.length) {
    const cell = queue.shift();
    const distance = Math.max(Math.abs(cell.x - startCell.x), Math.abs(cell.y - startCell.y));

    if (distance > maxRadius) {
      continue;
    }

    if (!isOccupied(mask, cell.x, cell.y)) {
      return cell;
    }

    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      if (!isInside(mask, nx, ny)) {
        continue;
      }
      const idx = ny * mask.maskWidth + nx;
      if (visited[idx]) {
        continue;
      }
      visited[idx] = 1;
      queue.push({ x: nx, y: ny });
    }
  }

  return null;
}

function findPath(mask, startCell, endCell) {
  const width = mask.maskWidth;
  const height = mask.maskHeight;
  const total = width * height;
  const startIdx = startCell.y * width + startCell.x;
  const endIdx = endCell.y * width + endCell.x;

  const gScore = new Float64Array(total);
  const fScore = new Float64Array(total);
  const cameFrom = new Int32Array(total);
  const inOpenSet = new Uint8Array(total);

  gScore.fill(Number.POSITIVE_INFINITY);
  fScore.fill(Number.POSITIVE_INFINITY);
  cameFrom.fill(-1);

  gScore[startIdx] = 0;
  fScore[startIdx] = heuristic(startCell, endCell);

  const open = [startIdx];
  inOpenSet[startIdx] = 1;

  while (open.length) {
    let bestIndexInOpen = 0;
    for (let i = 1; i < open.length; i += 1) {
      if (fScore[open[i]] < fScore[open[bestIndexInOpen]]) {
        bestIndexInOpen = i;
      }
    }

    const current = open[bestIndexInOpen];
    open.splice(bestIndexInOpen, 1);
    inOpenSet[current] = 0;

    if (current === endIdx) {
      return reconstructPath(cameFrom, current, width);
    }

    const cx = current % width;
    const cy = Math.floor(current / width);

    for (const [dx, dy, cost] of NEIGHBORS_8_COST) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isInside(mask, nx, ny) || isOccupied(mask, nx, ny)) {
        continue;
      }

      const neighbor = ny * width + nx;
      const tentative = gScore[current] + cost;
      if (tentative >= gScore[neighbor]) {
        continue;
      }

      cameFrom[neighbor] = current;
      gScore[neighbor] = tentative;
      fScore[neighbor] = tentative + heuristic({ x: nx, y: ny }, endCell);

      if (!inOpenSet[neighbor]) {
        open.push(neighbor);
        inOpenSet[neighbor] = 1;
      }
    }
  }

  return [];
}

function reconstructPath(cameFrom, current, width) {
  const path = [];
  let cursor = current;
  while (cursor !== -1) {
    const x = cursor % width;
    const y = Math.floor(cursor / width);
    path.push({ x, y });
    cursor = cameFrom[cursor];
  }

  path.reverse();
  return path;
}

function simplifyPolyline(points, minDistance) {
  if (points.length <= 2) {
    return points;
  }

  const result = [points[0]];
  let last = points[0];
  for (let i = 1; i < points.length - 1; i += 1) {
    if (distance(last, points[i]) >= minDistance) {
      result.push(points[i]);
      last = points[i];
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

function smoothPolylineChaikin(points, iterations) {
  let result = points;
  for (let iter = 0; iter < iterations; iter += 1) {
    if (result.length < 3) {
      break;
    }

    const next = [result[0]];
    for (let i = 0; i < result.length - 1; i += 1) {
      const p0 = result[i];
      const p1 = result[i + 1];
      next.push({ x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y });
      next.push({ x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y });
    }
    next.push(result[result.length - 1]);
    result = next;
  }

  return result;
}

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}

function isPolylineWhitespace(mask, pageWidth, pageHeight, points, sampleStepCellFraction) {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const segLength = distance(a, b);
    const sampleDistance = Math.max(0.004, mask.cellSizePx * sampleStepCellFraction / Math.max(pageWidth, pageHeight));
    const samples = Math.max(2, Math.ceil(segLength / sampleDistance));

    for (let s = 0; s <= samples; s += 1) {
      const t = s / samples;
      const sample = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
      if (!isLocalPointInWhitespace(mask, pageWidth, pageHeight, sample, 0)) {
        return false;
      }
    }
  }

  return true;
}

function isInside(mask, x, y) {
  return x >= 0 && y >= 0 && x < mask.maskWidth && y < mask.maskHeight;
}

function isOccupied(mask, x, y) {
  if (!isInside(mask, x, y)) {
    return true;
  }
  return mask.occupied[y * mask.maskWidth + x] === 1;
}

function heuristic(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

const NEIGHBORS_8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1]
];

const NEIGHBORS_8_COST = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2]
];
