# Local receipt recognition assets

This directory contains locally served third-party assets, loaded only when scanning.

- PaddleOCR.js 0.4.2 and PP-OCRv5 mobile detection / Greek-English recognition models: PaddlePaddle Authors, Apache-2.0. `LICENSE-paddle.txt`.
- OpenCV.js (locked npm dependency): Apache-2.0, `LICENSE-opencv.txt`.
- ONNX Runtime Web 1.30.0: Microsoft, MIT, `LICENSE-onnxruntime.txt`.
- Embedded dependency notices: `worker.mjs.LEGAL.txt`.

The Greek model is the official `PaddlePaddle/el_PP-OCRv5_mobile_rec_onnx` snapshot at `8152b89d2ee0e1d4c92decab75fe75e5e3d836b6`, packed as an uncompressed USTAR archive containing inference.onnx and inference.yml. `models.json` records original sources and SHA-256 hashes of both committed model archives.

Run `npm ci` followed by `npm run build:receipt-ocr` to rebuild the worker and runtime from the lockfile. Model hashes are checked before rebuilding. All runtime/model URLs resolve to the app origin. The worker rejects remote fetches and non-GET requests. No API keys, usage billing or recognition backend are involved. Runtime/model files are cached on demand by the service worker, separately from app-shell caches. The worker entry is requested with the running app version to prevent a stale adapter after app updates.

Original receipt photographs and benchmark OCR text are not included.
