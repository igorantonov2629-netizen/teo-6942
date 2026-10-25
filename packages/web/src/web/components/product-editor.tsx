import { TaobaoLinkField } from "./taobao-link-field";
import {
  apparelSizes,
  clothingTypes,
  moderatorSizeMarker,
  publishProblems,
  saveProblems,
  shoeSizes,
} from "../../shared/product-rules";
import { Check } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type FormEvent,
} from "react";
import { ProductPhotosEditor } from "./product-photos-editor";
import { categories, type Product } from "../lib/teo-data";
import {
  breakdownText,
  priceBreakdown,
  tierLabels,
  type Markups,
} from "../../shared/pricing";
type Props = {
  edit: Product;
  setEdit: Dispatch<SetStateAction<Product | null>>;
  clothingChoice: boolean | null;
  setClothingChoice: Dispatch<SetStateAction<boolean | null>>;
  buyPrice: number;
  setBuyPrice: Dispatch<SetStateAction<number>>;
  pricingConfigured: boolean;
  pricing: { rate: number | null; markups?: Markups };
  existing: boolean;
  saving: boolean;
  notify: (s: string) => void;
  saveProduct: (e: FormEvent) => void;
};
export function ProductEditor({
  edit,
  setEdit,
  clothingChoice,
  setClothingChoice,
  buyPrice,
  setBuyPrice,
  pricing,
  pricingConfigured,
  existing,
  saving,
  notify,
  saveProduct,
}: Props) {
  const [photosBusy, setPhotosBusy] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [customSize, setCustomSize] = useState("");
  const problemsRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (attempt) problemsRef.current?.scrollIntoView({ block: "center" });
  }, [attempt]);
  const current = { ...edit, clothing: clothingChoice ?? undefined };
  const breakdown =
    pricingConfigured && buyPrice > 0
      ? priceBreakdown(buyPrice, pricing, edit)
      : null;
  const autoPrice = breakdown?.rub;
  // Keep the ruble field in sync when ¥, category or type change the tier.
  useEffect(() => {
    if (autoPrice && autoPrice !== edit.price)
      setEdit((e) => (e ? { ...e, price: autoPrice } : e));
  }, [autoPrice, edit.price, setEdit]);
  const blocking = saveProblems(current);
  const missingForCatalog = publishProblems(current);
  const sizeOptions = edit.clothingType === "обувь" ? shoeSizes : apparelSizes;
  const sizes = edit.sizes || [];
  const toggleSize = (size: string) =>
    setEdit({
      ...edit,
      sizes: sizes.includes(size)
        ? sizes.filter((s) => s !== size)
        : [...sizes, size],
    });
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (photosBusy) return;
        if (blocking.length) {
          setShowProblems(true);
          setAttempt((n) => n + 1);
          return;
        }
        saveProduct(e);
      }}
    >
      <h2>{existing ? "Редактировать товар" : "Новый товар"}</h2>
      <div className="clothing-choice">
        <h3>Это одежда или обувь?</h3>
        <button
          type="button"
          className={clothingChoice === true ? "selected" : ""}
          onClick={() => {
            setClothingChoice(true);
            // Keep already confirmed sizes; never pre-select guessed ones.
            const type = edit.clothing
              ? edit.clothingType || "футболка"
              : "футболка";
            setEdit({
              ...edit,
              clothing: true,
              category: type === "обувь" ? "Обувь" : "Одежда",
              clothingType: type,
              sizes: edit.clothing ? edit.sizes || [] : [],
            });
          }}
        >
          Да, одежда / обувь
        </button>
        <button
          type="button"
          className={clothingChoice === false ? "selected" : ""}
          onClick={() => {
            setClothingChoice(false);
            setEdit({
              ...edit,
              clothing: false,
              category: "Для дома",
              sizes: undefined,
              clothingType: undefined,
            });
          }}
        >
          Нет
        </button>
      </div>
      {clothingChoice !== null && (
        <>
          {clothingChoice && (
            <div className="clothing-options">
              <label>
                Тип одежды
                <select
                  aria-label="Тип одежды"
                  value={edit.clothingType || ""}
                  onChange={(e) => {
                    const type = e.target.value;
                    const shoeChange =
                      (type === "обувь") !== (edit.clothingType === "обувь");
                    setEdit({
                      ...edit,
                      clothingType: type,
                      category: type === "обувь" ? "Обувь" : "Одежда",
                      sizes:
                        type === "размер уточнит модератор"
                          ? [moderatorSizeMarker]
                          : shoeChange ||
                              edit.clothingType === "размер уточнит модератор"
                            ? []
                            : edit.sizes || [],
                    });
                  }}
                >
                  <option value="" disabled>
                    Выберите тип
                  </option>
                  {clothingTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              {edit.clothingType !== "размер уточнит модератор" && (
                <div className="size-selector">
                  <span>
                    Размерная сетка продавца · отметьте все размеры из
                    карточки, наличие проверим по каждому заказу
                  </span>
                  {[
                    ...sizeOptions,
                    ...sizes.filter((x) => !sizeOptions.includes(x)),
                  ].map((size) => (
                    <button
                      type="button"
                      key={size}
                      aria-pressed={sizes.includes(size)}
                      className={sizes.includes(size) ? "selected" : ""}
                      onClick={() => toggleSize(size)}
                    >
                      {size}
                    </button>
                  ))}
                  <div className="custom-size">
                    <input
                      aria-label="Свой размер"
                      placeholder="Другой размер, напр. 44.5 или S/M"
                      maxLength={50}
                      value={customSize}
                      onChange={(e) => setCustomSize(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={!customSize.trim()}
                      onClick={() => {
                        const v = customSize.trim().replace(",", ".");
                        if (!sizes.includes(v))
                          setEdit({ ...edit, sizes: [...sizes, v] });
                        setCustomSize("");
                      }}
                    >
                      Добавить
                    </button>
                  </div>
                  {!sizes.length && (
                    <small className="size-warning">
                      Размеры не отмечены — товар можно сохранить только скрытым
                      черновиком.
                    </small>
                  )}
                </div>
              )}
            </div>
          )}
          <label>
            Название
            <input
              aria-label="Название"
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              Категория
              <select
                aria-label="Категория"
                value={edit.category}
                disabled={clothingChoice === true}
                onChange={(e) => setEdit({ ...edit, category: e.target.value })}
              >
                {categories
                  .slice(1)
                  .filter(
                    (c) => clothingChoice || !["Одежда", "Обувь"].includes(c),
                  )
                  .map((c) => (
                    <option key={c}>{c}</option>
                  ))}
              </select>
            </label>
            <label>
              Цвет
              <input
                aria-label="Цвет"
                value={edit.color}
                onChange={(e) => setEdit({ ...edit, color: e.target.value })}
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Закупка, ¥
              <input
                aria-label="Закупка, ¥"
                type="number"
                min="0.01"
                step="0.01"
                disabled={!pricingConfigured && !buyPrice}
                value={buyPrice || ""}
                onChange={(e) => setBuyPrice(Number(e.target.value))}
              />
            </label>
            <label>
              Продажа, ₽
              <input
                aria-label="Продажа, ₽"
                type="number"
                min="1"
                readOnly={buyPrice > 0 && pricingConfigured}
                value={edit.price}
                onChange={(e) =>
                  setEdit({ ...edit, price: Number(e.target.value) })
                }
              />
            </label>
          </div>
          {breakdown ? (
            <p className="price-breakdown" aria-label="Расчёт цены">
              <span>{tierLabels[breakdown.tier]}</span>
              {breakdownText(breakdown)}
            </p>
          ) : (
            <p className="muted">
              {pricingConfigured
                ? "Введите цену Taobao в юанях — рубли посчитаются по курсу, доставке до поставщика и сервису teo для этого типа товара. СДЭК оплачивается отдельно. Или оставьте юани пустыми и укажите цену в рублях."
                : "Курс пока не настроен — оставьте юани пустыми и укажите продажную цену в рублях."}
            </p>
          )}
          <TaobaoLinkField
            value={edit.taobao}
            onChange={(taobao) => setEdit((e) => (e ? { ...e, taobao } : e))}
          />
          <label className="draft-toggle">
            <input
              type="checkbox"
              aria-label="Скрыт из каталога"
              checked={!!edit.hidden}
              onChange={(e) => setEdit({ ...edit, hidden: e.target.checked })}
            />
            Скрыт из каталога (черновик)
          </label>
          <p className="muted">
            {edit.hidden
              ? missingForCatalog.length
                ? "Черновик сохранится скрытым. Для каталога ещё нужно: " +
                  missingForCatalog.join(" ")
                : "Черновик заполнен. Снимите галочку, чтобы товар появился в каталоге."
              : "Товар появится в каталоге сразу после сохранения. Одобрение владельца не требуется."}
          </p>
          <label>
            Описание
            <textarea
              aria-label="Описание"
              value={edit.description}
              onChange={(e) =>
                setEdit({ ...edit, description: e.target.value })
              }
            />
          </label>
          <ProductPhotosEditor
            edit={edit}
            setEdit={setEdit}
            onBusy={setPhotosBusy}
            notify={notify}
          />
          {showProblems && blocking.length > 0 && (
            <div className="form-problems" ref={problemsRef} role="alert">
              <b>Не сохранено. Исправьте:</b>
              <ul>
                {blocking.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              {!edit.hidden && (
                <small>
                  Или отметьте «Скрыт из каталога», чтобы сохранить черновик.
                </small>
              )}
            </div>
          )}
          <button
            className="primary full"
            disabled={saving || photosBusy}
            type="submit"
          >
            {saving ? "Сохраняем…" : "Сохранить товар"} <Check size={18} />
          </button>
        </>
      )}
    </form>
  );
}
