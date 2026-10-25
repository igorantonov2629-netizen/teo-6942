import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { money, type Order } from "../../shared/teo";
import {
  applyChanges,
  itemsTotal,
  normalizeChanges,
  proposalStatus,
  maxArrivalPhotos,
  type ItemChange,
} from "../../shared/availability";
import {
  useProposeAvailability,
  useRespondAvailability,
  useAddArrivalPhotos,
} from "../queries/commerce";
import { compressImage } from "../lib/compress-image";
import { InfoTip } from "./info-tip";

type Notify = (s: string) => void;
const time = (at: number) =>
  new Date(at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function left(at: number, now: number) {
  const m = Math.max(0, Math.ceil((at - now) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`;
}

/** Old → new list shared by the buyer and moderator views. */
function ChangeList({ o }: { o: Order }) {
  const a = o.availability!;
  return (
    <ul className="change-list">
      {a.changes.map((c) => {
        const item = (o.originalItems || o.items)[c.index];
        if (!item) return null;
        return (
          <li key={c.index} className={c.remove ? "removed" : ""}>
            <b>{item.name}</b>
            {c.remove ? (
              <span>
                <s>
                  {item.variant} · {item.qty} шт.
                </s>{" "}
                — нет в наличии, убираем из заказа
              </span>
            ) : (
              <span>
                {c.variant && (
                  <>
                    Размер: <s>{item.variant}</s> → <b>{c.variant}</b>
                  </>
                )}
                {c.variant && c.price !== undefined && <br />}
                {c.price !== undefined && (
                  <>
                    Цена за шт.: <s>{money(item.price)}</s> →{" "}
                    <b>{money(c.price)}</b>
                  </>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function BuyerProposal({ o, notify }: { o: Order; notify: Notify }) {
  const respond = useRespondAvailability();
  const now = useNow();
  const a = o.availability;
  if (!a || o.status !== proposalStatus || a.state !== "proposed") return null;
  const answer = async (accept: boolean) => {
    if (
      !window.confirm(
        accept
          ? `Согласиться с изменениями? Счёт за товары: ${money(a.total)}.`
          : "Отменить заказ? Деньги не списывались.",
      )
    )
      return;
    try {
      await respond.mutateAsync({ id: o.id, version: a.version, accept });
      notify(accept ? "Счёт выставлен — оплатите в заказе" : "Заказ отменён");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Ошибка");
    }
  };
  return (
    <div className="proposal-card" data-testid="buyer-proposal">
      <h3>Изменения в заказе</h3>
      <p>Мы проверили наличие у продавца — подтвердите изменения:</p>
      <ChangeList o={o} />
      {a.comment && <p className="proposal-comment">«{a.comment}»</p>}
      <p className="proposal-total">
        Сумма за товары: <s>{money(o.total)}</s> <b>{money(a.total)}</b>
      </p>
      <InfoTip
        summary={`Ответьте до ${time(a.expiresAt)} · осталось ${left(a.expiresAt, now)}`}
      >
        <p>
          Если не ответить за 3 часа, заказ отменится автоматически. Деньги
          пока не списываются.
        </p>
        <p>
          После согласия выставим счёт на новую сумму, реквизиты появятся в
          заказе. Если изменения не подходят — отмените заказ.
        </p>
      </InfoTip>
      <button
        className="primary"
        disabled={respond.isPending}
        onClick={() => answer(true)}
      >
        Согласен, выставить счёт
      </button>
      <button disabled={respond.isPending} onClick={() => answer(false)}>
        Отменить заказ
      </button>
    </div>
  );
}

type Line = { mode: "ok" | "size" | "remove"; variant: string; price: string };

export function AvailabilityReview({ o, notify }: { o: Order; notify: Notify }) {
  const propose = useProposeAvailability();
  const [lines, setLines] = useState<Line[]>(() =>
    o.items.map(() => ({ mode: "ok", variant: "", price: "" })),
  );
  const [comment, setComment] = useState("");
  const raw: ItemChange[] = lines.map((l, index) => ({
    index,
    ...(l.mode === "remove" ? { remove: true } : {}),
    ...(l.mode === "size" && l.variant.trim()
      ? { variant: l.variant.trim() }
      : {}),
    ...(l.mode !== "remove" && Number(l.price) > 0
      ? { price: Math.round(Number(l.price)) }
      : {}),
  }));
  const changes = normalizeChanges(o.items, raw);
  const items = applyChanges(o.items, changes);
  const total = itemsTotal(items);
  const missingSize = lines.some((l) => l.mode === "size" && !l.variant.trim());
  const set = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const submit = async () => {
    const msg = !changes.length
      ? `Всё в наличии. Выставить счёт за товары ${money(o.total)}? Доставка отдельно.`
      : !items.length
        ? "Убраны все товары — заказ будет отменён, покупатель получит уведомление. Продолжить?"
        : `Отправить изменения покупателю? Новая сумма ${money(total)}. Счёт выставится только после его согласия (до 3 часов).`;
    if (!window.confirm(msg)) return;
    try {
      await propose.mutateAsync({
        id: o.id,
        changes,
        comment: comment.trim() || undefined,
      });
      notify(
        changes.length
          ? "Изменения отправлены покупателю"
          : "Счёт выставлен, уведомление сохранено",
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Ошибка");
    }
  };
  return (
    <div className="availability-review" data-testid="availability-review">
      <h4>Проверка наличия</h4>
      {o.items.map((c, i) => {
        const l = lines[i]!;
        return (
          <div className={`review-line ${l.mode}`} key={i}>
            <span>
              <b>{c.name}</b>
              <small>
                {c.variant} · {c.qty} шт. · {money(c.price)}
              </small>
            </span>
            <fieldset className="review-modes" aria-label={`Наличие: ${c.name}`}>
              {(
                [
                  ["ok", "Есть"],
                  ["size", "Другой размер"],
                  ["remove", "Убрать"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  type="button"
                  key={mode}
                  aria-pressed={l.mode === mode}
                  className={l.mode === mode ? "selected" : ""}
                  onClick={() => set(i, { mode })}
                >
                  {label}
                </button>
              ))}
            </fieldset>
            {l.mode === "size" && (
              <input
                aria-label={`Новый размер: ${c.name}`}
                placeholder="Какой размер есть, напр. 42.5"
                maxLength={50}
                value={l.variant}
                onChange={(e) => set(i, { variant: e.target.value })}
              />
            )}
            {l.mode !== "remove" && (
              <input
                aria-label={`Новая цена: ${c.name}`}
                type="number"
                min="1"
                placeholder={`Новая цена за шт. (сейчас ${c.price} ₽)`}
                value={l.price}
                onChange={(e) => set(i, { price: e.target.value })}
              />
            )}
          </div>
        );
      })}
      {changes.length > 0 && (
        <textarea
          aria-label="Комментарий покупателю"
          placeholder="Комментарий покупателю (необязательно)"
          maxLength={500}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      )}
      {changes.length > 0 && items.length > 0 && (
        <p>
          Новая сумма: <s>{money(o.total)}</s> <b>{money(total)}</b>
        </p>
      )}
      <button
        className="primary"
        disabled={propose.isPending || missingSize}
        onClick={submit}
      >
        {missingSize
          ? "Укажите новый размер"
          : !changes.length
            ? "Всё в наличии — выставить оплату"
            : !items.length
              ? "Нет в наличии — отменить заказ"
              : "Отправить изменения покупателю"}
      </button>
    </div>
  );
}

export function ProposalStatus({ o }: { o: Order }) {
  const now = useNow();
  const a = o.availability;
  if (!a) return null;
  return (
    <div className="proposal-card staff">
      <b>
        {a.state === "proposed"
          ? `Ждём ответа покупателя до ${time(a.expiresAt)} · ${left(a.expiresAt, now)}`
          : a.state === "accepted"
            ? "Покупатель согласился с изменениями"
            : a.state === "expired"
              ? "Покупатель не ответил за 3 часа"
              : "Изменения не приняты"}
      </b>
      <ChangeList o={o} />
      {a.comment && <p className="proposal-comment">«{a.comment}»</p>}
    </div>
  );
}

export function ArrivalPhotos({ photos }: { photos?: string[] }) {
  if (!photos?.length) return null;
  return (
    <div className="arrival-photos">
      <b>Фото заказа на складе</b>
      <div>
        {photos.map((p, i) => (
          <a key={i} href={p} target="_blank" rel="noreferrer">
            <img src={p} alt={`Фото заказа ${i + 1}`} />
          </a>
        ))}
      </div>
    </div>
  );
}

/** Picker used before «Заказ у меня» (value/onChange) or to add photos later (orderId). */
export function ArrivalPhotoPicker({
  value,
  onChange,
  existing = 0,
  notify,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  existing?: number;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false);
  const room = maxArrivalPhotos - existing - value.length;
  return (
    <div className="arrival-picker">
      <label className={room <= 0 ? "full" : undefined}>
        <Camera size={26} />
        <span>
          <b>
            {busy
              ? "Сжимаем фото…"
              : room <= 0
                ? "Достигнут лимит фото"
                : "Сфотографируйте прибывший товар"}
          </b>
          <small>
            Покупатель увидит фото в заказе и в Telegram ·{" "}
            {existing + value.length}/{maxArrivalPhotos}
          </small>
        </span>
        <input
          aria-label="Фото прибывшего заказа"
          type="file"
          accept="image/*"
          multiple
          disabled={busy || room <= 0}
          onChange={async (e) => {
            const files = [...(e.target.files || [])].slice(0, room);
            e.target.value = "";
            if (!files.length) return;
            setBusy(true);
            try {
              onChange([...value, ...(await Promise.all(files.map((f) => compressImage(f))))]);
            } catch (err) {
              notify(err instanceof Error ? err.message : "Ошибка фото");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {value.length > 0 && (
        <div className="arrival-photos">
          <div>
            {value.map((p, i) => (
              <span key={i}>
                <img src={p} alt={`Новое фото ${i + 1}`} />
                <button
                  type="button"
                  aria-label={`Убрать фото ${i + 1}`}
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AddArrivalPhotos({ o, notify }: { o: Order; notify: Notify }) {
  const add = useAddArrivalPhotos();
  const [photos, setPhotos] = useState<string[]>([]);
  const existing = o.arrivalPhotos?.length || 0;
  if (existing >= maxArrivalPhotos) return null;
  return (
    <div className="arrival-add">
      <ArrivalPhotoPicker
        value={photos}
        onChange={setPhotos}
        existing={existing}
        notify={notify}
      />
      {photos.length > 0 && (
        <button
          disabled={add.isPending}
          onClick={async () => {
            try {
              await add.mutateAsync({ id: o.id, photos });
              setPhotos([]);
              notify("Фото отправлены покупателю");
            } catch (e) {
              notify(e instanceof Error ? e.message : "Ошибка");
            }
          }}
        >
          Отправить фото покупателю
        </button>
      )}
    </div>
  );
}
