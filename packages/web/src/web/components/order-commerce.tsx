import { orderLabel } from "../../shared/order-presentation";
import { useState } from "react";
import { money, type Order } from "../lib/teo-data";
import {
  shippingNotice,
  orderStages,
  goodsIssuedAt,
  unpaidTimeout,
} from "../../shared/commerce";
import {
  useReportPayment,
  useIssuePayment,
  useApprovePayment,
  useAdvanceOrder,
  useCancelUnpaidOrder,
} from "../queries/commerce";
import { InfoTip } from "./info-tip";
import {
  AvailabilityReview,
  BuyerProposal,
  ProposalStatus,
  ArrivalPhotos,
  ArrivalPhotoPicker,
  AddArrivalPhotos,
} from "./order-review";

export function BuyerOrders({
  orders,
  notify,
}: {
  orders: Order[];
  notify: (s: string) => void;
}) {
  return (
    <div className="orders-list">
      {orders.map((o) => (
        <div className="order-card" key={o.id}>
          <div className="order-head">
            <h3>{o.id}</h3>
            <span className="status-pill order-status">
              {orderLabel(o.status)}
            </span>
          </div>
          <p className="muted">
            {o.date} · {o.point}
          </p>
          <div className="order-products">
            {o.items.map((c, i) => (
              <div key={i}>
                <img src={c.image} alt={c.name} />
                <span>
                  {c.name}
                  <small>
                    {c.variant} · {c.qty} шт.
                  </small>
                </span>
                <b>
                  {money(c.price * c.qty)}
                </b>
              </div>
            ))}
          </div>
          <p>
            <b>Товары: {money(o.total)}</b>
          </p>
          <InfoTip summary="Доставка СДЭК до ПВЗ оплачивается отдельно">
            {shippingNotice}
          </InfoTip>
          {o.tracking && (
            <p>
              Трек-номер СДЭК: <b>{o.tracking}</b>
            </p>
          )}
          {o.history?.length ? (
            <ol className="order-timeline">
              {o.history.map((h, i) => (
                <li key={i}>
                  {orderLabel(h.status)}
                  <small>{new Date(h.at).toLocaleString("ru-RU")}</small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">
              Статус старого заказа сохранён. При необходимости обратитесь в
              поддержку.
            </p>
          )}
          {o.status === "Заявка принята" && (
            <p>Подтверждаем наличие. Пока оплачивать не нужно.</p>
          )}
          <BuyerProposal o={o} notify={notify} />
          <ArrivalPhotos photos={o.arrivalPhotos} />
          {(["goods", "shipping"] as const).map(
            (phase) =>
              o[phase === "goods" ? "goodsPayment" : "shippingPayment"] && (
                <PaymentCard
                  key={phase}
                  order={o}
                  phase={phase}
                  notify={notify}
                />
              ),
          )}
        </div>
      ))}
    </div>
  );
}
function PaymentCard({
  order: o,
  phase,
  notify,
}: {
  order: Order;
  phase: "goods" | "shipping";
  notify: (s: string) => void;
}) {
  const p = o[phase === "goods" ? "goodsPayment" : "shippingPayment"]!;
  const mutation = useReportPayment();
  const [receipt, setReceipt] = useState("");
  const upload = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
      notify("Выберите фото чека до 8 МБ");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
        c.width = img.width * scale;
        c.height = img.height * scale;
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        setReceipt(c.toDataURL("image/jpeg", 0.8));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="payment-card">
      <h3>
        Оплата {phase === "goods" ? "товара" : "доставки"} · {money(p.amount)}
      </h3>
      {p.state === "cancelled" ? (
        <p>
          Заказ отменён. Не оплачивайте этот счёт. Если перевод уже сделан,
          обратитесь в поддержку.
        </p>
      ) : p.state === "approved" ? (
        <p className="status-pill">Оплата подтверждена</p>
      ) : p.state === "pending" ? (
        <p>Проверяем поступление денег. Повторно переводить не нужно.</p>
      ) : (
        <>
          <p>
            {p.bank} · {p.recipient}
          </p>
          <b className="payment-details">{p.details}</b>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(p.details);
                notify("Реквизиты скопированы");
              } catch {
                notify("Не удалось скопировать. Выделите реквизиты вручную.");
              }
            }}
          >
            Скопировать реквизиты
          </button>
          <InfoTip
            summary={`Переведите ровно ${money(p.amount)}, затем нажмите «Я оплатил»`}
          >
            <p>Перед переводом проверьте банк и имя получателя.</p>
            <p>
              Кнопка «Я оплатил» только сообщает о переводе — владелец вручную
              проверит поступление денег и подтвердит оплату. Чек можно
              приложить, но он не заменяет проверку.
            </p>
          </InfoTip>
          <label>
            Чек (необязательно)
            <input
              aria-label={`Чек оплаты ${phase === "goods" ? "товара" : "доставки"}`}
              type="file"
              accept="image/*"
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
          {receipt && (
            <img className="receipt-preview" src={receipt} alt="Чек оплаты" />
          )}
          <button
            className="primary"
            disabled={mutation.isPending}
            onClick={async () => {
              if (!window.confirm("Вы уже перевели указанную сумму?")) return;
              try {
                await mutation.mutateAsync({
                  id: o.id,
                  phase,
                  receipt: receipt || undefined,
                });
                notify("Оплата отправлена на проверку владельцу");
              } catch (e) {
                notify(e instanceof Error ? e.message : "Ошибка");
              }
            }}
          >
            Я оплатил
          </button>
        </>
      )}
    </div>
  );
}
export function AdminOrders({
  orders,
  owner,
  notify,
}: {
  orders: Order[];
  owner: boolean;
  notify: (s: string) => void;
}) {
  return (
    <div className="orders-list">
      {orders.map((o) => (
        <AdminOrder key={o.id} o={o} owner={owner} notify={notify} />
      ))}
    </div>
  );
}
function AdminOrder({
  o,
  owner,
  notify,
}: {
  o: Order;
  owner: boolean;
  notify: (s: string) => void;
}) {
  const issue = useIssuePayment(),
    approve = useApprovePayment(),
    advance = useAdvanceOrder(),
    cancel = useCancelUnpaidOrder();
  const [amount, setAmount] = useState("");
  const [tracking, setTracking] = useState(o.tracking || "");
  const [photos, setPhotos] = useState<string[]>([]);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      notify("Заказ обновлён, уведомление сохранено");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Ошибка");
    }
  };
  const busy =
    issue.isPending ||
    approve.isPending ||
    advance.isPending ||
    cancel.isPending;
  const issuedAt = goodsIssuedAt(o);
  const cancellable =
    !!issuedAt &&
    Date.now() - issuedAt >= unpaidTimeout &&
    ["waiting", "pending"].includes(o.goodsPayment?.state || "") &&
    ["Ожидает оплаты товара", "Проверяем оплату товара"].includes(o.status);
  return (
    <div className="admin-order order-card">
      <div className="order-head">
        <h3>{o.id}</h3>
        <b>{money(o.total)}</b>
      </div>
      <span className="status-pill order-status">{orderLabel(o.status)}</span>
      <p>
        {o.buyerName} · {o.username ? "@" + o.username : "ID " + o.userId} ·{" "}
        {o.phone}
      </p>
      <p className={`admin-recipient${o.recipient ? "" : " missing"}`}>
        <span>ФИО для СДЭК</span>
        <b>{o.recipient || "не указано — уточните у покупателя"}</b>
      </p>
      <p>{o.point}</p>
      {o.items.map((c, i) => (
        <p key={i}>
          {c.name} · {c.variant} · {c.qty} шт.
          {c.taobao && /^[0-9]+$/.test(c.taobao) && (
            <>
              {" "}
              ·{" "}
              <a
                href={`https://item.taobao.com/item.htm?id=${c.taobao}`}
                target="_blank"
                rel="noreferrer"
              >
                Taobao ↗
              </a>
            </>
          )}
        </p>
      ))}
      {o.status === "Заявка принята" && (
        <AvailabilityReview o={o} notify={notify} />
      )}
      {o.availability && <ProposalStatus o={o} />}
      {(["goods", "shipping"] as const).map((phase) => {
        const p = o[phase === "goods" ? "goodsPayment" : "shippingPayment"];
        return (
          p && (
            <div key={phase} className="payment-card">
              <b>
                {phase === "goods" ? "Товар" : "Доставка"}: {money(p.amount)}
              </b>
              <p>
                {p.state === "waiting"
                  ? "Ожидаем перевод"
                  : p.state === "cancelled"
                    ? "Счёт отменён"
                    : p.state === "pending"
                      ? "Покупатель сообщил об оплате"
                      : "Оплата подтверждена"}
              </p>
              {p.receipt && (
                <a href={p.receipt} download={`${o.id}-${phase}.jpg`}>
                  Скачать чек
                </a>
              )}
              {p.state === "pending" && owner && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Проверьте фактическое поступление ${money(p.amount)} на ваш счёт. Деньги получены?`,
                      )
                    )
                      run(() =>
                        approve.mutateAsync({
                          id: o.id,
                          phase,
                          version: p.version,
                        }),
                      );
                  }}
                >
                  Подтвердить поступление денег
                </button>
              )}
            </div>
          )
        );
      })}
      {cancellable && (
        <button
          className="cancel-unpaid"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Проверьте фактическое поступление денег с владельцем. Даже если покупатель нажал «Я оплатил», перевод действительно не поступил? Отменить заказ и уведомить покупателя?",
              )
            )
              run(() => cancel.mutateAsync({ id: o.id }));
          }}
        >
          Заказ не оплачен. Отменить
        </button>
      )}
      {!cancellable &&
        issuedAt &&
        ["waiting", "pending"].includes(o.goodsPayment?.state || "") && (
          <p className="muted">
            Отмена неоплаченного товара доступна с{" "}
            {new Date(issuedAt + unpaidTimeout).toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            . Проверьте поступление денег перед отменой.
          </p>
        )}
      {o.status === "В пути к поставщику" && (
        <div>
          <ArrivalPhotoPicker
            value={photos}
            onChange={setPhotos}
            notify={notify}
          />
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  photos.length
                    ? `Товар поступил к вам? Покупателю уйдут ${photos.length} фото.`
                    : "Товар поступил к вам? Фото можно добавить и позже.",
                )
              )
                run(async () => {
                  await advance.mutateAsync({
                    id: o.id,
                    status: "Заказ у меня",
                    photos: photos.length ? photos : undefined,
                  });
                  setPhotos([]);
                });
            }}
          >
            Заказ у меня
          </button>
        </div>
      )}
      <ArrivalPhotos photos={o.arrivalPhotos} />
      {o.status === "Заказ у меня" && <AddArrivalPhotos o={o} notify={notify} />}
      {o.status === "Заказ у меня" && (
        <div>
          <label>
            Стоимость доставки СДЭК, ₽
            <input
              aria-label="Стоимость доставки СДЭК, ₽"
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !Number(amount)}
            onClick={() => {
              if (
                window.confirm(
                  `Выставить клиенту доставку ${money(Number(amount))}?`,
                )
              )
                run(() =>
                  issue.mutateAsync({
                    id: o.id,
                    phase: "shipping",
                    amount: Number(amount),
                  }),
                );
            }}
          >
            Выставить оплату доставки
          </button>
        </div>
      )}
      {o.status === "Доставка оплачена" && (
        <div>
          <label>
            Трек-номер СДЭК
            <input
              aria-label="Трек-номер СДЭК"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={busy || !tracking.trim()}
            onClick={() => {
              if (
                window.confirm("Посылка действительно отправлена получателю?")
              )
                run(() =>
                  advance.mutateAsync({
                    id: o.id,
                    status: "Заказ отправлен получателю",
                    tracking,
                  }),
                );
            }}
          >
            Заказ отправлен получателю
          </button>
        </div>
      )}
      {o.status === "Заказ отправлен получателю" && (
        <button
          className="primary"
          disabled={busy}
          onClick={() => {
            if (window.confirm("По данным СДЭК заказ доставлен?"))
              run(() =>
                advance.mutateAsync({ id: o.id, status: "Заказ доставлен" }),
              );
          }}
        >
          Заказ доставлен
        </button>
      )}
      {o.tracking && <p>СДЭК: {o.tracking}</p>}
      {!o.status.startsWith("Заказ отменён") &&
        !orderStages.includes(o.status as (typeof orderStages)[number]) && (
          <p className="muted">
            Старый статус сохранён; новый процесс применяется к новым заявкам.
          </p>
        )}
    </div>
  );
}
