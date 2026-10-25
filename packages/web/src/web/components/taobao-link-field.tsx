import { useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  taobaoDisplay,
  taobaoInputHelp,
  taobaoItemId,
  taobaoShortLink,
  taobaoUrl,
} from "../../shared/taobao";
import { useResolveTaobao } from "../queries/taobao";

/** One field: paste any Taobao / Tmall link or the whole «Поделиться» text. */
export function TaobaoLinkField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const resolve = useResolveTaobao();
  const latest = useRef(value);
  const [error, setError] = useState("");
  const set = (raw: string) => {
    latest.current = raw;
    setError("");
    const id = taobaoItemId(raw);
    if (id) return onChange(taobaoUrl(id));
    onChange(raw);
    if (!taobaoShortLink(raw)) return;
    resolve.mutate(
      { link: raw },
      {
        onSuccess: ({ url }) => {
          if (latest.current !== raw) return;
          latest.current = url;
          onChange(url);
        },
        onError: (e) => {
          if (latest.current === raw) setError(e.message);
        },
      },
    );
  };
  const shown = taobaoDisplay(value);
  const ok = !!value.trim() && !!taobaoItemId(value);
  return (
    <>
      <label>
        Ссылка на товар Taobao / Tmall
        <input
          aria-label="Ссылка на товар Taobao / Tmall"
          placeholder="Вставьте ссылку из Taobao"
          inputMode="url"
          value={shown}
          onChange={(e) => set(e.target.value)}
        />
      </label>
      <p
        className={
          "taobao-status " + (error ? "is-error" : ok ? "is-ok" : "muted")
        }
        aria-live="polite"
      >
        {resolve.isPending && latest.current === value ? (
          "Открываем короткую ссылку…"
        ) : error ? (
          error
        ) : ok ? (
          <>
            <Check size={14} /> Ссылка на товар распознана
          </>
        ) : (
          taobaoInputHelp
        )}
      </p>
    </>
  );
}
