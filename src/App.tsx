import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  ExternalLink,
  Heart,
  Info,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Menu,
  PackageCheck,
  Search,
  Share2,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getApiStatus, getRewaltoCatalog, lookupProduct, validateProductUrl } from "./api";
import { demoProducts } from "./demo";
import type { ApiStatus, AppPage, DataMode, PriceObservation, PriceRange, Product } from "./types";

type Screen = AppPage | "product";

const trackedStorageKey = "dealsense.tracked.v1";
const recentStorageKey = "dealsense.recent.v1";
const modeStorageKey = "dealsense.mode.v1";
const currentStorageKey = "dealsense.current.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPriceObservation(value: unknown): value is PriceObservation {
  if (!isRecord(value)) return false;
  return (
    (typeof value.id === "string" || typeof value.id === "number") &&
    typeof value.observedAt === "string" &&
    (value.priceMinor === null || typeof value.priceMinor === "number") &&
    (value.mrpMinor === undefined || value.mrpMinor === null || typeof value.mrpMinor === "number") &&
    (value.currency === undefined || typeof value.currency === "string") &&
    (value.inStock === undefined || value.inStock === null || typeof value.inStock === "boolean")
  );
}

function isProduct(value: unknown): value is Product {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    (value.source === "demo" || value.source === "rewalto") &&
    typeof value.title === "string" &&
    (value.brand === null || typeof value.brand === "string") &&
    typeof value.retailer === "string" &&
    (value.retailerSku === undefined || typeof value.retailerSku === "string") &&
    (value.imageUrl === null || typeof value.imageUrl === "string") &&
    (value.productUrl === null || typeof value.productUrl === "string") &&
    (value.priceMinor === null || typeof value.priceMinor === "number") &&
    (value.mrpMinor === null || typeof value.mrpMinor === "number") &&
    typeof value.currency === "string" &&
    (value.inStock === null || typeof value.inStock === "boolean") &&
    (value.observedAt === null || typeof value.observedAt === "string") &&
    Array.isArray(value.observations) &&
    value.observations.every(isPriceObservation) &&
    (value.historyTruncated === undefined || typeof value.historyTruncated === "boolean")
  );
}

function isProductList(value: unknown): value is Product[] {
  return Array.isArray(value) && value.every(isProduct);
}

function isMode(value: unknown): value is DataMode {
  return value === "demo" || value === "real";
}

function isCurrentProduct(value: unknown): value is Product | null {
  return value === null || isProduct(value);
}

const navItems: Array<{ id: AppPage; label: string; icon: typeof LayoutDashboard }> = [
  { id: "home", label: "Overview", icon: LayoutDashboard },
  { id: "tracked", label: "My tracking", icon: Activity },
];

const rangeOptions: Array<{ id: PriceRange; label: string }> = [
  { id: "7D", label: "7 days" },
  { id: "30D", label: "30 days" },
  { id: "90D", label: "90 days" },
  { id: "ALL", label: "All history" },
];

function getStored<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  const parsed: unknown = JSON.parse(raw);
  if (!isValid(parsed)) throw new Error(`Saved value for ${key} has an unexpected format.`);
  return parsed;
}

function toPrice(observation: PriceObservation): number | null {
  return observation.priceMinor === null ? null : observation.priceMinor / 100;
}

function formatPrice(value: number | null, currency = "INR"): string {
  if (value === null || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString("en-IN")}`;
  }
}

function formatDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", options ?? { day: "numeric", month: "short" }).format(date);
}

function ProductImage({ product, className = "" }: { product: Product; className?: string }) {
  const [failed, setFailed] = useState(false);
  return product.imageUrl && !failed ? (
    <img className={`product-image ${className}`} src={product.imageUrl} alt={product.title} onError={() => setFailed(true)} />
  ) : (
    <div className={`product-image image-placeholder ${className}`}>
      <ShoppingBag size={26} />
    </div>
  );
}

function SourceBadge({ source }: { source: Product["source"] }) {
  return source === "demo" ? (
    <span className="source-badge demo-badge"><Sparkles size={12} /> DEMO DATA</span>
  ) : (
    <span className="source-badge real-badge"><ShieldCheck size={12} /> REWALTO DATA</span>
  );
}

function getPriceRecommendation(product: Product) {
  const prices = product.observations
    .map(toPrice)
    .filter((price): price is number => price !== null && price > 0);
  const current = product.priceMinor === null ? null : product.priceMinor / 100;
  if (prices.length < 3 || current === null) {
    return {
      title: "Not enough data",
      text: "There are not enough recorded prices to make a reliable recommendation.",
      icon: CircleHelp,
      tone: "neutral",
    };
  }
  const low = Math.min(...prices);
  const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  if (current <= low * 1.03) {
    return {
      title: "Buy now",
      text: "The current price is close to the lowest recorded price for this product.",
      icon: TrendingDown,
      tone: "good",
    };
  }
  if (current < average * 0.92) {
    return {
      title: "Good deal",
      text: "This product is currently priced below its recorded average.",
      icon: BadgeCheck,
      tone: "good",
    };
  }
  if (current > average * 1.05) {
    return {
      title: "Wait for a drop",
      text: "The current price is higher than its recorded average. Consider waiting.",
      icon: TrendingUp,
      tone: "wait",
    };
  }
  return {
    title: "Fair price",
    text: "The current price is close to the recorded average for this product.",
    icon: Activity,
    tone: "neutral",
  };
}

function historyForRange(observations: PriceObservation[], range: PriceRange) {
  const usable = observations
    .filter((observation) => observation.priceMinor !== null)
    .sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt));
  if (range === "ALL" || usable.length === 0) return usable;
  const days = Number.parseInt(range, 10);
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return usable.filter((observation) => Date.parse(observation.observedAt) >= since);
}

function PriceChart({
  product,
  range,
  onRangeChange,
}: {
  product: Product;
  range: PriceRange;
  onRangeChange: (range: PriceRange) => void;
}) {
  const visible = useMemo(() => historyForRange(product.observations, range), [product.observations, range]);
  const chartData = visible.map((observation) => ({
    date: observation.observedAt,
    price: toPrice(observation) ?? 0,
  }));
  const currency = product.currency || "INR";
  const stroke = product.source === "demo" ? "#8b76f2" : "#31ae8b";

  return (
    <section className="panel chart-panel">
      <div className="panel-heading chart-heading">
        <div>
          <div className="eyebrow">PRICE PERFORMANCE</div>
          <h2>Price history</h2>
        </div>
        <div className="range-switch" role="group" aria-label="Price history time range">
          {rangeOptions.map((option) => (
            <button
              className={range === option.id ? "range-option selected" : "range-option"}
              type="button"
              onClick={() => onRangeChange(option.id)}
              key={option.id}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {visible.length > 0 ? (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.19} />
                  <stop offset="95%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eef0f6" strokeDasharray="4 5" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => formatDate(value)}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#969bb0", fontSize: 11 }}
                minTickGap={28}
                dy={12}
              />
              <YAxis
                tickFormatter={(value: number) => `₹${Math.round(value / 1000)}k`}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#969bb0", fontSize: 11 }}
                width={43}
                domain={["dataMin - 300", "dataMax + 300"]}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="chart-tooltip">
                      <span>{formatDate(String(label), { day: "numeric", month: "long", year: "numeric" })}</span>
                      <strong>{formatPrice(Number(payload[0].value), currency)}</strong>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={stroke}
                strokeWidth={3}
                fill="url(#priceGradient)"
                activeDot={{ r: 5, fill: stroke, stroke: "#fff", strokeWidth: 3 }}
                dot={false}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="chart-empty">
          <BarChart3 size={27} />
          <strong>No price observations in this period</strong>
          <span>Try a longer date range or check back when more data is available.</span>
        </div>
      )}
      <div className="chart-footnote">
        <span><i className={`legend-dot ${product.source === "demo" ? "dot-demo" : ""}`} /> Recorded price</span>
        <span>{visible.length} observation{visible.length === 1 ? "" : "s"}</span>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "",
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Tag;
  tone?: string;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={17} /></div>
      <div className="stat-label">{label}</div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </div>
  );
}

function ProductDetail({
  product,
  onBack,
  tracked,
  onToggleTracked,
  onRangeChange,
  range,
}: {
  product: Product;
  onBack: () => void;
  tracked: boolean;
  onToggleTracked: () => void;
  onRangeChange: (range: PriceRange) => void;
  range: PriceRange;
}) {
  const price = product.priceMinor === null ? null : product.priceMinor / 100;
  const mrp = product.mrpMinor === null ? null : product.mrpMinor / 100;
  const prices = product.observations
    .map(toPrice)
    .filter((value): value is number => value !== null && value > 0);
  const low = prices.length ? Math.min(...prices) : null;
  const high = prices.length ? Math.max(...prices) : null;
  const average = prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null;
  const ordered = [...product.observations].sort(
    (left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt),
  );
  const latestObservation = ordered.at(-1);
  const previousObservation = ordered.length > 1 ? ordered.at(-2) : undefined;
  const previousPrice = previousObservation?.priceMinor === null || !previousObservation
    ? null
    : previousObservation.priceMinor / 100;
  const lastChange =
    price !== null && previousPrice !== null ? price - previousPrice : null;
  const recommendation = getPriceRecommendation(product);
  const RecommendationIcon = recommendation.icon;
  const discount = price !== null && mrp !== null && mrp > 0 ? Math.round((1 - price / mrp) * 100) : null;

  return (
    <div className="page-stack">
      <button className="back-link" type="button" onClick={onBack}><ArrowLeft size={16} /> Back to overview</button>
      {product.source === "demo" && (
        <div className="demo-notice"><Sparkles size={16} /><span><strong>DEMO DATA</strong> — Sample product and sample price observations. This product was not matched to your pasted link.</span></div>
      )}
      <div className="product-detail-head">
        <div className="product-detail-image-wrap"><ProductImage product={product} /></div>
        <div className="product-intro">
          <div className="product-intro-tags"><SourceBadge source={product.source} /><span className="retailer-pill"><ShoppingBag size={12} /> {product.retailer}</span></div>
          <h1>{product.title}</h1>
          <p>{product.brand ? `${product.brand} · ` : ""}Price history and availability</p>
          <div className="price-row">
            <strong>{formatPrice(price, product.currency)}</strong>
            {mrp !== null && mrp > (price ?? 0) && <del>{formatPrice(mrp, product.currency)}</del>}
            {discount !== null && discount > 0 && <span className="discount-tag">{discount}% off</span>}
          </div>
          <div className="availability-row">
            <span className={product.inStock === true ? "availability available" : product.inStock === false ? "availability unavailable" : "availability unknown"}>
              <i /> {product.inStock === true ? "In stock" : product.inStock === false ? "Out of stock" : "Availability unknown"}
            </span>
            {product.observedAt && <span className="updated-text"><Clock3 size={13} /> Updated {formatDate(product.observedAt, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>}
          </div>
        </div>
        <div className="product-actions">
          <button className={`secondary-button ${tracked ? "is-tracked" : ""}`} type="button" onClick={onToggleTracked}>
            {tracked ? <Check size={16} /> : <Heart size={16} />} {tracked ? "Tracking" : "Track price"}
          </button>
          {product.productUrl ? (
            <a className="primary-button compact-button" href={product.productUrl} target="_blank" rel="noreferrer">
              Visit store <ExternalLink size={15} />
            </a>
          ) : (
            <span className="link-unavailable"><Info size={14} /> Store link unavailable in demo</span>
          )}
        </div>
      </div>

      <div className={`recommendation-card ${recommendation.tone}`}>
        <div className="recommendation-icon"><RecommendationIcon size={20} /></div>
        <div><div className="eyebrow">DEALSENSE RECOMMENDATION</div><strong>{recommendation.title}</strong><p>{recommendation.text}</p></div>
        <span className="recommendation-rule"><Sparkles size={14} /> Based on {prices.length} observation{prices.length === 1 ? "" : "s"}</span>
      </div>

      <div className="stats-grid">
        <StatCard label="Lowest recorded" value={formatPrice(low, product.currency)} note="Across available history" icon={TrendingDown} tone="green" />
        <StatCard label="Highest recorded" value={formatPrice(high, product.currency)} note="Across available history" icon={TrendingUp} tone="orange" />
        <StatCard label="Average price" value={formatPrice(average, product.currency)} note={`${prices.length} recorded prices`} icon={BarChart3} tone="violet" />
        <StatCard
          label="Since last reading"
          value={lastChange === null ? "—" : `${lastChange > 0 ? "+" : ""}${formatPrice(lastChange, product.currency)}`}
          note={previousObservation && latestObservation ? `${formatDate(previousObservation.observedAt)} → ${formatDate(latestObservation.observedAt)}` : "Need two observations"}
          icon={lastChange !== null && lastChange < 0 ? ArrowDownRight : Activity}
          tone={lastChange !== null && lastChange < 0 ? "green" : ""}
        />
      </div>

      <PriceChart product={product} range={range} onRangeChange={onRangeChange} />
      {product.historyTruncated && <div className="inline-note"><Info size={15} /> This chart shows the newest 100 observations returned by Rewalto. More history is available from the provider but is not loaded by this prototype.</div>}
      {product.source === "rewalto" && prices.length === 0 && (
        <div className="inline-note"><Info size={15} /> Rewalto found this listing, but did not return usable price observations. No history has been estimated.</div>
      )}
    </div>
  );
}

function Sidebar({
  screen,
  onNavigate,
  mode,
  apiStatus,
  mobileOpen,
  onClose,
}: {
  screen: Screen;
  onNavigate: (page: AppPage) => void;
  mode: DataMode;
  apiStatus: ApiStatus | null;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const isActive = (page: AppPage) => screen === page || (page === "home" && screen === "product");
  return (
    <>
      {mobileOpen && <button className="sidebar-backdrop" onClick={onClose} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Activity size={21} strokeWidth={2.8} /></div>
          <div><strong>DealSense</strong><span>SMART SHOPPING</span></div>
          <button className="mobile-close" type="button" onClick={onClose} aria-label="Close menu"><X size={20} /></button>
        </div>
        <div className="workspace-switch"><div className="workspace-avatar">D</div><div><strong>Personal space</strong><span>Free workspace</span></div><ChevronDown size={15} /></div>
        <div className="nav-section-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button className={`nav-item ${isActive(id) ? "active" : ""}`} key={id} type="button" onClick={() => { onNavigate(id); onClose(); }}>
              <Icon size={18} /><span>{label}</span>{id === "tracked" && <span className="nav-count">↗</span>}
            </button>
          ))}
        </nav>
        <div className="nav-section-label secondary-nav-label">LEARN MORE</div>
        <nav className="side-nav" aria-label="More navigation">
          <button className={`nav-item ${screen === "about" ? "active" : ""}`} type="button" onClick={() => { onNavigate("about"); onClose(); }}><CircleHelp size={18} /><span>About DealSense</span></button>
          <button className={`nav-item ${screen === "settings" ? "active" : ""}`} type="button" onClick={() => { onNavigate("settings"); onClose(); }}><Settings size={18} /><span>Settings & API</span></button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="data-connection-card">
          <div className="connection-top"><span className={`connection-dot ${apiStatus?.configured ? "connected" : ""}`} /><span>{mode === "demo" ? "Demo workspace" : apiStatus?.configured ? "API key present" : "Real API mode"}</span><LockKeyhole size={13} /></div>
          <p>{mode === "demo" ? "Try sample products with clearly labeled demo prices." : apiStatus?.configured ? "A Rewalto key is set; lookup will validate provider access." : "Add your Rewalto key to enable real lookups."}</p>
          <button type="button" onClick={() => { onNavigate("settings"); onClose(); }}>Configure data <ArrowRight size={14} /></button>
        </div>
        <div className="sidebar-user">
          <div className="user-avatar">AS</div><div><strong>Shopping smarter</strong><span>Personal account</span></div><Menu size={16} />
        </div>
      </aside>
    </>
  );
}

function Header({ screen, mode, onModeChange, onMenuClick, onShare }: {
  screen: Screen;
  mode: DataMode;
  onModeChange: () => void;
  onMenuClick: () => void;
  onShare: () => void;
}) {
  const labels: Record<Screen, string> = {
    home: "Overview",
    tracked: "My tracking",
    about: "About DealSense",
    settings: "Settings & API",
    product: "Product insights",
  };
  return (
    <header className="topbar">
      <div className="topbar-left"><button className="menu-toggle" type="button" onClick={onMenuClick} aria-label="Open navigation"><Menu size={20} /></button><span>Workspace</span><span className="crumb-slash">/</span><strong>{labels[screen]}</strong></div>
      <div className="topbar-actions">
        <button className="share-button" type="button" onClick={onShare}><Share2 size={15} /><span>Share</span></button>
        <span className={`mode-chip ${mode === "real" ? "mode-real" : ""}`}><i /> {mode === "real" ? "Real API" : "Demo mode"}</span>
        <button className="topbar-mode-button" type="button" onClick={onModeChange} aria-label="Switch data mode">
          <span className="desktop-mode-label">{mode === "demo" ? "Switch to real" : "Switch to demo"}</span>
          <span className="mobile-mode-label">Mode</span>
          <ChevronDown size={14} />
        </button>
        <div className="user-avatar top-user">AS</div>
      </div>
    </header>
  );
}

function SearchPanel({
  mode,
  isSearching,
  error,
  onSearch,
}: {
  mode: DataMode;
  isSearching: boolean;
  error: string;
  onSearch: (url: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [showSku, setShowSku] = useState(false);
  const [sku, setSku] = useState("");
  const [validation, setValidation] = useState("");
  const [skuValidation, setSkuValidation] = useState("");

  function submitUrl(event: FormEvent) {
    event.preventDefault();
    const problem = validateProductUrl(url);
    setValidation(problem ?? "");
    if (!problem) onSearch(url.trim());
  }

  function submitSku(event: FormEvent) {
    event.preventDefault();
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(sku.trim())) {
      setSkuValidation("Enter a valid retailer product ID.");
      return;
    }
    setSkuValidation("");
    onSearch(`SKU:${sku.trim()}`);
  }

  return (
    <section className="search-card">
      <div className="search-card-top">
        <div className="search-card-icon"><Link2 size={20} /></div>
        <div><h2>Start with a product link</h2><p>Paste a product URL and we’ll look for its price history.</p></div>
        <span className={`search-mode-label ${mode === "demo" ? "demo-mode-label" : ""}`}>{mode === "demo" ? <><Sparkles size={12} /> DEMO MODE</> : <><ShieldCheck size={12} /> REAL DATA</>}</span>
      </div>
      <form className="url-search-form" onSubmit={submitUrl}>
        <div className={`url-input-wrap ${validation || error ? "input-error" : ""}`}>
          <Link2 size={18} />
          <input
            aria-label="Product URL"
            autoComplete="url"
            placeholder="Paste a product URL, e.g. myntra.com/..."
            value={url}
            onChange={(event) => { setUrl(event.target.value); setValidation(""); }}
            disabled={isSearching}
          />
          {url && <button className="clear-input" type="button" onClick={() => setUrl("")} aria-label="Clear URL"><X size={15} /></button>}
        </div>
        <button className="primary-button search-button" type="submit" disabled={isSearching}>
          {isSearching ? <><LoaderCircle className="spin" size={17} /> Looking up</> : <><Search size={17} /> Track price</>}
        </button>
      </form>
      {(validation || error) && <div className="form-error"><Info size={15} /> {validation || error}</div>}
      {mode === "demo" && !error && <div className="demo-search-note"><Info size={14} /> Demo mode does not fetch or match pasted URLs. Results are sample data, clearly labeled.</div>}
      {mode === "real" && <div className="real-search-note"><LockKeyhole size={13} /> Real lookup currently supports exact Myntra product IDs through Rewalto.</div>}
      <div className="search-card-bottom">
        <div className="retailer-list"><span>Retailers</span><b className="retailer-supported"><i /> Myntra · API</b><b className="retailer-demo">Flipkart · demo</b><b className="retailer-demo">Amazon · demo</b></div>
        <button className="sku-link" type="button" onClick={() => setShowSku((value) => !value)}>
          {showSku ? "Hide product ID search" : "Have a Myntra product ID?"} <ArrowRight size={13} />
        </button>
      </div>
      {showSku && (
        <form className="sku-search-form" onSubmit={submitSku}>
          <label htmlFor="sku-input">Myntra retailer SKU</label>
          <div className="sku-form-row">
            <input id="sku-input" value={sku} onChange={(event) => { setSku(event.target.value); setSkuValidation(""); }} placeholder="e.g. 12345678" />
            <button className="secondary-button" type="submit" disabled={isSearching}>{isSearching ? "Searching…" : "Search ID"}</button>
          </div>
          {skuValidation && <div className="form-error"><Info size={14} />{skuValidation}</div>}
          <span className="sku-help">Rewalto's documented listings API supports exact retailerSku filtering; it does not search by free-text.</span>
        </form>
      )}
      <div className="search-trust"><ShieldCheck size={14} /> Your API key stays securely on the server <span /> <LockKeyhole size={13} /> No checkout or payment data</div>
    </section>
  );
}

function FeatureCard({ icon: Icon, title, text, tone }: {
  icon: typeof Tag;
  title: string;
  text: string;
  tone: string;
}) {
  return <article className="feature-card"><div className={`feature-icon ${tone}`}><Icon size={18} /></div><h3>{title}</h3><p>{text}</p></article>;
}

function DemoProducts({ onSelect, compact = false }: { onSelect: (product: Product) => void; compact?: boolean }) {
  return (
    <div className={`demo-product-grid ${compact ? "compact-products" : ""}`}>
      {demoProducts.map((product) => (
        <button className="demo-product-card" type="button" key={product.id} onClick={() => onSelect(product)}>
          <div className="demo-product-art"><ProductImage product={product} /><span>DEMO</span></div>
          <div className="demo-product-info"><span>{product.retailer}</span>          <strong>{product.title}</strong><b>{formatPrice(product.priceMinor === null ? null : product.priceMinor / 100)}</b></div>
          <ArrowUpRight className="demo-product-arrow" size={16} />
        </button>
      ))}
    </div>
  );
}

function RewaltoCatalog({ onSelect }: { onSelect: (product: Product) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historySku, setHistorySku] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function loadPage() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const page = await getRewaltoCatalog(nextCursor);
      setProducts((current) => [...current, ...page.data]);
      setNextCursor(page.page.nextCursor);
      setLoaded(true);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not load Rewalto products.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function openHistory(product: Product) {
    if (!product.retailerSku || historySku) return;
    setHistorySku(product.retailerSku);
    setError("");
    try {
      onSelect(await lookupProduct({ retailerSku: product.retailerSku }));
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not load this product's price history.";
      setError(message);
    } finally {
      setHistorySku(null);
    }
  }

  return (
    <section className="rewalto-catalog-section">
      <div className="catalog-heading">
        <div>
          <div className="eyebrow">REAL PROVIDER LISTINGS</div>
          <h2>Myntra products in Rewalto</h2>
          <p>Browse products Rewalto actually lists, then open a product page or its recorded price history.</p>
        </div>
        <span className="catalog-provider-pill"><ShieldCheck size={13} /> REWALTO · LIVE</span>
      </div>
      <div className="catalog-credit-note"><Info size={15} /><span>Each page requests up to 20 listings and costs 1 credit per 10 delivered listings (up to 2 credits). Re-reading within 7 days is free. Opening history separately requests the exact listing and up to 100 observations; those reads are also billed at Rewalto’s rate.</span></div>
      {products.length > 0 && (
        <div className="rewalto-product-grid">
          {products.map((product) => (
            <article className="rewalto-product-card" key={product.id}>
              {product.productUrl ? (
                <a className="rewalto-product-image-link" href={product.productUrl} target="_blank" rel="noreferrer" aria-label={`Open ${product.title} at Myntra`}>
                  <ProductImage product={product} />
                  <span className="rewalto-listing-pill">REWALTO</span>
                  <span className="catalog-external-icon"><ExternalLink size={14} /></span>
                </a>
              ) : (
                <div className="rewalto-product-image-link">
                  <ProductImage product={product} />
                  <span className="rewalto-listing-pill">REWALTO</span>
                </div>
              )}
              <div className="rewalto-product-body">
                <span className="rewalto-product-retailer">MYNTRA{product.brand ? ` · ${product.brand}` : ""}</span>
                <h3>{product.title}</h3>
                <div className="rewalto-product-price">{formatPrice(product.priceMinor === null ? null : product.priceMinor / 100, product.currency)}</div>
                <span className="rewalto-observed-date">{product.observedAt ? `Observed ${formatDate(product.observedAt, { day: "numeric", month: "short", year: "numeric" })}` : "No latest price reading"}</span>
                <div className="rewalto-product-actions">
                  <button className="secondary-button catalog-history-button" type="button" disabled={!product.retailerSku || historySku !== null} onClick={() => void openHistory(product)}>
                    {historySku === product.retailerSku ? <><LoaderCircle className="spin" size={14} /> Loading history</> : <><BarChart3 size={14} /> View price history</>}
                  </button>
                  {product.productUrl ? <a href={product.productUrl} target="_blank" rel="noreferrer" className="catalog-product-link">Product page <ExternalLink size={12} /></a> : <span className="catalog-no-link">Store link unavailable</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {error && <div className="catalog-error"><Info size={15} /> {error}</div>}
      {!loaded && !loading && (
        <button className="catalog-load-button" type="button" onClick={() => void loadPage()}>
          <PackageCheck size={16} /> Load first 20 products · up to 2 credits
        </button>
      )}
      {loading && products.length === 0 && <div className="catalog-loading"><LoaderCircle className="spin" size={19} /> Loading Myntra listings from Rewalto…</div>}
      {loaded && nextCursor && (
        <button className="catalog-load-button" type="button" onClick={() => void loadPage()} disabled={loading}>
          {loading ? <><LoaderCircle className="spin" size={16} /> Loading listings…</> : <><ArrowRight size={16} /> Load 20 more · up to 2 credits</>}
        </button>
      )}
      {loaded && !nextCursor && <div className="catalog-end-note"><Check size={14} /> You’ve reached the end of the Rewalto Myntra listings.</div>}
      {error && loaded && nextCursor && <button className="catalog-retry-button" type="button" onClick={() => void loadPage()} disabled={loading}>{loading ? "Retrying…" : "Retry loading this page"}</button>}
      {loaded && <div className="catalog-count-note">Showing {products.length} actual Rewalto listing{products.length === 1 ? "" : "s"}. No demo products are included here.</div>}
    </section>
  );
}

function HomePage({
  mode,
  status,
  statusError,
  isSearching,
  error,
  onSearch,
  onSelectProduct,
  onNavigate,
}: {
  mode: DataMode;
  status: ApiStatus | null;
  statusError: string;
  isSearching: boolean;
  error: string;
  onSearch: (url: string) => void;
  onSelectProduct: (product: Product) => void;
  onNavigate: (page: AppPage) => void;
}) {
  return (
    <div className="page-stack">
      <div className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow hero-eyebrow"><span className="live-dot" /> SHOP WITH A LITTLE MORE CERTAINTY</div>
          <h1>Know the price<br />before you <span>buy.</span></h1>
          <p>Track product prices, explore historical trends, and make smarter shopping decisions.</p>
        </div>
        <div className="hero-decoration" aria-hidden="true">
          <div className="decor-orbit orbit-one" /><div className="decor-orbit orbit-two" />
          <div className="decor-card decor-card-back"><span>SAMPLE DATA</span><strong>Illustrative</strong><i /></div>
          <div className="decor-card decor-card-front"><div className="decor-card-icon"><TrendingDown size={17} /></div><span>Illustrative price history</span><strong>Price trend</strong><div className="decor-sparkline"><i /><i /><i /><i /><i /><i /><i /><i /></div></div>
        </div>
      </div>
      {mode === "real" && status && !status.configured && (
        <div className="setup-callout"><Info size={17} /><div><strong>Real API access needs a key</strong><span>Add <code>REWALTO_API_KEY</code> to your server-side <code>.env</code> file, then restart the app.</span></div><span className="setup-pill">Myntra data only</span></div>
      )}
      {mode === "real" && statusError && (
        <div className="setup-callout"><Info size={17} /><div><strong>Could not reach the DealSense API server</strong><span>{statusError}</span></div></div>
      )}
      <SearchPanel mode={mode} isSearching={isSearching} error={error} onSearch={onSearch} />
      {mode === "real" && status?.configured && <RewaltoCatalog onSelect={onSelectProduct} />}
      <div className="section-heading">
        <div><div className="eyebrow">WHY DEALSENSE</div><h2>A smarter way to shop</h2></div>
        <button className="text-button" type="button" onClick={() => onNavigate("about")}>How it works <ArrowRight size={15} /></button>
      </div>
      <div className="features-grid">
        <FeatureCard icon={Activity} title="Watch prices move" text="See real observations over time and spot meaningful drops before you buy." tone="feature-violet" />
        <FeatureCard icon={BarChart3} title="History, not hunches" text="Explore the highs, lows and average from actual recorded price observations." tone="feature-green" />
        <FeatureCard icon={Sparkles} title="Buy with confidence" text="Get a simple recommendation based on the price history that is available." tone="feature-orange" />
      </div>
      <section className="demo-samples-section">
        <div className="section-heading sample-heading">
          <div><div className="eyebrow">A QUICK TOUR</div><h2>Explore sample products</h2></div>
          <span className="demo-badge mini-demo-badge"><Sparkles size={12} /> ALL SAMPLE DATA</span>
        </div>
        <DemoProducts onSelect={onSelectProduct} compact />
        <div className="demo-footer-note"><Info size={14} /> Sample prices and product history are illustrative demo data. They are never presented as live retailer data.</div>
      </section>
      {mode === "real" && status?.configured && (
        <div className="provider-footnote"><ShieldCheck size={15} /> Provider: Rewalto · Real product lookups currently cover Myntra only. <a href="https://rewalto.com/developers/docs/api/myntra" target="_blank" rel="noreferrer">API documentation <ExternalLink size={12} /></a></div>
      )}
    </div>
  );
}

function TrackedPage({
  products,
  recentProducts,
  onSelectProduct,
  onRemove,
  onBrowse,
}: {
  products: Product[];
  recentProducts: Product[];
  onSelectProduct: (product: Product) => void;
  onRemove: (id: string) => void;
  onBrowse: () => void;
}) {
  return (
    <div className="page-stack">
      <div className="page-title-row"><div><div className="eyebrow">YOUR WATCHLIST</div><h1>My tracking</h1><p>Keep an eye on products and their latest recorded prices.</p></div><button className="primary-button" type="button" onClick={onBrowse}><Search size={16} /> Track a product</button></div>
      {products.length === 0 ? (
        <div className="empty-state panel"><div className="empty-icon"><Heart size={24} /></div><h2>Your watchlist is ready</h2><p>Search a product and choose <strong>Track price</strong> to keep its latest price and history close by.</p><button className="secondary-button" type="button" onClick={onBrowse}>Find a product <ArrowRight size={15} /></button><div className="empty-demo-divider"><span /> or preview a sample <span /></div><DemoProducts onSelect={onSelectProduct} compact /></div>
      ) : (
        <div className="panel tracked-panel">
          <div className="tracked-table-heading"><div><h2>Tracked products</h2><span>{products.length} product{products.length === 1 ? "" : "s"} · saved in this browser</span></div><span className="storage-label"><LockKeyhole size={13} /> Private to this device</span></div>
          <div className="tracked-list">
            {products.map((product) => {
              const previous = [...product.observations].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt)).at(-2);
              const priorPrice = previous?.priceMinor == null ? null : previous.priceMinor / 100;
              const currentPrice = product.priceMinor === null ? null : product.priceMinor / 100;
              return (
                <div className="tracked-row" key={product.id}>
                  <button className="tracked-product-main" type="button" onClick={() => onSelectProduct(product)}>
                    <ProductImage product={product} />
                    <span className="tracked-product-name"><strong>{product.title}</strong><span>{product.retailer} · {product.brand ?? "Product"}</span><SourceBadge source={product.source} /></span>
                  </button>
                  <div className="tracked-price"><span>Latest price</span><strong>{formatPrice(currentPrice, product.currency)}</strong>{priorPrice !== null && currentPrice !== null && <small className={currentPrice < priorPrice ? "price-down" : currentPrice > priorPrice ? "price-up" : ""}>{currentPrice === priorPrice ? "Same as last reading" : `${currentPrice < priorPrice ? "↓" : "↑"} ${formatPrice(Math.abs(currentPrice - priorPrice), product.currency)} since last reading`}</small>}</div>
                  <div className="tracked-updated"><span>Last updated</span><strong>{product.observedAt ? formatDate(product.observedAt) : "Not available"}</strong></div>
                  <button className="icon-button open-product-button" type="button" onClick={() => onSelectProduct(product)} title="Open price history"><ArrowUpRight size={17} /></button>
                  <button className="icon-button remove-product-button" type="button" onClick={() => onRemove(product.id)} title={`Remove ${product.title}`}><Trash2 size={16} /></button>
                </div>
              );
            })}
          </div>
          <div className="tracked-panel-foot"><Info size={14} /> Your watchlist is saved locally in this browser. Real observations are not changed or fabricated.</div>
        </div>
      )}
      {recentProducts.length > 0 && (
        <section className="panel recent-panel">
          <div className="tracked-table-heading"><div><h2>Recently searched</h2><span>Saved in this browser · latest result shown</span></div><span className="storage-label"><Clock3 size={13} /> {recentProducts.length} recent</span></div>
          <div className="recent-product-list">
            {recentProducts.map((product) => (
              <button className="recent-product-row" type="button" key={product.id} onClick={() => onSelectProduct(product)}>
                <ProductImage product={product} />
                <span className="recent-product-name"><strong>{product.title}</strong><span>{product.retailer} · {product.observedAt ? `Checked ${formatDate(product.observedAt)}` : "Date unavailable"}</span><SourceBadge source={product.source} /></span>
                <span className="recent-product-price"><small>Latest available</small><strong>{formatPrice(product.priceMinor === null ? null : product.priceMinor / 100, product.currency)}</strong></span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AboutPage() {
  return (
    <div className="page-stack">
      <div className="page-title-row"><div><div className="eyebrow">OUR PURPOSE</div><h1>Smarter decisions, not more shopping.</h1><p>DealSense is a focused price-tracking prototype built to make product pricing easier to understand.</p></div></div>
      <div className="about-hero panel"><div className="about-mark"><Activity size={27} /></div><div className="eyebrow">DEALSENSE · SMART SHOPPING</div><h2>Know when a price is worth it.</h2><p>Paste a supported product link to check its latest available price and recorded history. We turn those observations into a clear chart and a simple recommendation—so you can decide when to buy.</p><div className="about-pill-row"><span><ShieldCheck size={14} /> Observed data, not estimates</span><span><LockKeyhole size={14} /> API key stays server-side</span><span><BarChart3 size={14} /> Clear about demo data</span></div></div>
      <div className="section-heading"><div><div className="eyebrow">A LITTLE TRANSPARENCY</div><h2>What DealSense does—and doesn't do</h2></div></div>
      <div className="about-grid">
        <article className="panel about-info-card"><div className="about-info-icon green"><Check size={17} /></div><h3>Price insights</h3><p>Shows prices returned by Rewalto's documented API or clearly labeled sample data in Demo Mode.</p></article>
        <article className="panel about-info-card"><div className="about-info-icon orange"><Info size={17} /></div><h3>No e-commerce</h3><p>DealSense does not sell products, process payments, or guarantee a retailer's current availability.</p></article>
        <article className="panel about-info-card"><div className="about-info-icon violet"><PackageCheck size={17} /></div><h3>Provider coverage</h3><p>This prototype's real lookup supports Myntra retailer SKUs. Other retailer connectors are not yet configured.</p></article>
      </div>
    </div>
  );
}

function SettingsPage({
  mode,
  status,
  statusError,
  onModeChange,
  onRefreshStatus,
  statusLoading,
}: {
  mode: DataMode;
  status: ApiStatus | null;
  statusError: string;
  onModeChange: (mode: DataMode) => void;
  onRefreshStatus: () => void;
  statusLoading: boolean;
}) {
  return (
    <div className="page-stack">
      <div className="page-title-row"><div><div className="eyebrow">PREFERENCES</div><h1>Settings & API</h1><p>Choose your data source and check your Rewalto connection.</p></div></div>
      <section className="panel settings-panel">
        <div className="settings-title"><div className="settings-title-icon"><Activity size={18} /></div><div><h2>Data mode</h2><p>Demo data and real API results are kept separate.</p></div></div>
        <div className="mode-choice-grid">
          <button className={`mode-choice ${mode === "demo" ? "selected" : ""}`} type="button" onClick={() => onModeChange("demo")}>
            <span className="mode-choice-radio">{mode === "demo" && <i />}</span><span className="mode-choice-body"><strong><Sparkles size={17} /> Demo Mode</strong><span>Explore sample product data and illustrative price history. Every sample is labeled DEMO DATA.</span><b className="mode-choice-tag demo-choice-tag">No API key needed</b></span>
          </button>
          <button className={`mode-choice ${mode === "real" ? "selected" : ""}`} type="button" onClick={() => onModeChange("real")}>
            <span className="mode-choice-radio">{mode === "real" && <i />}</span><span className="mode-choice-body"><strong><ShieldCheck size={17} /> Real API Mode</strong><span>Look up Rewalto's latest Myntra listings and actual price observations.</span><b className="mode-choice-tag real-choice-tag">Requires server API key</b></span>
          </button>
        </div>
      </section>
      <section className="panel settings-panel api-status-panel">
        <div className="settings-title"><div className="settings-title-icon settings-lock"><LockKeyhole size={18} /></div><div><h2>Rewalto API configuration</h2><p>Credentials are read by the server only; they are never sent to the browser.</p></div><button className="secondary-button refresh-button" type="button" onClick={onRefreshStatus} disabled={statusLoading}>{statusLoading ? <LoaderCircle className="spin" size={15} /> : <Activity size={15} />} Check server setup</button></div>
        <div className={`api-status-box ${status?.configured ? "api-ready" : ""}`}>
          <div className={`api-status-icon ${status?.configured ? "ready" : ""}`}>{status?.configured ? <Check size={18} /> : <Info size={18} />}</div>
          <div><strong>{status?.configured ? "API key configured" : statusError ? "API server unavailable" : status ? "API key not configured" : "Checking server setup"}</strong><span>{status?.configured ? "A key is present on the server. Its validity and data access are checked when you make a real lookup." : statusError || (status ? "Real API mode needs REWALTO_API_KEY in the server's .env file." : "Waiting for a response from the DealSense server.")}</span></div>
          <span className={`api-status-indicator ${status?.configured ? "ready" : ""}`}><i />{status?.configured ? "Key present" : statusError ? "Unavailable" : status ? "Not configured" : "Checking"}</span>
        </div>
        <div className="api-config-instructions"><div><strong>Set up your key</strong><span>1. Copy <code>.env.example</code> to <code>.env</code> in the project root.</span><span>2. Set <code>REWALTO_API_KEY=your_key</code> and restart the server.</span><span>3. Keep the key out of frontend variables and source control.</span></div><a href="https://rewalto.com/developers/docs/api/myntra" target="_blank" rel="noreferrer">Rewalto API docs <ExternalLink size={13} /></a></div>
      </section>
      <section className="panel coverage-panel"><div className="coverage-heading"><div><div className="eyebrow">CURRENT PROVIDER COVERAGE</div><h2>Available in Real API Mode</h2></div><span className="coverage-count">1 retailer</span></div><div className="coverage-retailer"><span className="myntra-logo">M</span><div><strong>Myntra</strong><span>Look up listings by exact retailer SKU and read dated observations.</span></div><span className="coverage-supported"><Check size={13} /> Supported</span></div><div className="coverage-unavailable"><strong>Flipkart & Amazon</strong><span>Not included in this Rewalto integration. They can still be previewed as explicitly labeled sample products in Demo Mode.</span></div></section>
    </div>
  );
}

function Toast({ children, onClose, tone = "success" }: { children: ReactNode; onClose: () => void; tone?: "success" | "error" }) {
  return <div className={`toast ${tone}`} role="status"><span>{tone === "success" ? <Check size={16} /> : <Info size={16} />}</span><div>{children}</div><button type="button" onClick={onClose} aria-label="Dismiss message"><X size={16} /></button></div>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<DataMode>("demo");
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [apiStatusError, setApiStatusError] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  const [tracked, setTracked] = useState<Product[]>([]);
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [range, setRange] = useState<PriceRange>("30D");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");

  useEffect(() => {
    try {
      setTracked(getStored(trackedStorageKey, [], isProductList));
      setRecentProducts(getStored(recentStorageKey, [], isProductList));
      setMode(getStored(modeStorageKey, "demo", isMode));
      setCurrentProduct(getStored(currentStorageKey, null, isCurrentProduct));
    } catch (error) {
      console.error("Could not read DealSense browser storage:", error);
      setStorageWarning("Saved settings could not be read. Browser storage may be disabled or damaged.");
    } finally {
      setStorageReady(true);
    }
    getApiStatus()
      .then((status) => { setApiStatus(status); setApiStatusError(""); })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "The DealSense API server could not be reached.";
        console.error("Could not check API status:", message);
        setApiStatusError(message);
      });
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(trackedStorageKey, JSON.stringify(tracked));
    } catch (error) {
      console.error("Could not save your watchlist:", error);
      setStorageWarning("Your browser could not save the watchlist. Check its storage permissions.");
    }
  }, [tracked, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(recentStorageKey, JSON.stringify(recentProducts));
    } catch (error) {
      console.error("Could not save recent searches:", error);
      setStorageWarning("Your browser could not save recent searches. Check its storage permissions.");
    }
  }, [recentProducts, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(modeStorageKey, JSON.stringify(mode));
      localStorage.setItem(currentStorageKey, JSON.stringify(currentProduct));
    } catch (error) {
      console.error("Could not save DealSense preferences:", error);
      setStorageWarning("Your browser could not save DealSense preferences.");
    }
  }, [mode, currentProduct, storageReady]);

  useEffect(() => {
    const syncHash = () => {
      const target = window.location.hash.replace(/^#\/?/, "");
      if (target.startsWith("product/")) {
        const id = decodeURIComponent(target.slice("product/".length));
        const product = tracked.find((item) => item.id === id) ?? demoProducts.find((item) => item.id === id) ?? null;
        if (product) setCurrentProduct(product);
        setScreen("product");
      } else if (target === "tracked" || target === "about" || target === "settings" || target === "home") {
        setScreen(target);
      } else {
        setScreen("home");
      }
    };
    window.addEventListener("hashchange", syncHash);
    if (window.location.hash) syncHash();
    return () => window.removeEventListener("hashchange", syncHash);
  }, [tracked]);

  function navigate(target: Screen, product?: Product) {
    if (product) setCurrentProduct(product);
    setSearchError("");
    const hash = target === "product" && product
      ? `#/product/${encodeURIComponent(product.id)}`
      : `#/${target}`;
    if (window.location.hash === hash) setScreen(target);
    else window.location.hash = hash;
    setScreen(target);
  }

  function changeMode(nextMode: DataMode) {
    setMode(nextMode);
    setSearchError("");
    setToast({
      tone: "success",
      message: nextMode === "demo"
        ? "Demo Mode is on. Sample data is clearly labeled."
        : "Real API Mode selected. Only actual Rewalto responses will be shown.",
    });
  }

  async function refreshApiStatus() {
    setStatusLoading(true);
    try {
      setApiStatus(await getApiStatus());
      setApiStatusError("");
      setToast({ tone: "success", message: "Server setup checked." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not check the server connection.";
      setApiStatusError(message);
      setToast({ tone: "error", message });
    } finally {
      setStatusLoading(false);
    }
  }

  async function runSearch(search: string) {
    setSearchError("");
    setIsSearching(true);
    try {
      if (search.startsWith("SKU:")) {
        const sku = search.slice(4);
        if (mode === "demo") {
          setCurrentProduct(demoProducts[0]);
          recordRecent(demoProducts[0]);
          setToast({ tone: "success", message: "Demo sample opened. No live SKU lookup was performed." });
          navigate("product", demoProducts[0]);
          return;
        }
        const result = await lookupProduct({ retailerSku: sku });
        setCurrentProduct(result);
        recordRecent(result);
        navigate("product", result);
        setToast({ tone: "success", message: "Product observations loaded from Rewalto." });
        return;
      }
      const validation = validateProductUrl(search);
      if (validation) throw new Error(validation);
      if (mode === "demo") {
        const host = new URL(search).hostname.toLowerCase();
        const sample = host.includes("amazon")
          ? demoProducts[2]
          : host.includes("flipkart")
            ? demoProducts[1]
            : demoProducts[0];
        setCurrentProduct(sample);
        recordRecent(sample);
        navigate("product", sample);
        setToast({ tone: "success", message: "Demo sample opened. This sample is not matched to your pasted link." });
        return;
      }
      const result = await lookupProduct({ url: search });
      setCurrentProduct(result);
      recordRecent(result);
      navigate("product", result);
      setToast({ tone: "success", message: "Latest price and available observations loaded from Rewalto." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Product lookup failed.";
      setSearchError(message);
      setToast({ tone: "error", message });
    } finally {
      setIsSearching(false);
    }
  }

  function toggleTracked(product: Product) {
    const alreadyTracked = tracked.some((item) => item.id === product.id);
    setTracked((items) => alreadyTracked
      ? items.filter((item) => item.id !== product.id)
      : [product, ...items]);
    setToast({
      tone: "success",
      message: alreadyTracked ? "Product removed from your watchlist." : "Product added to your watchlist.",
    });
  }

  function selectProduct(product: Product) {
    setRecentProducts((items) => [product, ...items.filter((item) => item.id !== product.id)].slice(0, 10));
    setCurrentProduct(product);
    navigate("product", product);
  }

  function recordRecent(product: Product) {
    setRecentProducts((items) => [product, ...items.filter((item) => item.id !== product.id)].slice(0, 10));
  }

  async function shareApp() {
    if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
      setToast({
        tone: "error",
        message: "This link only works on this computer. Deploy DealSense first to get a WhatsApp-shareable link.",
      });
      return;
    }

    const shareData = {
      title: "DealSense — Smart Shopping",
      text: "Track product prices and explore price history with DealSense.",
      url: window.location.origin,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        setToast({ tone: "success", message: "Website link copied. Paste it into WhatsApp to share." });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Could not share the DealSense link:", error);
      setToast({ tone: "error", message: "Could not share the link. Copy the website address from your browser." });
    }
  }

  const isCurrentTracked = currentProduct ? tracked.some((item) => item.id === currentProduct.id) : false;

  return (
    <div className="app-shell">
      <Sidebar screen={screen} onNavigate={(target) => navigate(target)} mode={mode} apiStatus={apiStatus} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="main-shell">
        <Header screen={screen} mode={mode} onModeChange={() => changeMode(mode === "demo" ? "real" : "demo")} onMenuClick={() => setMobileOpen(true)} onShare={() => void shareApp()} />
        <div className="main-content">
          {screen === "home" && <HomePage mode={mode} status={apiStatus} statusError={apiStatusError} isSearching={isSearching} error={searchError} onSearch={runSearch} onSelectProduct={selectProduct} onNavigate={(target) => navigate(target)} />}
          {screen === "tracked" && <TrackedPage products={tracked} recentProducts={recentProducts} onSelectProduct={selectProduct} onRemove={(id) => { setTracked((items) => items.filter((item) => item.id !== id)); setToast({ tone: "success", message: "Product removed from your watchlist." }); }} onBrowse={() => navigate("home")} />}
          {screen === "product" && currentProduct && <ProductDetail product={currentProduct} onBack={() => navigate("home")} tracked={isCurrentTracked} onToggleTracked={() => toggleTracked(currentProduct)} range={range} onRangeChange={setRange} />}
          {screen === "product" && !currentProduct && <div className="empty-state panel"><h2>Product not found</h2><p>Open a product from your dashboard or start a new search.</p><button className="primary-button" type="button" onClick={() => navigate("home")}>Go to overview <ArrowRight size={15} /></button></div>}
          {screen === "about" && <AboutPage />}
          {screen === "settings" && <SettingsPage mode={mode} status={apiStatus} statusError={apiStatusError} onModeChange={changeMode} onRefreshStatus={refreshApiStatus} statusLoading={statusLoading} />}
          <footer className="app-footer"><span>© 2026 DealSense</span><span>Prices are observations, not promises.</span><button type="button" onClick={() => navigate("about")}>About the data</button></footer>
        </div>
      </main>
      {toast && <Toast tone={toast.tone} onClose={() => setToast(null)}>{toast.message}</Toast>}
      {storageWarning && <Toast tone="error" onClose={() => setStorageWarning("")}>{storageWarning}</Toast>}
    </div>
  );
}
