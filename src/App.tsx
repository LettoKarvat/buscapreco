/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Package,
  Loader2,
  AlertCircle,
  Barcode,
  CheckCircle,
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
const API_BASE = "https://53bb-206-84-60-250.ngrok-free.app";
const RESET_DELAY_MS = 15_000;
const FOCUS_CHECK_MS = 2_000;

export default function App() {
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  /* ---- limpa e reinicia o timer de reset ---- */
  const startResetTimer = () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setProduct(null);
      setError("");
      setBarcode("");
      inputRef.current?.focus();
    }, RESET_DELAY_MS);
  };

  /* ---- BUSCA ---- */
  const handleSearch = async () => {
    if (!barcode.trim()) {
      setError("Por favor, insira um código de barras");
      return;
    }

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

    setLoading(true);
    setError("");
    setProduct(null);

    try {
      const resp = await fetch(`${API_BASE}/test-api/product/${barcode}`, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });

      if (!resp.ok) {
        const { error: msg } = await resp.json();
        throw new Error("Produto não encontrado");
      }

      const data: {
        CODPROD: string;
        DESCRICAO: string;
        PRECO: number | null;
        PRECOPROMO?: number | null;
        MARCA: string;
        CATEGORIA: string;
      } = await resp.json();

      const formatted: Product = {
        id: data.CODPROD,
        name: data.DESCRICAO,
        description: data.DESCRICAO,
        price: typeof data.PRECO === "number" ? data.PRECO : 0,
        promotionalPrice:
          typeof data.PRECOPROMO === "number" ? data.PRECOPROMO : undefined,
        brand: data.MARCA ?? "",
        category: data.CATEGORIA ?? "",
      };

      setProduct(formatted);
      setHistory((prev) =>
        [barcode, ...prev.filter((c) => c !== barcode)].slice(0, 5)
      );
    } catch (err: any) {
      setError(err.message || "Falha na busca do produto");
    }

    setBarcode("");
    setLoading(false);
    inputRef.current?.focus();
  };

  /* busca automática (13 dígitos) */
  useEffect(() => {
    if (barcode.length === 13 && !loading) handleSearch();
  }, [barcode]);

  /* reinicia timer quando há produto ou erro */
  useEffect(() => {
    if (!loading && (product || error)) startResetTimer();
  }, [product, error, loading]);

  /* garante foco permanente no input */
  useEffect(() => {
    const id = setInterval(() => {
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    }, FOCUS_CHECK_MS);
    return () => clearInterval(id);
  }, []);

  /* ---------- UI ---------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50">
      {/* header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-blue-100">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col items-center">
          <img
            src="https://iili.io/F0MLICg.png"
            alt="Supermercado São Geraldo"
            className="h-24 md:h-32 w-auto"
          />
          <div className="mt-6 flex items-center gap-3">
            <div className="p-3 bg-blue-600 rounded-lg">
              <Barcode className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800">
              Scanner de Produtos
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* card busca */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border border-blue-100">
          <label
            htmlFor="barcode"
            className="block text-sm font-semibold text-gray-700 mb-2"
          >
            Código de Barras
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
              className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
            />
            <Package className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          </div>

          <button
            onClick={handleSearch}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Buscando…</span>
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                <span>Buscar Produto</span>
              </>
            )}
          </button>

          {/* histórico */}
          {history.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Buscas recentes:
              </p>
              <div className="flex flex-wrap gap-2">
                {history.map((c) => (
                  <button
                    key={c}
                    onClick={() => setBarcode(c)}
                    className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full hover:bg-gray-200"
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
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-blue-100 hover:shadow-xl">
            <div className="p-6">
              <div className="flex justify-between mb-4">
                <div className="pr-4">
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    {product.name}
                  </h2>
                  <p className="text-gray-600 mb-2">{product.description}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="font-medium">{product.brand}</span>
                    <span>•</span>
                    <span>{product.category}</span>
                  </div>
                </div>

                {/* selo removido */}
              </div>

              <div className="flex justify-between">
                <div className="text-right">
                  {typeof product.promotionalPrice === "number" ? (
                    <>
                      <p className="text-sm text-gray-500 line-through">
                        R$ {product.price.toFixed(2)}
                      </p>
                      <p className="text-2xl font-bold text-emerald-600">
                        R$ {product.promotionalPrice.toFixed(2)}
                      </p>
                      <p className="text-xs text-emerald-600 font-medium">
                        Economia: R$
                        {(product.price - product.promotionalPrice).toFixed(2)}
                      </p>
                    </>
                  ) : (
                    <p className="text-2xl font-bold text-gray-800">
                      R$ {product.price.toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>Código: {product.id}</span>
                </div>
              </div>

              {typeof product.promotionalPrice === "number" && (
                <div className="mt-4 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <p className="text-emerald-700 text-sm font-medium">
                    🎉 Economia de{" "}
                    {(
                      ((product.price - product.promotionalPrice) /
                        product.price) *
                      100
                    ).toFixed(0)}
                    %
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* footer */}
      <footer className="bg-white/80 backdrop-blur-md border-t border-blue-100">
        <div className="max-w-4xl mx-auto px-4 py-3 text-center text-sm text-gray-600 flex items-center justify-center gap-1">
          Desenvolvido por
          <span className="font-semibold text-blue-600">
            Faives Soluções e Tecnologias
          </span>
        </div>
      </footer>
    </div>
  );
}
