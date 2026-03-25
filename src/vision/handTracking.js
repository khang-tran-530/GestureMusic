// src/vision/handTracking.js
import {
  FilesetResolver,
  HandLandmarker,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

/**
 * HandTrackingController
 * - Owns camera stream + MediaPipe landmarker + RAF loop
 * - Optionally draws to a canvas
 * - Emits results + gesture metadata each frame via onResults callback
 */
export function createHandTrackingController({
  videoEl,
  canvasEl,
  statusEl,
  cameraWindowEl,
  modelAssetPath = "/models/hand_landmarker.task",
  wasmRoot = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm",
  numHands = 1,
  delegate = "GPU",
  videoConstraints = { width: { ideal: 640 }, height: { ideal: 480 } },
  draw = true,
  onResults = null, // (results, gestureInfo) => void
} = {}) {
  if (!videoEl) throw new Error("createHandTrackingController: videoEl is required");
  if (!canvasEl) throw new Error("createHandTrackingController: canvasEl is required");
  if (!statusEl) throw new Error("createHandTrackingController: statusEl is required");
  if (!cameraWindowEl) throw new Error("createHandTrackingController: cameraWindowEl is required");

  const ctx = canvasEl.getContext("2d");

  let stream = null;
  let rafId = null;

  let handLandmarker = null;
  let drawingUtils = null;
  let lastVideoTime = -1;

  let history = [];
  let lastSwipeAt = 0;

  const SWIPE_WINDOW_MS = 220;
  const SWIPE_COOLDOWN_MS = 450;
  const SWIPE_MIN_DX = 0.12;
  const SWIPE_MAX_DY = 0.08;
  const SWIPE_DOMINANCE = 1.8;
  const MIN_POINTS = 4;
  const EXTENSION_TOLERANCE = 0.015;
  const MIRROR_X = true;

  function setStatus(msg) {
    statusEl.textContent = msg;
  }

  function resizeCanvasToVideo() {
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
  }

  function resetGestureState() {
    history = [];
  }

  function isIndexFingerExtended(landmarks) {
    const mcp = landmarks[5];
    const pip = landmarks[6];
    const dip = landmarks[7];
    const tip = landmarks[8];

    return (
      tip.y < dip.y - EXTENSION_TOLERANCE &&
      dip.y < pip.y - EXTENSION_TOLERANCE &&
      pip.y < mcp.y - EXTENSION_TOLERANCE
    );
  }

  function trimHistory(tNow) {
    const cutoff = tNow - SWIPE_WINDOW_MS;
    while (history.length && history[0].t < cutoff) history.shift();
  }

  function pushPoint(point, tNow) {
    history.push({ x: point.x, y: point.y, t: tNow });
    trimHistory(tNow);
  }

  function detectSwipe(tNow) {
    trimHistory(tNow);
    if (history.length < MIN_POINTS) return null;

    const oldest = history[0];
    const newest = history[history.length - 1];
    const dxRaw = newest.x - oldest.x;
    const dy = newest.y - oldest.y;
    const dx = MIRROR_X ? -dxRaw : dxRaw;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (tNow - lastSwipeAt < SWIPE_COOLDOWN_MS) return null;
    if (absX < SWIPE_MIN_DX) return null;
    if (absY > SWIPE_MAX_DY) return null;
    if (absX < absY * SWIPE_DOMINANCE) return null;

    lastSwipeAt = tNow;
    resetGestureState();
    return dx > 0 ? "right" : "left";
  }

  function getGestureInfo(results, tNow) {
    const landmarks = results?.landmarks?.[0];
    if (!landmarks) {
      resetGestureState();
      return { swipe: null, tracking: false };
    }

    if (!isIndexFingerExtended(landmarks)) {
      resetGestureState();
      return { swipe: null, tracking: true };
    }

    pushPoint(landmarks[8], tNow);
    return {
      swipe: detectSwipe(tNow),
      tracking: true,
    };
  }

  async function init() {
    if (handLandmarker) return;

    setStatus("loading hand model...");

    const vision = await FilesetResolver.forVisionTasks(wasmRoot);

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath,
        delegate,
      },
      numHands,
      runningMode: "VIDEO",
    });

    drawingUtils = new DrawingUtils(ctx);
    setStatus("hand model ready ✅");
  }

  function startLoop() {
    const loop = () => {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

      if (handLandmarker && videoEl.readyState >= 2) {
        if (videoEl.currentTime !== lastVideoTime) {
          const now = performance.now();
          const results = handLandmarker.detectForVideo(videoEl, now);
          const gestureInfo = getGestureInfo(results, now);
          lastVideoTime = videoEl.currentTime;

          if (typeof onResults === "function") onResults(results, gestureInfo);

          if (draw && results?.landmarks?.length) {
            for (const landmarks of results.landmarks) {
              drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS);
              drawingUtils.drawLandmarks(landmarks);
            }
          }
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    loop();
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    lastVideoTime = -1;
    resetGestureState();
  }

  async function start() {
    try {
      setStatus("requesting camera permission...");

      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });

      videoEl.srcObject = stream;
      cameraWindowEl.classList.remove("is-hidden");

      await new Promise((resolve) => {
        videoEl.addEventListener(
          "loadeddata",
          () => resolve(),
          { once: true }
        );
      });

      resizeCanvasToVideo();
      await init();

      setStatus("webcam + hand tracking running ✅");
      startLoop();
    } catch (err) {
      console.error(err);
      cameraWindowEl.classList.add("is-hidden");
      setStatus(`error: ${err?.name ?? "UnknownError"}`);

      alert(
        `Could not start webcam.\n\nError: ${err?.name ?? "UnknownError"}\n\n` +
          `Fixes:\n- Allow camera permission in Chrome for localhost\n- macOS System Settings → Privacy & Security → Camera\n- Close other apps using the camera`
      );

      stream = null;
      resetGestureState();
      throw err;
    }
  }

  function stop() {
    setStatus("stopping...");

    stopLoop();

    if (videoEl.srcObject) {
      videoEl.srcObject.getTracks().forEach((t) => t.stop());
    }

    videoEl.srcObject = null;
    stream = null;

    setStatus("idle");
    cameraWindowEl.classList.add("is-hidden");
  }

  function isRunning() {
    return Boolean(stream);
  }

  return {
    init,
    start,
    stop,
    isRunning,
  };
}
