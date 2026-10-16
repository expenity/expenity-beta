# Bundled receipt recognition assets

Tesseract.js 7.0.0 and its locked tesseract.js-core dependency, Apache-2.0; see accompanying licences. Only LSTM core variants are included (standard, SIMD and relaxed SIMD). Language data: eng / ell, tesseract-ocr/tessdata_fast commit 87416418657359cb625c412a48b6e1d6d41c29bd, Apache-2.0, gzip with deterministic mtime. All assets are served from the app origin. No receipt is sent to an OCR provider.

Rebuild engine assets from package-lock.json with `node dev/build-ocr.mjs`. Language snapshots are committed alongside their licence for reproducibility.
