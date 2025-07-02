import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Package,
  Loader2,
  AlertCircle,
  Barcode,
  CheckCircle,
} from "lucide-react";

/* ---------- interface + mock ---------- */
interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  promotionalPrice?: number;
  brand: string;
  category: string;
  image: string;
  availability: "in-stock" | "out-of-stock" | "limited";
}
const mockProducts: Record<string, Product> = {
  "7891000100103": {
    id: "7891000100103",
    name: "Coca-Cola Original 350ml",
    description: "Refrigerante Coca-Cola Original lata 350ml",
    price: 4.99,
    promotionalPrice: 3.99,
    brand: "Coca-Cola",
    category: "Bebidas",
    image:
      "https://images.pexels.com/photos/50593/coca-cola-cold-drink-soft-drink-coke-50593.jpeg?auto=compress&cs=tinysrgb&w=400",
    availability: "in-stock",
  },
  "7891000055502": {
    id: "7891000055502",
    name: "Guaraná Antarctica 350ml",
    description: "Refrigerante Guaraná Antarctica lata 350ml",
    price: 4.5,
    brand: "Antarctica",
    category: "Bebidas",
    image:
      "https://images.pexels.com/photos/8919563/pexels-photo-8919563.jpeg?auto=compress&cs=tinysrgb&w=400",
    availability: "in-stock",
  },
  "7891000244234": {
    id: "7891000244234",
    name: "Água Mineral Crystal 500ml",
    description: "Água mineral natural Crystal garrafa 500ml",
    price: 2.99,
    promotionalPrice: 2.49,
    brand: "Crystal",
    category: "Bebidas",
    image:
      "https://images.pexels.com/photos/327090/pexels-photo-327090.jpeg?auto=compress&cs=tinysrgb&w=400",
    availability: "limited",
  },
};

/* ---------- constantes ---------- */
const RESET_DELAY_MS = 15000; // 15 s
const FOCUS_CHECK_MS = 2000; // 2 s

function App() {
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  /* ---- limpa e reinicia o reset timer ---- */
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

    /* ⚠️ cancela qualquer timer ativo ao iniciar nova busca */
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

    setLoading(true);
    setError("");
    setProduct(null);

    await new Promise((r) => setTimeout(r, 700)); // mock delay

    const found = mockProducts[barcode];
    if (found) {
      setProduct(found);
      setHistory((prev) =>
        [barcode, ...prev.filter((c) => c !== barcode)].slice(0, 5)
      );
    } else {
      setError("Produto não encontrado. Verifique o código de barras.");
    }

    /* limpa input p/ próxima leitura */
    setBarcode("");
    setLoading(false);
    inputRef.current?.focus();
  };

  /* busca automática (13 dígitos) */
  useEffect(() => {
    if (barcode.length === 13 && !loading) handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcode]);

  /* inicia/renova timer assim que há produto ou erro na tela e não está carregando */
  useEffect(() => {
    if (!loading && (product || error)) startResetTimer();
  }, [product, error, loading]);

  /* garante foco permanente */
  useEffect(() => {
    const id = setInterval(() => {
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    }, FOCUS_CHECK_MS);
    return () => clearInterval(id);
  }, []);

  /* helpers */
  const availabilityColor = (a: string) =>
    ({
      "in-stock": "text-emerald-600 bg-emerald-50",
      limited: "text-orange-600 bg-orange-50",
      "out-of-stock": "text-red-600 bg-red-50",
    }[a] || "text-gray-600 bg-gray-50");
  const availabilityText = (a: string) =>
    ({
      "in-stock": "Em estoque",
      limited: "Estoque limitado",
      "out-of-stock": "Fora de estoque",
    }[a] || "Indisponível");

  /* ---------- UI ---------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50">
      {/* header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-blue-100">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <Barcode className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">
            Scanner de Produtos
          </h1>
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
            <div className="md:flex">
              <img
                src={product.image}
                alt={product.name}
                className="md:w-1/3 w-full h-64 md:h-full object-cover"
              />
              <div className="md:w-2/3 p-6">
                <div className="flex justify-between mb-4">
                  <div>
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
                  <div
                    className={`px-3 py-1 rounded-full text-sm font-medium ${availabilityColor(
                      product.availability
                    )}`}
                  >
                    {availabilityText(product.availability)}
                  </div>
                </div>

                <div className="flex justify-between">
                  <div className="text-right">
                    {product.promotionalPrice ? (
                      <>
                        <p className="text-sm text-gray-500 line-through">
                          R$ {product.price.toFixed(2)}
                        </p>
                        <p className="text-2xl font-bold text-emerald-600">
                          R$ {product.promotionalPrice.toFixed(2)}
                        </p>
                        <p className="text-xs text-emerald-600 font-medium">
                          Economia: R$
                          {(product.price - product.promotionalPrice).toFixed(
                            2
                          )}
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

                {product.promotionalPrice && (
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
          </div>
        )}
      </main>
      {/* FOOTER */}
      <footer className="bg-white/80 backdrop-blur-md border-t border-blue-100">
        <div className="max-w-4xl mx-auto px-4 py-3 text-center text-sm text-gray-600 flex items-center justify-center gap-1">
          Desenvolvido &nbsp;por&nbsp;
          <span className="font-semibold text-blue-600">Inova&nbsp;Tec</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
