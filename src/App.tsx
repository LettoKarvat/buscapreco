/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Camera,
  ScanLine,
  Flashlight,
  FlashlightOff,
  Settings,
  X,
  Loader2,
  Barcode,
  AlertCircle,
  CheckCircle2,
  Play,
  ZoomIn,
} from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

/* ========================= Utils de URL/ngrok ========================= */
const isNgrokUrl = (u: string) =>
  /(^https?:\/\/)?([^.]+\.)?ngrok(-free)?\.(app|dev)/i.test(u) ||
  /(^https?:\/\/)?[a-z0-9-]+\.ngrok\.io/i.test(u);

const normalizeUrl = (u: string) => {
  if (!u) return "";
  const t = u.trim();
  if (/^https?:\/\//i.test(t)) return t;
  // se for domínio/host simples, tenta http por padrão
  return isNgrokUrl(t) ? `https://${t}` : `http://${t}`;
};

// Se a página está em HTTPS e o destino é HTTP, usa o proxy serverless
const wrapWithProxyIfNeeded = (fullUrl: string) => {
  try {
    const pageIsHttps = window.location.protocol === "https:";
    const destIsHttp = /^http:\/\//i.test(fullUrl);
    if (pageIsHttps && destIsHttp) {
      return `/api/proxy?url=${encodeURIComponent(fullUrl)}`;
    }
    return fullUrl;
  } catch {
    return fullUrl;
  }
};

/* =============================== Types =============================== */
type ProdDetail = {
  CODAUXILIAR: number | string;
  CODFILIAL: number;
  CODPROD: number;
  DESCRICAO: string;
  ESTOQUE_ATUAL: number;
  BLOQUEADO: number;
  AVARIA: number;
  ESTOQUE_DISPONIVEL: number;
  CODFORNEC: number;
  FORNECEDOR: string;
  DTULTENT: string | null;
  CUSTOULTENT: number | null;
  PRECO_VAREJO?: number | null;
};

/* =============================== Consts ============================== */
// Seu DNS público HTTP (porta com NAT do seu roteador)
const DEFAULT_API_BASE = "http://7932077a4b6e.sn.mynetname.net:12470";
// Para testes DENTRO da LAN em build local (http://localhost:5173), pode usar:
// const DEFAULT_API_BASE = "http://192.168.1.101:5001";

// Mantive esse valor pois existia no seu arquivo original
const RESET_DELAY_MS = 15_000;

const CONFIG_PASSWORD = "F@ives25";

/* ============================ Format helpers ========================= */
const fmtBRL = (n: number | null | undefined) =>
  typeof n === "number"
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "-";

const fmtDate = (iso: string | null) => {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("pt-BR");
  } catch {
    return "-";
  }
};

/* ====================== Helpers fora do componente ==================== */
const makeBarcodeDetector = async (): Promise<any | null> => {
  const W: any = window as any;
  if (!("BarcodeDetector" in W)) return null;
  const desired = [
    "ean_13",
    "ean_8",
    "upc_a",
    "upc_e",
    "code_128",
    "code_39",
    "code_93",
    "itf",
    "codabar",
    "qr_code",
    "data_matrix",
    "pdf417",
    "aztec",
  ];
  try {
    const supported: string[] =
      (await W.BarcodeDetector.getSupportedFormats?.()) || [];
    const fmts = supported.length
      ? desired.filter((f) => supported.includes(f))
      : desired;
    if (!fmts.length) return null;
    return new W.BarcodeDetector({ formats: fmts });
  } catch {
    return null;
  }
};

const loadTesseractFromCDN = async (): Promise<any | null> => {
  const W: any = window as any;
  if (W.Tesseract) return W.Tesseract;
  try {
    await import(
      /* @vite-ignore */ "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"
    );
    return W.Tesseract || null;
  } catch {
    return null;
  }
};

export default function App() {
  /* ============================== Configs ============================== */
  const [apiBase, setApiBase] = useState(() =>
    normalizeUrl(localStorage.getItem("apiBase") || DEFAULT_API_BASE)
  );
  const [filial, setFilial] = useState(
    () => localStorage.getItem("filial") || "1"
  );
  const [numReg, setNumReg] = useState(
    () => localStorage.getItem("numregiao") || "1"
  );
  const [showCfg, setShowCfg] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const [tmpApi, setTmpApi] = useState(apiBase);
  const [tmpFil, setTmpFil] = useState(filial);
  const [tmpReg, setTmpReg] = useState(numReg);

  useEffect(() => {
    localStorage.setItem("apiBase", apiBase);
    localStorage.setItem("filial", filial);
    localStorage.setItem("numregiao", numReg);
  }, [apiBase, filial, numReg]);

  /* ========================== Estados do Scanner ======================= */
  const [manualCode, setManualCode] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const mediaTrackRef = useRef<MediaStreamTrack | null>(null);
  const imageCaptureRef = useRef<any>(null);

  const [scanning, setScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState<boolean | null>(null);
  const [cameraErr, setCameraErr] = useState("");
  const [needsGesture, setNeedsGesture] = useState(false);

  const [ultraMode, setUltraMode] = useState(true);
  const bdRef = useRef<any>(null);
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const processingRef = useRef(false);

  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState<{
    min: number;
    max: number;
    step: number;
  } | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);

  const lastTextRef = useRef<string>("");
  const [lastCode, setLastCode] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [product, setProduct] = useState<ProdDetail | null>(null);
  const [animKey, setAnimKey] = useState(0);

  const lastHitAtRef = useRef<number>(0);

  /* ============================ Helpers câmera ========================= */
  const stopCamera = useCallback(() => {
    try {
      setScanning(false);
      setTorchOn(false);
      setTorchSupported(null);
      setZoomSupported(false);
      setZoomRange(null);
      setZoom(null);
      bdRef.current = null;
      imageCaptureRef.current = null;

      codeReaderRef.current?.reset();
      codeReaderRef.current = null;

      const v = videoRef.current;
      const stream = v?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      if (v) {
        v.srcObject = null;
        v.removeAttribute("src");
        v.removeAttribute("width");
        v.removeAttribute("height");
      }
      mediaTrackRef.current = null;
      setNeedsGesture(false);
    } catch {}
  }, []);

  const ensureVideoPlay = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.setAttribute("muted", "");
    // @ts-ignore
    v.playsInline = true;
    v.setAttribute("playsinline", "true");
    v.setAttribute("autoplay", "");
    for (let i = 0; i < 3; i++) {
      try {
        await v.play();
        setNeedsGesture(false);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 180));
      }
    }
    setNeedsGesture(true);
  }, []);

  const waitForVideoRef = () =>
    new Promise<HTMLVideoElement>((resolve, reject) => {
      let tries = 0;
      const tick = () => {
        const v = videoRef.current;
        if (v) return resolve(v);
        if (tries++ > 60) return reject(new Error("Vídeo não montou"));
        requestAnimationFrame(tick);
      };
      tick();
    });

  const describeEnv = async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const cams = devs.filter((d) => d.kind === "videoinput").length;
      // @ts-ignore
      return `secureContext=${
        (window as any).isSecureContext
      } videoinputs=${cams}`;
    } catch {
      // @ts-ignore
      return `secureContext=${(window as any).isSecureContext}`;
    }
  };

  const pickBackCamera = async () => {
    const devices = await BrowserMultiFormatReader.listVideoInputDevices();
    if (!devices.length) throw new Error("Nenhuma câmera encontrada");
    const byLabel = devices.find((d) =>
      /back|rear|trás|traseira/i.test(d.label || "")
    );
    return (byLabel || devices[devices.length - 1]).deviceId;
  };

  const quickPreview = useCallback(
    async (deviceId?: string) => {
      const v = await waitForVideoRef();
      const baseWithDevice: MediaTrackConstraints | undefined = deviceId
        ? { deviceId: { exact: deviceId } }
        : undefined;
      const baseFacing: MediaTrackConstraints = {
        facingMode: { ideal: "environment" },
      };

      const profiles: MediaStreamConstraints[] = [
        {
          audio: false,
          video: {
            ...(baseWithDevice || baseFacing),
            width: { ideal: 3840 },
            height: { ideal: 2160 },
            frameRate: { ideal: 60 },
            aspectRatio: 16 / 9,
          },
        },
        {
          audio: false,
          video: {
            ...(baseWithDevice || baseFacing),
            width: { ideal: 2560 },
            height: { ideal: 1440 },
            frameRate: { ideal: 60 },
            aspectRatio: 16 / 9,
          },
        },
        {
          audio: false,
          video: {
            ...(baseWithDevice || baseFacing),
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
            aspectRatio: 16 / 9,
          },
        },
        {
          audio: false,
          video: {
            ...(baseWithDevice || baseFacing),
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
        },
        {
          audio: false,
          video: {
            ...(baseWithDevice || baseFacing),
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        },
        { audio: false, video: true },
      ];
      if (baseWithDevice) {
        profiles.push(
          {
            audio: false,
            video: {
              ...baseFacing,
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 },
            },
          },
          { audio: false, video: true }
        );
      }
      let lastErr: any = null;
      for (const c of profiles) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(c);
          v.srcObject = stream;
          const track = stream.getVideoTracks?.()[0] || null;
          mediaTrackRef.current = track;

          if (track && "ImageCapture" in window) {
            try {
              // @ts-ignore
              imageCaptureRef.current = new (window as any).ImageCapture(track);
            } catch {
              imageCaptureRef.current = null;
            }
          }

          v.onloadedmetadata = () => {
            if (!v) return;
            v.setAttribute("width", String(v.videoWidth));
            v.setAttribute("height", String(v.videoHeight));
          };

          await ensureVideoPlay();
          return stream;
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error("Falha ao abrir câmera");
    },
    [ensureVideoPlay]
  );

  const safeApply = async (obj: any) => {
    const track = mediaTrackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [obj] });
    } catch {}
  };

  const inspectCapabilitiesAndBoost = useCallback(() => {
    setTimeout(async () => {
      const track = mediaTrackRef.current;
      if (!track) return;

      try {
        const caps: any = track.getCapabilities?.() || {};
        setTorchSupported(Boolean(caps.torch));

        if (
          typeof caps.zoom?.min === "number" &&
          typeof caps.zoom?.max === "number"
        ) {
          setZoomSupported(true);
          setZoomRange({
            min: caps.zoom.min,
            max: caps.zoom.max,
            step: caps.zoom.step ?? 0.1,
          });
          const z = caps.zoom.min + (caps.zoom.max - caps.zoom.min) * 0.35;
          setZoom(z);
          await safeApply({ zoom: z });
        } else {
          setZoomSupported(false);
          setZoomRange(null);
          setZoom(null);
        }

        if (caps.focusMode?.includes?.("continuous"))
          await safeApply({ focusMode: "continuous" });
        if (caps.exposureMode?.includes?.("continuous"))
          await safeApply({ exposureMode: "continuous" });
        if (typeof caps.exposureCompensation?.min === "number") {
          const mid = Math.min(caps.exposureCompensation.max ?? 0, 0.4);
          await safeApply({ exposureCompensation: mid });
        }
        if (caps.whiteBalanceMode?.includes?.("continuous"))
          await safeApply({ whiteBalanceMode: "continuous" });
      } catch {
        setTorchSupported(false);
        setZoomSupported(false);
        setZoomRange(null);
        setZoom(null);
      }
    }, 600);
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = mediaTrackRef.current;
    if (!track) return;
    try {
      // @ts-ignore
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch {
      setTorchSupported(false);
    }
  }, [torchOn]);

  const applyZoom = useCallback(async (val: number) => {
    const track = mediaTrackRef.current;
    if (!track) return;
    try {
      // @ts-ignore
      await track.applyConstraints({ advanced: [{ zoom: val }] });
      setZoom(val);
    } catch {}
  }, []);

  const measureBrightness = (v: HTMLVideoElement) => {
    const w = Math.max(64, Math.floor(v.videoWidth * 0.25));
    const h = Math.max(48, Math.floor(v.videoHeight * 0.25));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(
      v,
      (v.videoWidth - w) / 2,
      (v.videoHeight - h) / 2,
      w,
      h,
      0,
      0,
      w,
      h
    );
    const d = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
    }
    return sum / (d.length / 4) / 255; // 0..1
  };

  const startBDLoop = useCallback(() => {
    const v = videoRef.current as any;
    if (!v || !bdRef.current) return;
    const raf = v.requestVideoFrameCallback
      ? (cb: Function) => v.requestVideoFrameCallback(() => cb())
      : (cb: Function) => setTimeout(() => cb(), 16);

    const step = async () => {
      if (!scanning || !bdRef.current) return;
      if (processingRef.current) {
        raf(step);
        return;
      }
      processingRef.current = true;

      try {
        const vw = v.videoWidth || 0;
        const vh = v.videoHeight || 0;
        if (!vw || !vh) {
          processingRef.current = false;
          raf(step);
          return;
        }

        const rw = Math.floor(vw * 0.8);
        const rh = Math.floor(vh * 0.6);
        const rx = Math.floor((vw - rw) / 2);
        const ry = Math.floor((vh - rh) / 2);

        let canvas = roiCanvasRef.current;
        if (!canvas)
          (canvas = document.createElement("canvas")),
            (roiCanvasRef.current = canvas);
        canvas.width = rw;
        canvas.height = rh;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(v, rx, ry, rw, rh, 0, 0, rw, rh);

        const bitmap = await createImageBitmap(canvas);
        const codes = await bdRef.current.detect(bitmap);
        bitmap.close();

        if (codes?.length) {
          const code = (codes[0].rawValue || "").trim();
          if (code && code !== lastTextRef.current) {
            lastTextRef.current = code;
            lastHitAtRef.current = Date.now();
            setLastCode(code);
            fetchProduct(code);
          }
        } else {
          try {
            const bright = measureBrightness(v);
            if (bright < 0.22 && torchSupported && !torchOn) {
              await toggleTorch();
            } else if (bright > 0.55 && torchSupported && torchOn) {
              await toggleTorch();
            }
          } catch {}
        }
      } catch {
      } finally {
        processingRef.current = false;
        raf(step);
      }
    };
    raf(step);
  }, [scanning, torchSupported, torchOn, toggleTorch]);

  const startZXing = useCallback(async () => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.ITF,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODABAR,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    try {
      // @ts-ignore
      hints.set(DecodeHintType.ALSO_INVERTED, true);
      // @ts-ignore
      hints.set(DecodeHintType.ASSUME_GS1, true);
    } catch {}

    // @ts-ignore
    const reader = new BrowserMultiFormatReader(hints, 160);
    codeReaderRef.current = reader;

    await new Promise((r) => setTimeout(r, 200));
    await reader.decodeFromVideoElement(videoRef.current!, (res) => {
      const txt = res?.getText?.()?.trim();
      if (txt && txt !== lastTextRef.current) {
        lastTextRef.current = txt;
        lastHitAtRef.current = Date.now();
        setLastCode(txt);
        fetchProduct(txt);
      }
    });
  }, []);

  const runOCRDigits = useCallback(
    async (bitmap: ImageBitmap): Promise<string | null> => {
      try {
        const Tesseract = await loadTesseractFromCDN();
        if (!Tesseract) return null;

        const worker = await Tesseract.createWorker({ logger: () => {} });
        await worker.loadLanguage("eng");
        await worker.initialize("eng");
        await worker.setParameters({
          tessedit_char_whitelist: "0123456789",
          tessedit_pageseg_mode: "6",
        });

        const c = document.createElement("canvas");
        c.width = bitmap.width;
        c.height = bitmap.height;
        const ctx = c.getContext("2d")!;
        // @ts-ignore
        ctx.drawImage(bitmap, 0, 0);
        const {
          data: { text },
        } = await worker.recognize(c);
        await worker.terminate();

        const digits = (text || "").replace(/\D+/g, "");
        if (digits.length >= 8 && digits.length <= 18) return digits;
        return null;
      } catch {
        return null;
      }
    },
    []
  );

  const captureHQ = useCallback(
    async (silent = true) => {
      try {
        if (!mediaTrackRef.current || !imageCaptureRef.current) return;

        let blob: Blob;
        try {
          blob = await imageCaptureRef.current.takePhoto({
            imageWidth: 4032,
            imageHeight: 3024,
            fillLightMode: torchOn ? "flash" : "off",
          });
        } catch {
          blob = await imageCaptureRef.current.takePhoto();
        }

        const bitmap = await createImageBitmap(blob);

        if (bdRef.current) {
          try {
            const codes = await bdRef.current.detect(bitmap);
            if (codes?.length) {
              const code = (codes[0].rawValue || "").trim();
              if (code) {
                lastTextRef.current = code;
                lastHitAtRef.current = Date.now();
                setLastCode(code);
                fetchProduct(code);
                bitmap.close();
                return;
              }
            }
          } catch {}
        }

        const digits = await runOCRDigits(bitmap);
        if (digits) {
          lastTextRef.current = digits;
          lastHitAtRef.current = Date.now();
          setLastCode(digits);
          fetchProduct(digits);
          bitmap.close();
          return;
        }

        bitmap.close();
        if (!silent) setError("Não foi possível ler automaticamente (HQ).");
      } catch (e: any) {
        if (!silent) setError(e?.message || "Falha na captura HQ.");
      }
    },
    [torchOn, runOCRDigits]
  );

  useEffect(() => {
    if (!scanning) return;
    const id = setInterval(async () => {
      const now = Date.now();
      const idle = now - (lastHitAtRef.current || now);
      if (idle > 1500) {
        await captureHQ(true);
        lastHitAtRef.current = Date.now();
      }
      if (zoomSupported && zoomRange && zoom != null && idle > 900) {
        const next = Math.min(zoomRange.max, zoom + (zoomRange.step || 0.1));
        if (next > zoom) applyZoom(next);
      }
    }, 600);
    return () => clearInterval(id);
  }, [scanning, captureHQ, zoomSupported, zoomRange, zoom, applyZoom]);

  const startCamera = useCallback(async () => {
    setCameraErr("");
    setError("");
    setProduct(null);
    setLastCode("");
    lastTextRef.current = "";
    lastHitAtRef.current = Date.now();

    stopCamera();

    try {
      setScanning(true);
      await waitForVideoRef();

      let deviceId: string | undefined = undefined;
      try {
        deviceId = await pickBackCamera();
      } catch {
        deviceId = undefined;
      }

      await quickPreview(deviceId);
      inspectCapabilitiesAndBoost();

      if (ultraMode) {
        const bd = await makeBarcodeDetector();
        if (bd) {
          bdRef.current = bd;
          await new Promise((r) => setTimeout(r, 150));
          startBDLoop();
        } else {
          await startZXing();
        }
      } else {
        await startZXing();
      }
    } catch (e: any) {
      const n = e?.name || "";
      const msg =
        n === "NotAllowedError"
          ? "Permissão de câmera negada."
          : n === "OverconstrainedError"
          ? "Não foi possível satisfazer as constraints de vídeo."
          : e?.message || String(e);
      const env = await describeEnv();
      setCameraErr(`${n || "Erro"}: ${msg}\n${env}`);
      stopCamera();
    }
  }, [
    stopCamera,
    quickPreview,
    inspectCapabilitiesAndBoost,
    ultraMode,
    startBDLoop,
    startZXing,
  ]);

  /* ======================= API produto (via proxy se precisar) ========= */
  const fetchProduct = async (code: string) => {
    const c = (code || "").trim();
    if (!c) return;

    setLoading(true);
    setError("");
    setProduct(null);
    setAnimKey((k) => k + 1);

    const rawUrl =
      `${apiBase}/test-api/product/details` +
      `?produto=${encodeURIComponent(c)}` +
      `&codfilial=${encodeURIComponent(filial)}` +
      `&numregiao=${encodeURIComponent(numReg)}` +
      `&with_price=1`;

    const url = wrapWithProxyIfNeeded(rawUrl);

    try {
      const headers: Record<string, string> = {};
      if (isNgrokUrl(apiBase)) headers["ngrok-skip-browser-warning"] = "true";

      const res = await fetch(url, { headers });
      const body = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}\n${body}`);

      const data = JSON.parse(body);
      const row: ProdDetail = Array.isArray(data) ? data[0] : data;
      setProduct(row || null);
    } catch (e: any) {
      setError(e?.message || "Erro ao buscar produto");
    } finally {
      setLoading(false);
    }
  };

  /* ============================ Lifecycle ============================== */
  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onCanPlay = () => ensureVideoPlay();
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("loadedmetadata", onCanPlay);
    return () => {
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("loadedmetadata", onCanPlay);
    };
  }, [ensureVideoPlay]);

  useEffect(() => {
    startCamera();
  }, []); // auto-start

  const videoMaxH = "70vh";

  /* ================================ UI ================================= */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2.5 rounded-xl shadow-md">
              <Barcode className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                Consulta de Produtos
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Leitura automática (câmera + OCR)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={ultraMode}
                onChange={(e) => setUltraMode(e.target.checked)}
              />
              Modo Ultra
            </label>

            <button
              onClick={() => {
                setTmpApi(apiBase);
                setTmpFil(filial);
                setTmpReg(numReg);
                setShowCfg(true);
                setUnlocked(false);
                setPwd("");
                setPwdErr("");
              }}
              className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors"
              aria-label="Configurações"
            >
              <Settings className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>
      </header>

      {/* Aviso se estiver em HTTPS usando um endpoint HTTP (sem proxy) */}
      {window.location.protocol === "https:" && /^http:\/\//i.test(apiBase) && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
            O site está em HTTPS e a API em HTTP. As chamadas serão roteadas via{" "}
            <code>/api/proxy</code> da Vercel para evitar bloqueio de mixed
            content.
          </div>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4">
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Teste manual (digite o código e pressione Enter)
          </label>
          <div className="flex gap-2">
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchProduct(manualCode)}
              placeholder="Ex.: 7891234567890, CODPROD ou CODFAB"
              className="flex-1 px-3 py-2 rounded-xl border-2 border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none text-sm"
            />
          </div>
        </div>

        {/* Câmera */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-200">
          <div className="relative">
            <video
              ref={videoRef}
              className="w-full h-auto bg-black"
              style={{ maxHeight: videoMaxH, objectFit: "contain" }}
              playsInline
              autoPlay
              muted
              onClick={() => needsGesture && ensureVideoPlay()}
              onPlay={() => setNeedsGesture(false)}
            />

            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-48 border-4 border-blue-500 rounded-2xl shadow-2xl" />
              {!needsGesture && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-full flex items-center gap-2">
                  <ScanLine className="w-4 h-4 text-blue-400 animate-pulse" />
                  <span className="text-white text-sm font-medium">
                    {bdRef.current
                      ? "Lendo automaticamente (Ultra)..."
                      : "Lendo automaticamente..."}
                  </span>
                </div>
              )}
            </div>

            {needsGesture && (
              <div
                className="absolute inset-0 bg-black/60 flex items-center justify-center cursor-pointer"
                onClick={ensureVideoPlay}
                title="Toque para liberar o vídeo"
              >
                <div className="inline-flex items-center gap-2 bg-white/90 text-slate-800 font-semibold px-5 py-3 rounded-xl shadow-lg">
                  <Play className="w-5 h-5" />
                  Toque para liberar o vídeo
                </div>
              </div>
            )}

            <div className="absolute bottom-4 right-4 flex gap-2">
              {torchSupported && (
                <button
                  onClick={toggleTorch}
                  className="bg-black/70 backdrop-blur-sm hover:bg-black/80 text-white p-3 rounded-full transition-all shadow-lg"
                  aria-label={torchOn ? "Desligar flash" : "Ligar flash"}
                >
                  {torchOn ? (
                    <Flashlight className="w-5 h-5" />
                  ) : (
                    <FlashlightOff className="w-5 h-5" />
                  )}
                </button>
              )}
              <button
                onClick={stopCamera}
                className="bg-red-500/90 backdrop-blur-sm hover:bg-red-600 text-white p-3 rounded-full transition-all shadow-lg"
                aria-label="Parar câmera"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {zoomSupported && zoomRange && (
              <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg">
                <div className="flex items-center gap-2">
                  <ZoomIn className="w-4 h-4 text-white" />
                  <input
                    type="range"
                    min={zoomRange.min}
                    max={zoomRange.max}
                    step={zoomRange.step}
                    value={zoom ?? zoomRange.min}
                    onChange={(e) => applyZoom(Number(e.target.value))}
                    className="w-40 accent-white"
                    aria-label="Zoom"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {lastCode && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
            <div className="bg-blue-500 p-2 rounded-lg">
              <Barcode className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">
                Código detectado automaticamente
              </p>
              <p className="text-lg font-bold text-blue-900 mt-0.5">
                {lastCode}
              </p>
            </div>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-xl shadow-md p-8 flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <p className="text-slate-600 font-medium">Consultando produto...</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-semibold text-red-800">
                Erro na consulta
              </p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          </div>
        )}

        {product && !loading && (
          <div
            key={animKey}
            className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <div className="bg-gradient-to-r from-green-500 to-green-600 px-6 py-5 flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <CheckCircle2
                  className="w-6 h-6 text-white"
                  strokeWidth={2.5}
                />
              </div>
              <div className="flex-1">
                <p className="text-green-50 text-sm font-medium">
                  Produto Encontrado
                </p>
                <p className="text-white text-lg font-bold mt-0.5">
                  {product.DESCRICAO}
                </p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    Código Produto
                  </p>
                  <p className="text-xl font-bold text-slate-900">
                    {product.CODPROD}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    Código Auxiliar
                  </p>
                  <p className="text-xl font-bold text-slate-900">
                    {product.CODAUXILIAR}
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-5 border border-blue-200">
                <h3 className="text-sm font-bold text-blue-900 mb-4 flex items-center gap-2">
                  <div className="w-1 h-4 bg-blue-500 rounded-full" />
                  Informações de Estoque
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-blue-700 font-medium mb-1">
                      Estoque Atual
                    </p>
                    <p className="text-2xl font-bold text-blue-900">
                      {product.ESTOQUE_ATUAL}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-700 font-medium mb-1">
                      Disponível
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {product.ESTOQUE_DISPONIVEL}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-700 font-medium mb-1">
                      Bloqueado
                    </p>
                    <p className="text-lg font-semibold text-orange-600">
                      {product.BLOQUEADO}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-700 font-medium mb-1">
                      Avaria
                    </p>
                    <p className="text-lg font-semibold text-red-600">
                      {product.AVARIA}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">
                    Preço Varejo
                  </p>
                  <p className="text-2xl font-bold text-green-800">
                    {fmtBRL(product.PRECO_VAREJO)}
                  </p>
                </div>
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                    Custo Últ. Entrada
                  </p>
                  <p className="text-2xl font-bold text-amber-800">
                    {fmtBRL(product.CUSTOULTENT)}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <div className="w-1 h-4 bg-slate-500 rounded-full" />
                  Fornecedor
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 font-medium">
                      Nome:
                    </span>
                    <span className="text-sm text-slate-900 font-semibold">
                      {product.FORNECEDOR}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 font-medium">
                      Código:
                    </span>
                    <span className="text-sm text-slate-900 font-semibold">
                      {product.CODFORNEC}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 font-medium">
                      Última Entrada:
                    </span>
                    <span className="text-sm text-slate-900 font-semibold">
                      {fmtDate(product.DTULTENT)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="text-center py-2">
                  <p className="text-xs text-slate-500 font-medium mb-1">
                    Filial
                  </p>
                  <p className="text-base font-bold text-slate-700">
                    {product.CODFILIAL}
                  </p>
                </div>
                <div className="text-center py-2">
                  <p className="text-xs text-slate-500 font-medium mb-1">
                    Região
                  </p>
                  <p className="text-base font-bold text-slate-700">{numReg}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal de Configurações */}
      {showCfg && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-5 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <Settings className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white">Configurações</h2>
              </div>
              <button
                onClick={() => {
                  setShowCfg(false);
                  setUnlocked(false);
                  setPwd("");
                  setPwdErr("");
                }}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Fechar"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-6">
              {!unlocked ? (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      Digite a senha para acessar as configurações
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Senha
                    </label>
                    <input
                      type="password"
                      value={pwd}
                      onChange={(e) => setPwd(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        (pwd === CONFIG_PASSWORD
                          ? (setUnlocked(true), setPwdErr(""))
                          : setPwdErr("Senha incorreta"))
                      }
                      className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                      placeholder="Digite a senha"
                      autoFocus
                    />
                    {pwdErr && (
                      <p className="text-sm text-red-600 mt-2 font-medium">
                        {pwdErr}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (pwd === CONFIG_PASSWORD) {
                        setUnlocked(true);
                        setPwdErr("");
                      } else setPwdErr("Senha incorreta");
                    }}
                    className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-6 py-3.5 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
                  >
                    Desbloquear
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      URL da API
                    </label>
                    <input
                      type="text"
                      value={tmpApi}
                      onChange={(e) => setTmpApi(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all text-sm"
                      placeholder="http://host:porta"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Código da Filial
                    </label>
                    <input
                      type="text"
                      value={tmpFil}
                      onChange={(e) => setTmpFil(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Número da Região
                    </label>
                    <input
                      type="text"
                      value={tmpReg}
                      onChange={(e) => setTmpReg(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                      placeholder="1"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => {
                        setShowCfg(false);
                        setUnlocked(false);
                        setPwd("");
                        setTmpApi(apiBase);
                        setTmpFil(filial);
                        setTmpReg(numReg);
                      }}
                      className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 px-6 py-3.5 rounded-xl font-semibold transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        setApiBase(normalizeUrl(tmpApi));
                        setFilial(tmpFil);
                        setNumReg(tmpReg);
                        setShowCfg(false);
                        setUnlocked(false);
                        setPwd("");
                      }}
                      className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-6 py-3.5 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
