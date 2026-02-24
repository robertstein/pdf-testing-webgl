export class KeyboardController {
  constructor(cameraState, onChange) {
    this.cameraState = cameraState;
    this.onChange = onChange;
    this.pressed = new Set();

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  attach() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.pressed.clear();
  }

  onKeyDown(event) {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Spacebar", "+", "=", "-", "_", "Add", "Subtract"].includes(event.key)) {
      event.preventDefault();
    }

    if (event.key === " " || event.key === "Spacebar") {
      this.cameraState.x = 0;
      this.cameraState.y = 0;
      this.cameraState.zoom = this.cameraState.initialZoom;
      this.onChange();
      return;
    }

    this.pressed.add(event.key);
    this.onChange();
  }

  onKeyUp(event) {
    this.pressed.delete(event.key);
  }

  isActive() {
    return this.pressed.size > 0;
  }

  step(deltaSeconds) {
    if (!this.pressed.size) {
      return false;
    }

    let changed = false;
    const move = (this.cameraState.panSpeed * deltaSeconds) / this.cameraState.zoom;

    if (this.pressed.has("ArrowUp")) {
      this.cameraState.y += move;
      changed = true;
    }
    if (this.pressed.has("ArrowDown")) {
      this.cameraState.y -= move;
      changed = true;
    }
    if (this.pressed.has("ArrowLeft")) {
      this.cameraState.x -= move;
      changed = true;
    }
    if (this.pressed.has("ArrowRight")) {
      this.cameraState.x += move;
      changed = true;
    }

    if (this.pressed.has("+") || this.pressed.has("=") || this.pressed.has("Add")) {
      this.cameraState.zoom = Math.min(
        this.cameraState.maxZoom,
        this.cameraState.zoom * Math.pow(this.cameraState.zoomStep, deltaSeconds * 60)
      );
      changed = true;
    }

    if (this.pressed.has("-") || this.pressed.has("_") || this.pressed.has("Subtract")) {
      this.cameraState.zoom = Math.max(
        this.cameraState.minZoom,
        this.cameraState.zoom / Math.pow(this.cameraState.zoomStep, deltaSeconds * 60)
      );
      changed = true;
    }

    return changed;
  }
}
