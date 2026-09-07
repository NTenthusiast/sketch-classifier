<template>
  <section class="draw-card" aria-labelledby="drawing-title">
    <div class="card-heading">
      <div>
        <span class="eyebrow">01 · Your input</span>
        <h2 id="drawing-title" class="draw-prompt">Try a <strong>{{ prompt }}</strong></h2>
      </div>
      <span class="live-pill" :class="{ ready: modelReady }">
        <span class="status-dot" aria-hidden="true"></span>
        {{ modelReady ? "Model ready" : "Loading model" }}
      </span>
    </div>

    <div class="canvas-frame" :class="{ drawing: isDrawing }">
      <canvas
        ref="canvas"
        width="800"
        height="800"
        aria-label="Drawing canvas. Use a pointer or touch to draw a doodle."
        @pointerdown="startStroke"
        @pointermove="continueStroke"
        @pointerup="finishStroke"
        @pointercancel="finishStroke"
        @pointerleave="finishStroke"
      >
        Your browser does not support the drawing canvas.
      </canvas>
      <div v-if="!hasDrawing" class="canvas-hint" aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <path d="M9 35c8-17 13-24 20-21 8 3-2 14 3 17 3 2 6-1 8-4" />
          <path d="m8 35 7-1-5-5-2 6Z" />
        </svg>
        <span>Start sketching here</span>
      </div>
    </div>

    <div class="draw-footer">
      <p>
        <button class="text-button" type="button" @click="$emit('shuffle')">
          New prompt
        </button>
      </p>
      <div class="canvas-actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="!canUndo"
          @click="undo"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7 6 3.5 9.5 7 13M4 9.5h7a5 5 0 0 1 5 5" />
          </svg>
          Undo
        </button>
        <button
          class="secondary-button"
          type="button"
          :disabled="!hasDrawing"
          @click="clear"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 6h10M8 3.5h4M6.5 6l.7 10h5.6l.7-10" />
          </svg>
          Clear
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";

const props = defineProps({
  prompt: { type: String, required: true },
  modelReady: { type: Boolean, default: false },
});

const emit = defineEmits(["predict", "cleared", "shuffle"]);

const MODEL_SIZE = 28;
const MODEL_MARGIN = 1;
const DRAWING_RED_CHANNEL = 0x17;

const canvas = ref(null);
const hasDrawing = ref(false);
const isDrawing = ref(false);
const strokeCount = ref(0);
const canUndo = computed(() => strokeCount.value > 0);

const strokes = [];
let context = null;
let activeStroke = null;
let predictionTimer = null;
const modelCanvas = document.createElement("canvas");
modelCanvas.width = MODEL_SIZE;
modelCanvas.height = MODEL_SIZE;
const modelContext = modelCanvas.getContext("2d", { willReadFrequently: true });

onMounted(() => {
  context = canvas.value.getContext("2d", { willReadFrequently: true });
  configureContext();
  paintBackground();
});

watch(
  () => props.modelReady,
  (ready) => {
    if (ready && hasDrawing.value) emitPrediction();
  },
);

function configureContext() {
  context.lineWidth = 25;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#171612";
  context.fillStyle = "#171612";
}

function paintBackground() {
  context.save();
  context.fillStyle = "#fffef9";
  context.fillRect(0, 0, canvas.value.width, canvas.value.height);
  context.restore();
}

function pointFromEvent(event) {
  const bounds = canvas.value.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * (canvas.value.width / bounds.width),
    y: (event.clientY - bounds.top) * (canvas.value.height / bounds.height),
  };
}

function startStroke(event) {
  if (event.button !== undefined && event.button !== 0) return;

  event.preventDefault();
  canvas.value.setPointerCapture?.(event.pointerId);
  isDrawing.value = true;
  const point = pointFromEvent(event);
  activeStroke = [point];
  strokes.push(activeStroke);
  strokeCount.value = strokes.length;
  hasDrawing.value = true;

  context.beginPath();
  context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2);
  context.fill();
  schedulePrediction();
}

function continueStroke(event) {
  if (!isDrawing.value || !activeStroke) return;

  event.preventDefault();
  const point = pointFromEvent(event);
  const previous = activeStroke[activeStroke.length - 1];
  activeStroke.push(point);

  context.beginPath();
  context.moveTo(previous.x, previous.y);
  context.lineTo(point.x, point.y);
  context.stroke();
  schedulePrediction();
}

function finishStroke(event) {
  if (!isDrawing.value) return;
  event?.preventDefault();
  isDrawing.value = false;
  activeStroke = null;
  window.clearTimeout(predictionTimer);
  emitPrediction();
}

function schedulePrediction() {
  window.clearTimeout(predictionTimer);
  predictionTimer = window.setTimeout(emitPrediction, 90);
}

function redraw() {
  paintBackground();
  configureContext();

  for (const stroke of strokes) {
    if (!stroke.length) continue;
    context.beginPath();
    context.arc(stroke[0].x, stroke[0].y, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();

    if (stroke.length > 1) {
      context.beginPath();
      context.moveTo(stroke[0].x, stroke[0].y);
      for (const point of stroke.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
    }
  }
}

function undo() {
  if (!strokes.length) return;
  strokes.pop();
  strokeCount.value = strokes.length;
  hasDrawing.value = strokes.length > 0;
  redraw();
  hasDrawing.value ? emitPrediction() : emit("cleared");
}

function clear() {
  strokes.length = 0;
  activeStroke = null;
  strokeCount.value = 0;
  hasDrawing.value = false;
  paintBackground();
  emit("cleared");
}

function getDrawingBounds() {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    for (const point of stroke) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (!Number.isFinite(minX)) return null;

  // Include the full round stroke plus a small allowance for antialiasing.
  const strokePadding = context.lineWidth / 2 + 2;
  const left = Math.max(0, Math.floor(minX - strokePadding));
  const top = Math.max(0, Math.floor(minY - strokePadding));
  const right = Math.min(canvas.value.width, Math.ceil(maxX + strokePadding));
  const bottom = Math.min(canvas.value.height, Math.ceil(maxY + strokePadding));

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function createModelInput() {
  // Quick Draw bitmaps center each drawing's bounding box. Mirror that layout:
  // crop the ink bounds, preserve aspect ratio, and leave a one-pixel margin.
  const bounds = getDrawingBounds();
  if (!bounds) return null;

  modelContext.fillStyle = "#fff";
  modelContext.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE);
  modelContext.imageSmoothingEnabled = true;
  modelContext.imageSmoothingQuality = "high";

  const availableSize = MODEL_SIZE - MODEL_MARGIN * 2;
  const scale = Math.min(
    availableSize / bounds.width,
    availableSize / bounds.height,
  );
  const targetWidth = bounds.width * scale;
  const targetHeight = bounds.height * scale;
  const targetX = (MODEL_SIZE - targetWidth) / 2;
  const targetY = (MODEL_SIZE - targetHeight) / 2;

  modelContext.drawImage(
    canvas.value,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    targetX,
    targetY,
    targetWidth,
    targetHeight,
  );

  const pixels = modelContext.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;
  const input = new Float32Array(MODEL_SIZE * MODEL_SIZE);
  for (let index = 0; index < input.length; index += 1) {
    input[index] = Math.min(
      1,
      (255 - pixels[index * 4]) / (255 - DRAWING_RED_CHANNEL),
    );
  }

  return { input, previewUrl: modelCanvas.toDataURL("image/png") };
}

function emitPrediction() {
  if (!props.modelReady || !hasDrawing.value) return;
  const payload = createModelInput();
  if (payload) emit("predict", payload);
}
</script>
