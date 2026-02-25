const MIN_DRAW_DRAG_PX = 8;

export class GestureController {
  constructor({
    canvas,
    sceneManager,
    cameraState,
    onChange,
    onDrawGesture,
    onUndoLastDecoration
  }) {
    this.canvas = canvas;
    this.sceneManager = sceneManager;
    this.cameraState = cameraState;
    this.onChange = onChange;
    this.onDrawGesture = onDrawGesture;
    this.onUndoLastDecoration = onUndoLastDecoration;

    this.panDragging = false;
    this.panPointerId = null;
    this.lastX = 0;
    this.lastY = 0;

    this.drawDragging = false;
    this.drawPointerId = null;
    this.drawStartX = 0;
    this.drawStartY = 0;

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
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  attach() {
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("dblclick", this.onDoubleClick);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
  }

  detach() {
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("dblclick", this.onDoubleClick);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);

    this.panDragging = false;
    this.panPointerId = null;
    this.drawDragging = false;
    this.drawPointerId = null;
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
    if (event.button === 2) {
      event.preventDefault();
      this.panDragging = true;
      this.panPointerId = event.pointerId;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.canvas.setPointerCapture?.(event.pointerId);
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const startHit = this.sceneManager.pickPageAtClient(event.clientX, event.clientY, this.cameraState);
    if (!startHit) {
      return;
    }

    event.preventDefault();
    this.drawDragging = true;
    this.drawPointerId = event.pointerId;
    this.drawStartX = event.clientX;
    this.drawStartY = event.clientY;
    this.canvas.setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event) {
    if (this.panDragging && event.pointerId === this.panPointerId) {
      const deltaX = event.clientX - this.lastX;
      const deltaY = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.sceneManager.panCameraByScreenDelta(this.cameraState, -deltaX, -deltaY);
      this.onChange();
    }
  }

  onPointerUp(event) {
    if (this.panDragging && event.pointerId === this.panPointerId) {
      this.panDragging = false;
      this.panPointerId = null;
      this.canvas.releasePointerCapture?.(event.pointerId);
      return;
    }

    if (!this.drawDragging || event.pointerId !== this.drawPointerId) {
      return;
    }

    this.drawDragging = false;
    this.drawPointerId = null;
    this.canvas.releasePointerCapture?.(event.pointerId);

    const dragDistance = Math.hypot(event.clientX - this.drawStartX, event.clientY - this.drawStartY);
    if (dragDistance < MIN_DRAW_DRAG_PX) {
      return;
    }

    const maybePromise = this.onDrawGesture?.({
      startClient: { x: this.drawStartX, y: this.drawStartY },
      endClient: { x: event.clientX, y: event.clientY }
    });
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => {});
    }
  }

  onDoubleClick(event) {
    event.preventDefault();
    this.cameraState.x = 0;
    this.cameraState.y = 0;
    this.cameraState.zoom = this.cameraState.initialZoom;
    this.zoomVelocity = 0;
    this.onChange();
  }

  onContextMenu(event) {
    event.preventDefault();
  }

  onKeyDown(event) {
    if (event.key !== "Backspace") {
      return;
    }

    const target = event.target;
    const tagName = target?.tagName?.toLowerCase();
    const isEditable =
      target?.isContentEditable ||
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select";

    if (isEditable) {
      return;
    }

    const removed = this.onUndoLastDecoration?.();
    if (removed) {
      event.preventDefault();
      this.onChange();
    }
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
