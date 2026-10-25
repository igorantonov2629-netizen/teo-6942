import { useState, type Dispatch, type SetStateAction } from "react";
import type { Product } from "../lib/teo-data";
export function ProductPhotosEditor({
  edit,
  setEdit,
  onBusy,
  notify,
}: {
  edit: Product;
  setEdit: Dispatch<SetStateAction<Product | null>>;
  onBusy: (b: boolean) => void;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const images = (edit.images?.length ? edit.images : [edit.image]).filter(
    Boolean,
  );
  const read = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024)
        return reject(new Error("Выберите фото до 8 МБ каждое"));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Не удалось прочитать фото"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Не удалось открыть фото"));
        img.onload = () => {
          const canvas = document.createElement("canvas"),
            scale = Math.min(1, 1000 / Math.max(img.width, img.height));
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas
            .getContext("2d")!
            .drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  return (
    <div className="product-photo-editor">
      <label>
        Фотографии товара · {images.length}/8
        <input
          aria-label="Фото товара"
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          onChange={async (e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            if (files.length + images.length > 8) {
              notify("Максимум 8 фотографий. Удалите лишние перед загрузкой.");
              return;
            }
            setBusy(true);
            onBusy(true);
            try {
              const added = await Promise.all(files.map(read));
              setEdit((prev) => {
                if (!prev) return prev;
                const current = (
                  prev.images?.length ? prev.images : [prev.image]
                ).filter(Boolean);
                const next = [...current, ...added];
                if (next.length > 8) return prev;
                return { ...prev, images: next, image: next[0]! };
              });
            } catch (e) {
              notify(e instanceof Error ? e.message : "Ошибка загрузки");
            } finally {
              setBusy(false);
              onBusy(false);
            }
          }}
        />
      </label>
      <p className="muted">
        Можно выбрать несколько файлов. Первое фото — обложка. До 8 МБ на файл.
      </p>
      {busy && <p>Обрабатываем фотографии…</p>}
      <div className="product-photo-grid">
        {images.map((src, i) => (
          <div key={i}>
            <img src={src} alt={`Фото товара ${i + 1}`} />
            <button
              type="button"
              disabled={busy || i === 0}
              onClick={() => {
                const next = [src, ...images.filter((_, j) => j !== i)];
                setEdit({ ...edit, image: src, images: next });
              }}
            >
              {i === 0 ? "Обложка" : "На обложку"}
            </button>
            <button
              type="button"
              aria-label={`Удалить фото ${i + 1}`}
              disabled={busy || images.length === 1}
              onClick={() => {
                const next = images.filter((_, j) => j !== i);
                setEdit({ ...edit, image: next[0]!, images: next });
              }}
            >
              Удалить
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
