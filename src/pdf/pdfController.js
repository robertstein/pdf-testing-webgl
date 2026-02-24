import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
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
    if (!this.pdfDocument) {
      throw new Error("No PDF loaded.");
    }

    const page = await this.pdfDocument.getPage(pageIndex + 1);
    const sourceViewport = page.getViewport({ scale: 1 });
    const largestDimension = Math.max(sourceViewport.width, sourceViewport.height);
    const scale = Math.min(1, maxDimension / largestDimension);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: false });

    if (!context) {
      throw new Error("Could not acquire 2D canvas context.");
    }

    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    await page.render({ canvasContext: context, viewport }).promise;
    page.cleanup();

    const downscaled = scale < 1;
    let imageSource = canvas;

    if (typeof createImageBitmap === "function") {
      try {
        imageSource = await createImageBitmap(canvas, { imageOrientation: "flipY" });
      } catch {
        imageSource = canvas;
      }
    }

    return {
      imageSource,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      bytesEstimate: canvas.width * canvas.height * 4,
      downscaled
    };
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
