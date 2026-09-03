import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const runtime = fileURLToPath(import.meta.resolve("pdfjs-dist/build/pdf.min.mjs"));
const worker = fileURLToPath(import.meta.resolve("pdfjs-dist/build/pdf.worker.min.mjs"));
await mkdir("vendor/pdfjs", { recursive: true });
await copyFile(runtime, "vendor/pdfjs/pdf.min.mjs");
await copyFile(worker, "vendor/pdfjs/pdf.worker.min.mjs");
