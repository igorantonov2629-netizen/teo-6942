import { HomeBannerCarousel } from "../components/home-banner-carousel";
import { HomeUpdates } from "../components/home-updates";
import { FullNameCard } from "../components/full-name-card";
import { AdminProducts } from "../components/admin-products";
import { hasFullName } from "../../shared/full-name";
import { InfoTip } from "../components/info-tip";
import { pricingReady, emptySettings } from "../../shared/commerce";
import { BuyerOrders, AdminOrders } from "../components/order-commerce";
import { DestinationPicker } from "../components/destination-picker";
import { CommerceSettingsPanel } from "../components/commerce-settings";
import { useCommerceSettings } from "../queries/commerce";
import { shippingNotice } from "../../shared/commerce";
import { ProductEditor } from "../components/product-editor";
import { ProductPhotoSlider } from "../components/product-photo-slider";
import { PhotoWorkControls } from "../components/photo-work-controls";
import {
  AdminUsers,
  AdminStats,
  AdminNotifications,
} from "../components/admin-extras";
import {
  TeoSplash,
  RegistrationCard,
  ProductGallery,
} from "../components/teo-extras";
import {
  useTeoCatalog,
  useTeoProfile,
  useTeoOrders,
  useTeoRequests,
  useTeoAdmin,
  useCreateOrder,
  useCreateRequest,
  useSaveProduct,
  useSetRequest,
} from "../queries/teo";
import { ProductReviews } from "../components/product-reviews";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Heart,
  ShoppingBag,
  UserRound,
  MapPin,
  Search,
  Camera,
  Plus,
  Minus,
  X,
  SlidersHorizontal,
  LayoutGrid,
  Package,
  Truck,
  ShieldCheck,
  ChevronRight,
  Star,
  ImagePlus,
  Settings2,
  Clock,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import {
  categories,
  money,
  useStored,
  type Product,
  type CartItem,
} from "../lib/teo-data";

type Tab =
  | "catalog"
  | "favorites"
  | "cart"
  | "profile"
  | "orders"
  | "admin"
  | "search"
  | "sale";
export default function Teo() {
  const catalogQuery = useTeoCatalog();
  const profileQuery = useTeoProfile();
  const user = profileQuery.data;
  const isModerator = !!user && ["owner", "moderator"].includes(user.role);
  const ordersQuery = useTeoOrders(!!user);
  const requestsQuery = useTeoRequests(!!user);
  const adminQuery = useTeoAdmin(isModerator);
  const createOrder = useCreateOrder();
  const createRequest = useCreateRequest();
  const saveProductMutation = useSaveProduct();
  const setRequestMutation = useSetRequest();
  const products =
    isModerator && adminQuery.data
      ? adminQuery.data.products
      : catalogQuery.data || [];
  const orders =
    isModerator && adminQuery.data
      ? adminQuery.data.orders
      : ordersQuery.data || [];
  const requests =
    isModerator && adminQuery.data
      ? adminQuery.data.requests
      : requestsQuery.data || [];
  const cartKey = "cart-" + (user?.id || "guest");
  const [cart, setCart] = useStored<CartItem[]>(cartKey, []);
  const [favorites, setFavorites] = useStored<number[]>(
    "favorites-" + (user?.id || "guest"),
    [],
  );
  const [searchHistory, setSearchHistory] = useStored<string[]>(
    "search-history",
    [],
  );
  const rememberSearch = (value: string) => {
    const v = value.trim();
    if (v)
      setSearchHistory((prev) =>
        [v, ...prev.filter((x) => x !== v)].slice(0, 5),
      );
  };
  const [galleryProduct, setGalleryProduct] = useState<Product | null>(null);
  const [clothingChoice, setClothingChoice] = useState<boolean | null>(null);
  const orderKey = useRef(crypto.randomUUID());
  const requestKey = useRef(crypto.randomUUID());
  const [point, setPoint] = useStored("point-" + (user?.id || "guest"), "");
  const [city, setCity] = useStored("city-" + (user?.id || "guest"), "");
  const [tab, setTab] = useState<Tab>("catalog");
  const [category, setCategory] = useState("Все");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("popular");
  const [filters, setFilters] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [variant, setVariant] = useState("");
  const [modal, setModal] = useState<
    "pickup" | "photo" | "payment" | "success" | "edit" | null
  >(null);
  const [pickupNext, setPickupNext] = useState(false);
  const [photo, setPhoto] = useState("");
  const [comment, setComment] = useState("");
  const [toast, setToast] = useState("");
  const paying = createOrder.isPending;
  const [adminTab, setAdminTab] = useState("Заказы");
  const [edit, setEdit] = useState<Product | null>(null);
  const commerceQuery = useCommerceSettings(isModerator);
  const [buyPrice, setBuyPrice] = useState(0);
  useEffect(() => {
    const app = (
      window as unknown as {
        Telegram?: { WebApp?: { ready?: () => void; expand?: () => void } };
      }
    ).Telegram?.WebApp;
    app?.ready?.();
    app?.expand?.();
  }, []);
  useEffect(() => {
    if (selected || modal) {
      const old = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = old;
      };
    }
  }, [selected, modal]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const count = cart.reduce((a, c) => a + c.qty, 0);
  const total = cart.reduce(
    (a, c) =>
      a + (products.find((p) => p.id === c.productId)?.price || 0) * c.qty,
    0,
  );
  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (user?.id) {
      setPoint(user?.point || "");
      setCity(user?.city || "");
    }
  }, [user?.id, user?.point, user?.city, setPoint, setCity]);
  useEffect(() => {
    if (!isModerator && tab === "admin") setTab("profile");
  }, [isModerator, tab]);
  useEffect(() => {
    const id = Number(
      new URLSearchParams(window.location.search).get("product"),
    );
    if (id && catalogQuery.data) {
      const p = catalogQuery.data.find((p) => p.id === id);
      if (p) {
        setSelected(p);
        setVariant(
          p.clothing
            ? p.sizes?.[0] || "Размер уточнит модератор"
            : p.category === "Одежда"
              ? "M"
              : p.category === "Обувь"
                ? "38"
                : p.color,
        );
      }
    }
  }, [catalogQuery.data]);
  const go = (t: Tab) => {
    setTab(t);
    setSelected(null);
    if (t === "catalog") {
      setFilters(false);
      setSort("popular");
      setMinPrice("");
      setMaxPrice("");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openProduct = (p: Product) => {
    if (p.hidden) {
      notify("Товар убран из каталога");
      return;
    }
    setSelected(p);
    setVariant(
      p.clothing
        ? p.sizes?.[0] || "Размер уточнит модератор"
        : p.category === "Одежда"
          ? "M"
          : p.category === "Обувь"
            ? "38"
            : p.color,
    );
  };
  const like = (id: number) =>
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  const add = (p: Product, v?: string) => {
    if (
      !v &&
      (p.clothing || p.category === "Одежда" || p.category === "Обувь")
    ) {
      openProduct(p);
      return;
    }
    v = v || p.color;
    setCart((prev) => {
      const found = prev.find((c) => c.productId === p.id && c.variant === v);
      return found
        ? prev.map((c) => (c === found ? { ...c, qty: c.qty + 1 } : c))
        : [...prev, { productId: p.id, qty: 1, variant: v }];
    });
    notify("Товар добавлен в корзину");
  };
  const qty = (i: number, delta: number) =>
    setCart((prev) =>
      prev
        .map((c, j) => (j === i ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0),
    );
  const checkout = () => {
    if (!user?.phone || !user.started) {
      go("profile");
      notify("Поделитесь своим номером через /start в боте.");
      return;
    }
    if (!city || !point.startsWith(city + ", ")) {
      setPickupNext(true);
      setModal("pickup");
    } else setModal("payment");
  };
  const upload = (file?: File, target = "request") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Выберите изображение");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      notify("Максимальный размер — 8 МБ");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 800 / Math.max(img.width, img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas
          .getContext("2d")!
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/jpeg", 0.8);
        if (target === "product")
          setEdit((prev) =>
            prev
              ? {
                  ...prev,
                  image: data,
                  images: [data, ...(prev.images || []).slice(0, 7)],
                }
              : prev,
          );
        else setPhoto(data);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };
  const saleIds = [...products]
    .filter((p) => !p.hidden)
    .sort((a, b) => a.price - b.price || a.id - b.id)
    .slice(0, 5)
    .map((p) => p.id);
  let visible = products.filter(
    (p) =>
      !p.hidden &&
      (category === "Все" || p.category === category) &&
      p.name.toLowerCase().includes(query.toLowerCase()) &&
      (tab !== "favorites" || favorites.includes(p.id)),
  );
  visible = visible.filter(
    (p) =>
      (tab !== "sale" || saleIds.includes(p.id)) &&
      (!minPrice || p.price >= Number(minPrice)) &&
      (!maxPrice || p.price <= Number(maxPrice)),
  );
  if (tab === "sale") visible = [...visible].sort((a, b) => a.price - b.price);
  if (sort === "cheap")
    visible = [...visible].sort((a, b) => a.price - b.price);
  if (sort === "expensive")
    visible = [...visible].sort((a, b) => b.price - a.price);
  if (sort === "new") visible = [...visible].sort((a, b) => b.id - a.id);
  const newProduct = () => {
    setClothingChoice(null);
    setBuyPrice(0);
    setEdit({
      id: Date.now(),
      name: "",
      category: "Для дома",
      price: 1,
      image: "/images/lamp.jpg",
      color: "Оранжевый",
      description: "",
      rating: "5.0",
      taobao: "",
    });
    setModal("edit");
  };
  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit || clothingChoice === null) return;
    try {
      await saveProductMutation.mutateAsync({
        ...edit,
        clothing: clothingChoice,
        taobaoYuan: buyPrice > 0 ? buyPrice : undefined,
      });
      setModal(null);
      notify("Товар сохранён");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Не удалось сохранить товар",
      );
    }
  };
  const submitOrder = async () => {
    try {
      const result = await createOrder.mutateAsync({
        key: orderKey.current,
        point,
        city,
        items: cart,
      });
      setCart([]);
      orderKey.current = crypto.randomUUID();
      setModal("success");
      if (result.notifications.failed)
        notify(
          "Заявка сохранена. Часть уведомлений ожидает повторной отправки.",
        );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Не удалось оформить заявку",
      );
    }
  };
  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) return;
    try {
      const result = await createRequest.mutateAsync({
        key: requestKey.current,
        image: photo,
        comment,
      });
      setModal(null);
      setPhoto("");
      setComment("");
      requestKey.current = crypto.randomUUID();
      notify(
        result.notifications.failed
          ? "Запрос сохранён. Уведомления ожидают повторной отправки."
          : "Фото-запрос отправлен",
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Не удалось отправить фото",
      );
    }
  };
  const updateRequest = async (
    id: string,
    status: "Новый" | "В поиске" | "Найден" | "Добавлен",
    productId?: number,
  ) => {
    try {
      await setRequestMutation.mutateAsync({ id, status, productId });
      notify("Фото-запрос обновлён");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Не удалось обновить запрос",
      );
    }
  };

  return (
    <div className="teo-app">
      <TeoSplash />
      <header className="header">
        <div className="header-inner">
          <button className="logo" onClick={() => go("catalog")}>
            teo<span>®</span>
          </button>
          <div className="header-divider" />
          <button
            className="location"
            onClick={() => {
              setPickupNext(false);
              setModal("pickup");
            }}
          >
            <MapPin size={16} />
            {city.split(",")[0] || "Выбрать город"}
            <ChevronRight size={13} />
          </button>
          <nav className="desktop-nav">
            <button
              className={tab === "catalog" ? "active" : ""}
              onClick={() => go("catalog")}
            >
              Каталог
            </button>
            <button
              className={tab === "orders" ? "active" : ""}
              onClick={() => go("orders")}
            >
              Мои заказы
            </button>
          </nav>
          <div className="header-right">
            <span className="telegram-label">Ваш маленький мир находок</span>
            <button
              aria-label="Избранное"
              className={"icon-btn " + (tab === "favorites" ? "accent" : "")}
              onClick={() => go("favorites")}
            >
              <Heart size={21} />
              {favorites.length > 0 && <i>{favorites.length}</i>}
            </button>
            <button
              className={"cart-head " + (tab === "cart" ? "accent" : "")}
              onClick={() => go("cart")}
            >
              <ShoppingBag size={20} />
              <span>Корзина</span>
              <b>{count}</b>
            </button>
            <button
              aria-label="Профиль"
              className="profile-icon"
              onClick={() => go("profile")}
            >
              <UserRound size={19} />
            </button>
          </div>
        </div>
      </header>
      <main className="main">
        {(tab === "catalog" ||
          tab === "favorites" ||
          tab === "search" ||
          tab === "sale") && (
          <>
            {tab === "search" && (
              <div className="search-page-heading">
                <button
                  onClick={() => {
                    setQuery("");
                    setMinPrice("");
                    setMaxPrice("");
                    go("catalog");
                  }}
                >
                  <ArrowRight
                    style={{ transform: "rotate(180deg)" }}
                    size={18}
                  />{" "}
                  Назад
                </button>
                <h1>Поиск товаров</h1>
                <p>Найдите свою следующую любимую вещь</p>
              </div>
            )}
            <div className="search-row">
              <div className="searchbox">
                <Search size={20} />
                <input
                  aria-label="Поиск товаров"
                  value={query}
                  onFocus={() => {
                    if (tab !== "search") {
                      setTab("search");
                      setCategory("Все");
                      setFilters(true);
                      window.scrollTo(0, 0);
                    }
                  }}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      rememberSearch(query);
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={() => rememberSearch(query)}
                  placeholder="Найти что-то особенное"
                />
                {query && (
                  <button
                    aria-label="Очистить поиск"
                    onClick={() => setQuery("")}
                  >
                    <X size={17} />
                  </button>
                )}
                <span className="search-divider" />
                <button
                  className="camera-btn"
                  aria-label="Поиск по фото"
                  onClick={() => {
                    setPhoto("");
                    setComment("");
                    setModal("photo");
                  }}
                >
                  <Camera size={20} />
                  <span>Поиск по фото</span>
                </button>
              </div>
              <div className="search-note">
                <ShieldCheck size={17} /> Находки с Taobao. Заботы — на нас.
              </div>
            </div>
            {tab === "search" && searchHistory.length > 0 && (
              <section className="search-history">
                <div>
                  <h3>Последние запросы</h3>
                  <button onClick={() => setSearchHistory([])}>Очистить</button>
                </div>
                {searchHistory.map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setQuery(q);
                      rememberSearch(q);
                    }}
                  >
                    <Clock size={15} />
                    {q}
                    <ArrowRight size={14} />
                  </button>
                ))}
              </section>
            )}
            {tab === "catalog" && !query && (
              <HomeBannerCarousel openPhoto={() => setModal("photo")}>
                <div className="hero-main">
                  <div className="hero-copy">
                    <span className="eyebrow">
                      <span /> МАЛЕНЬКИЕ ВЕЩИ. БОЛЬШЕ СЧАСТЬЯ.
                    </span>
                    <h1>
                      Заказывать
                      <br />
                      из Китая —<br />
                      <em>теперь легко.</em>
                    </h1>
                    <p>
                      Классные находки с Taobao —<br />
                      без сложностей, с заботой о вас.
                    </p>
                    <button
                      className="dark-btn"
                      onClick={() => {
                        setCategory("Для дома");
                        document
                          .getElementById("catalog")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      Смотреть подборку <ArrowUpRight size={18} />
                    </button>
                  </div>
                  <img
                    className="hero-lamp"
                    src="/images/lamp.jpg"
                    alt="Оранжевая настольная лампа"
                  />
                  <div className="hero-product">
                    <span>УЮТ В ОДНО КАСАНИЕ</span>
                    <button
                      onClick={() => {
                        const p = products.find((p) => p.id === 1);
                        if (p) openProduct(p);
                      }}
                    >
                      Лампа Mushroom <ArrowUpRight size={17} />
                    </button>
                  </div>
                </div>
                {products.some((p) => p.id === 2 && !p.hidden) && (
                  <div className="hero-side">
                    <div className="side-copy">
                      <span className="eyebrow">НОВАЯ ЛЮБИМАЯ</span>
                      <h2>
                        Всё своё
                        <br />
                        ношу с собой.
                      </h2>
                      <button
                        onClick={() => {
                          setCategory("Аксессуары");
                          document
                            .getElementById("catalog")
                            ?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        Аксессуары на каждый день <ArrowUpRight size={18} />
                      </button>
                    </div>
                    <img src="/images/bag.jpg" alt="Оливковая сумка" />
                    <button
                      className="round-arrow"
                      aria-label="Открыть сумку"
                      onClick={() => {
                        const p = products.find((p) => p.id === 2);
                        if (p) openProduct(p);
                      }}
                    >
                      <ArrowUpRight size={23} />
                    </button>
                  </div>
                )}
              </HomeBannerCarousel>
            )}
            {tab === "catalog" && !query && (
              <HomeUpdates
                orders={ordersQuery.data || []}
                loading={!!user && ordersQuery.isLoading}
                openOrders={() => go("orders")}
              />
            )}
            {tab === "catalog" && (
              <div className="benefits">
                <div>
                  <ShieldCheck size={20} />
                  <span>Проверяем каждый товар</span>
                </div>
                <div>
                  <Truck size={21} />
                  <span>Доставляем в ваш ПВЗ СДЭК</span>
                </div>
                <div>
                  <Heart size={20} />
                  <span>На связи на каждом этапе</span>
                </div>
              </div>
            )}
            {(tab === "catalog" || tab === "sale") && (
              <div className="home-tabs categories">
                <button
                  className={tab === "catalog" ? "selected" : ""}
                  onClick={() => {
                    setCategory("Все");
                    setQuery("");
                    go("catalog");
                  }}
                >
                  Все находки
                </button>
                <button
                  className={tab === "sale" ? "selected" : ""}
                  onClick={() => {
                    setCategory("Все");
                    setQuery("");
                    setMinPrice("");
                    setMaxPrice("");
                    setSort("cheap");
                    go("sale");
                  }}
                >
                  Распродажа
                </button>
              </div>
            )}
            {tab === "sale" && (
              <div className="sale-intro">
                <span className="eyebrow">
                  МАЛЕНЬКАЯ ЦЕНА · БОЛЬШАЯ РАДОСТЬ
                </span>
                <h1>Находки по самым приятным ценам</h1>
                <p>
                  Пять самых доступных товаров в Teo — от дешёвых к дорогим.
                </p>
                <small>
                  Отметка «скидка» выделяет доступные цены; снижение цены
                  показано только при наличии старой цены.
                </small>
              </div>
            )}
            <section id="catalog" className="catalog">
              <div className="section-heading">
                <div>
                  <span className="eyebrow section-eyebrow">
                    ВЫБРАНО С ЗАБОТОЙ
                  </span>
                  <h2>
                    {tab === "favorites"
                      ? "Избранное"
                      : tab === "search"
                        ? "Результаты поиска"
                        : tab === "sale"
                          ? "Распродажа"
                          : "Ваши будущие любимые вещи"}
                    <span>{visible.length}</span>
                  </h2>
                </div>
                <button
                  className="filter-btn"
                  onClick={() => setFilters(!filters)}
                >
                  <SlidersHorizontal size={17} />
                  <span>Фильтры</span>
                </button>
              </div>
              <div className="catalog-controls">
                <div className="categories">
                  {categories.map((c) => (
                    <button
                      key={c}
                      className={category === c ? "selected" : ""}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <select
                  aria-label="Сортировка"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="popular">По популярности</option>
                  <option value="cheap">Сначала дешевле</option>
                  <option value="expensive">Сначала дороже</option>
                  <option value="new">Сначала новинки</option>
                </select>
              </div>
              {filters && tab !== "search" && (
                <div className="filter-panel">
                  <span>Сортировать по цене</span>
                  <button onClick={() => setSort("cheap")}>
                    По возрастанию
                  </button>
                  <button onClick={() => setSort("expensive")}>
                    По убыванию
                  </button>
                  <button
                    onClick={() => {
                      setSort("popular");
                      setCategory("Все");
                      setQuery("");
                    }}
                  >
                    Сбросить
                  </button>
                </div>
              )}
              {tab === "search" && (
                <div className="search-filter-panel">
                  <div>
                    <SlidersHorizontal size={17} />
                    <b>Фильтры поиска</b>
                    <button
                      onClick={() => {
                        setMinPrice("");
                        setMaxPrice("");
                        setCategory("Все");
                        setSort("popular");
                      }}
                    >
                      Сбросить
                    </button>
                  </div>
                  <div className="search-filter-fields">
                    <label>
                      Цена от, ₽
                      <input
                        aria-label="Цена от"
                        type="number"
                        min="0"
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value)}
                      />
                    </label>
                    <label>
                      Цена до, ₽
                      <input
                        aria-label="Цена до"
                        type="number"
                        min="0"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                      />
                    </label>
                    <label>
                      Порядок
                      <select
                        aria-label="Порядок результатов"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="popular">Популярные</option>
                        <option value="cheap">Сначала дешевле</option>
                        <option value="expensive">Сначала дороже</option>
                        <option value="new">Новинки</option>
                      </select>
                    </label>
                  </div>
                  {Number(minPrice) > Number(maxPrice) && maxPrice && (
                    <p className="muted">
                      Цена «до» должна быть не меньше цены «от».
                    </p>
                  )}
                </div>
              )}
              {catalogQuery.isLoading && (
                <div className="api-state">Загружаем находки…</div>
              )}
              {catalogQuery.isError && (
                <div className="api-state">
                  Не удалось загрузить каталог.
                  <button onClick={() => catalogQuery.refetch()}>
                    Повторить
                  </button>
                </div>
              )}
              <div className="product-grid">
                {visible.map((p, i) => (
                  <article
                    className="product-card"
                    key={p.id}
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    <div className={"product-image image-" + p.id}>
                      <button
                        className="product-open"
                        aria-label={"Открыть: " + p.name}
                        onClick={() => openProduct(p)}
                      >
                        <img src={p.image} alt={p.name} />
                      </button>
                      {saleIds.includes(p.id) ? (
                        <span className="product-tag discount-tag">
                          % скидка
                        </span>
                      ) : (
                        p.tag && (
                          <span
                            className={
                              "product-tag " +
                              (p.tag === "Новинка" ? "green" : "")
                            }
                          >
                            {p.tag === "Хит Teo" && (
                              <Star size={10} fill="currentColor" />
                            )}
                            {p.tag}
                          </span>
                        )
                      )}
                      <button
                        className={
                          "favorite-btn " +
                          (favorites.includes(p.id) ? "liked" : "")
                        }
                        aria-label={"В избранное: " + p.name}
                        onClick={(e) => {
                          e.stopPropagation();
                          like(p.id);
                        }}
                      >
                        <Heart
                          size={19}
                          fill={
                            favorites.includes(p.id) ? "currentColor" : "none"
                          }
                        />
                      </button>
                    </div>
                    <div className="product-info">
                      <div className="product-meta">
                        <span>{p.category}</span>
                        <span>
                          <Star size={11} fill="currentColor" />
                          {p.rating}
                        </span>
                      </div>
                      <button
                        className="product-title"
                        onClick={() => openProduct(p)}
                      >
                        {p.name}
                      </button>
                      <div className="price-row">
                        <div>
                          <b>{money(p.price)}</b>
                          {p.oldPrice && <del>{money(p.oldPrice)}</del>}
                        </div>
                        <button
                          className={
                            "add-btn " +
                            (cart.some((c) => c.productId === p.id)
                              ? "added"
                              : "")
                          }
                          aria-label={
                            cart.some((c) => c.productId === p.id)
                              ? "В корзину: " + p.name
                              : "Добавить: " + p.name
                          }
                          onClick={() =>
                            cart.some((c) => c.productId === p.id)
                              ? go("cart")
                              : add(p)
                          }
                        >
                          {cart.some((c) => c.productId === p.id) ? (
                            <ShoppingBag size={18} />
                          ) : (
                            <Plus size={20} />
                          )}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {visible.length === 0 && (
                <div className="empty">
                  <Search size={36} />
                  <h3>
                    {tab === "favorites"
                      ? "Здесь будут ваши любимые вещи"
                      : "Пока ничего не нашлось"}
                  </h3>
                  <p>
                    {tab === "favorites"
                      ? "Нажмите на сердечко у понравившегося товара."
                      : "Пришлите фото — поможем найти похожий товар."}
                  </p>
                  <button
                    className="primary"
                    onClick={() =>
                      tab === "favorites" ? go("catalog") : setModal("photo")
                    }
                  >
                    {tab === "favorites" ? "В каталог" : "Отправить фото"}
                  </button>
                </div>
              )}
            </section>
            <section className="photo-banner">
              <div className="photo-banner-icon">
                <Camera size={30} />
              </div>
              <div>
                <h3>Влюбились в вещь, но не нашли её здесь?</h3>
                <p>Пришлите фото — мы поищем её для вас на Taobao.</p>
              </div>
              <button
                onClick={() => {
                  setPhoto("");
                  setComment("");
                  setModal("photo");
                }}
              >
                Найти по фото <ArrowUpRight size={17} />
              </button>
            </section>
          </>
        )}
        {tab === "cart" && (
          <section className="page-section">
            <div className="page-title">
              <span className="eyebrow">ПОЧТИ ВАШЕ</span>
              <h1>
                Корзина <small>{count}</small>
              </h1>
            </div>
            {!count ? (
              <div className="empty">
                <ShoppingBag size={42} />
                <h3>Здесь пока пусто</h3>
                <p>Самые классные находки уже ждут в каталоге.</p>
                <button className="primary" onClick={() => go("catalog")}>
                  Выбрать что-то особенное <ArrowRight size={18} />
                </button>
              </div>
            ) : (
              <div className="cart-layout">
                <div className="cart-items">
                  {cart.map((c, i) => {
                    const p = products.find((p) => p.id === c.productId);
                    if (!p) return null;
                    return (
                      <div className="cart-item" key={p.id + c.variant}>
                        <img src={p.image} alt={p.name} />
                        <div>
                          <span className="muted">{p.category}</span>
                          <h3>{p.name}</h3>
                          <p>{c.variant}</p>
                          <b>{money(p.price)}</b>
                        </div>
                        <div className="quantity">
                          <button
                            aria-label="Уменьшить"
                            onClick={() => qty(i, -1)}
                          >
                            <Minus size={14} />
                          </button>
                          <span>{c.qty}</span>
                          <button
                            aria-label="Увеличить"
                            onClick={() => qty(i, 1)}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <button
                          className="subtle"
                          aria-label="Удалить товар"
                          onClick={() =>
                            setCart((prev) => prev.filter((_, j) => i !== j))
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    );
                  })}
                  <div className="care-note">
                    <ShieldCheck size={20} />
                    <p>
                      Закупим на Taobao, проверим и отправим вам.
                      <br />
                      <span>
                        Выбирайте любимое — об остальном позаботится Teo.
                      </span>
                    </p>
                  </div>
                </div>
                <aside className="summary">
                  <h3>Ваш заказ</h3>
                  <button
                    className="pickup-card"
                    onClick={() => {
                      setPickupNext(false);
                      setModal("pickup");
                    }}
                  >
                    <MapPin size={22} />
                    <div>
                      <b>Пункт выдачи СДЭК</b>
                      <span>{point || "Выберите удобный пункт выдачи"}</span>
                    </div>
                    <ChevronRight size={18} />
                  </button>
                  <div className="summary-line">
                    <span>Товары · {count} шт.</span>
                    <b>{money(total)}</b>
                  </div>
                  <div className="summary-line muted">
                    <span>Доставка до ПВЗ</span>
                    <span>Отдельная оплата после получения на склад</span>
                  </div>
                  <div className="summary-total">
                    <span>Сумма товаров без доставки</span>
                    <b>{money(total)}</b>
                  </div>
                  <button className="primary full" onClick={checkout}>
                    Оформить заявку <ArrowRight size={18} />
                  </button>
                </aside>
              </div>
            )}
          </section>
        )}
        {tab === "orders" && (
          <section className="page-section">
            <div className="page-title">
              <span className="eyebrow">НА КАЖДОМ ЭТАПЕ РЯДОМ</span>
              <h1>Мои заказы</h1>
            </div>
            {ordersQuery.isLoading ? (
              <div className="api-state">Загружаем заказы…</div>
            ) : !ordersQuery.data?.length ? (
              <div className="empty">
                <Package size={42} />
                <h3>Ваши находки ещё впереди</h3>
                <p>После оформления здесь появится статус заказа.</p>
                <button className="primary" onClick={() => go("catalog")}>
                  Перейти в каталог
                </button>
              </div>
            ) : (
              <BuyerOrders orders={ordersQuery.data || []} notify={notify} />
            )}
          </section>
        )}
        {tab === "profile" && (
          <section className="profile-page page-section">
            <div className="page-title">
              <span className="eyebrow">ВАШ УГОЛОК В TEO</span>
              <h1>Профиль</h1>
            </div>
            {isModerator && (
              <button className="moderator-entry" onClick={() => go("admin")}>
                <Settings2 />
                <div>
                  <b>Панель модератора</b>
                  <span>Заказы, товары и фото-запросы</span>
                </div>
                <ChevronRight />
              </button>
            )}
            {!user?.phone && <RegistrationCard />}
            {user && (
              <FullNameCard
                key={`fio-${user.id}`}
                user={user}
                notify={notify}
              />
            )}
            {profileQuery.isLoading && (
              <div className="api-state">Подтверждаем Telegram-аккаунт…</div>
            )}
            {profileQuery.isError && (
              <p className="api-state">{profileQuery.error.message}</p>
            )}
            <div className="profile-layout">
              <div className="profile-card">
                <div className="avatar">Т</div>
                <h2>{user?.name || "Гость Teo"}</h2>
                <p>
                  {user?.username ? "@" + user.username : "Username не задан"}
                </p>
                <p>{user?.phone || "Номер не указан"}</p>
                <div className="profile-stats">
                  <div>
                    <b>{ordersQuery.data?.length || 0}</b>
                    <span>заказов</span>
                  </div>
                  <div>
                    <b>{favorites.length}</b>
                    <span>избранное</span>
                  </div>
                </div>
              </div>
              <div className="profile-menu">
                <button onClick={() => go("orders")}>
                  <Package />
                  <div>
                    <b>Мои заказы</b>
                    <span>Статусы и история ваших покупок</span>
                  </div>
                  <ChevronRight />
                </button>
                <button
                  onClick={() => {
                    setPickupNext(false);
                    setModal("pickup");
                  }}
                >
                  <MapPin />
                  <div>
                    <b>Город и пункт выдачи СДЭК</b>
                    <span>{point || city || "Выберите город и ПВЗ"}</span>
                  </div>
                  <ChevronRight />
                </button>
                <button onClick={() => go("favorites")}>
                  <Heart />
                  <div>
                    <b>Избранное</b>
                    <span>Всё, что запало в сердце</span>
                  </div>
                  <ChevronRight />
                </button>
                <button onClick={() => setModal("photo")}>
                  <Camera />
                  <div>
                    <b>Поиск по фото</b>
                    <span>
                      {requests.length
                        ? `${requests.length} запросов отправлено`
                        : "Поможем найти ту самую вещь"}
                    </span>
                  </div>
                  <ChevronRight />
                </button>
              </div>
            </div>
            {requests.length > 0 && (
              <div className="request-list">
                <h3>Мои фото-запросы</h3>
                {requests.map((r) => (
                  <div className="request-card" key={r.id}>
                    <img src={r.image} alt="Фото-запрос" />
                    <div>
                      <b>{r.id}</b>
                      <p>{r.comment || "Без комментария"}</p>
                      <span className="status-pill">{r.status}</span>
                      {r.productId && (
                        <button
                          onClick={() => {
                            const p = products.find(
                              (p) => p.id === r.productId,
                            );
                            if (p) openProduct(p);
                          }}
                        >
                          Открыть найденный товар <ArrowUpRight size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        {tab === "admin" && isModerator && (
          <section className="page-section">
            <div className="page-title">
              <span className="eyebrow">УПРАВЛЕНИЕ TEO</span>
              <h1>Панель модератора</h1>
            </div>
            {adminQuery.isLoading && (
              <div className="api-state">Загружаем панель…</div>
            )}
            {adminQuery.isError && (
              <p className="api-state">{adminQuery.error.message}</p>
            )}
            {adminQuery.data && (
              <AdminNotifications
                pending={adminQuery.data.pendingNotifications}
                notify={notify}
                refresh={() => adminQuery.refetch()}
              />
            )}
            <AdminStats orders={orders} requests={requests} />
            <div className="categories admin-tabs">
              {[
                "Заказы",
                "Товары",
                "Фото-запросы",
                ...(user?.role === "owner"
                  ? ["Настройки", "Пользователи"]
                  : []),
              ].map((t) => (
                <button
                  className={adminTab === t ? "selected" : ""}
                  onClick={() => setAdminTab(t)}
                  key={t}
                >
                  {t}
                </button>
              ))}
            </div>
            {adminTab === "Заказы" && (
              <AdminOrders
                orders={orders}
                owner={user.role === "owner"}
                notify={notify}
              />
            )}
            {adminTab === "Товары" && (
              <AdminProducts
                products={products}
                onNew={newProduct}
                notify={notify}
                onEdit={(p) => {
                  setEdit({ ...p });
                  setBuyPrice(p.taobaoYuan || 0);
                  setClothingChoice(
                    p.clothing ??
                      (p.category === "Одежда" || p.category === "Обувь"),
                  );
                  setModal("edit");
                }}
              />
            )}
            {adminTab === "Фото-запросы" &&
              (requests.length ? (
                requests.map((r) => (
                  <div className="request-card" key={r.id}>
                    <img src={r.image} alt="Фото-запрос" />
                    <div>
                      <h3>{r.id}</h3>
                      <a
                        className="download-photo"
                        href={r.image}
                        download={`${r.id}.jpg`}
                      >
                        Скачать фото покупателя <ArrowRight size={15} />
                      </a>
                      <p>{r.comment || "Без комментария"}</p>
                      <PhotoWorkControls
                        request={r}
                        moderatorId={user.id}
                        notify={notify}
                      />
                      <select
                        value={r.status}
                        disabled={setRequestMutation.isPending}
                        onChange={(e) =>
                          updateRequest(
                            r.id,
                            e.target.value as
                              "Новый" | "В поиске" | "Найден" | "Добавлен",
                            r.productId,
                          )
                        }
                      >
                        {["Новый", "В поиске", "Найден", "Добавлен"].map(
                          (s) => (
                            <option key={s}>{s}</option>
                          ),
                        )}
                      </select>
                      <select
                        aria-label="Связанный товар"
                        value={r.productId || ""}
                        disabled={setRequestMutation.isPending}
                        onChange={(e) =>
                          updateRequest(
                            r.id,
                            e.target.value
                              ? "Добавлен"
                              : (r.status as
                                  "Новый" | "В поиске" | "Найден" | "Добавлен"),
                            Number(e.target.value) || undefined,
                          )
                        }
                      >
                        <option value="">Привязать товар</option>
                        {products.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <p className="muted">
                        {r.username ? "@" + r.username : "Без username"} · ID{" "}
                        {r.userId} · {r.phone || "Номер не указан"}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty">
                  <Camera size={35} />
                  <h3>Фото-запросов пока нет</h3>
                </div>
              ))}
            {adminTab === "Пользователи" && user?.role === "owner" && (
              <AdminUsers users={adminQuery.data?.users || []} />
            )}
            {adminTab === "Настройки" && (
              <CommerceSettingsPanel
                owner={user.role === "owner"}
                notify={notify}
              />
            )}
          </section>
        )}
        <footer>
          <button className="logo" onClick={() => go("catalog")}>
            teo<span>®</span>
          </button>
          <span>Хорошие вещи ближе, чем кажется.</span>
        </footer>
      </main>
      <nav className="mobile-nav">
        {(
          [
            { t: "catalog", label: "Каталог", icon: LayoutGrid },
            { t: "favorites", label: "Избранное", icon: Heart },
            { t: "cart", label: "Корзина", icon: ShoppingBag },
            { t: "orders", label: "Мои заказы", icon: Package },
            { t: "profile", label: "Профиль", icon: UserRound },
          ] as const
        ).map(({ t, label, icon: Icon }) => (
          <button
            className={tab === t ? "active" : ""}
            onClick={() => go(t)}
            key={t}
          >
            <span>
              <Icon size={21} />
              {t === "cart" && count > 0 && <i>{count}</i>}
            </span>
            {label}
          </button>
        ))}
      </nav>
      {selected && (
        <div className="overlay product-screen-overlay">
          <dialog
            open
            className="product-modal"
            aria-modal="true"
            aria-label={selected.name}
          >
            <div className="product-screen-header">
              <button className="logo" onClick={() => setSelected(null)}>
                teo<span>®</span>
              </button>
              <span>{selected.name}</span>
              <button
                className="close-btn"
                aria-label="Закрыть товар"
                onClick={() => setSelected(null)}
              >
                <X size={23} />
              </button>
            </div>
            <div className="product-screen-scroll">
              <div className="product-screen-layout">
                <div className="detail-image">
                  <ProductPhotoSlider
                    key={selected.id}
                    product={selected}
                    onOpen={() => setGalleryProduct(selected)}
                  />
                  <button
                    className={
                      "favorite-btn " +
                      (favorites.includes(selected.id) ? "liked" : "")
                    }
                    onClick={() => like(selected.id)}
                    aria-label="В избранное"
                  >
                    <Heart
                      fill={
                        favorites.includes(selected.id)
                          ? "currentColor"
                          : "none"
                      }
                      size={23}
                    />
                  </button>
                </div>
                <div className="detail-content">
                  <span className="eyebrow">{selected.category}</span>
                  <h2>{selected.name}</h2>
                  <div className="detail-price">
                    <b>{money(selected.price)}</b>
                    <span>
                      <Star size={15} fill="currentColor" />
                      {selected.rating}
                    </span>
                  </div>
                  <p>{selected.description}</p>
                  <label className="variant-label">
                    {selected.clothing ||
                    selected.category === "Одежда" ||
                    selected.category === "Обувь"
                      ? "Размер"
                      : "Цвет"}
                    : <b>{variant}</b>
                  </label>
                  <div className="variants">
                    {(selected.clothing
                      ? selected.sizes?.length
                        ? selected.sizes
                        : ["Размер уточнит модератор"]
                      : selected.category === "Одежда"
                        ? ["S", "M", "L", "XL"]
                        : selected.category === "Обувь"
                          ? ["36", "37", "38", "39", "40", "41"]
                          : [selected.color]
                    ).map((v) => (
                      <button
                        className={variant === v ? "selected" : ""}
                        key={v}
                        onClick={() => setVariant(v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  {(selected.clothing ||
                    selected.category === "Одежда" ||
                    selected.category === "Обувь") && (
                    <small className="size-note">
                      Размерная сетка продавца. Наличие размера подтвердим до
                      оплаты.
                    </small>
                  )}
                  <div className="detail-feature">
                    <Truck size={20} />
                    <div>
                      <b>Доставка в СДЭК</b>
                      <span>Срок доставки уточняется при оформлении</span>
                    </div>
                  </div>
                  <div className="detail-feature">
                    <ShieldCheck size={20} />
                    <div>
                      <b>С заботой о вашей покупке</b>
                      <span>Проверка товара перед отправкой</span>
                    </div>
                  </div>
                  <button
                    className="primary full"
                    onClick={() =>
                      cart.some(
                        (c) =>
                          c.productId === selected.id && c.variant === variant,
                      )
                        ? go("cart")
                        : add(selected, variant)
                    }
                  >
                    <ShoppingBag size={18} />
                    {cart.some(
                      (c) =>
                        c.productId === selected.id && c.variant === variant,
                    )
                      ? "Перейти в корзину"
                      : "Добавить в корзину"}{" "}
                    <span>{money(selected.price)}</span>
                  </button>
                  <button
                    className="detail-cart-link"
                    onClick={() => go("cart")}
                  >
                    Перейти в корзину <ArrowRight size={15} />
                  </button>
                </div>
              </div>
              <ProductReviews key={selected.id} productId={selected.id} />
            </div>
          </dialog>
        </div>
      )}
      {modal && (
        <div className="overlay">
          <dialog open className="modal" aria-modal="true">
            <button
              className="close-btn"
              aria-label="Закрыть"
              disabled={paying}
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "pickup" && (
              <>
                <span className="eyebrow">БЛИЖЕ К ВАМ</span>
                <h2>Выберите ПВЗ СДЭК</h2>
                <DestinationPicker
                  requireAddress={pickupNext}
                  city={city}
                  point={point}
                  authenticated={!!user}
                  notify={notify}
                  onSave={(newCity, newPoint) => {
                    setCity(newCity);
                    setPoint(newPoint);
                    setModal(pickupNext ? "payment" : null);
                    setPickupNext(false);
                  }}
                />
              </>
            )}
            {modal === "photo" && (
              <form onSubmit={submitRequest}>
                <span className="eyebrow">НАЙДЁМ ТО САМОЕ</span>
                <h2>Покажите, что ищете</h2>
                {!user?.phone && <RegistrationCard />}
                <p className="muted">
                  Пришлите фото или скриншот понравившейся вещи.
                </p>
                <label className={"photo-upload " + (photo ? "has-photo" : "")}>
                  {photo ? (
                    <img src={photo} alt="Загруженное фото" />
                  ) : (
                    <>
                      <ImagePlus size={36} />
                      <b>Выбрать фото</b>
                      <span>JPG, PNG, WEBP · до 8 МБ</span>
                    </>
                  )}
                  <input
                    aria-label="Загрузить фото"
                    type="file"
                    accept="image/*"
                    onChange={(e) => upload(e.target.files?.[0])}
                  />
                </label>
                <label className="camera-upload">
                  <Camera size={16} />
                  Сделать фото
                  <input
                    aria-label="Загрузить фото"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => upload(e.target.files?.[0])}
                  />
                </label>
                <label>
                  Комментарий
                  <textarea
                    aria-label="Комментарий"
                    placeholder="Например: ищу такую сумку в зелёном цвете"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
                <button
                  className="primary full"
                  disabled={!photo || createRequest.isPending || !user?.phone}
                  type="submit"
                >
                  {createRequest.isPending
                    ? "Отправляем…"
                    : "Отправить фото-запрос"}{" "}
                  <ArrowRight size={18} />
                </button>
              </form>
            )}
            {modal === "payment" && (
              <>
                <div className="modal-symbol">
                  <ShoppingBag size={28} />
                </div>
                <h2>Ваш заказ</h2>
                <InfoTip summary="Сейчас деньги не списываются">
                  <p>
                    Сначала подтвердим наличие, затем выставим оплату товара.
                  </p>
                  <p>{shippingNotice}</p>
                </InfoTip>
                <div className="payment-info">
                  <span>{count} товаров</span>
                  <b>{money(total)}</b>
                </div>
                <p className="pickup-text">
                  <MapPin size={17} />
                  {point}
                </p>

                {user && !hasFullName(user) && (
                  <FullNameCard
                    key={`fio-pay-${user.id}`}
                    user={user}
                    notify={notify}
                  />
                )}
                <button
                  className="primary full"
                  disabled={paying || !user || !hasFullName(user)}
                  onClick={submitOrder}
                >
                  {paying ? "Оформляем…" : "Отправить заявку модератору"}
                </button>
              </>
            )}
            {modal === "success" && (
              <div className="success-content">
                <div className="modal-symbol success">
                  <CheckCircle2 size={40} />
                </div>
                <span className="eyebrow">ВАША НАХОДКА УЖЕ БЛИЖЕ</span>
                <h2>Заявка принята!</h2>
                <p>
                  Следить за товаром можно в приложении. Оплата согласуется с
                  модератором.
                </p>

                <button
                  className="primary full"
                  onClick={() => {
                    setModal(null);
                    go("orders");
                  }}
                >
                  Посмотреть заказ <ArrowRight size={18} />
                </button>
              </div>
            )}
            {modal === "edit" && edit && (
              <ProductEditor
                edit={edit}
                setEdit={setEdit}
                clothingChoice={clothingChoice}
                setClothingChoice={setClothingChoice}
                buyPrice={buyPrice}
                setBuyPrice={setBuyPrice}
                pricingConfigured={pricingReady(
                  commerceQuery.data || emptySettings,
                )}
                pricing={commerceQuery.data || emptySettings}
                existing={products.some((p) => p.id === edit.id)}
                saving={saveProductMutation.isPending}
                notify={notify}
                saveProduct={saveProduct}
              />
            )}
          </dialog>
        </div>
      )}
      {galleryProduct && (
        <ProductGallery
          product={galleryProduct}
          onClose={() => setGalleryProduct(null)}
        />
      )}
      {toast && (
        <output className="toast">
          <CheckCircle2 size={19} />
          {toast}
        </output>
      )}
    </div>
  );
}
