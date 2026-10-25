import { Children, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Camera,
  Route,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { shippingNotice } from "../../shared/commerce";

export function HomeBannerCarousel({
  children,
  openPhoto,
}: {
  children: ReactNode;
  openPhoto: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [guide, setGuide] = useState(false);
  const slides = Children.toArray(children).filter(Boolean);
  const count = slides.length + 2;
  const go = (index: number) => {
    const el = track.current;
    if (el)
      el.scrollTo({
        left: ((index + count) % count) * el.clientWidth,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  };
  return (
    <section
      className="home-banner-carousel"
      aria-label="Баннеры teo"
      aria-roledescription="карусель"
    >
      <div
        className="banner-track"
        ref={track}
        onScroll={() => {
          const el = track.current;
          if (el) setActive(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {slides.map((slide, i) => (
          <div
            className="banner-slide hero"
            aria-label={`${i + 1} из ${count}`}
            key={i}
          >
            {slide}
          </div>
        ))}
        <div
          className="banner-slide hero"
          aria-label={`${count - 1} из ${count}`}
        >
          <button
            className="home-info-banner home-photo-banner"
            onClick={openPhoto}
            tabIndex={active === count - 2 ? 0 : -1}
          >
            <Camera size={46} />
            <span>
              <small>ЕСТЬ ФОТО — НАЙДЁМ ВЕЩЬ</small>
              <strong>
                Не нашли товар?
                <br />
                Поиск по фотографии
              </strong>
              <span>Пришлите фото — поможем с поиском.</span>
              <b>
                Найти по фото <ArrowUpRight size={18} />
              </b>
            </span>
          </button>
        </div>
        <div
          className="banner-slide hero"
          aria-label={`${count} из ${count}`}
        >
          <button
            className="home-info-banner guide-banner"
            onClick={() => setGuide(!guide)}
            aria-expanded={guide}
            aria-controls="home-order-guide"
            tabIndex={active === count - 1 ? 0 : -1}
          >
            <Route size={46} />
            <span>
              <small>ПРОСТО, ШАГ ЗА ШАГОМ</small>
              <strong>
                Как заказать:
                <br />
                товар → оплата → доставка СДЭК
              </strong>
              <span>Товар и доставка оплачиваются отдельно.</span>
              <b>
                {guide ? "Скрыть инструкцию" : "Как это работает"}{" "}
                <ArrowUpRight size={18} />
              </b>
            </span>
          </button>
        </div>
      </div>
      <div className="banner-controls">
        <button aria-label="Предыдущий баннер" onClick={() => go(active - 1)}>
          <ChevronLeft size={20} />
        </button>
        <div className="banner-pagination">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              aria-label={`Баннер ${i + 1}`}
              aria-current={active === i ? "true" : undefined}
              className={active === i ? "active" : ""}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button aria-label="Следующий баннер" onClick={() => go(active + 1)}>
          <ChevronRight size={20} />
        </button>
      </div>
      {guide && (
        <div className="home-order-guide" id="home-order-guide">
          <h3>От находки до вашего ПВЗ</h3>
          <ol>
            <li>
              <b>Выберите товар.</b> Добавьте в корзину, укажите город и адрес
              ПВЗ СДЭК, отправьте заявку.
            </li>
            <li>
              <b>Оплатите товар после подтверждения наличия.</b> Реквизиты
              появятся в заказе. После перевода нажмите «Я оплатил» — владелец
              проверит поступление денег.
            </li>
            <li>
              <b>Дождитесь поступления к поставщику.</b> Мы свяжемся с вами и
              отдельно рассчитаем доставку из Владивостока.
            </li>
            <li>
              <b>Оплатите доставку.</b> После подтверждения денег отправим
              посылку СДЭК и сообщим трек-номер.
            </li>
          </ol>
          <p className="shipping-disclosure">{shippingNotice}</p>
        </div>
      )}
    </section>
  );
}
