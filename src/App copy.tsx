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
} from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";

/** Detecta domínios do ngrok (.ngrok-free.dev, .ngrok.app, .ngrok.dev, .ngrok.io) */
const isNgrokUrl = (u: string) =>
  /(^https?:\/\/)?([^.]+\.)?ngrok(-free)?\.(app|dev)/i.test(u) ||
  /(^https?:\/\/)?[a-z0-9-]+\.ngrok\.io/i.test(u);

/** Normaliza a URL; se for ngrok e não tiver protocolo, força https; senão usa http */
const normalizeUrl = (u: string) => {
  if (!u) return "";
  const t = u.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return isNgrokUrl(t) ? `https://${t}` : `http://${t}`;
};

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

const DEFAULT_API_BASE = "https://inward-pied-katerine.ngrok-free.dev";
const CONFIG_PASSWORD = "F@ives25";

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

export default function App() {
  // Configs
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

  // Câmera / scan
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const mediaTrackRef = useRef<MediaStreamTrack | null>(null);

  const [scanning, setScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState<boolean | null>(null);
  const [cameraErr, setCameraErr] = useState("");

  const lastTextRef = useRef<string>("");
  const [lastCode, setLastCode] = useState<string>("");

  // Resultado
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [product, setProduct] = useState<ProdDetail | null>(null);
  const [animKey, setAnimKey] = useState(0);

  const stopCamera = useCallback(() => {
    setScanning(false);
    setTorchOn(false);
    setTorchSupported(null);
    codeReaderRef.current?.reset();
    codeReaderRef.current = null;

    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (v) {
      v.srcObject = null;
      v.removeAttribute("src");
    }
    mediaTrackRef.current = null;
  }, []);

  const pickBackCamera = async () => {
    const devices = await BrowserMultiFormatReader.listVideoInputDevices();
    if (!devices.length) throw new Error("Nenhuma câmera encontrada.");
    // tenta achar 'back' / 'trás' / 'rear'
    const back = devices.find((d) =>
      /back|trás|traseira|rear/i.test(d.label || "")
    );
    return (back || devices[devices.length - 1]).deviceId;
  };

  const inspectTorchSupportSoon = () => {
    // dá um tempinho pro vídeo anexar o stream
    setTimeout(() => {
      const v = videoRef.current;
      const stream = (v?.srcObject || null) as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0] || null;
      mediaTrackRef.current = track || null;
      try {
        const caps: any = track?.getCapabilities?.() || {};
        setTorchSupported(Boolean(caps.torch));
      } catch {
        setTorchSupported(false);
      }
    }, 600);
  };

  const startCamera = useCallback(async () => {
    setCameraErr("");
    setError("");
    setProduct(null);
    setLastCode("");
    lastTextRef.current = "";

    try {
      stopCamera();

      codeReaderRef.current = new BrowserMultiFormatReader();
      const deviceId = await pickBackCamera();

      await codeReaderRef.current.decodeFromVideoDevice(
        deviceId,
        videoRef.current!,
        (result, err, controls) => {
          if (result) {
            const text = result.getText().trim();
            if (!text) return;

            // Evita flood: ignora leituras repetidas muito próximas
            if (text === lastTextRef.current) return;
            lastTextRef.current = text;
            setLastCode(text);
            handleScan(text);

            // Após ler, dá uma pequena pausa visual
            // (se quiser parar após 1 leitura, descomente a linha abaixo)
            // stopCamera();
          }
        }
      );

      setScanning(true);
      inspectTorchSupportSoon();
    } catch (e: any) {
      setCameraErr(e?.message || "Falha ao iniciar a câmera");
      stopCamera();
    }
  }, []);

  const toggleTorch = async () => {
    try {
      const track = mediaTrackRef.current;
      // Alguns devices exigem advanced constraints:
      // @ts-ignore
      await track?.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch {
      // Sem suporte real
      setTorchSupported(false);
    }
  };

  const apiSearch = useCallback(
    async (ean: string) => {
      if (!ean) return;
      setLoading(true);
      setError("");
      setProduct(null);
      try {
        const url = `${apiBase}/test-api/product/by-barcode?codauxiliar=${encodeURIComponent(
          ean
        )}&codfilial=${encodeURIComponent(
          filial
        )}&numregiao=${encodeURIComponent(numReg)}&with_price=1`;

        const headers: Record<string, string> = {};
        if (isNgrokUrl(apiBase)) headers["ngrok-skip-browser-warning"] = "true";

        const r = await fetch(url, { headers });
        const bodyText = await r.text();

        if (!r.ok) {
          throw new Error(`${r.status} ${r.statusText}\n${bodyText}`);
        }

        const data = JSON.parse(bodyText);
        const row: ProdDetail = Array.isArray(data) ? data[0] : data;

        setProduct(row);
        setAnimKey((k) => k + 1);
      } catch (e: any) {
        setError(e?.message || "Falha na busca (veja console)");
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    [apiBase, filial, numReg]
  );

  const handleScan = useCallback(
    (text: string) => {
      // mantém apenas dígitos do EAN
      const code = (text.match(/\d+/g) || []).join("");
      if (!code) return;
      apiSearch(code);
    },
    [apiSearch]
  );

  // UI
  return (
    <div className="h-screen flex flex-col bg-slate-950 overflow-hidden relative">
      {/* Fundo simples */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />

      {/* CSS de animação e moldura */}
      <style>{`
        @keyframes slideUp { 
          0% { opacity: 0; transform: translateY(12px); } 
          100% { opacity: 1; transform: translateY(0); } 
        }
        .animate-slide-up { animation: slideUp .35s ease-out both; }

        .scan-frame {
          position: absolute; inset: 0;
          border: 2px solid rgba(59,130,246,.5);
          border-radius: 16px;
          box-shadow: 0 0 0 9999px rgba(2,6,23,.35) inset;
        }
        .scan-line {
          position: absolute; left: 8px; right: 8px; height: 2px; 
          background: linear-gradient(90deg, transparent, rgba(34,211,238, .9), transparent);
          animation: sweep 1.6s ease-in-out infinite;
        }
        @keyframes sweep {
          0%   { top: 12% }
          50%  { top: 70% }
          100% { top: 12% }
        }
      `}</style>

      {/* Header */}
      <header className="flex-none relative bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/60">
        <button
          onClick={() => setShowCfg(true)}
          className="absolute right-5 top-5 p-2 rounded-lg text-slate-200 hover:bg-slate-800 transition"
          aria-label="Configurações"
        >
          <Settings className="w-5 h-5" />
        </button>

        <div className="mx-auto w-full max-w-3xl px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-400/20">
              <ScanLine className="w-5 h-5 text-blue-300" />
            </span>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-100">
              Scanner de Produtos (Câmera)
            </h1>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center px-4 pt-6 pb-6 overflow-y-auto relative z-10">
        <div className="w-full max-w-3xl space-y-6">
          {/* Controles + vídeo */}
          <section className="bg-slate-800/90 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl p-5 md:p-6 animate-slide-up">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {!scanning ? (
                <button
                  onClick={startCamera}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-xl transition"
                >
                  <Camera className="w-5 h-5" />
                  Iniciar câmera
                </button>
              ) : (
                <>
                  <button
                    onClick={stopCamera}
                    className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold px-4 py-2.5 rounded-xl transition"
                  >
                    <X className="w-5 h-5" />
                    Parar
                  </button>

                  {torchSupported ? (
                    <button
                      onClick={toggleTorch}
                      className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold px-4 py-2.5 rounded-xl transition"
                    >
                      {torchOn ? (
                        <>
                          <FlashlightOff className="w-5 h-5" />
                          Lanterna: desligar
                        </>
                      ) : (
                        <>
                          <Flashlight className="w-5 h-5" />
                          Lanterna: ligar
                        </>
                      )}
                    </button>
                  ) : torchSupported === false ? (
                    <span className="text-xs text-slate-400">
                      *Lanterna não suportada neste aparelho.
                    </span>
                  ) : null}

                  {lastCode && (
                    <span className="ml-auto text-xs md:text-sm text-slate-300">
                      Último EAN lido:{" "}
                      <b className="text-slate-100">{lastCode}</b>
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Vídeo */}
            <div className="relative rounded-2xl overflow-hidden border border-slate-700/70">
              <div className="relative aspect-[3/4] bg-black/70">
                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
                {scanning && (
                  <>
                    <div className="scan-frame" />
                    <div className="scan-line" />
                  </>
                )}
                {!scanning && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-slate-300 text-sm md:text-base flex items-center gap-2">
                      <ScanLine className="w-5 h-5" />
                      Câmera parada
                    </div>
                  </div>
                )}
              </div>
            </div>

            {cameraErr && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-600/40 bg-red-900/30 p-3">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
                <p className="text-sm text-red-200">{cameraErr}</p>
              </div>
            )}
          </section>

          {/* Resultado / erros */}
          {loading && (
            <section className="bg-slate-800/90 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl p-5 flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-slate-200" />
              <span className="text-slate-200 text-sm">Buscando produto…</span>
            </section>
          )}

          {error && !loading && (
            <section className="bg-red-900/70 backdrop-blur-xl rounded-3xl border border-red-600/40 shadow-2xl p-5 animate-slide-up">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-300 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-red-100 mb-1">Erro</h3>
                  <p className="text-sm text-red-200 whitespace-pre-wrap break-words">
                    {error}
                  </p>
                </div>
              </div>
            </section>
          )}

          {product && !loading && (
            <section
              key={animKey}
              className="bg-slate-800/90 backdrop-blur-xl rounded-3xl border-2 border-blue-500/40 shadow-2xl overflow-hidden animate-slide-up"
            >
              <div className="bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-3">
                <div className="flex items-center gap-2 text-white">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-bold uppercase tracking-wide">
                    Produto encontrado
                  </span>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h2 className="text-lg md:text-xl font-bold text-white leading-tight">
                    {product.DESCRICAO}
                  </h2>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-700/60 text-slate-200 border border-slate-600">
                      <Barcode className="w-4 h-4" />
                      EAN: <b>{product.CODAUXILIAR}</b>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-700/60 text-slate-200 border border-slate-600">
                      CODPROD: <b>{product.CODPROD}</b>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-700/60 text-slate-200 border border-slate-600">
                      Filial: <b>{product.CODFILIAL}</b>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end md:items-start justify-center">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                    Preço de venda
                  </p>
                  <div className="text-3xl font-extrabold bg-gradient-to-r from-blue-300 to-cyan-200 bg-clip-text text-transparent">
                    {fmtBRL(product.PRECO_VAREJO ?? null)}
                  </div>
                </div>

                <div className="bg-slate-900/40 rounded-2xl border border-slate-700 p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                    Estoque
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-3">
                      <p className="text-slate-400 text-xs">Atual</p>
                      <p className="text-slate-100 text-lg font-bold">
                        {product.ESTOQUE_ATUAL}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-3">
                      <p className="text-slate-400 text-xs">Bloqueado</p>
                      <p className="text-slate-100 text-lg font-bold">
                        {product.BLOQUEADO}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-3">
                      <p className="text-slate-400 text-xs">Avaria</p>
                      <p className="text-slate-100 text-lg font-bold">
                        {product.AVARIA}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-3">
                      <p className="text-slate-400 text-xs">Disponível</p>
                      <p className="text-slate-100 text-lg font-bold">
                        {product.ESTOQUE_DISPONIVEL}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/40 rounded-2xl border border-slate-700 p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                    Fornecedor & Custos
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-3">
                      <p className="text-slate-400 text-xs">Fornecedor</p>
                      <p className="text-slate-100 font-semibold">
                        {product.CODFORNEC} - {product.FORNECEDOR}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-3">
                      <p className="text-slate-400 text-xs">Última entrada</p>
                      <p className="text-slate-100 font-semibold">
                        {fmtDate(product.DTULTENT)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-3">
                      <p className="text-slate-400 text-xs">
                        Custo última entrada
                      </p>
                      <p className="text-slate-100 font-semibold">
                        {fmtBRL(product.CUSTOULTENT ?? null)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Modal de Configurações */}
      {showCfg && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-slide-up">
          <div className="bg-slate-800 rounded-3xl w-full max-w-md shadow-2xl border border-slate-700 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-white">Configurações</h3>
                <button
                  onClick={() => {
                    setShowCfg(false);
                    setUnlocked(false);
                    setPwd("");
                    setPwdErr("");
                  }}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {!unlocked ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">
                      Senha de Acesso
                    </label>
                    <input
                      type="password"
                      value={pwd}
                      onChange={(e) => setPwd(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (pwd === CONFIG_PASSWORD) {
                            setUnlocked(true);
                            setPwdErr("");
                          } else setPwdErr("Senha incorreta");
                        }
                      }}
                      placeholder="Digite a senha"
                      className="w-full px-4 py-3 bg-slate-900/50 border-2 border-slate-600 rounded-xl text-sm font-medium text-white placeholder:text-slate-500 focus:ring-4 focus:ring-blue-500/40 focus:border-blue-500 outline-none"
                      autoFocus
                    />
                    {pwdErr && (
                      <p className="text-sm text-red-400 font-medium mt-2 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" />
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
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white py-3 rounded-xl text-sm font-semibold shadow-lg transition"
                  >
                    Desbloquear
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {[
                    { lbl: "URL da API", val: tmpApi, set: setTmpApi },
                    { lbl: "Código da Filial", val: tmpFil, set: setTmpFil },
                    { lbl: "Número da Região", val: tmpReg, set: setTmpReg },
                  ].map(({ lbl, val, set }) => (
                    <div key={lbl}>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">
                        {lbl}
                      </label>
                      <input
                        value={val}
                        onChange={(e) => set(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-900/50 border-2 border-slate-600 rounded-xl text-sm font-medium text-white placeholder:text-slate-500 focus:ring-4 focus:ring-blue-500/40 focus:border-blue-500 outline-none"
                      />
                    </div>
                  ))}

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
                      className="flex-1 px-4 py-3 border-2 border-slate-600 hover:bg-slate-700 rounded-xl text-sm font-semibold text-slate-300 transition"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        const safeUrl = normalizeUrl(tmpApi.trim());
                        setApiBase(safeUrl);
                        setFilial(tmpFil);
                        setNumReg(tmpReg);
                        localStorage.setItem("apiBase", safeUrl);
                        localStorage.setItem("filial", tmpFil);
                        localStorage.setItem("numregiao", tmpReg);
                        setShowCfg(false);
                        setUnlocked(false);
                        setPwd("");
                      }}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white py-3 rounded-xl text-sm font-semibold shadow-lg transition"
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
