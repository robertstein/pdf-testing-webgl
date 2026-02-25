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

/**
 * @typedef {Object} DecorationStyle
 * @property {number} stemColor
 * @property {number} leafColor
 * @property {number[]} flowerPalette
 * @property {number[]} berryPalette
 * @property {number} stemWidth
 * @property {number} flowerCount
 * @property {number} berryCount
 */

/**
 * @typedef {Object} DecorationInstance
 * @property {string} id
 * @property {number} pageIndex
 * @property {number} createdAt
 * @property {import("three").Group} group
 * @property {{ minX: number, minY: number, maxX: number, maxY: number }} boundsWorld
 */

/**
 * @typedef {Object} DecorationSeed
 * @property {{ x: number, y: number }} startWorld
 * @property {{ x: number, y: number }} endWorld
 * @property {number} dragLength
 * @property {number} dragAngle
 * @property {number} rngSeed
 */

/**
 * @typedef {Object} PageContentMask
 * @property {number} pageIndex
 * @property {number} maskWidth
 * @property {number} maskHeight
 * @property {number} cellSizePx
 * @property {Uint8Array} occupied
 * @property {number} analysisScale
 */

/**
 * @typedef {Object} MaskBuildOptions
 * @property {number} analysisMaxDim
 * @property {number} textPaddingPx
 * @property {number} pixelLumaThreshold
 * @property {number} pixelEdgeThreshold
 * @property {number} dilationPx
 */

/**
 * @typedef {Object} RouteResult
 * @property {Array<{ x: number, y: number }>} pointsLocal
 * @property {"ok" | "no_route" | "too_short"} status
 */

export {};
