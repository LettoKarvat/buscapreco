/* eslint-disable react-hooks/exhaustive-deps */
import Icon from "./resources/icon.png";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  Package,
  Loader2,
  AlertCircle,
  Barcode,
  CheckCircle,
  Settings,
  X,
  Clock,
} from "lucide-react";
import { Keyboard } from "@capacitor/keyboard";
import { registerPlugin } from "@capacitor/core";

const ScannerPlugin = registerPlugin("ScannerPlugin");

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  promotionalPrice?: number;
  brand: string;
  category: string;
}

const DEFAULT_API_BASE = "https://inward-pied-katerine.ngrok-free.dev";
const RESET_DELAY_MS = 15_000;
const CONFIG_PASSWORD = "F@ives25";

const normalizeUrl = (u: string) =>
  u.startsWith("http://") || u.startsWith("https://") ? u : `http://${u}`;

export default function App() {
  useEffect(() => {
    Keyboard.hide().catch(() => {});
  }, []);

  const [apiBase, setApiBase] = useState(() =>
    normalizeUrl(localStorage.getItem("apiBase") || DEFAULT_API_BASE)
  );
  const [filial, setFilial] = useState(
    () => localStorage.getItem("filial") || "1"
  );
  const [numReg, setNumReg] = useState(
    () => localStorage.getItem("numregiao") || "1"
  );

  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showCfg, setShowCfg] = useState(false);
  const [tmpApi, setTmpApi] = useState(apiBase);
  const [tmpFil, setTmpFil] = useState(filial);
  const [tmpReg, setTmpReg] = useState(numReg);
  const [pwd, setPwd] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [pwdErr, setPwdErr] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const focusTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 🔑 chave para remontar o card do resultado e disparar animação
  const [resultAnimKey, setResultAnimKey] = useState(0);

  useEffect(() => {
    (showCfg ? Keyboard.show() : Keyboard.hide()).catch(() => {});
  }, [showCfg]);

  useEffect(() => {
    localStorage.setItem("apiBase", apiBase);
    localStorage.setItem("filial", filial);
    localStorage.setItem("numregiao", numReg);
  }, [apiBase, filial, numReg]);

  const apiSearch = useCallback(
    async (code: string) => {
      if (!code) return;
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

      setLoading(true);
      setError("");
      setProduct(null);

      try {
        const url = `${apiBase}/test-api/product/price?codfilial=${filial}&numregiao=${numReg}&codauxiliar=${code}`;
        const r = await fetch(url, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });

        console.log("URL", url);
        console.log("status", r.status, r.statusText);
        const bodyText = await r.text();
        console.log("body", bodyText);

        if (!r.ok) {
          throw new Error(`${r.status} ${r.statusText}\n${bodyText}`);
        }

        const data = JSON.parse(bodyText);
        setProduct({
          id: data.CODPROD,
          name: data.DESCRICAO,
          description: data.DESCRICAO,
          price: data.PRECO_VAREJO,
        });

        // 🔁 re-dispara animação do card a cada resultado
        setResultAnimKey((k) => k + 1);

        setHistory((prev) =>
          [code, ...prev.filter((c) => c !== code)].slice(0, 5)
        );
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Falha na busca (veja console)");
      }

      setLoading(false);
      resetTimerRef.current = setTimeout(() => {
        setProduct(null);
        setError("");
      }, RESET_DELAY_MS);
    },
    [apiBase, filial, numReg]
  );

  const processScan = useCallback(
    (code: string) => {
      setBarcode("");
      apiSearch(code.trim());
    },
    [apiSearch]
  );

  useEffect(() => {
    const sub = ScannerPlugin.addListener(
      "scan",
      ({ code }: { code: string }) => processScan(code)
    );
    return () => {
      sub.remove();
      ScannerPlugin.stop?.().catch(() => {});
    };
  }, [processScan]);

  useEffect(() => {
    const ip = (window as any)?.plugins?.intent;
    if (!ip?.setNewIntentHandler) return;
    ip.setNewIntentHandler((it: any) => {
      const code =
        it?.extras?.BARCODE ?? it?.extras?.SCAN_CODE ?? it?.extras?.scannerdata;
      if (code) processScan(code);
    });
  }, [processScan]);

  useEffect(() => {
    let buf = "";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        processScan(buf);
        buf = "";
      } else if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [processScan]);

  useEffect(() => {
    if (focusTimerRef.current) clearInterval(focusTimerRef.current);
    if (!showCfg) {
      focusTimerRef.current = setInterval(
        () => inputRef.current?.focus(),
        1500
      );
    }
    return () => focusTimerRef.current && clearInterval(focusTimerRef.current);
  }, [showCfg]);

  return (
    <div className="h-screen flex flex-col bg-slate-950 overflow-hidden relative">
      {/* CSS das animações */}
      <style>{`
        @keyframes slideUp { 
          0% { opacity: 0; transform: translateY(16px); } 
          100% { opacity: 1; transform: translateY(0); } 
        }
        .animate-slide-up { animation: slideUp .45s ease-out both; }

        @keyframes riseIn {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .price-rise { animation: riseIn .5s cubic-bezier(.2,.8,.2,1) both; }

        @keyframes popIn {
          0% { transform: scale(.98); }
          60% { transform: scale(1.03); }
          100% { transform: scale(1); }
        }
        .price-pop { animation: popIn .5s ease-out .05s both; }
      `}</style>

      {/* Fundo degradê */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950 via-slate-900 to-cyan-950"></div>

      {/* Bolhas de cor */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
        <div className="absolute top-0 -right-4 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-96 h-96 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
      </div>

      {/* Input oculto para manter foco quando for leitor */}
      <input
        ref={inputRef}
        value={barcode}
        readOnly
        inputMode="none"
        autoFocus
        {...({ virtualkeyboardpolicy: "manual" } as any)}
        className="absolute opacity-0 pointer-events-none"
      />

      <header className="flex-none relative bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/60">
        {/* ação à direita */}
        <button
          onClick={() => setShowCfg(true)}
          className="absolute right-5 top-5 p-2 rounded-lg text-slate-200 hover:bg-slate-800 transition"
          aria-label="Configurações"
        >
          <Settings className="w-5 h-5" />
        </button>

        <div className="mx-auto w-full max-w-4xl px-6">
          {/* LOGO centralizada com contraste para leitura */}
          <div className="flex items-center justify-center pt-5">
            <div className="rounded-2xl bg-white/95 px-3 py-2 shadow-xl ring-1 ring-slate-200 backdrop-blur-sm">
              <img
                src={Icon}
                alt="Logo"
                className="h-[160px] sm:h-[180px] md:h-[200px] w-auto object-contain"
              />
            </div>
          </div>

          {/* Título centralizado, ícone discreto */}
          <div className="flex items-center justify-center gap-3 py-4">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-blue-500/12 border border-blue-400/25">
              <Barcode className="w-5 h-5 text-blue-300" strokeWidth={2.25} />
            </span>
            <h1 className="text-2xl md:text-[28px] font-semibold leading-tight tracking-tight text-slate-100">
              Scanner de Produtos
            </h1>
          </div>
        </div>

        {/* divisor suave */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-800 to-transparent" />
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-start px-4 pt-8 pb-6 overflow-y-auto relative z-10">
        <div className="w-full max-w-md space-y-6">
          <section className="bg-slate-800/90 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl shadow-black/50 p-6 animate-slide-up">
            <div className="space-y-4">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-400/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative flex items-center">
                  <div className="absolute left-4 pointer-events-none">
                    <Package
                      className="w-5 h-5 text-slate-400"
                      strokeWidth={2}
                    />
                  </div>
                  <input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value.trim())}
                    onKeyDown={(e) => e.key === "Enter" && processScan(barcode)}
                    placeholder="Escaneie ou digite o código"
                    disabled={loading}
                    inputMode="none"
                    {...({ virtualkeyboardpolicy: "manual" } as any)}
                    className="w-full px-12 py-4 bg-slate-900/50 border-2 border-slate-600 rounded-2xl text-base font-medium text-white placeholder:text-slate-500 focus:ring-4 focus:ring-blue-500/50 focus:border-blue-500 caret-transparent transition-all outline-none disabled:bg-slate-900/30 disabled:text-slate-500"
                  />
                  {barcode && !loading && (
                    <button
                      onClick={() => setBarcode("")}
                      className="absolute right-4 p-1 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={() => processScan(barcode)}
                disabled={loading || !barcode}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 disabled:from-slate-300 disabled:to-slate-300 text-white py-4 rounded-2xl flex items-center justify-center gap-2.5 text-base font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all duration-200 disabled:shadow-none"
              >
                {loading ? (
                  <>
                    <Loader2
                      className="w-5 h-5 animate-spin"
                      strokeWidth={2.5}
                    />
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" strokeWidth={2.5} />
                    <span>Buscar Produto</span>
                  </>
                )}
              </button>

              {history.length > 0 && (
                <div className="pt-4 border-t border-slate-700">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <p className="text-sm font-semibold text-slate-200">
                      Consultas Recentes
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {history.map((c) => (
                      <button
                        key={c}
                        onClick={() => processScan(c)}
                        className="px-4 py-2 bg-slate-700/50 hover:bg-slate-600 text-slate-200 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-105 border border-slate-600"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {error && (
            <section className="bg-red-900/80 backdrop-blur-xl border-2 border-red-500/50 rounded-3xl p-5 shadow-2xl shadow-red-900/50 animate-slide-up">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 p-2 bg-red-500/20 rounded-xl">
                  <AlertCircle
                    className="w-5 h-5 text-red-400"
                    strokeWidth={2.5}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-red-200 mb-1">
                    Erro na Consulta
                  </h3>
                  <p className="text-sm text-red-300 whitespace-pre-wrap break-words">
                    {error}
                  </p>
                </div>
              </div>
            </section>
          )}

          {product && (
            <section
              key={resultAnimKey} // <- remonta para animar sempre
              className="bg-gradient-to-br from-slate-800 to-slate-900 backdrop-blur-xl rounded-3xl border-2 border-blue-500/50 shadow-2xl shadow-blue-500/30 overflow-hidden animate-slide-up"
            >
              <div className="bg-gradient-to-r from-blue-500 to-cyan-400 px-6 py-4">
                <div className="flex items-center gap-2 text-white">
                  <CheckCircle className="w-5 h-5" strokeWidth={2.5} />
                  <span className="text-sm font-bold uppercase tracking-wide">
                    Produto Encontrado
                  </span>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-white mb-2 leading-tight">
                    {product.name}
                  </h2>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {product.description}
                  </p>
                </div>

                <div className="flex items-end justify-between pt-4 border-t border-slate-700">
                  {/* bloco do preço com animações */}
                  <div className="price-rise">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                      Preço
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="price-pop text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                        R$ {product.price.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                      Código
                    </p>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-lg border border-slate-600">
                      <Barcode className="w-4 h-4 text-slate-300" />
                      <span className="text-sm font-bold text-slate-200">
                        {product.id}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-none bg-slate-900/80 backdrop-blur-xl border-t border-slate-700/50 text-center py-4 relative z-10">
        <p className="text-sm text-slate-400">
          Desenvolvido por{" "}
          <span className="font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            Faives Soluções em Tecnologia
          </span>
        </p>
      </footer>

      {/* Modal de Configurações */}
      {showCfg && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-slide-up">
          <div className="bg-slate-800 rounded-3xl w-full max-w-md shadow-2xl border border-slate-700 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-400 px-6 py-5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                    <Settings
                      className="w-5 h-5 text-white"
                      strokeWidth={2.5}
                    />
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    Configurações
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowCfg(false);
                    setUnlocked(false);
                    setPwd("");
                    setPwdErr("");
                  }}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-white" strokeWidth={2.5} />
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
                          } else {
                            setPwdErr("Senha incorreta");
                          }
                        }
                      }}
                      placeholder="Digite a senha"
                      className="w-full px-4 py-3 bg-slate-900/50 border-2 border-slate-600 rounded-xl text-sm font-medium text-white placeholder:text-slate-500 focus:ring-4 focus:ring-blue-500/50 focus:border-blue-500 transition-all outline-none"
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
                      } else {
                        setPwdErr("Senha incorreta");
                      }
                    }}
                    className="w-full bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white py-3 rounded-xl text-sm font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl transition-all duration-200"
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
                        className="w-full px-4 py-3 bg-slate-900/50 border-2 border-slate-600 rounded-xl text-sm font-medium text-white placeholder:text-slate-500 focus:ring-4 focus:ring-blue-500/50 focus:border-blue-500 transition-all outline-none"
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
                      className="flex-1 px-4 py-3 border-2 border-slate-600 hover:bg-slate-700 rounded-xl text-sm font-semibold text-slate-300 transition-all"
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
                      className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white py-3 rounded-xl text-sm font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl transition-all duration-200"
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
