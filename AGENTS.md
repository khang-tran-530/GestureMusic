# Repository Guidelines

## Project Structure & Module Organization
`main.js` is the browser entry point and wires the UI to hand-tracking behavior. `src/ui/` contains the OGL-based gallery implementation and gallery-specific CSS. `src/vision/` contains MediaPipe webcam and gesture logic. Static model assets live in `public/models/`, and album cover images live in `src/covers/`. Root files `index.html` and `style.css` define the shell layout and shared styling.

## Build, Test, and Development Commands
- `npm install`: install Vite, OGL, and MediaPipe dependencies.
- `npm run dev`: start the local Vite dev server for webcam and UI work.
- `npm run build`: create a production bundle in `dist/`.
- `npm run preview`: serve the production build locally for a final check.

Run commands from the repository root: `cd /Users/khangtran/Coding/GestureMusic`.

## Coding Style & Naming Conventions
Use ES modules and keep browser-facing code in plain JavaScript. Follow the repository’s current style: semicolons enabled, `camelCase` for variables/functions, `PascalCase` for classes, and descriptive factory names such as `createHandTrackingController`. Prefer double quotes in `main.js` and existing file-local style where you are editing; avoid mixing styles within the same file. Keep CSS class names hyphenated, for example `.camera-window` and `.topbar__right`.

## Testing Guidelines
There is no automated test suite yet. Validate changes with `npm run build` and manual browser checks through `npm run dev`. For gesture changes, verify camera permission flow, model loading from `public/models/hand_landmarker.task`, swipe direction, and gallery navigation. When adding tests later, place them near the related module or under a dedicated `tests/` folder and name them after the feature, for example `handTracking.test.js`.

## Commit & Pull Request Guidelines
Recent commits use short, plain-language summaries such as `Separated hand tracking code` and `added titles under album cards`. Keep commit messages concise, action-focused, and specific to one change. For pull requests, include:
- a brief description of the user-visible change
- manual verification steps
- screenshots or short recordings for UI updates
- notes about camera permissions, model paths, or known limitations when relevant

## Configuration & Asset Notes
Do not hard-code alternate model locations without updating `modelAssetPath` usage. Large media assets should stay optimized before committing. If a change depends on webcam access, document any browser or OS permission requirements in the PR.
