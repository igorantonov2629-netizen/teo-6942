import type { PhotoRequest } from "../../shared/teo";
import { usePhotoAction } from "../queries/teo";

export function PhotoWorkControls({
  request: r,
  moderatorId,
  notify,
}: {
  request: PhotoRequest;
  moderatorId: number;
  notify: (text: string) => void;
}) {
  const mutation = usePhotoAction();
  const act = async (action: "claim" | "done") => {
    if (
      action === "done" &&
      !window.confirm("Вы уже отправили сообщение покупателю в личном чате?")
    )
      return;
    try {
      await mutation.mutateAsync({ id: r.id, action });
      notify(
        action === "claim"
          ? "Запрос закреплён за вами"
          : "Ответ отмечен как отправленный",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Ошибка обработки");
    }
  };
  const target = r.username
    ? r.username
    : r.phone
      ? "+" + r.phone.replace(/\D/g, "")
      : null;
  const text =
    "Просим прощения за неудобства! В течение 15 минут отправим информацию о товаре.\nС уважением поддержка teo.";
  return (
    <div className="photo-work-controls">
      <p>
        {r.assignedTo
          ? `В работе: ${r.assignedName}`
          : "Пока никто не взял в работу"}
      </p>
      {r.replyConfirmedAt ? (
        <span className="status-pill">Ответ отмечен как отправленный</span>
      ) : !r.assignedTo ? (
        <button
          className="primary"
          disabled={mutation.isPending}
          onClick={() => act("claim")}
        >
          Взял в работу
        </button>
      ) : r.assignedTo === moderatorId ? (
        <>
          {target && (
            <a
              className="primary"
              href={`https://t.me/${target}?text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noreferrer"
            >
              {r.username ? "@" + r.username : "Покупатель"} · ответить
            </a>
          )}
          <button disabled={mutation.isPending} onClick={() => act("done")}>
            Ответ отправлен
          </button>
          <small>
            Отправьте текст в личном чате, затем отметьте ответ здесь. Бот не
            видит вашу личную переписку.
          </small>
        </>
      ) : null}
    </div>
  );
}
