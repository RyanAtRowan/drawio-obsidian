/**
 * Adds pan (middle-click drag) and zoom (scroll wheel) to a read-only,
 * inlined SVG diagram, similar to how drawio's own canvas and Obsidian's
 * canvas both behave. Panning is bounded so the diagram can't be scrolled
 * completely out of view - there's no infinite empty space to get lost in.
 */
export class DiagramPanZoom {
  private static readonly MIN_SCALE = 0.05;
  private static readonly MAX_SCALE = 8;
  // Minimum number of pixels of the diagram that must stay visible on
  // each axis, so panning can't lose the diagram entirely off-screen.
  private static readonly MIN_VISIBLE_PX = 60;

  private scale = 1;
  private translateX = 0;
  private translateY = 0;
  private naturalWidth = 1;
  private naturalHeight = 1;
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panStartTranslateX = 0;
  private panStartTranslateY = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly target: SVGSVGElement
  ) {
    this.setup();
  }

  private setup() {
    const { width, height } = this.getNaturalSize();
    this.naturalWidth = width;
    this.naturalHeight = height;

    this.container.style.overflow = "hidden";
    this.container.style.position = "relative";
    this.container.style.background = "#ffffff";

    this.target.style.position = "absolute";
    this.target.style.left = "0";
    this.target.style.top = "0";
    // Overrides the .diagram-view svg { max-width: 100% } rule, which
    // would otherwise fight with our own explicit sizing/scaling below.
    this.target.style.maxWidth = "none";
    this.target.style.maxHeight = "none";
    this.target.style.width = `${width}px`;
    this.target.style.height = `${height}px`;
    this.target.style.transformOrigin = "0 0";

    // Start fitted to the container and centered, matching how the
    // diagram used to auto-scale before pan/zoom was interactive.
    const rect = this.container.getBoundingClientRect();
    const fitScale = Math.min(rect.width / width, rect.height / height);
    this.scale = isFinite(fitScale) && fitScale > 0 ? Math.min(fitScale, 1) : 1;
    this.translateX = (rect.width - width * this.scale) / 2;
    this.translateY = (rect.height - height * this.scale) / 2;
    this.applyTransform();

    this.container.addEventListener("wheel", this.onWheel, {
      passive: false,
    });
    this.container.addEventListener("mousedown", this.onMouseDown);
  }

  private getNaturalSize(): { width: number; height: number } {
    const viewBox = this.target.getAttribute("viewBox");
    if (viewBox) {
      const parts = viewBox.trim().split(/\s+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        return { width: parts[2], height: parts[3] };
      }
    }

    const widthAttr = parseFloat(this.target.getAttribute("width") || "");
    const heightAttr = parseFloat(this.target.getAttribute("height") || "");
    if (widthAttr > 0 && heightAttr > 0) {
      return { width: widthAttr, height: heightAttr };
    }

    try {
      const bbox = this.target.getBBox();
      return { width: bbox.width || 1, height: bbox.height || 1 };
    } catch (err) {
      return { width: 1, height: 1 };
    }
  }

  private applyTransform() {
    this.target.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
  }

  private clampValue(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  // Keeps at least MIN_VISIBLE_PX of the diagram within the container on
  // each axis, whatever the current scale/translate is.
  private clamp() {
    const rect = this.container.getBoundingClientRect();
    const contentWidth = this.naturalWidth * this.scale;
    const contentHeight = this.naturalHeight * this.scale;
    const margin = DiagramPanZoom.MIN_VISIBLE_PX;

    const minX = margin - contentWidth;
    const maxX = rect.width - margin;
    const minY = margin - contentHeight;
    const maxY = rect.height - margin;

    this.translateX = this.clampValue(
      this.translateX,
      Math.min(minX, maxX),
      Math.max(minX, maxX)
    );
    this.translateY = this.clampValue(
      this.translateY,
      Math.min(minY, maxY),
      Math.max(minY, maxY)
    );
  }

  private onWheel = (evt: WheelEvent) => {
    evt.preventDefault();
    const rect = this.container.getBoundingClientRect();
    const mouseX = evt.clientX - rect.left;
    const mouseY = evt.clientY - rect.top;

    const zoomFactor = Math.pow(1.0015, -evt.deltaY);
    const newScale = this.clampValue(
      this.scale * zoomFactor,
      DiagramPanZoom.MIN_SCALE,
      DiagramPanZoom.MAX_SCALE
    );

    // Keep the point under the cursor fixed in place while zooming.
    const contentX = (mouseX - this.translateX) / this.scale;
    const contentY = (mouseY - this.translateY) / this.scale;
    this.translateX = mouseX - contentX * newScale;
    this.translateY = mouseY - contentY * newScale;
    this.scale = newScale;

    this.clamp();
    this.applyTransform();
  };

  private onMouseDown = (evt: MouseEvent) => {
    // Middle-click drag to pan, consistent with Obsidian's canvas.
    if (evt.button !== 1) {
      return;
    }
    evt.preventDefault();
    this.isPanning = true;
    this.panStartX = evt.clientX;
    this.panStartY = evt.clientY;
    this.panStartTranslateX = this.translateX;
    this.panStartTranslateY = this.translateY;
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseup", this.onMouseUp);
  };

  private onMouseMove = (evt: MouseEvent) => {
    if (!this.isPanning) {
      return;
    }
    this.translateX = this.panStartTranslateX + (evt.clientX - this.panStartX);
    this.translateY = this.panStartTranslateY + (evt.clientY - this.panStartY);
    this.clamp();
    this.applyTransform();
  };

  private onMouseUp = () => {
    this.isPanning = false;
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
  };

  destroy() {
    this.container.removeEventListener("wheel", this.onWheel);
    this.container.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
  }
}
