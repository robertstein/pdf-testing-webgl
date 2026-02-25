import * as THREE from "three";
import { isLocalPointInWhitespace, routeVineThroughWhitespace } from "./vineRouter";

const DEFAULT_STYLE = {
  stemColor: 0x2f7d44,
  leafColor: 0x5ea33e,
  flowerPalette: [0xd94f70, 0xf5c76b, 0x4b7fc9, 0xf2e9c9],
  berryPalette: [0x9f1f3a, 0x73213a, 0xb83b5e],
  stemWidth: 0.012,
  flowerCount: 6,
  berryCount: 10
};

export class DecorationLayer {
  constructor(sceneManager, options = {}) {
    this.sceneManager = sceneManager;
    this.style = { ...DEFAULT_STYLE, ...(options.style || {}) };
    this.maxDecorations = options.maxDecorations || 300;
    this.whitespaceMaskCache = options.whitespaceMaskCache || null;
    this.globalStack = [];
    this.decorationsByPage = new Map();
    this.nextId = 1;
  }

  async addFromDrag({ pageIndex, startWorld, endWorld }) {
    const pageMesh = this.sceneManager.getPageMesh(pageIndex);
    const pageLayout = this.sceneManager.getPageLayout(pageIndex);
    if (!pageMesh || !pageLayout || !this.whitespaceMaskCache) {
      return { status: "no_route" };
    }

    const startLocal = this.sceneManager.worldToPageLocal(pageIndex, startWorld);
    const endLocal = this.sceneManager.worldToPageLocal(pageIndex, endWorld);

    const roughDragLength = Math.hypot(endLocal.x - startLocal.x, endLocal.y - startLocal.y);
    if (roughDragLength < 0.03) {
      return { status: "too_short" };
    }

    const mask = await this.whitespaceMaskCache.getOrBuildMask(pageIndex);
    const route = routeVineThroughWhitespace({
      mask,
      pageWidth: pageLayout.worldWidth,
      pageHeight: pageLayout.worldHeight,
      startLocal,
      endLocal,
      minLength: 0.03,
      snapRadiusCells: 14
    });

    if (route.status !== "ok" || route.pointsLocal.length < 2) {
      return { status: route.status };
    }

    const rngSeed = hashSeed(pageIndex, startLocal, endLocal);
    const rng = mulberry32(rngSeed);

    const splinePoints = route.pointsLocal.map((point) => new THREE.Vector3(point.x, point.y, 0));
    const group = new THREE.Group();
    group.position.set(0, 0, 0.002);

    const stemCurve = new THREE.CatmullRomCurve3(splinePoints, false, "catmullrom", 0.5);
    const routedLength = polylineLength(route.pointsLocal);
    const stemSegments = Math.min(110, Math.max(24, Math.floor(routedLength * 90)));
    const stemRadius = this.style.stemWidth * (0.8 + rng() * 0.45);
    const stemGeometry = new THREE.TubeGeometry(stemCurve, stemSegments, stemRadius, 6, false);
    const stemMaterial = new THREE.MeshBasicMaterial({ color: this.style.stemColor });
    const stemMesh = new THREE.Mesh(stemGeometry, stemMaterial);
    group.add(stemMesh);

    addLeaves(group, stemCurve, this.style, rng, {
      mask,
      pageWidth: pageLayout.worldWidth,
      pageHeight: pageLayout.worldHeight
    }, Math.max(5, Math.floor(routedLength * 10)));

    addFlowers(group, stemCurve, this.style, rng, {
      mask,
      pageWidth: pageLayout.worldWidth,
      pageHeight: pageLayout.worldHeight
    });

    addBerries(group, stemCurve, this.style, rng, {
      mask,
      pageWidth: pageLayout.worldWidth,
      pageHeight: pageLayout.worldHeight
    });

    const decoration = {
      id: `decor-${this.nextId++}`,
      pageIndex,
      createdAt: Date.now(),
      group,
      boundsWorld: computeWorldBoundsFromPoints(splinePoints, pageMesh.position)
    };

    if (!this.decorationsByPage.has(pageIndex)) {
      this.decorationsByPage.set(pageIndex, []);
    }

    pageMesh.add(group);
    this.decorationsByPage.get(pageIndex).push(decoration);
    this.globalStack.push(decoration);

    while (this.globalStack.length > this.maxDecorations) {
      this.removeOldest();
    }

    return { status: "created", decoration };
  }

  removeLast() {
    const last = this.globalStack.pop();
    if (!last) {
      return false;
    }

    this.removeDecoration(last);
    return true;
  }

  clearAll() {
    const stackCopy = [...this.globalStack];
    this.globalStack.length = 0;
    for (const decoration of stackCopy) {
      this.removeDecoration(decoration);
    }
    this.decorationsByPage.clear();
  }

  dispose() {
    this.clearAll();
  }

  removeOldest() {
    const oldest = this.globalStack.shift();
    if (!oldest) {
      return;
    }
    this.removeDecoration(oldest);
  }

  removeDecoration(decoration) {
    const pageList = this.decorationsByPage.get(decoration.pageIndex);
    if (pageList) {
      const index = pageList.findIndex((item) => item.id === decoration.id);
      if (index >= 0) {
        pageList.splice(index, 1);
      }
      if (!pageList.length) {
        this.decorationsByPage.delete(decoration.pageIndex);
      }
    }

    if (decoration.group.parent) {
      decoration.group.parent.remove(decoration.group);
    }

    disposeObject3D(decoration.group);
  }
}

function addLeaves(group, curve, style, rng, pageMaskContext, count) {
  for (let i = 0; i < count; i += 1) {
    const t = (i + 1) / (count + 1);
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
    const side = rng() > 0.5 ? 1 : -1;
    const offset = 0.025 + rng() * 0.04;

    const leafCenter = {
      x: point.x + normal.x * side * offset,
      y: point.y + normal.y * side * offset
    };

    const padPx = worldRadiusToPixels(pageMaskContext, 0.02);
    if (!isLocalPointInWhitespace(
      pageMaskContext.mask,
      pageMaskContext.pageWidth,
      pageMaskContext.pageHeight,
      leafCenter,
      padPx
    )) {
      continue;
    }

    const leaf = new THREE.Mesh(
      new THREE.CircleGeometry(0.012 + rng() * 0.016, 8),
      new THREE.MeshBasicMaterial({ color: style.leafColor })
    );

    leaf.position.set(leafCenter.x, leafCenter.y, 0.003 + rng() * 0.002);
    leaf.scale.set(1.4, 0.8, 1);
    leaf.rotation.z = Math.atan2(tangent.y, tangent.x) + side * (0.5 + rng() * 0.5);
    group.add(leaf);
  }
}

function addFlowers(group, curve, style, rng, pageMaskContext) {
  for (let i = 0; i < style.flowerCount; i += 1) {
    const t = 0.1 + rng() * 0.8;
    const point = curve.getPointAt(t);
    const petalRadius = 0.01 + rng() * 0.012;

    const padPx = worldRadiusToPixels(pageMaskContext, petalRadius * 1.8);
    if (!isLocalPointInWhitespace(
      pageMaskContext.mask,
      pageMaskContext.pageWidth,
      pageMaskContext.pageHeight,
      { x: point.x, y: point.y },
      padPx
    )) {
      continue;
    }

    const flowerGroup = new THREE.Group();
    flowerGroup.position.set(point.x, point.y, 0.005 + rng() * 0.003);

    const petalColor = pick(style.flowerPalette, rng);
    const centerColor = 0x4e2d1f;

    for (let p = 0; p < 5; p += 1) {
      const petal = new THREE.Mesh(
        new THREE.CircleGeometry(petalRadius, 10),
        new THREE.MeshBasicMaterial({ color: petalColor })
      );
      const angle = (Math.PI * 2 * p) / 5;
      petal.position.set(Math.cos(angle) * petalRadius * 0.85, Math.sin(angle) * petalRadius * 0.85, 0);
      petal.scale.set(1.2, 0.8, 1);
      flowerGroup.add(petal);
    }

    const center = new THREE.Mesh(
      new THREE.CircleGeometry(petalRadius * 0.45, 10),
      new THREE.MeshBasicMaterial({ color: centerColor })
    );
    center.position.z = 0.001;
    flowerGroup.add(center);

    flowerGroup.rotation.z = rng() * Math.PI * 2;
    group.add(flowerGroup);
  }
}

function addBerries(group, curve, style, rng, pageMaskContext) {
  for (let i = 0; i < style.berryCount; i += 1) {
    const t = 0.05 + rng() * 0.9;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
    const berriesInCluster = 1 + Math.floor(rng() * 3);
    const clusterOffset = (0.015 + rng() * 0.028) * (rng() > 0.5 ? 1 : -1);

    for (let b = 0; b < berriesInCluster; b += 1) {
      const jitter = (b - (berriesInCluster - 1) / 2) * 0.012;
      const berryRadius = 0.006 + rng() * 0.006;
      const candidate = {
        x: point.x + normal.x * clusterOffset + tangent.x * jitter,
        y: point.y + normal.y * clusterOffset + tangent.y * jitter
      };

      const padPx = worldRadiusToPixels(pageMaskContext, berryRadius * 1.6);
      if (!isLocalPointInWhitespace(
        pageMaskContext.mask,
        pageMaskContext.pageWidth,
        pageMaskContext.pageHeight,
        candidate,
        padPx
      )) {
        continue;
      }

      const berry = new THREE.Mesh(
        new THREE.CircleGeometry(berryRadius, 8),
        new THREE.MeshBasicMaterial({ color: pick(style.berryPalette, rng) })
      );

      berry.position.set(candidate.x, candidate.y, 0.004 + rng() * 0.002);
      group.add(berry);
    }
  }
}

function worldRadiusToPixels(pageMaskContext, worldRadius) {
  const maskPixelWidth = pageMaskContext.mask.maskWidth * pageMaskContext.mask.cellSizePx;
  const maskPixelHeight = pageMaskContext.mask.maskHeight * pageMaskContext.mask.cellSizePx;
  const pxPerWorldX = maskPixelWidth / Math.max(0.0001, pageMaskContext.pageWidth);
  const pxPerWorldY = maskPixelHeight / Math.max(0.0001, pageMaskContext.pageHeight);
  return Math.max(1, Math.round(worldRadius * ((pxPerWorldX + pxPerWorldY) / 2)));
}

function computeWorldBoundsFromPoints(localPoints, pagePosition) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of localPoints) {
    const x = point.x + pagePosition.x;
    const y = point.y + pagePosition.y;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { minX, minY, maxX, maxY };
}

function disposeObject3D(object) {
  object.traverse((node) => {
    if (node.geometry) {
      node.geometry.dispose();
    }
    if (node.material) {
      if (Array.isArray(node.material)) {
        for (const mat of node.material) {
          mat.dispose();
        }
      } else {
        node.material.dispose();
      }
    }
  });
}

function hashSeed(pageIndex, start, end) {
  let hash = 2166136261 >>> 0;
  hash = fnv1a(hash, pageIndex);
  hash = fnv1a(hash, Math.round(start.x * 1000));
  hash = fnv1a(hash, Math.round(start.y * 1000));
  hash = fnv1a(hash, Math.round(end.x * 1000));
  hash = fnv1a(hash, Math.round(end.y * 1000));
  return hash >>> 0;
}

function fnv1a(hash, value) {
  hash ^= value >>> 0;
  hash = Math.imul(hash, 16777619);
  return hash >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}
