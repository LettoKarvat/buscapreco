/* eslint-disable react-hooks/exhaustive-deps */
import Icon from "./resources/icon.png";
import React, { useState, useEffect, useRef } from "react";
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

/* ---------- tipos ---------- */
interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  promotionalPrice?: number;
  brand: string;
  category: string;
}

/* ---------- constantes ---------- */
const DEFAULT_API_BASE = "https://3e204be18720.ngrok-free.app";
const RESET_DELAY_MS = 15_000;
const FOCUS_CHECK_MS = 2_000;
const CONFIG_PASSWORD = "F@ives25";

export default function App() {
  // API base, filial e região vêm de localStorage ou usam valores padrão
  const [apiBase, setApiBase] = useState<string>(
    () => localStorage.getItem("apiBase") || DEFAULT_API_BASE
  );
  const [filial, setFilial] = useState<string>(
    () => localStorage.getItem("filial") || "1"
  );
  const [numregiao, setNumregiao] = useState<string>(
    () => localStorage.getItem("numregiao") || "1"
  );

  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  // modal de configurações
  const [showSettings, setShowSettings] = useState(false);
  const [tmpApiBase, setTmpApiBase] = useState(apiBase);
  const [tmpFilial, setTmpFilial] = useState(filial);
  const [tmpNumreg, setTmpNumreg] = useState(numregiao);
  const [passwordInput, setPasswordInput] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pwdError, setPwdError] = useState("");

  /* ---- limpa e reinicia o timer de reset ---- */
  const startResetTimer = () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setProduct(null);
      setError("");
      setBarcode("");
      if (!showSettings) inputRef.current?.focus();
    }, RESET_DELAY_MS);
  };

  /* ---- BUSCA ---- */
  const handleSearch = async () => {
    if (!barcode.trim()) {
      setError("Por favor, insira um código auxiliar");
      return;
    }
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

    setLoading(true);
    setError("");
    setProduct(null);

    try {
      const resp = await fetch(
        `${apiBase}/test-api/product/price` +
          `?codfilial=${filial}&numregiao=${numregiao}&codauxiliar=${barcode}`,
        { headers: { "ngrok-skip-browser-warning": "true" } }
      );
      if (!resp.ok) {
        const { error: msg } = await resp.json();
        throw new Error(msg || "Produto não encontrado");
      }
      const data: {
        CODPROD: string;
        DESCRICAO: string;
        PRECO_VAREJO: number;
      } = await resp.json();

      setProduct({
        id: data.CODPROD,
        name: data.DESCRICAO,
        description: data.DESCRICAO,
        price: data.PRECO_VAREJO,
        promotionalPrice: undefined,
        brand: "",
        category: "",
      });
      setHistory((prev) =>
        [barcode, ...prev.filter((c) => c !== barcode)].slice(0, 5)
      );
    } catch (err: any) {
      setError(err.message || "Falha na busca do produto");
    }

    setBarcode("");
    setLoading(false);
    if (!showSettings) inputRef.current?.focus();
  };

  /* persiste as configurações no localStorage */
  useEffect(() => {
    localStorage.setItem("apiBase", apiBase);
    localStorage.setItem("filial", filial);
    localStorage.setItem("numregiao", numregiao);
  }, [apiBase, filial, numregiao]);

  /* busca automática (13 dígitos) */
  useEffect(() => {
    if (barcode.length === 13 && !loading) handleSearch();
  }, [barcode]);

  /* reinicia timer quando há produto ou erro */
  useEffect(() => {
    if (!loading && (product || error)) startResetTimer();
  }, [product, error, loading]);

  /* foca input enquanto modal fechado */
  useEffect(() => {
    const id = setInterval(() => {
      if (
        !showSettings &&
        inputRef.current &&
        document.activeElement !== inputRef.current
      ) {
        inputRef.current.focus();
      }
    }, FOCUS_CHECK_MS);
    return () => clearInterval(id);
  }, [showSettings]);

  /* desbloqueia config se senha correta */
  const verifyPassword = () => {
    if (passwordInput === CONFIG_PASSWORD) {
      setIsUnlocked(true);
      setPwdError("");
    } else {
      setPwdError("Senha incorreta");
    }
  };

  /* salva configurações e fecha modal */
  const saveSettings = () => {
    if (!isUnlocked) return;
    setApiBase(tmpApiBase);
    setFilial(tmpFilial);
    setNumregiao(tmpNumreg);
    setShowSettings(false);
    setIsUnlocked(false);
    setPasswordInput("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50">
      {/* header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-blue-100">
        <div className="relative max-w-6xl mx-auto px-6 py-8 flex flex-col items-center">
          <img
            src={Icon}
            alt="Supermercado São Geraldo"
            className="h-32 md:h-40 w-auto"
          />

          <div className="mt-6 flex items-center gap-3">
            <div className="p-3 bg-blue-600 rounded-lg">
              <Barcode className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800">
              Scanner de Produtos
            </h1>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="absolute top-6 right-6"
          >
            <Settings className="w-6 h-6 text-gray-600 hover:text-gray-800" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* card busca */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border border-blue-100">
          <label
            htmlFor="barcode"
            className="block text-sm font-semibold text-gray-700 mb-2"
          >
            Código Auxiliar
          </label>
          <div className="relative mb-6">
            <input
              ref={inputRef}
              id="barcode"
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Digite ou escaneie"
              autoFocus
              disabled={loading}
              className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-lg"
            />
            <Package className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Search className="w-5 h-5" />
            )}
            <span>{loading ? "Buscando…" : "Buscar"}</span>
          </button>

          {/* histórico */}
          {history.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Últimos auxiliares:
              </p>
              <div className="flex flex-wrap gap-2">
                {history.map((c) => (
                  <button
                    key={c}
                    onClick={() => setBarcode(c)}
                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 text-sm"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* erro */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-700 font-medium">{error}</span>
          </div>
        )}

        {/* produto */}
        {product && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border border-blue-100 hover:shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-1">
                  {product.name}
                </h2>
                <p className="text-gray-600">{product.description}</p>
              </div>
              <div className="text-2xl font-bold text-gray-800">
                R$ {product.price.toFixed(2)}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Código: {product.id}</span>
            </div>
          </div>
        )}
      </main>

      {/* footer */}
      <footer className="bg-white/80 backdrop-blur-md border-t border-blue-100 py-3 text-center text-sm text-gray-600">
        Desenvolvido por{" "}
        <span className="font-semibold text-blue-600">
          Faives Soluções em Tecnologia
        </span>
      </footer>

      {/* modal de configurações */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-80 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Configurações</h3>
              <button onClick={() => setShowSettings(false)}>
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {!isUnlocked ? (
              <>
                <label className="block text-sm font-medium text-gray-700">
                  Senha
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg mb-2"
                />
                {pwdError && (
                  <p className="text-sm text-red-600 mb-2">{pwdError}</p>
                )}
                <button
                  onClick={verifyPassword}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg"
                >
                  Verificar
                </button>
              </>
            ) : (
              <>
                <label className="block text-sm font-medium text-gray-700">
                  URL do ngrok
                </label>
                <input
                  type="text"
                  value={tmpApiBase}
                  onChange={(e) => setTmpApiBase(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg mb-4"
                />
                <label className="block text-sm font-medium text-gray-700">
                  Filial
                </label>
                <input
                  type="text"
                  value={tmpFilial}
                  onChange={(e) => setTmpFilial(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg mb-4"
                />
                <label className="block text-sm font-medium text-gray-700">
                  Região
                </label>
                <input
                  type="text"
                  value={tmpNumreg}
                  onChange={(e) => setTmpNumreg(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg mb-6"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowSettings(false);
                      setIsUnlocked(false);
                      setPasswordInput("");
                    }}
                    className="px-4 py-2 rounded-lg border"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveSettings}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg"
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
