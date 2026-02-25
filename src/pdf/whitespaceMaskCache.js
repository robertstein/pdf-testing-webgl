export class WhitespaceMaskCache {
  constructor(pdfController, options = {}) {
    this.pdfController = pdfController;
    this.options = {
      analysisMaxDim: 768,
      textPaddingPx: 2,
      pixelLumaThreshold: 245,
      pixelEdgeThreshold: 18,
      dilationPx: 8,
      cellSizePx: 4,
      ...options
    };

    this.cache = new Map();
    this.pending = new Map();
  }

  async getOrBuildMask(pageIndex) {
    if (this.cache.has(pageIndex)) {
      return this.cache.get(pageIndex);
    }

    if (this.pending.has(pageIndex)) {
      return this.pending.get(pageIndex);
    }

    const promise = this.buildMask(pageIndex)
      .then((mask) => {
        this.cache.set(pageIndex, mask);
        this.pending.delete(pageIndex);
        return mask;
      })
      .catch((error) => {
        this.pending.delete(pageIndex);
        throw error;
      });

    this.pending.set(pageIndex, promise);
    return promise;
  }

  clear() {
    this.cache.clear();
    this.pending.clear();
  }

  async buildMask(pageIndex) {
    const analysis = await this.pdfController.renderPageAnalysis(pageIndex, this.options.analysisMaxDim);
    const textBoxes = await this.pdfController.getPageTextBoxes(pageIndex, analysis.scale);

    const {
      width,
      height,
      imageData,
      scale,
      pdfWidth,
      pdfHeight
    } = analysis;

    const cellSizePx = this.options.cellSizePx;
    const maskWidth = Math.max(1, Math.ceil(width / cellSizePx));
    const maskHeight = Math.max(1, Math.ceil(height / cellSizePx));
    const occupied = new Uint8Array(maskWidth * maskHeight);

    markContentFromPixels({
      occupied,
      maskWidth,
      maskHeight,
      cellSizePx,
      width,
      height,
      imageData,
      pixelLumaThreshold: this.options.pixelLumaThreshold,
      pixelEdgeThreshold: this.options.pixelEdgeThreshold
    });

    markContentFromTextBoxes({
      occupied,
      maskWidth,
      maskHeight,
      cellSizePx,
      textBoxes,
      textPaddingPx: this.options.textPaddingPx
    });

    const dilationRadiusCells = Math.max(0, Math.ceil(this.options.dilationPx / cellSizePx));
    const dilated = dilateOccupancy(occupied, maskWidth, maskHeight, dilationRadiusCells);

    return {
      pageIndex,
      maskWidth,
      maskHeight,
      cellSizePx,
      occupied: dilated,
      analysisScale: scale,
      analysisWidth: width,
      analysisHeight: height,
      pdfWidth,
      pdfHeight
    };
  }
}

function markContentFromPixels({
  occupied,
  maskWidth,
  maskHeight,
  cellSizePx,
  width,
  height,
  imageData,
  pixelLumaThreshold,
  pixelEdgeThreshold
}) {
  const data = imageData.data;
  const luma = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      luma[y * width + x] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const current = luma[y * width + x];
      const left = x > 0 ? luma[y * width + (x - 1)] : current;
      const up = y > 0 ? luma[(y - 1) * width + x] : current;
      const edgeStrength = Math.max(Math.abs(current - left), Math.abs(current - up));
      const hasInk = current < pixelLumaThreshold;
      const hasEdge = edgeStrength > pixelEdgeThreshold && current < 252;

      if (hasInk || hasEdge) {
        const cx = Math.min(maskWidth - 1, Math.floor(x / cellSizePx));
        const cy = Math.min(maskHeight - 1, Math.floor(y / cellSizePx));
        occupied[cy * maskWidth + cx] = 1;
      }
    }
  }
}

function markContentFromTextBoxes({
  occupied,
  maskWidth,
  maskHeight,
  cellSizePx,
  textBoxes,
  textPaddingPx
}) {
  for (const box of textBoxes) {
    const minX = Math.max(0, Math.floor((box.x - textPaddingPx) / cellSizePx));
    const minY = Math.max(0, Math.floor((box.y - textPaddingPx) / cellSizePx));
    const maxX = Math.min(maskWidth - 1, Math.ceil((box.x + box.width + textPaddingPx) / cellSizePx));
    const maxY = Math.min(maskHeight - 1, Math.ceil((box.y + box.height + textPaddingPx) / cellSizePx));

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        occupied[y * maskWidth + x] = 1;
      }
    }
  }
}

function dilateOccupancy(occupied, width, height, radius) {
  if (radius <= 0) {
    return occupied;
  }

  const result = new Uint8Array(occupied);
  const offsets = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy <= radius * radius) {
        offsets.push([dx, dy]);
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!occupied[y * width + x]) {
        continue;
      }

      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        result[ny * width + nx] = 1;
      }
    }
  }

  return result;
}
