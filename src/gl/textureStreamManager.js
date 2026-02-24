import * as THREE from "three";
import { expandVisibleIndicesWithRing } from "../layout/gridLayout";
import { MemoryManager } from "./memoryManager";

export class TextureStreamManager {
  constructor({
    pdfController,
    sceneManager,
    layout,
    memoryPolicy,
    textureMaxDimension,
    onDownscale,
    onError
  }) {
    this.pdfController = pdfController;
    this.sceneManager = sceneManager;
    this.layout = layout;
    this.pageLookup = Object.fromEntries(layout.pages.map((p) => [p.pageIndex, p]));
    this.textureMaxDimension = textureMaxDimension;
    this.onDownscale = onDownscale;
    this.onError = onError;

    this.memoryManager = new MemoryManager(memoryPolicy);
    this.entries = new Map();
    this.loadQueue = [];
    this.activeLoads = 0;
    this.maxConcurrentLoads = 2;
    this.preloadRing = 1;
    this.cancelled = false;

    for (const page of layout.pages) {
      this.entries.set(page.pageIndex, {
        pageIndex: page.pageIndex,
        texture: null,
        state: "unloaded",
        pixelWidth: 0,
        pixelHeight: 0,
        bytesEstimate: 0,
        lastUsedTs: 0
      });
    }
  }

  hasPendingWork() {
    return this.activeLoads > 0 || this.loadQueue.length > 0;
  }

  updateVisibleSet(visibleSet, center) {
    if (this.cancelled) {
      return;
    }

    const targetSet = expandVisibleIndicesWithRing(visibleSet, this.pageLookup, this.layout.columns, this.preloadRing);

    for (const pageIndex of targetSet) {
      const entry = this.entries.get(pageIndex);
      if (!entry || entry.state === "ready" || entry.state === "loading") {
        if (entry && entry.state === "ready") {
          entry.lastUsedTs = Date.now();
        }
        continue;
      }
      this.enqueue(pageIndex);
    }

    this.evictIfNeeded(targetSet, center);
    this.pumpQueue();
  }

  enqueue(pageIndex) {
    if (!this.loadQueue.includes(pageIndex)) {
      this.loadQueue.push(pageIndex);
    }
  }

  pumpQueue() {
    while (this.activeLoads < this.maxConcurrentLoads && this.loadQueue.length > 0) {
      const pageIndex = this.loadQueue.shift();
      const entry = this.entries.get(pageIndex);
      if (!entry || entry.state === "ready" || entry.state === "loading") {
        continue;
      }
      this.loadPageTexture(pageIndex);
    }
  }

  async loadPageTexture(pageIndex) {
    const entry = this.entries.get(pageIndex);
    if (!entry) {
      return;
    }

    entry.state = "loading";
    this.activeLoads += 1;

    try {
      const renderResult = await this.pdfController.renderPageToCanvas(pageIndex, this.textureMaxDimension);
      if (this.cancelled) {
        if (renderResult.imageSource && "close" in renderResult.imageSource) {
          renderResult.imageSource.close();
        }
        return;
      }

      const texture = new THREE.Texture(renderResult.imageSource);
      texture.needsUpdate = true;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = false;

      entry.texture = texture;
      entry.state = "ready";
      entry.pixelWidth = renderResult.pixelWidth;
      entry.pixelHeight = renderResult.pixelHeight;
      entry.bytesEstimate = renderResult.bytesEstimate;
      entry.lastUsedTs = Date.now();

      this.memoryManager.add(entry.bytesEstimate);
      this.sceneManager.setTexture(pageIndex, texture);

      if (renderResult.downscaled) {
        this.onDownscale?.();
      }
    } catch (error) {
      entry.state = "error";
      this.onError?.(error);
    } finally {
      this.activeLoads = Math.max(0, this.activeLoads - 1);
      this.pumpQueue();
    }
  }

  evictIfNeeded(pinnedSet, center) {
    if (!this.memoryManager.shouldEvict()) {
      return;
    }

    const evictable = [];
    for (const entry of this.entries.values()) {
      if (entry.state !== "ready" || pinnedSet.has(entry.pageIndex)) {
        continue;
      }
      const page = this.pageLookup[entry.pageIndex];
      const dx = page.worldX - center.centerX;
      const dy = page.worldY - center.centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      evictable.push({ entry, distance });
    }

    evictable.sort((a, b) => {
      if (a.distance !== b.distance) {
        return b.distance - a.distance;
      }
      return a.entry.lastUsedTs - b.entry.lastUsedTs;
    });

    for (const item of evictable) {
      if (!this.memoryManager.shouldEvict()) {
        break;
      }
      const entry = item.entry;
      this.sceneManager.clearTexture(entry.pageIndex);
      this.memoryManager.remove(entry.bytesEstimate);
      entry.texture = null;
      entry.state = "evicted";
      entry.bytesEstimate = 0;
      entry.pixelHeight = 0;
      entry.pixelWidth = 0;
      entry.lastUsedTs = Date.now();
    }
  }

  getUsage() {
    return this.memoryManager.getUsage();
  }

  dispose() {
    this.cancelled = true;
    this.loadQueue.length = 0;

    for (const entry of this.entries.values()) {
      if (entry.texture || entry.state === "ready") {
        this.sceneManager.clearTexture(entry.pageIndex);
      }
      entry.texture = null;
    }
  }
}
