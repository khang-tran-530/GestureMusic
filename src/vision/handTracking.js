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
   * - Emits results each frame via onResults callback
   */
  export function createHandTrackingController({
    videoEl,
    canvasEl,
    statusEl,
    cameraWindowEl,
    modelAssetPath = "/models/hand_landmarker.task",
    wasmRoot = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm",
    numHands = 1,
    delegate = "CPU",
    videoConstraints = { width: { ideal: 640 }, height: { ideal: 480 } },
    draw = true,
    onResults = null, // (results) => void
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
  
    function setStatus(msg) {
      statusEl.textContent = msg;
    }
  
    function resizeCanvasToVideo() {
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
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
  
    //logic for hand gestures
    function startLoop() {
      const loop = () => {
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  
        if (handLandmarker && videoEl.readyState >= 2) {
          if (videoEl.currentTime !== lastVideoTime) {
            const results = handLandmarker.detectForVideo(videoEl, performance.now());
            lastVideoTime = videoEl.currentTime;
  
            // Let main.js decide what to do with the results
            if (typeof onResults === "function") onResults(results);
  
            // Optional built-in drawing
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