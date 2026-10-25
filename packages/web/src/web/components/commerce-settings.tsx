import { useState } from "react";
import {
  useCommerceSettings,
  useSaveCommerceSettings,
} from "../queries/commerce";
import { emptySettings, type CommerceSettings } from "../../shared/commerce";
import { normalizeMarkups, priceTiers, tierLabels } from "../../shared/pricing";
export function CommerceSettingsPanel({
  owner,
  notify,
}: {
  owner: boolean;
  notify: (t: string) => void;
}) {
  const query = useCommerceSettings(true);
  if (!owner)
    return (
      <p className="muted">
        Курс, наценку и реквизиты настраивает только владелец.
      </p>
    );
  if (!query.data)
    return <p>{query.error?.message || "Загружаем настройки…"}</p>;
  return (
    <SettingsForm
      key={JSON.stringify(query.data)}
      initial={query.data}
      notify={notify}
    />
  );
}
function SettingsForm({
  initial,
  notify,
}: {
  initial: CommerceSettings;
  notify: (t: string) => void;
}) {
  const [s, set] = useState<CommerceSettings>({
    ...emptySettings,
    ...initial,
    markups: normalizeMarkups(initial.markups),
  });
  const save = useSaveCommerceSettings();
  return (
    <form
      className="settings-card"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await save.mutateAsync(s);
          notify("Настройки сохранены. Оформленные суммы не меняются.");
        } catch (err) {
          notify(err instanceof Error ? err.message : "Ошибка");
        }
      }}
    >
      <h3>Курс и наценка</h3>
      <label>
        Курс ₽ за 1 ¥
        <input
          aria-label="Курс ₽ за 1 ¥"
          type="number"
          step="0.01"
          min="0.01"
          value={s.rate ?? ""}
          onChange={(e) =>
            set({
              ...s,
              rate: e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
      </label>
      <div className="markup-table">
        <div className="markup-row markup-head">
          <span>Тип товара</span>
          <span>Доставка до поставщика, ₽</span>
          <span>Сервис teo, ₽</span>
        </div>
        {priceTiers.map((tier) => (
          <div className="markup-row" key={tier}>
            <span>{tierLabels[tier]}</span>
            {(["delivery", "service"] as const).map((field) => (
              <input
                key={field}
               
                aria-label={`${tierLabels[tier]}: ${field === "delivery" ? "доставка до поставщика" : "сервис teo"}, ₽`}
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={s.markups[tier][field]}
                onChange={(e) =>
                  set({
                    ...s,
                    markups: {
                      ...s.markups,
                      [tier]: {
                        ...s.markups[tier],
                        [field]: Math.max(0, Math.round(Number(e.target.value))),
                      },
                    },
                  })
                }
              />
            ))}
          </div>
        ))}
      </div>
      <p className="muted">
        Цена ₽ = цена Taobao ¥ × курс + доставка до поставщика + сервис teo
        (по типу товара). Доставка СДЭК из Владивостока оплачивается отдельно.
        Изменения пересчитают цены товаров с указанной ценой в юанях, но не уже
        оформленные заказы.
      </p>
      <h3>Реквизиты для переводов</h3>
      {(
        [
          ["bank", "Банк"],
          ["recipient", "Имя получателя"],
          ["details", "Номер карты или телефон для СБП"],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            aria-label={label}
            value={s[key]}
            onChange={(e) => set({ ...s, [key]: e.target.value })}
          />
        </label>
      ))}
      <small>
        Не вводите CVV, срок карты, пароли или коды. Реквизиты доступны
        покупателю только в его выставленном счёте.
      </small>
      <button className="primary full" disabled={save.isPending}>
        Сохранить настройки
      </button>
    </form>
  );
}
