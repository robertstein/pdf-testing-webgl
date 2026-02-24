import * as THREE from "three";

const PLACEHOLDER_COLOR = 0x334155;

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.pageMeshes = new Map();

    this.baseHalfHeight = 2.2;
    this.baseHalfWidth = 2.2;
  }

  init() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    this.renderer.setClearColor(0x0b1322, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(ambient);

    this.onResize();
  }

  getMaxTextureSize() {
    const gl = this.renderer.getContext();
    return gl.getParameter(gl.MAX_TEXTURE_SIZE);
  }

  onResize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);

    const aspect = width / height;
    this.baseHalfWidth = this.baseHalfHeight * aspect;

    this.camera.left = -this.baseHalfWidth;
    this.camera.right = this.baseHalfWidth;
    this.camera.top = this.baseHalfHeight;
    this.camera.bottom = -this.baseHalfHeight;
    this.camera.updateProjectionMatrix();
  }

  setPages(pages) {
    this.clearPages();
    for (const page of pages) {
      const geometry = new THREE.PlaneGeometry(page.worldWidth, page.worldHeight);
      const material = new THREE.MeshBasicMaterial({ color: PLACEHOLDER_COLOR });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(page.worldX, page.worldY, 0);
      this.scene.add(mesh);
      this.pageMeshes.set(page.pageIndex, mesh);
    }
  }

  clearPages() {
    for (const mesh of this.pageMeshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material.map) {
        mesh.material.map.dispose();
      }
      mesh.material.dispose();
    }
    this.pageMeshes.clear();
  }

  setTexture(pageIndex, texture) {
    const mesh = this.pageMeshes.get(pageIndex);
    if (!mesh) {
      return;
    }

    if (mesh.material.map) {
      mesh.material.map.dispose();
    }

    mesh.material.color.setHex(0xffffff);
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
  }

  clearTexture(pageIndex) {
    const mesh = this.pageMeshes.get(pageIndex);
    if (!mesh) {
      return;
    }

    if (mesh.material.map) {
      mesh.material.map.dispose();
      mesh.material.map = null;
    }
    mesh.material.color.setHex(PLACEHOLDER_COLOR);
    mesh.material.needsUpdate = true;
  }

  applyCameraState(cameraState) {
    this.camera.position.x = cameraState.x;
    this.camera.position.y = cameraState.y;
    this.camera.zoom = cameraState.zoom;
    this.camera.updateProjectionMatrix();
  }

  getWorldBounds(cameraState) {
    const halfWidth = this.baseHalfWidth / cameraState.zoom;
    const halfHeight = this.baseHalfHeight / cameraState.zoom;
    return {
      minX: cameraState.x - halfWidth,
      maxX: cameraState.x + halfWidth,
      minY: cameraState.y - halfHeight,
      maxY: cameraState.y + halfHeight,
      centerX: cameraState.x,
      centerY: cameraState.y
    };
  }

  getVisiblePageIndices(layoutPages, cameraState) {
    const bounds = this.getWorldBounds(cameraState);
    const visible = new Set();

    for (const page of layoutPages) {
      const minX = page.worldX - page.worldWidth / 2;
      const maxX = page.worldX + page.worldWidth / 2;
      const minY = page.worldY - page.worldHeight / 2;
      const maxY = page.worldY + page.worldHeight / 2;

      if (maxX < bounds.minX || minX > bounds.maxX || maxY < bounds.minY || minY > bounds.maxY) {
        continue;
      }
      visible.add(page.pageIndex);
    }

    return { visible, bounds };
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.clearPages();
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
