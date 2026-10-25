import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Product } from "../lib/teo-data";
export function ProductPhotoSlider({
  product,
  onOpen,
}: {
  product: Product;
  onOpen: () => void;
}) {
  const [index, setIndex] = useState(0);
  const start = useRef<number | null>(null);
  const images = product.images?.length ? product.images : [product.image];
  const move = (delta: number) =>
    setIndex((i) => (i + delta + images.length) % images.length);
  return (
    <div
      className="product-photo-slider"
      onTouchStart={(e) => {
        start.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (start.current === null) return;
        const delta =
          (e.changedTouches[0]?.clientX ?? start.current) - start.current;
        start.current = null;
        if (Math.abs(delta) > 45) move(delta < 0 ? 1 : -1);
      }}
    >
      <button
        className="detail-photo-open"
        aria-label="Открыть фотографии"
        onClick={onOpen}
      >
        <img src={images[index]} alt={`${product.name}, фото ${index + 1}`} />
        <span>Открыть фото на весь экран</span>
      </button>
      {images.length > 1 && (
        <>
          <button
            className="photo-prev"
            aria-label="Предыдущее фото товара"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={22} />
          </button>
          <button
            className="photo-next"
            aria-label="Следующее фото товара"
            onClick={() => move(1)}
          >
            <ChevronRight size={22} />
          </button>
          <div className="photo-dots">
            {images.map((_, i) => (
              <button
                key={i}
                aria-label={`Фото товара ${i + 1}`}
                className={i === index ? "active" : ""}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <small className="photo-count">
            {index + 1} / {images.length}
          </small>
        </>
      )}
    </div>
  );
}
