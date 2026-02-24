export class GestureController {
  constructor({ canvas, sceneManager, cameraState, onChange }) {
    this.canvas = canvas;
    this.sceneManager = sceneManager;
    this.cameraState = cameraState;
    this.onChange = onChange;

    this.dragging = false;
    this.dragPointerId = null;
    this.lastX = 0;
    this.lastY = 0;
    this.zoomAnchorX = 0;
    this.zoomAnchorY = 0;
    this.zoomVelocity = 0;
    this.zoomSensitivity = 0.0028;
    this.zoomDamping = 10;
    this.maxZoomVelocity = 7;

    this.onWheel = this.onWheel.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onDoubleClick = this.onDoubleClick.bind(this);
  }

  attach() {
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("dblclick", this.onDoubleClick);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  detach() {
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("dblclick", this.onDoubleClick);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);

    this.dragging = false;
    this.dragPointerId = null;
  }

  onWheel(event) {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      const wheelDelta = normalizeWheelDelta(event);
      const logImpulse = -wheelDelta * this.zoomSensitivity;
      this.zoomAnchorX = event.clientX;
      this.zoomAnchorY = event.clientY;
      this.applyZoomLogDelta(logImpulse);
      this.zoomVelocity = clamp(
        this.zoomVelocity + logImpulse * 14,
        -this.maxZoomVelocity,
        this.maxZoomVelocity
      );
      this.onChange();
      return;
    }

    this.sceneManager.panCameraByScreenDelta(this.cameraState, event.deltaX, event.deltaY);
    this.onChange();
  }

  onPointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    this.dragging = true;
    this.dragPointerId = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.canvas.setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event) {
    if (!this.dragging || event.pointerId !== this.dragPointerId) {
      return;
    }

    const deltaX = event.clientX - this.lastX;
    const deltaY = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;

    this.sceneManager.panCameraByScreenDelta(this.cameraState, -deltaX, -deltaY);
    this.onChange();
  }

  onPointerUp(event) {
    if (!this.dragging || event.pointerId !== this.dragPointerId) {
      return;
    }

    this.dragging = false;
    this.dragPointerId = null;
    this.canvas.releasePointerCapture?.(event.pointerId);
  }

  onDoubleClick(event) {
    event.preventDefault();
    this.cameraState.x = 0;
    this.cameraState.y = 0;
    this.cameraState.zoom = this.cameraState.initialZoom;
    this.zoomVelocity = 0;
    this.onChange();
  }

  step(deltaSeconds) {
    if (Math.abs(this.zoomVelocity) < 0.001) {
      this.zoomVelocity = 0;
      return false;
    }

    const changed = this.applyZoomLogDelta(this.zoomVelocity * deltaSeconds);
    this.zoomVelocity *= Math.exp(-this.zoomDamping * deltaSeconds);
    if (Math.abs(this.zoomVelocity) < 0.001) {
      this.zoomVelocity = 0;
    }
    return changed;
  }

  applyZoomLogDelta(logDelta) {
    if (!logDelta) {
      return false;
    }

    const before = this.sceneManager.screenToWorld(this.zoomAnchorX, this.zoomAnchorY, this.cameraState);
    const nextZoom = clamp(
      this.cameraState.zoom * Math.exp(logDelta),
      this.cameraState.minZoom,
      this.cameraState.maxZoom
    );

    if (nextZoom === this.cameraState.zoom) {
      return false;
    }

    this.cameraState.zoom = nextZoom;
    const after = this.sceneManager.screenToWorld(this.zoomAnchorX, this.zoomAnchorY, this.cameraState);
    this.cameraState.x += before.x - after.x;
    this.cameraState.y += before.y - after.y;
    return true;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeWheelDelta(event) {
  if (event.deltaMode === 1) {
    return event.deltaY * 16;
  }
  if (event.deltaMode === 2) {
    return event.deltaY * window.innerHeight;
  }
  return event.deltaY;
}
