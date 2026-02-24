import { useEffect, useRef, useState } from "react";
import { computeGridLayout } from "./layout/gridLayout";
import { SceneManager } from "./gl/sceneManager";
import { TextureStreamManager } from "./gl/textureStreamManager";
import { computeDefaultMemoryPolicy } from "./gl/memoryManager";
import { KeyboardController } from "./input/keyboardController";
import { PdfDocumentController } from "./pdf/pdfController";

const INITIAL_CAMERA = {
  x: 0,
  y: 0,
  zoom: 1,
  initialZoom: 1,
  minZoom: 0.2,
  maxZoom: 6,
  panSpeed: 2.8,
  zoomStep: 1.1
};

export default function App() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const pdfControllerRef = useRef(null);
  const keyboardRef = useRef(null);
  const textureStreamRef = useRef(null);

  const [status, setStatus] = useState("Upload a PDF to start.");
  const [error, setError] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [memoryUsage, setMemoryUsage] = useState({ bytes: 0, count: 0, maxBytes: 0, maxCount: 0 });
  const [downscaleNotice, setDownscaleNotice] = useState(false);

  const cameraStateRef = useRef({ ...INITIAL_CAMERA });
  const pagesRef = useRef([]);
  const rafRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const renderRequestedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const sceneManager = new SceneManager(canvas);
    try {
      sceneManager.init();
    } catch (err) {
      setError("WebGL is unavailable in this browser/environment.");
      return undefined;
    }

    sceneRef.current = sceneManager;
    pdfControllerRef.current = new PdfDocumentController();

    const keyboardController = new KeyboardController(cameraStateRef.current, requestRenderLoop);
    keyboardController.attach();
    keyboardRef.current = keyboardController;

    const onResize = () => {
      sceneManager.onResize();
      requestRenderLoop();
    };

    window.addEventListener("resize", onResize);
    requestRenderLoop();

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      lastFrameTimeRef.current = 0;
      textureStreamRef.current?.dispose();
      keyboardController.detach();
      pdfControllerRef.current?.dispose();
      sceneManager.dispose();
    };
  }, []);

  function requestRenderLoop() {
    renderRequestedRef.current = true;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(loop);
    }
  }

  function loop(now) {
    if (!sceneRef.current) {
      rafRef.current = 0;
      return;
    }

    const last = lastFrameTimeRef.current || now;
    const delta = Math.min(0.05, (now - last) / 1000);
    lastFrameTimeRef.current = now;

    const keyboardActive = keyboardRef.current?.step(delta) || false;
    const cameraState = cameraStateRef.current;
    sceneRef.current.applyCameraState(cameraState);

    const pages = pagesRef.current;
    if (pages.length && textureStreamRef.current) {
      const { visible, bounds } = sceneRef.current.getVisiblePageIndices(pages, cameraState);
      textureStreamRef.current.updateVisibleSet(visible, bounds);
      setMemoryUsage(textureStreamRef.current.getUsage());
    }

    sceneRef.current.render();

    const hasPending = textureStreamRef.current?.hasPendingWork() || false;
    const shouldContinue = keyboardActive || hasPending || renderRequestedRef.current;
    renderRequestedRef.current = false;

    if (shouldContinue) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    rafRef.current = 0;
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setError("");
    setDownscaleNotice(false);

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a valid PDF file.");
      return;
    }

    const sceneManager = sceneRef.current;
    const pdfController = pdfControllerRef.current;
    if (!sceneManager || !pdfController) {
      setError("Viewer not ready.");
      return;
    }

    try {
      setStatus("Loading PDF...");
      setMemoryUsage({ bytes: 0, count: 0, maxBytes: 0, maxCount: 0 });
      textureStreamRef.current?.dispose();
      sceneManager.clearPages();

      await pdfController.loadFromFile(file);
      const pageMetadata = await pdfController.getPageMetadata();
      const layout = computeGridLayout(pageMetadata, canvasRef.current.clientWidth);

      pagesRef.current = layout.pages;
      setPageCount(layout.pages.length);
      sceneManager.setPages(layout.pages);

      const maxTextureSize = sceneManager.getMaxTextureSize();
      const textureMaxDimension = Math.max(256, Math.min(2048, maxTextureSize));

      textureStreamRef.current = new TextureStreamManager({
        pdfController,
        sceneManager,
        layout,
        memoryPolicy: computeDefaultMemoryPolicy(),
        textureMaxDimension,
        onDownscale: () => setDownscaleNotice(true),
        onError: (err) => setError(`Texture load error: ${String(err?.message || err)}`)
      });

      Object.assign(cameraStateRef.current, INITIAL_CAMERA);
      setStatus(`Loaded ${layout.pages.length} pages.`);
      requestRenderLoop();
    } catch (err) {
      textureStreamRef.current?.dispose();
      setError(String(err?.message || err));
      setStatus("Failed to load PDF.");
    }
  }

  return (
    <div className="app-shell">
      <aside className="panel">
        <h1>PDF WebGL Viewer</h1>

        <label className="upload">
          <span>Upload PDF</span>
          <input type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
        </label>

        <p className="status">{status}</p>
        {error ? <p className="error">{error}</p> : null}
        {downscaleNotice ? (
          <p className="notice">Some pages were downscaled to preserve performance and memory.</p>
        ) : null}

        <div className="stats">
          <p>Pages: {pageCount}</p>
          <p>
            Textures: {memoryUsage.count}/{memoryUsage.maxCount || "-"}
          </p>
          <p>
            GPU Est.: {(memoryUsage.bytes / (1024 * 1024)).toFixed(1)}MB /
            {" "}
            {memoryUsage.maxBytes ? (memoryUsage.maxBytes / (1024 * 1024)).toFixed(0) : "-"}MB
          </p>
        </div>

        <div className="help">
          <p>Controls</p>
          <p>`+` / `-`: zoom in/out</p>
          <p>Arrow keys: pan</p>
          <p>Space: reset camera</p>
        </div>
      </aside>

      <main className="canvas-wrap">
        <canvas ref={canvasRef} className="viewer-canvas" />
      </main>
    </div>
  );
}
