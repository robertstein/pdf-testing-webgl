/**
 * @typedef {Object} PDFPageMeta
 * @property {number} pageIndex
 * @property {number} pdfWidth
 * @property {number} pdfHeight
 * @property {number} aspect
 * @property {number} worldWidth
 * @property {number} worldHeight
 * @property {number} worldX
 * @property {number} worldY
 * @property {number} row
 * @property {number} col
 */

/**
 * @typedef {Object} TextureEntry
 * @property {number} pageIndex
 * @property {import("three").Texture | null} texture
 * @property {"unloaded" | "loading" | "ready" | "evicted" | "error"} state
 * @property {number} pixelWidth
 * @property {number} pixelHeight
 * @property {number} bytesEstimate
 * @property {number} lastUsedTs
 */

/**
 * @typedef {Object} MemoryPolicy
 * @property {number} maxTextureBytes
 * @property {number} maxTextures
 * @property {number} oversubscriptionRatio
 */

/**
 * @typedef {Object} CameraState
 * @property {number} x
 * @property {number} y
 * @property {number} zoom
 * @property {number} minZoom
 * @property {number} maxZoom
 * @property {number} panSpeed
 * @property {number} zoomStep
 */

export {};
