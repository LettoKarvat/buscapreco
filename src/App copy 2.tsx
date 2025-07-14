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
} from "lucide-react";
import { Keyboard } from "@capacitor/keyboard";
import { registerPlugin } from "@capacitor/core";

/* ──────────── plugin nativo que acende o laser ──────────── */
const ScannerPlugin = registerPlugin("ScannerPlugin");

/* ─────────────── tipos ─────────────── */
interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  promotionalPrice?: number;
  brand: string;
  category: string;
}

/* ───────────── constantes ───────────── */
const DEFAULT_API_BASE = "https://3e204be18720.ngrok-free.app";
const RESET_DELAY_MS = 15_000;
const CONFIG_PASSWORD = "F@ives25";

/* ───────────────────────────────────────── */
export default function App() {
  /* ─── 1. esconda teclado ao iniciar ─── */
  useEffect(() => {
    Keyboard.hide().catch(() => {});
  }, []);

  /* ─── 2. estado ─── */
  const [apiBase, setApiBase] = useState(
    () => localStorage.getItem("apiBase") || DEFAULT_API_BASE
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

  /* modal */
  const [showCfg, setShowCfg] = useState(false);
  const [tmpApi, setTmpApi] = useState(apiBase);
  const [tmpFil, setTmpFil] = useState(filial);
  const [tmpReg, setTmpReg] = useState(numReg);
  const [pwd, setPwd] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [pwdErr, setPwdErr] = useState("");

  /* refs */
  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const focusTimerRef = useRef<NodeJS.Timeout | null>(null);

  /* ─── 3. mostra/oculta teclado conforme modal ─── */
  useEffect(() => {
    (showCfg ? Keyboard.show() : Keyboard.hide()).catch(() => {});
  }, [showCfg]);

  /* ─── 4. persiste config ─── */
  useEffect(() => {
    localStorage.setItem("apiBase", apiBase);
    localStorage.setItem("filial", filial);
    localStorage.setItem("numregiao", numReg);
  }, [apiBase, filial, numReg]);

  /* ─── 5. busca na API ─── */
  const apiSearch = useCallback(
    async (code: string) => {
      if (!code) return;
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

      setLoading(true);
      setError("");
      setProduct(null);

      try {
        const r = await fetch(
          `${apiBase}/test-api/product/price?codfilial=${filial}&numregiao=${numReg}&codauxiliar=${code}`,
          { headers: { "ngrok-skip-browser-warning": "true" } }
        );
        if (!r.ok) {
          const { error: msg } = await r.json();
          throw new Error(msg || "Produto não encontrado");
        }
        const data: {
          CODPROD: string;
          DESCRICAO: string;
          PRECO_VAREJO: number;
        } = await r.json();
        setProduct({
          id: data.CODPROD,
          name: data.DESCRICAO,
          description: data.DESCRICAO,
          price: data.PRECO_VAREJO,
        });
        setHistory((prev) =>
          [code, ...prev.filter((c) => c !== code)].slice(0, 5)
        );
      } catch (e: any) {
        setError(e.message || "Falha na busca");
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

  /* ─── 6. listener do plugin (liga laser no load) ─── */
  useEffect(() => {
    const sub = ScannerPlugin.addListener(
      "scan",
      ({ code }: { code: string }) => processScan(code)
    );
    return () => {
      sub.remove();
      // desliga laser (se o plugin expôs stop)
      ScannerPlugin.stop?.().catch(() => {});
    };
  }, [processScan]);

  /* ─── 7. fallback: broadcast + wedge ─── */
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

  /* ─── 8. foco no input invisível ─── */
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

  /* ─── 9. JSX ─── */
  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-blue-50 via-white to-emerald-50 overflow-hidden">
      {/* header */}
      <header className="flex-none bg-white/80 backdrop-blur-md border-b border-blue-100 shadow-sm">
        <div className="relative mx-auto w-full max-w-4xl px-4 py-3 flex flex-col items-center">
          <img src={Icon} alt="Logo" className="h-20 w-auto" />
          <div className="mt-2 flex items-center gap-2">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Barcode className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-800">
              Scanner de Produtos
            </h1>
          </div>
          <button
            onClick={() => setShowCfg(true)}
            className="absolute top-2 right-3"
          >
            <Settings className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </header>

      {/* corpo */}
      <main className="flex-1 flex flex-col items-center justify-start px-3 pt-3">
        {/* input invisível */}
        <input
          ref={inputRef}
          value={barcode}
          readOnly
          inputMode="none"
          autoFocus
          {...({ virtualkeyboardpolicy: "manual" } as any)}
          className="absolute opacity-0 pointer-events-none"
        />

        {/* card */}
        <section className="w-full max-w-md bg-white rounded-xl border border-blue-100 shadow p-3 flex flex-col gap-2">
          <div className="relative">
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && processScan(barcode)}
              placeholder="Escaneie ou digite"
              disabled={loading}
              inputMode="none"
              {...({ virtualkeyboardpolicy: "manual" } as any)}
              className="w-full px-4 py-2 pl-9 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 caret-transparent"
            />
            <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>

          <button
            onClick={() => processScan(barcode)}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg flex items-center justify-center gap-1.5 text-sm font-medium"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            {loading ? "Buscando…" : "Buscar"}
          </button>

          {history.length > 0 && (
            <div className="pt-1 border-t border-gray-200">
              <p className="text-xs font-medium text-gray-700 mb-1">Últimos:</p>
              <div className="flex flex-wrap gap-1.5">
                {history.map((c) => (
                  <button
                    key={c}
                    onClick={() => processScan(c)}
                    className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* mensagens */}
        {error && (
          <div className="mt-2 w-full max-w-md bg-red-50 border border-red-200 rounded-lg p-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span className="text-red-700 text-xs">{error}</span>
          </div>
        )}

        {/* produto */}
        {product && (
          <section className="mt-2 w-full max-w-md bg-white rounded-xl border border-blue-100 shadow p-3">
            <h2 className="text-base font-bold text-gray-800 truncate">
              {product.name}
            </h2>
            <p className="text-gray-600 text-xs line-clamp-2">
              {product.description}
            </p>
            <div className="flex justify-between items-center mt-1">
              <span className="text-lg font-bold text-gray-800">
                R$ {product.price.toFixed(2)}
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <CheckCircle className="w-4 h-4 text-emerald-600" /> Cód.{" "}
                {product.id}
              </span>
            </div>
          </section>
        )}
      </main>

      {/* rodapé */}
      <footer className="flex-none bg-white/80 backdrop-blur-md border-t border-blue-100 text-center text-xs py-1">
        Desenvolvido por{" "}
        <span className="font-semibold text-blue-600">
          Faives Soluções em Tecnologia
        </span>
      </footer>

      {/* modal config */}
      {showCfg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-72 p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold">Configurações</h3>
              <button
                onClick={() => {
                  setShowCfg(false);
                  setUnlocked(false);
                  setPwd("");
                }}
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            {!unlocked ? (
              <>
                <label className="text-xs font-medium text-gray-700">
                  Senha
                </label>
                <input
                  type="password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-lg mb-1 text-xs"
                  autoFocus
                />
                {pwdErr && (
                  <p className="text-xs text-red-600 mb-1">{pwdErr}</p>
                )}
                <button
                  onClick={() => {
                    if (pwd === CONFIG_PASSWORD) {
                      setUnlocked(true);
                      setPwdErr("");
                    } else {
                      setPwdErr("Senha incorreta");
                    }
                  }}
                  className="w-full bg-blue-600 text-white py-1.5 rounded-lg text-xs"
                >
                  Verificar
                </button>
              </>
            ) : (
              <>
                {[
                  { lbl: "URL ngrok", val: tmpApi, set: setTmpApi },
                  { lbl: "Filial", val: tmpFil, set: setTmpFil },
                  { lbl: "Região", val: tmpReg, set: setTmpReg },
                ].map(({ lbl, val, set }) => (
                  <React.Fragment key={lbl}>
                    <label className="text-xs font-medium text-gray-700">
                      {lbl}
                    </label>
                    <input
                      value={val}
                      onChange={(e) => set(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-lg mb-2 text-xs"
                    />
                  </React.Fragment>
                ))}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowCfg(false);
                      setUnlocked(false);
                      setPwd("");
                    }}
                    className="px-3 py-1.5 border rounded-lg text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      setApiBase(tmpApi);
                      setFilial(tmpFil);
                      setNumReg(tmpReg);
                      setShowCfg(false);
                      setUnlocked(false);
                      setPwd("");
                    }}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs"
                  >
                    Salvar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
