import type { Dispatch, SetStateAction } from "react";
import { money } from "../lib/teo-data";
import type { Order, PhotoRequest } from "../../shared/teo";
import { useRetryNotifications } from "../queries/teo";

export function AdminNotifications({
  pending,
  notify,
  refresh,
}: {
  pending: number;
  notify: (text: string) => void;
  refresh: () => unknown;
}) {
  const retry = useRetryNotifications();
  return (
    <div className="notification-status">
      Ожидают отправки: {pending}
      <button
        disabled={retry.isPending}
        onClick={async () => {
          try {
            const result = await retry.mutateAsync();
            notify(`Отправлено: ${result.sent}, ошибок: ${result.failed}`);
            refresh();
          } catch (error) {
            notify(error instanceof Error ? error.message : "Ошибка отправки");
          }
        }}
      >
        {retry.isPending ? "Отправляем…" : "Повторить уведомления"}
      </button>
    </div>
  );
}

export function AdminStats({
  orders,
  requests,
}: {
  orders: Order[];
  requests: PhotoRequest[];
}) {
  return (
    <div className="admin-stats">
      <div>
        <span>Заказы</span>
        <b>{orders.length}</b>
      </div>
      <div>
        <span>Сумма заказов</span>
        <b>{money(orders.reduce((a, o) => a + o.total, 0))}</b>
      </div>
      <div>
        <span>Фото-запросы</span>
        <b>{requests.filter((r) => r.status === "Новый").length}</b>
      </div>
    </div>
  );
}

type AdminUser = {
  id: number;
  name: string;
  username: string | null;
  phone: string | null;
  role: string;
};

export function AdminUsers({ users }: { users: AdminUser[] }) {
  return (
    <div className="users-list">
      {users.map((u) => (
        <div className="request-card" key={u.id}>
          <div>
            <h3>{u.name}</h3>
            <p>
              {u.username ? "@" + u.username : "Username не задан"} · ID {u.id}
            </p>
            <p>{u.phone || "Номер не указан"}</p>
            <span className="status-pill">
              {u.role === "owner"
                ? "Владелец"
                : u.role === "moderator"
                  ? "Модератор"
                  : "Покупатель"}
            </span>
          </div>
        </div>
      ))}
      <p className="muted">
        Добавить модератора: /newmoder ID в личном чате с ботом. Отозвать
        доступ: /delmoder ID.
      </p>
    </div>
  );
}

export function AdminPricing({
  rate,
  setRate,
  markup,
  setMarkup,
}: {
  rate: number;
  setRate: Dispatch<SetStateAction<number>>;
  markup: number;
  setMarkup: Dispatch<SetStateAction<number>>;
}) {
  return (
    <div className="settings-card">
      <h3>Расчёт цены продажи</h3>
      <label>
        Курс юаня, ₽
        <input
          aria-label="Курс юаня, ₽"
          type="number"
          min="1"
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        />
      </label>
      <label>
        Наценка, %
        <input
          aria-label="Наценка, %"
          type="number"
          min="0"
          value={markup}
          onChange={(e) => setMarkup(Number(e.target.value))}
        />
      </label>
      <p className="muted">
        Цена = закупка в ¥ × курс × (1 + наценка / 100).
        <br />
        Используется при добавлении товара, существующие цены не меняются.
      </p>
    </div>
  );
}
