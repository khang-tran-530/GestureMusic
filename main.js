import "./style.css";
import { createCircularGallery } from "./src/ui/CircularGalleryOGL.js";
import "./src/ui/circularGallery.css";

import { createHandTrackingController } from "./src/vision/handTracking.js";

const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");

const galleryEl = document.querySelector("#oglGallery");
if (!galleryEl) throw new Error("#oglGallery not found in HTML");

const cameraWindow = document.getElementById("cameraWindow");
if (!cameraWindow) throw new Error("#cameraWindow not found in HTML");

// Hard-coded song data
const songs = [
  { title: "Currents", artist: "Tame Impala", cover: "./src/covers/16-Tame-Impala.webp" },
  { title: "Chromakopia", artist: "Tyler the Creator", cover: "./src/covers/Chromakopia_CD_cover.jpg" },
  { title: "Blonde", artist: "Frank Ocean", cover: "./src/covers/frank-ocean-blonde-album-cover.jpg" },
  { title: "Nothing But The Best", artist: "Frank Sinatra", cover: "./src/covers/frank-sinatra.jpg" },
  { title: "Silk Sonic", artist: "Bruno Mars & Anderson .Paak", cover: "./src/covers/Silk-Sonic.webp" },
  { title: "Long Live Asap", artist: "Asap Rocky", cover: "./src/covers/longliveasap.jpg" },
];

// OGL Gallery
const gallery = createCircularGallery(galleryEl, {
  items: songs.map((s) => ({ image: s.cover, text: s.title })),
  bend: 3,
  borderRadius: 0.05,
  font: "200 20px Inter",
  textColor: "#ffffff",
});

window.gallery = gallery; // expose gallery to website console for debugging

// Hand tracking controller
const handTracking = createHandTrackingController({
  videoEl: video,
  canvasEl: overlay,
  statusEl,
  cameraWindowEl: cameraWindow,
  draw: true, // keep drawing landmarks like before
  onResults: (results, gestureInfo) => {
    if (!gestureInfo?.swipe) return;
    if (gestureInfo.swipe === "right") gallery.next();
    if (gestureInfo.swipe === "left")  gallery.prev();
  },
});

//start webcam button logic
startBtn.addEventListener("click", async () => {
  try {
    if (handTracking.isRunning()) {
      handTracking.stop();
      startBtn.textContent = "Start webcam";
    } else {
      await handTracking.start();
      startBtn.textContent = "Stop webcam";
    }
  } catch {
    // start() already sets status + alerts; just reset button
    startBtn.textContent = "Start webcam";
  }
});