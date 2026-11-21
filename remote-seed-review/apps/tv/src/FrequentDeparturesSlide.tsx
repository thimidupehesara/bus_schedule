import { memo } from 'react';

export interface FrequentServiceItem {
  id: string;
  destinationSi: string;
  destinationEn: string;
  si: string;
  en: string;
}

export const FREQUENT_SERVICES: readonly FrequentServiceItem[] = [
  {
    id: 'badulla',
    destinationSi: 'බදුල්ල',
    destinationEn: 'Badulla',
    si: 'මහියංගණ සිට බදුල්ල දක්වා ගමන් ගන්නා බස් රථ සෑම විනාඩි 15කට සැරයක් පිටත්වෙයි.',
    en: 'Mahiyanganaya to Badulla buses depart every 15 minutes.',
  },
  {
    id: 'kandy',
    destinationSi: 'නුවර',
    destinationEn: 'Kandy',
    si: 'මහියංගණ සිට නුවර දක්වා ගමන් ගන්නා බස් රථ සෑම විනාඩි 15කට සැරයක් පිටත්වෙයි.',
    en: 'Mahiyanganaya to Kandy buses depart every 15 minutes.',
  },
  {
    id: 'sacred-city',
    destinationSi: 'පූජා නගරය',
    destinationEn: 'Sacred City',
    si: 'මහියංගණ සිට පූජා නගරය දක්වා ගමන් ගන්නා බස් රථ සෑම විනාඩි 15කට සැරයක් පිටත්වෙයි.',
    en: 'Mahiyanganaya to Sacred City of Mahiyanganaya buses depart every 15 minutes.',
  },
];

interface FrequentDeparturesSlideProps {
  active: boolean;
  hidden: boolean;
  fadeMs: number;
}

export const FrequentDeparturesSlide = memo(function FrequentDeparturesSlide({
  active,
  hidden,
  fadeMs,
}: FrequentDeparturesSlideProps) {
  return (
    <div
      className={`frequent-slide${active ? ' active' : ''}`}
      style={{
        opacity: active ? (hidden ? 0 : 1) : 0,
        visibility: active ? 'visible' : 'hidden',
        pointerEvents: active ? 'auto' : 'none',
        transition: `opacity ${fadeMs / 2}ms ease-in-out, visibility ${fadeMs / 2}ms ease-in-out`,
      }}
      aria-hidden={!active}
      aria-label="Frequent Bus Services"
    >
      <div className="frequent-content-wrapper">
        <header className="frequent-header-block">
          <h2 lang="si" className="frequent-title-si">
            සෑම විනාඩි 15කට වරක් පිටත්වන බස් රථ
          </h2>
          <div lang="en" className="frequent-subtitle-en">
            FREQUENT BUS SERVICES • DEPARTING EVERY 15 MINUTES
          </div>
        </header>

        <div className="frequent-cards-stack">
          {FREQUENT_SERVICES.map((item) => (
            <article key={item.id} className="frequent-card">
              <div className="frequent-card-left">
                <p lang="si" className="frequent-card-si">
                  {item.si}
                </p>
                <p lang="en" className="frequent-card-en">
                  {item.en}
                </p>
              </div>

              <div className="frequent-pill-badge" aria-label="Every 15 minutes">
                <svg
                  className="frequent-pill-icon"
                  viewBox="0 0 24 24"
                  width="26"
                  height="26"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <div className="frequent-pill-labels">
                  <span className="pill-min">15 MIN</span>
                  <span lang="si" className="pill-si">
                    විනාඩි 15
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
});
