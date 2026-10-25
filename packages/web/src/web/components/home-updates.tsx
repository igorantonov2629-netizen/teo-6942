import { ChevronRight } from "lucide-react";
import type { Order } from "../../shared/teo";
import { money } from "../../shared/teo";
import {
  homeOrder,
  journeySteps,
  orderJourney,
  outstandingPayment,
} from "../../shared/order-presentation";

function itemsCaption(order: Order) {
  const first = order.items[0];
  if (!first) return "";
  const rest = order.items.length - 1;
  return rest > 0 ? `${first.name} и ещё ${rest}` : first.name;
}

export function HomeUpdates({
  orders,
  loading,
  openOrders,
}: {
  orders: Order[];
  loading: boolean;
  openOrders: () => void;
}) {
  const order = homeOrder(orders);
  const payment = order ? outstandingPayment(order) : null;
  const answer = order?.status === "Ждём согласия покупателя";
  const action = Boolean(payment || answer);
  const j = order ? orderJourney(order.status) : null;
  const activeCount = orders.filter(
    (o) =>
      !["Заказ доставлен", "Выдан"].includes(o.status) &&
      !o.status.startsWith("Заказ отменён"),
  ).length;
  const first = order?.items[0];
  const tone = loading || !j ? "empty" : j.tone;
  return (
    <section className="home-updates" aria-label="Ваш заказ и помощь">
      <button
        className={`home-order-panel tone-${tone}${action ? " needs-payment" : ""}`}
        data-tone={tone}
        onClick={openOrders}
      >
        <span className="home-order-top">
          <small>
            {order
              ? `ВАШ ЗАКАЗ · ${order.id}${activeCount > 1 ? ` · ещё ${activeCount - 1}` : ""}`
              : "МОИ ЗАКАЗЫ"}
          </small>
          <span className={`home-order-action${action ? " urgent" : ""}`}>
            {payment ? "К оплате" : answer ? "Ответить" : "Мои заказы"}
            <ChevronRight size={16} />
          </span>
        </span>
        {order && first && !loading && (
          <span className="home-order-item">
            <span className="home-order-thumb">
              {first.image ? <img src={first.image} alt="" /> : null}
            </span>
            <span className="home-order-item-name">
              <span>{itemsCaption(order)}</span>
              <small>{money(order.total)}</small>
            </span>
          </span>
        )}
        <span className="home-order-copy">
          <strong>
            {loading
              ? "Загружаем заказы…"
              : j
                ? j.title
                : "Ваша первая находка — впереди"}
          </strong>
          <span>
            {loading
              ? ""
              : payment
                ? `Оплатите ${payment.phase}: ${money(payment.amount)}. Реквизиты — в заказе.`
                : j
                  ? j.short
                  : "Здесь появится статус заказа после оформления заявки."}
          </span>
        </span>
        {j && !loading && j.step >= 0 && (
          <ol
            className="home-order-track"
            aria-label={`Этап ${j.step + 1} из ${journeySteps.length}: ${journeySteps[j.step]}`}
          >
            {journeySteps.map((s, i) => (
              <li
                key={s}
                aria-current={i === j.step ? "step" : undefined}
                className={
                  i < j.step ? "done" : i === j.step ? "current" : undefined
                }
              >
                <i />
                <em>{s}</em>
              </li>
            ))}
          </ol>
        )}
      </button>
    </section>
  );
}
