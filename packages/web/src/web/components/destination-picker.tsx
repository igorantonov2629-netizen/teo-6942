import { useState } from "react";
import { useCities, useDestination } from "../queries/commerce";
import { InfoTip } from "./info-tip";
export function DestinationPicker({
  city,
  point,
  authenticated,
  requireAddress = true,
  onSave,
  notify,
}: {
  city: string;
  point: string;
  authenticated: boolean;
  requireAddress?: boolean;
  onSave: (city: string, point: string) => void;
  notify: (t: string) => void;
}) {
  const [query, setQuery] = useState(city.split(",")[0] || "");
  const [chosen, setChosen] = useState(city);
  const [address, setAddress] = useState(
    point.startsWith(city + ", ") ? point.slice(city.length + 2) : "",
  );
  const cities = useCities(query);
  const save = useDestination();
  return (
    <form
      className="destination-picker"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const result = authenticated
            ? await save.mutateAsync({ city: chosen, address })
            : {
                city: chosen,
                point: address.trim() ? `${chosen}, ${address.trim()}` : "",
              };
          onSave(result.city, result.point);
        } catch (err) {
          notify(err instanceof Error ? err.message : "Ошибка сохранения");
        }
      }}
    >
      <label>
        Город
        <input
          aria-label="Поиск города"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setChosen("");
            setAddress("");
          }}
          placeholder="Введите название города"
        />
      </label>
      {!chosen && (
        <div className="city-options">
          {cities.isLoading ? (
            <p>Ищем города…</p>
          ) : cities.isError ? (
            <p>Не удалось загрузить города</p>
          ) : cities.data?.length ? (
            cities.data.map((c) => (
              <button
                type="button"
                key={c.name + c.region}
                onClick={() => {
                  setChosen(`${c.name}, ${c.region}`);
                  setQuery(c.name);
                }}
              >
                {c.name}
                <small>{c.region}</small>
              </button>
            ))
          ) : (
            <p>Город не найден. Обратитесь в поддержку.</p>
          )}
        </div>
      )}
      {chosen && (
        <p className="muted">
          {chosen}{" "}
          <button
            type="button"
            onClick={() => {
              setChosen("");
              setAddress("");
            }}
          >
            Изменить
          </button>
        </p>
      )}
      <label>
        Адрес ПВЗ СДЭК
        <input
          aria-label="Адрес ПВЗ СДЭК"
          required={requireAddress}
          minLength={requireAddress ? 3 : undefined}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Улица, дом, при необходимости код ПВЗ"
        />
      </label>
      <InfoTip summary="Нужен адрес пункта выдачи СДЭК, не домашний">
        Действующий ПВЗ подтвердит модератор. Справочник городов не является
        списком доступных ПВЗ.
      </InfoTip>
      <small className="muted">
        Города:{" "}
        <a
          href="https://doi.org/10.5281/zenodo.5151423"
          target="_blank"
          rel="noreferrer"
        >
          E. Pogrebnyak, K. Artemov
        </a>
        , CC BY 4.0. Данные 2021 года.
      </small>
      <button className="primary full" disabled={!chosen || save.isPending}>
        {save.isPending
          ? "Сохраняем…"
          : requireAddress
            ? "Сохранить город и ПВЗ"
            : "Сохранить город"}
      </button>
    </form>
  );
}
