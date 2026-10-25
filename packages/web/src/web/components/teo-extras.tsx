import { useState, useEffect, useRef } from "react";
import { X, Download, Send, ChevronLeft, ChevronRight } from "lucide-react";
import type { Product } from "../lib/teo-data";
import { InfoTip } from "./info-tip";
export function TeoSplash() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 900);
    return () => clearTimeout(t);
  }, []);
  return visible ? (
    <div className="teo-splash">
      <span className="logo">
        teo<span>®</span>
      </span>
      <img src="/images/lamp.jpg" alt="Любимая находка Teo" />
      <h2>
        С teo — заказывать
        <br />
        из Китая просто
      </h2>
      <span className="splash-progress" />
    </div>
  ) : null;
}
export function RegistrationCard() {
  return (
    <div className="registration-card">
      <h3>Сохраним ваши контакты для заказа</h3>
      <InfoTip summary="В боте: /start → «Поделиться номером»">
        Номер будет доступен владельцу и модераторам для связи по заказам.
        Username сохраняется, если он задан в Telegram. Удалить номер:
        /deletephone в боте.
      </InfoTip>
      <a
        className="primary"
        href="https://t.me/teobaobot?start=register"
        target="_blank"
        rel="noreferrer"
      >
        Поделиться номером в боте
      </a>
      <small>Удалить номер из профиля можно командой /deletephone.</small>
    </div>
  );
}
export function ProductGallery({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState("");
  const swipeStart = useRef<number | null>(null);
  const images = product.images?.length ? product.images : [product.image];
  const image = images[index]!;
  const share = async () => {
    const url = `https://teo-mv8o7mi.runable.site/?product=${product.id}`;
    try {
      if (navigator.share && navigator.canShare) {
        let file: File | undefined;
        try {
          const response = await fetch(image);
          if (response.ok) {
            const blob = await response.blob();
            const extension = blob.type.includes("png")
              ? "png"
              : blob.type.includes("webp")
                ? "webp"
                : "jpg";
            file = new File(
              [blob],
              `teo-${product.id}-${index + 1}.${extension}`,
              { type: blob.type },
            );
          }
        } catch {
          /* External images may prohibit CORS; share the product link instead. */
        }
        if (file && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: product.name,
            text: `${product.name}\n${url}`,
          });
          return;
        }
      }
      if (navigator.share)
        await navigator.share({ title: product.name, text: product.name, url });
      else
        window.open(
          "https://t.me/share/url?url=" +
            encodeURIComponent(url) +
            "&text=" +
            encodeURIComponent(product.name),
          "_blank",
          "noopener",
        );
    } catch {
      setNote("Отправка отменена.");
    }
  };
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fn);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener("keydown", fn);
    };
  }, [onClose]);
  return (
    <div className="gallery-overlay">
      <div className="gallery-top">
        <span>{product.name}</span>
        <button aria-label="Закрыть фотографии" onClick={onClose}>
          <X size={25} />
        </button>
      </div>
      <div
        className="gallery-image-stage"
        onTouchStart={(e) => {
          swipeStart.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (swipeStart.current === null) return;
          const delta =
            (e.changedTouches[0]?.clientX ?? swipeStart.current) -
            swipeStart.current;
          swipeStart.current = null;
          if (Math.abs(delta) > 45)
            setIndex(
              (i) => (i + (delta < 0 ? 1 : -1) + images.length) % images.length,
            );
        }}
      >
        <img className="gallery-photo" src={image} alt={product.name} />
        {images.length > 1 && (
          <>
            <button
              className="photo-prev"
              aria-label="Предыдущее фото"
              onClick={() =>
                setIndex((i) => (i - 1 + images.length) % images.length)
              }
            >
              <ChevronLeft />
            </button>
            <button
              className="photo-next"
              aria-label="Следующее фото"
              onClick={() => setIndex((i) => (i + 1) % images.length)}
            >
              <ChevronRight />
            </button>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="gallery-thumbs">
          {images.map((src, i) => (
            <button
              key={i}
              className={index === i ? "selected" : ""}
              aria-label={`Фото ${i + 1}`}
              onClick={() => setIndex(i)}
            >
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      )}
      <div className="gallery-actions">
        <a href={image} download={`teo-${product.id}-${index + 1}.jpg`}>
          <Download size={19} />
          Скачать фото
        </a>
        <button onClick={share}>
          <Send size={19} />
          Отправить
        </button>
      </div>
      <p>На телефоне после скачивания можно сохранить файл в галерею.</p>
      {note && <p>{note}</p>}
    </div>
  );
}
