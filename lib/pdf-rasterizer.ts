import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

type PdfPageImage = {
  pageNumber: number;
  buffer: Buffer;
};

type PdfViewport = {
  width: number;
  height: number;
};

type PdfRenderTask = {
  promise: Promise<void>;
};

type PdfPage = {
  getViewport: (params: { scale: number }) => PdfViewport;
  render: (params: { canvasContext: unknown; viewport: PdfViewport }) => PdfRenderTask;
  cleanup?: () => void;
};

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};

type PdfLoadingTask = {
  promise: Promise<PdfDocument>;
  destroy: () => Promise<void>;
};

type PdfJsModule = {
  VerbosityLevel: {
    ERRORS: number;
  };
  getDocument: (source: unknown) => PdfLoadingTask;
};

function installPdfJsNodeGlobals() {
  const scope = globalThis as Record<string, unknown>;

  scope.DOMMatrix ??= DOMMatrix;
  scope.ImageData ??= ImageData;
  scope.Path2D ??= Path2D;
}

function buildCanvasViewport(page: PdfPage, options?: { targetWidth?: number }) {
  const baseViewport = page.getViewport({ scale: 1 });
  const targetWidth = options?.targetWidth ?? 2200;
  const scale = Math.min(3.2, Math.max(2, targetWidth / Math.max(baseViewport.width, 1)));

  return page.getViewport({ scale });
}

export async function renderPdfPagesToPngBuffers(
  buffer: Buffer,
  options?: {
    maxPages?: number;
    targetWidth?: number;
  }
): Promise<PdfPageImage[]> {
  installPdfJsNodeGlobals();

  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  } as unknown);
  const document = await loadingTask.promise;

  try {
    const pageCount = Math.min(document.numPages, options?.maxPages ?? 5);
    const pageImages: PdfPageImage[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);

      try {
        const viewport = buildCanvasViewport(page, options);
        const canvas = createCanvas(
          Math.max(1, Math.ceil(viewport.width)),
          Math.max(1, Math.ceil(viewport.height))
        );
        const context = canvas.getContext("2d");

        await page.render({
          canvasContext: context,
          viewport,
        }).promise;

        pageImages.push({
          pageNumber,
          buffer: canvas.toBuffer("image/png"),
        });
      } finally {
        page.cleanup?.();
      }
    }

    return pageImages;
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}
