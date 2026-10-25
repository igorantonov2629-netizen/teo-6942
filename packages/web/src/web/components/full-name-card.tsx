import { useState } from "react";
import { BadgeCheck, TriangleAlert } from "lucide-react";
import {
  fullNameOf,
  fullNameWhy,
  hasFullName,
  type FullNameFields,
} from "../../shared/full-name";
import { useSaveFullName } from "../queries/commerce";

/** Required recipient name for СДЭК: shown in profile and blocks checkout until filled. */
export function FullNameCard({
  user,
  notify,
  onSaved,
  startOpen = false,
}: {
  user: FullNameFields | undefined;
  notify: (s: string) => void;
  onSaved?: () => void;
  startOpen?: boolean;
}) {
  const filled = !!user && hasFullName(user);
  const [editing, setEditing] = useState(startOpen || !filled);
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [middleName, setMiddleName] = useState(user?.middleName || "");
  const [noMiddleName, setNoMiddleName] = useState(user?.middleName === "");
  const save = useSaveFullName();
  if (filled && !editing)
    return (
      <div className="fullname-card done">
        <BadgeCheck size={22} />
        <span>
          <small>ФИО ПОЛУЧАТЕЛЯ ДЛЯ СДЭК</small>
          <b>{fullNameOf(user)}</b>
        </span>
        <button type="button" onClick={() => setEditing(true)}>
          Изменить
        </button>
      </div>
    );
  return (
    <form
      className={`fullname-card${filled ? "" : " required"}`}
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await save.mutateAsync({
            lastName,
            firstName,
            middleName: noMiddleName ? "" : middleName,
            noMiddleName,
          });
          setEditing(false);
          notify("ФИО сохранено");
          onSaved?.();
        } catch (err) {
          notify(err instanceof Error ? err.message : "Не удалось сохранить");
        }
      }}
    >
      <div className="fullname-head">
        <TriangleAlert size={22} />
        <span>
          <b>{filled ? "ФИО получателя" : "Укажите ФИО получателя"}</b>
          <small>Обязательно для отправки СДЭК</small>
        </span>
      </div>
      <p>{fullNameWhy}</p>
      <label>
        Фамилия
        <input
          aria-label="Фамилия"
          value={lastName}
          maxLength={60}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Иванова"
        />
      </label>
      <label>
        Имя
        <input
          aria-label="Имя"
          value={firstName}
          maxLength={60}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Анна"
        />
      </label>
      <label>
        Отчество
        <input
          aria-label="Отчество"
          value={noMiddleName ? "" : middleName}
          disabled={noMiddleName}
          maxLength={60}
          onChange={(e) => setMiddleName(e.target.value)}
          placeholder="Сергеевна"
        />
      </label>
      <label className="fullname-check">
        <input
          type="checkbox"
            aria-label="Нет отчества"
          checked={noMiddleName}
          onChange={(e) => setNoMiddleName(e.target.checked)}
        />
        Нет отчества (по паспорту)
      </label>
      <div className="fullname-actions">
        <button
          className="primary"
          type="submit"
          disabled={
            save.isPending ||
            !lastName.trim() ||
            !firstName.trim() ||
            (!noMiddleName && !middleName.trim())
          }
        >
          {save.isPending ? "Сохраняем…" : "Сохранить ФИО"}
        </button>
        {filled && (
          <button type="button" onClick={() => setEditing(false)}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}
