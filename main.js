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

// ===== 7-card Arc Carousel with Smooth Slide Transitions =====
const carouselEl = document.getElementById("carousel");
const selTitleEl = document.getElementById("selTitle");
const selArtistEl = document.getElementById("selArtist");

// 7 total: 3 left + center + 3 right
const VISIBLE = 3;
const CARD_COUNT = VISIBLE * 2 + 1;

// Arc tuning (these matter a lot for “circular band” feel)
const ANGLE_STEP = 0.28; // radians per step (smaller = flatter)
const RADIUS_X = 520;    // horizontal radius
const RADIUS_Y = 150;    // vertical radius (higher = more arc)
const CENTER_DROP = 38;  // center sits lower
const CENTER_SCALE = 1.15; // scale of center card

// Depth tuning
const SCALE_MIN = 0.78;  // scale at the edges
const OPACITY_MIN = 0.25;
const BLUR_MAX = 1.8;

const SLIDE_MS = 280;    // should match your CSS transition duration

// Mode switching later (albums -> tracks). For now you can test with Enter.
let mode = "albums"; // "albums" | "tracks"

// Hard-coded data for now
const albums = [
  {
    id: "a1",
    title: "Album One",
    artist: "Artist A",
    cover: "https://picsum.photos/700?1",
    tracks: [
      { id: "t1", title: "Track 1", artist: "Artist A", cover: "https://picsum.photos/700?11" },
      { id: "t2", title: "Track 2", artist: "Artist A", cover: "https://picsum.photos/700?12" },
      { id: "t3", title: "Track 3", artist: "Artist A", cover: "https://picsum.photos/700?13" },
    ],
  },
  {
    id: "a2",
    title: "Album Two",
    artist: "Artist B",
    cover: "https://picsum.photos/700?2",
    tracks: [
      { id: "t4", title: "Song A", artist: "Artist B", cover: "https://picsum.photos/700?21" },
      { id: "t5", title: "Song B", artist: "Artist B", cover: "https://picsum.photos/700?22" },
    ],
  },
  {
    id: "a3",
    title: "Album Three",
    artist: "Artist C",
    cover: "https://picsum.photos/700?3",
    tracks: [{ id: "t6", title: "Track X", artist: "Artist C", cover: "https://picsum.photos/700?31" }],
  },
  { id: "a4", title: "Album Four", artist: "Artist D", cover: "https://picsum.photos/700?4", tracks: [] },
  { id: "a5", title: "Album Five", artist: "Artist E", cover: "https://picsum.photos/700?5", tracks: [] },
  { id: "a6", title: "Album Six", artist: "Artist F", cover: "https://picsum.photos/700?6", tracks: [] },
  { id: "a7", title: "Album Seven", artist: "Artist G", cover: "https://picsum.photos/700?7", tracks: [] },
];

let selectedAlbumIndex = 0;
let selectedTrackIndex = 0;

// Cards are kept in left->right order
const cards = [];
let isAnimating = false;

function clampIndex(i, n) {
  if (n <= 0) return 0;
  return (i + n) % n;
}

function getList() {
  if (mode === "albums") return albums;
  const album = albums[clampIndex(selectedAlbumIndex, albums.length)];
  return album?.tracks?.length ? album.tracks : [];
}

function getSelectedIndex() {
  return mode === "albums" ? selectedAlbumIndex : selectedTrackIndex;
}

function setSelectedIndex(i, n) {
  const idx = clampIndex(i, n);
  if (mode === "albums") selectedAlbumIndex = idx;
  else selectedTrackIndex = idx;
}

function setSelectedInfo(item) {
  selTitleEl.textContent = item?.title ?? "";
  selArtistEl.textContent = item?.artist ?? "";
}

// Circular arc mapping (THIS fixes the “linear steps” look)
function arcTransform(offset) {
  // offset is -3..+3
  const a = offset * ANGLE_STEP;

  // x moves along a circle horizontally; y rises gradually near center, more at edges
  const x = Math.sin(a) * RADIUS_X;
  const y = -(1 - Math.cos(a)) * RADIUS_Y;

  // Center sits lower (if we want)
  // const drop = offset === 0 ? CENTER_DROP : 0;

  const d = Math.abs(offset) / VISIBLE;
  const baseScale = 1 - (1 - SCALE_MIN) * d;
  const scale = offset === 0 ? baseScale * CENTER_SCALE : baseScale;

  const opacity = 1 - (1 - OPACITY_MIN) * d;
  const blur = BLUR_MAX * d;

  return { x, y: y, scale, opacity, blur, z: 100 - Math.abs(offset) };
}

function applyStyle(card, offset) {
  const t = arcTransform(offset);

  // Hide cards that are outside the visible slots (-3..+3)
  const offscreen = Math.abs(offset) > VISIBLE;

  card.style.transform =
    `translateX(calc(-50% + ${t.x}px)) translateY(${t.y}px) scale(${t.scale})`;

  card.style.opacity = offscreen ? "0" : String(t.opacity);
  card.style.filter = `blur(${t.blur}px)`;
  card.style.zIndex = String(t.z);
}


function setCardContent(card, item) {
  const img = card.querySelector("img");
  img.src = item?.cover || "";
  img.alt = item?.title ? `${item.title} cover` : "cover";
}

// Build exactly 7 cards once
function initCarouselDOM() {
  carouselEl.innerHTML = "";
  cards.length = 0;

  for (let i = 0; i < CARD_COUNT; i++) {
    const card = document.createElement("div");
    card.className = "carousel-card";
    card.innerHTML = `<img alt="" draggable="false" />`;
    carouselEl.appendChild(card);
    cards.push(card);
  }
}

// Initial layout: fill 7 cards around selected
function renderInitial() {
  const list = getList();
  const n = list.length;

  if (!n) {
    setSelectedInfo({ title: mode === "tracks" ? "No tracks" : "No albums", artist: "" });
    cards.forEach((c) => (c.style.opacity = "0"));
    return;
  }

  // ensure selected index is valid
  setCardPositionsAndContent();
}

function setCardPositionsAndContent() {
  const list = getList();
  const n = list.length;
  if (!n) return;

  const sel = getSelectedIndex();

  // Update selected info
  setSelectedInfo(list[sel]);

  // Fill left->right cards with indices sel-3..sel+3
  for (let i = 0; i < CARD_COUNT; i++) {
    const offset = i - VISIBLE; // 0..6 -> -3..+3
    const idx = clampIndex(sel + offset, n);

    setCardContent(cards[i], list[idx]);
    applyStyle(cards[i], offset);
  }
}

// Animate slide by moving cards to neighboring offsets,
// then recycle the offscreen card to the other side.
function slide(dir) {
  // dir: +1 means move selection right (cards slide left)
  // dir: -1 means move selection left (cards slide right)
  if (isAnimating) return;

  const list = getList();
  const n = list.length;
  if (n <= 0) return;

  isAnimating = true;

  // Update selected index immediately (so info updates after animation)
  const currentSel = getSelectedIndex();
  const nextSel = clampIndex(currentSel + dir, n);
  setSelectedIndex(nextSel, n);

  // 1) Animate all cards one slot
  for (let i = 0; i < CARD_COUNT; i++) {
    const currentOffset = i - VISIBLE;       // -3..+3
    const nextOffset = currentOffset - dir;  // shift opposite direction of selection
    applyStyle(cards[i], nextOffset);
  }

  // 2) After transition, recycle one card
  setTimeout(() => {
    const list2 = getList();
    const n2 = list2.length;
    const sel2 = getSelectedIndex();

    if (dir === 1) {
      // selection moved right; cards slid left; leftmost becomes new rightmost
      const recycled = cards.shift();
      recycled.classList.add("no-trans");
    
      // Update content for what will appear on the far right
      const newRightIdx = clampIndex(sel2 + VISIBLE, n2);
      setCardContent(recycled, list2[newRightIdx]);
    
      // 1) Place it just beyond the right edge (offset +4) with no transition
      applyStyle(recycled, VISIBLE + 1);
    
      // Put it at the end of the array (logical order left->right)
      cards.push(recycled);
    
      // Force the browser to acknowledge the no-trans state
      recycled.offsetHeight;
    
      // 2) Next frame, enable transitions and animate into the visible rightmost slot (+3)
      requestAnimationFrame(() => {
        recycled.classList.remove("no-trans");
        applyStyle(recycled, VISIBLE);
    
        // Snap the rest of the cards to canonical offsets (-3..+3) so state is stable
        for (let i = 0; i < CARD_COUNT; i++) {
          const offset = i - VISIBLE;
          // Skip recycled because we already set it to VISIBLE above (optional)
          if (cards[i] !== recycled) applyStyle(cards[i], offset);
        }
      });
    
    } else {
      // selection moved left; cards slid right; rightmost becomes new leftmost
      const recycled = cards.pop();
      recycled.classList.add("no-trans");
    
      const newLeftIdx = clampIndex(sel2 - VISIBLE, n2);
      setCardContent(recycled, list2[newLeftIdx]);
    
      // 1) Place it just beyond the left edge (offset -4)
      applyStyle(recycled, -(VISIBLE + 1));
    
      cards.unshift(recycled);
    
      recycled.offsetHeight;
    
      // 2) Animate into the visible leftmost slot (-3)
      requestAnimationFrame(() => {
        recycled.classList.remove("no-trans");
        applyStyle(recycled, -VISIBLE);
    
        for (let i = 0; i < CARD_COUNT; i++) {
          const offset = i - VISIBLE;
          if (cards[i] !== recycled) applyStyle(cards[i], offset);
        }
      });
    }
    

    // After recycling, re-apply the “canonical” offsets -3..+3 to the now-reordered cards.
    // This keeps the system stable for the next animation.
    for (let i = 0; i < CARD_COUNT; i++) {
      applyStyle(cards[i], i - VISIBLE);
    }

    // Update selected info to match new selection
    setSelectedInfo(list2[sel2]);

    isAnimating = false;
  }, SLIDE_MS);
}

// Mode switching test (Enter for now; pinch later)
function switchMode(nextMode) {
  if (nextMode === mode || isAnimating) return;

  carouselEl.classList.add("is-switching");
  setTimeout(() => {
    mode = nextMode;

    // entering tracks starts at first track
    if (mode === "tracks") selectedTrackIndex = 0;

    carouselEl.classList.remove("is-switching");

    // refill content for new mode
    setCardPositionsAndContent();
  }, 190);
}

// Keyboard controls
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    slide(-1);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    slide(1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (mode === "albums") switchMode("tracks");
    else switchMode("albums");
  }
});

// Init
initCarouselDOM();
setCardPositionsAndContent();

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
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
  );

  // Create the landmarker using the model you downloaded into /public/models/
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/models/hand_landmarker.task",
      delegate: "CPU", // if this causes issues, change to "CPU"
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
