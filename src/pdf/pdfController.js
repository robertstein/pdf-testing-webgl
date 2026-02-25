import { GlobalWorkerOptions, Util, getDocument } from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export class PdfDocumentController {
  constructor() {
    this.loadingTask = null;
    this.pdfDocument = null;
    this.pageCount = 0;
  }

  async loadFromFile(file) {
    this.dispose();
    const buffer = await file.arrayBuffer();
    this.loadingTask = getDocument({ data: buffer });
    this.pdfDocument = await this.loadingTask.promise;
    this.pageCount = this.pdfDocument.numPages;
    return this.pdfDocument;
  }

  async getPageMetadata() {
    if (!this.pdfDocument) {
      throw new Error("No PDF loaded.");
    }

    const pages = [];
    for (let pageIndex = 0; pageIndex < this.pageCount; pageIndex += 1) {
      const page = await this.pdfDocument.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1 });
      pages.push({
        pageIndex,
        pdfWidth: viewport.width,
        pdfHeight: viewport.height,
        aspect: viewport.height / viewport.width
      });
      page.cleanup();
    }

    return pages;
  }

  async renderPageToCanvas(pageIndex, maxDimension = 2048) {
    const { page, canvas, viewport, sourceViewport } = await this.renderPage(pageIndex, maxDimension);

    const downscaled = viewport.scale < 1;
    let imageSource = canvas;

    if (typeof createImageBitmap === "function") {
      try {
        imageSource = await createImageBitmap(canvas, { imageOrientation: "flipY" });
      } catch {
        imageSource = canvas;
      }
    }

    page.cleanup();

    return {
      imageSource,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      bytesEstimate: canvas.width * canvas.height * 4,
      downscaled,
      scale: viewport.scale,
      pdfWidth: sourceViewport.width,
      pdfHeight: sourceViewport.height
    };
  }

  async renderPageAnalysis(pageIndex, maxDimension = 768) {
    const { page, canvas, context, viewport, sourceViewport } = await this.renderPage(pageIndex, maxDimension);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    page.cleanup();

    return {
      width: canvas.width,
      height: canvas.height,
      imageData,
      scale: viewport.scale,
      pdfWidth: sourceViewport.width,
      pdfHeight: sourceViewport.height
    };
  }

  async getPageTextBoxes(pageIndex, scale = 1) {
    if (!this.pdfDocument) {
      throw new Error("No PDF loaded.");
    }

    const page = await this.pdfDocument.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });
    const textContent = await page.getTextContent();

    const boxes = [];
    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) {
        continue;
      }

      const tx = Util.transform(viewport.transform, item.transform);
      const angle = Math.atan2(tx[1], tx[0]);
      const width = Math.max(1, Math.abs((item.width || 0) * viewport.scale));
      const height = Math.max(1, Math.hypot(tx[2], tx[3]));

      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const baseX = tx[4];
      const baseY = tx[5];
      const upX = -sin * height;
      const upY = cos * height;

      const p0 = { x: baseX, y: baseY };
      const p1 = { x: baseX + cos * width, y: baseY + sin * width };
      const p2 = { x: p1.x - upX, y: p1.y - upY };
      const p3 = { x: baseX - upX, y: baseY - upY };

      const minX = Math.min(p0.x, p1.x, p2.x, p3.x);
      const minY = Math.min(p0.y, p1.y, p2.y, p3.y);
      const maxX = Math.max(p0.x, p1.x, p2.x, p3.x);
      const maxY = Math.max(p0.y, p1.y, p2.y, p3.y);

      boxes.push({
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY)
      });
    }

    page.cleanup();
    return boxes;
  }

  async renderPage(pageIndex, maxDimension) {
    if (!this.pdfDocument) {
      throw new Error("No PDF loaded.");
    }

    const page = await this.pdfDocument.getPage(pageIndex + 1);
    const sourceViewport = page.getViewport({ scale: 1 });
    const largestDimension = Math.max(sourceViewport.width, sourceViewport.height);
    const scale = Math.min(1, maxDimension / largestDimension);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });

    if (!context) {
      page.cleanup();
      throw new Error("Could not acquire 2D canvas context.");
    }

    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    await page.render({ canvasContext: context, viewport }).promise;

    return { page, canvas, context, viewport, sourceViewport };
  }

  dispose() {
    if (this.loadingTask) {
      this.loadingTask.destroy();
      this.loadingTask = null;
    }
    if (this.pdfDocument) {
      this.pdfDocument.destroy();
      this.pdfDocument = null;
    }
    this.pageCount = 0;
  }
}
