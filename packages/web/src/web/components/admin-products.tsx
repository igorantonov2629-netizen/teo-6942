import { useMemo, useState } from "react";
import { taobaoItemId } from "../../shared/taobao";
import { EyeOff, Eye, Pencil, Plus, Search } from "lucide-react";
import { money, type Product } from "../lib/teo-data";
import { useHideProduct } from "../queries/teo";

const filters = ["Все", "В каталоге", "Скрытые"] as const;

/** Moderator product list: large tappable cards, search and visibility filter. */
export function AdminProducts({
  products,
  onNew,
  onEdit,
  notify,
}: {
  products: Product[];
  onNew: () => void;
  onEdit: (p: Product) => void;
  notify: (s: string) => void;
}) {
  const hide = useHideProduct();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("Все");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const linkId = taobaoItemId(query);
    return products.filter(
      (p) =>
        (filter === "Все" || (filter === "Скрытые") === !!p.hidden) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.taobao.includes(linkId || q) ||
          p.category.toLowerCase().includes(q)),
    );
  }, [products, query, filter]);
  const hiddenCount = products.filter((p) => p.hidden).length;
  return (
    <div className="admin-products-wrap">
      <button className="primary admin-add-product" onClick={onNew}>
        <Plus size={20} /> Добавить товар
      </button>
      <div className="admin-products-tools">
        <label className="admin-search">
          <Search size={18} />
          <input
            aria-label="Поиск товара"
            placeholder="Название, категория или ссылка Taobao"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <fieldset className="admin-filter" aria-label="Показать">
          {filters.map((f) => (
            <button
              key={f}
              className={filter === f ? "selected" : ""}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
              <small>
                {f === "Все"
                  ? products.length
                  : f === "Скрытые"
                    ? hiddenCount
                    : products.length - hiddenCount}
              </small>
            </button>
          ))}
        </fieldset>
      </div>
      <div className="admin-products">
        {shown.map((p) => (
          <div key={p.id} className={p.hidden ? "is-hidden" : undefined}>
            <button
              className="admin-product-main"
              aria-label={`Открыть ${p.name}`}
              onClick={() => onEdit(p)}
            >
              <span className="admin-product-thumb">
                {p.image || p.images?.[0] ? (
                  <img src={p.image || p.images?.[0]} alt={p.name} />
                ) : (
                  <em>Нет фото</em>
                )}
              </span>
              <span className="admin-product-info">
                <b>{p.name}</b>
                <span className="admin-product-price">{money(p.price)}</span>
                <span className="admin-product-meta">
                  <i className={p.hidden ? "chip hidden" : "chip live"}>
                    {p.hidden ? "Скрыт" : "В каталоге"}
                  </i>
                  <small>{p.category}</small>
                </span>
              </span>
            </button>
            <div className="admin-product-actions">
              <button className="edit" onClick={() => onEdit(p)}>
                <Pencil size={17} /> Изменить
              </button>
              <button
                className="subtle"
                disabled={hide.isPending}
                onClick={async () => {
                  try {
                    await hide.mutateAsync({ id: p.id, hidden: !p.hidden });
                  } catch (error) {
                    notify(error instanceof Error ? error.message : "Ошибка");
                  }
                }}
              >
                {p.hidden ? <Eye size={17} /> : <EyeOff size={17} />}
                {p.hidden ? "Вернуть в каталог" : "Скрыть товар"}
              </button>
            </div>
          </div>
        ))}
        {!shown.length && (
          <p className="admin-empty">Ничего не найдено. Измените поиск.</p>
        )}
      </div>
    </div>
  );
}
