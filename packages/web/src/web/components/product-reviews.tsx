import { useState } from "react";
import { Star, Send } from "lucide-react";
import { useTeoReviews, useAddReview, telegramInit } from "../queries/teo";
export function ProductReviews({ productId }: { productId: number }) {
  const reviewsQuery = useTeoReviews(productId);
  const addReview = useAddReview();
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [rating, setRating] = useState(5);
  const items = reviewsQuery.data || [];
  return (
    <section className="reviews-section">
      <span className="eyebrow">ВАШ ОПЫТ ВАЖЕН</span>
      <h2>
        Отзывы <small>{items.length}</small>
      </h2>
      {reviewsQuery.isLoading && <p className="muted">Загружаем отзывы…</p>}
      {reviewsQuery.isError && (
        <p className="muted">Отзывы временно недоступны.</p>
      )}
      {!items.length && (
        <p className="muted">
          Пока нет отзывов. Поделитесь первым впечатлением.
        </p>
      )}
      {items.map((r) => (
        <article className="review-card" key={r.id}>
          <div>
            <b>{r.name}</b>
            <span>{r.date}</span>
          </div>
          <div className="review-stars">
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                size={14}
                fill={i < r.rating ? "currentColor" : "none"}
              />
            ))}
          </div>
          <p>{r.text}</p>
        </article>
      ))}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await addReview.mutateAsync({
              productId,
              name: name.trim(),
              text: text.trim(),
              rating,
            });
            setText("");
            setError("");
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Не удалось сохранить отзыв",
            );
          }
        }}
      >
        <h3>Оставить отзыв</h3>
        <div className="rating-buttons">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              type="button"
              key={v}
              aria-label={`${v} из 5`}
              aria-pressed={rating === v}
              onClick={() => setRating(v)}
            >
              <Star size={25} fill={v <= rating ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
        <label>
          Ваше имя
          <input
            aria-label="Ваше имя"
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Как к вам обращаться?"
          />
        </label>
        <label>
          Ваш отзыв
          <textarea
            aria-label="Ваш отзыв"
            required
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Расскажите, что вам понравилось"
          />
        </label>
        {error && <p className="muted">{error}</p>}
        {!telegramInit() && (
          <p className="muted">
            Чтобы оставить отзыв, откройте Teo через Telegram.
          </p>
        )}
        <button
          className="primary"
          disabled={addReview.isPending || !telegramInit()}
          type="submit"
        >
          {addReview.isPending ? "Сохраняем…" : "Опубликовать отзыв"}{" "}
          <Send size={16} />
        </button>
      </form>
    </section>
  );
}
