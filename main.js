import "./style.css";
import {
  FilesetResolver,
  HandLandmarker,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const overlayCtx = overlay.getContext("2d");

let stream = null;
let rafId = null;

// MediaPipe
let handLandmarker = null;
let drawingUtils = null;
let lastVideoTime = -1;

function setStatus(msg) {
  statusEl.textContent = msg;
}

function resizeCanvasToVideo() {
  // Match canvas pixel size to actual video pixel size (important for correct drawing)
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
}

async function initHandLandmarkerIfNeeded() {
  if (handLandmarker) return;

  setStatus("loading hand model...");

  // Loads MediaPipe WASM runtime
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  // Create the landmarker using the model you downloaded into /public/models/
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/models/hand_landmarker.task",
      delegate: "GPU", // if this causes issues, change to "CPU"
    },
    numHands: 1,
    runningMode: "VIDEO",
  });

  drawingUtils = new DrawingUtils(overlayCtx);
  setStatus("hand model ready ✅");
}

function startDetectionLoop() {
  const loop = () => {
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

    if (handLandmarker && video.readyState >= 2) {
      // Only run detection when a new video frame is available
      if (video.currentTime !== lastVideoTime) {
        const results = handLandmarker.detectForVideo(video, performance.now());
        lastVideoTime = video.currentTime;

        if (results?.landmarks?.length) {
          for (const landmarks of results.landmarks) {
            drawingUtils.drawConnectors(
              landmarks,
              HandLandmarker.HAND_CONNECTIONS
            );
            drawingUtils.drawLandmarks(landmarks);
          }
        }
      }
    }

    rafId = requestAnimationFrame(loop);
  };

  loop();
}

function stopDetectionLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  lastVideoTime = -1;
}

async function startWebcam() {
  try {
    setStatus("requesting camera permission...");

    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });

    video.srcObject = stream;

    video.addEventListener(
      "loadeddata",
      async () => {
        resizeCanvasToVideo();
        await initHandLandmarkerIfNeeded();

        startBtn.textContent = "Stop webcam";
        setStatus("webcam + hand tracking running ✅");
        startDetectionLoop();
      },
      { once: true }
    );
  } catch (err) {
    console.error(err);
    setStatus(`error: ${err.name}`);
    alert(
      `Could not start webcam.\n\nError: ${err.name}\n\n` +
        `Fixes:\n- Allow camera permission in Chrome for localhost\n- macOS System Preferences → Security & Privacy → Privacy → Camera\n- Close other apps using the camera`
    );
    stream = null;
  }
}

function stopWebcam() {
  setStatus("stopping...");

  stopDetectionLoop();

  if (video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
  }

  video.srcObject = null;
  stream = null;

  startBtn.textContent = "Start webcam";
  setStatus("idle");
}

startBtn.addEventListener("click", () => {
  if (stream) stopWebcam();
  else startWebcam();
});
