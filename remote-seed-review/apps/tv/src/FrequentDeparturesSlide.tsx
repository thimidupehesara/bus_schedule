import { memo } from 'react';

export interface FrequentServiceItem {
  id: string;
  destinationSi: string;
  destinationEn: string;
  si: string;
  en: string;
  intervalEn: string;
  intervalSi: string;
}

export const FREQUENT_SERVICES: readonly FrequentServiceItem[] = [
  {
    id: 'badulla',
    destinationSi: 'බදුල්ල',
    destinationEn: 'Badulla',
    si: 'බදුල්ල දක්වා ධාවනය වන බස් රථ සෑම විනාඩි 15කට වරක් පිටත්වෙයි.',
    en: 'Mahiyanganaya to Badulla buses depart every 15 minutes.',
    intervalEn: '15 MIN',
    intervalSi: 'විනාඩි 15',
  },
  {
    id: 'kandy',
    destinationSi: 'නුවර',
    destinationEn: 'Kandy',
    si: 'මහනුවර දක්වා ධාවනය වන බස් රථ සෑම විනාඩි 20-30කට වරක් පිටත්වෙයි.',
    en: 'Mahiyanganaya to Kandy buses depart every 20-30 minutes.',
    intervalEn: '20-30 MIN',
    intervalSi: 'විනාඩි 20-30',
  },
  {
    id: 'sacred-city',
    destinationSi: 'පූජා නගරය',
    destinationEn: 'Sacred City',
    si: 'මහියංගණ සිට පූජා නගරය දක්වා ධාවනය වන බස් රථ සෑම විනාඩි 15කට වරක් පිටත්වෙයි.',
    en: 'Mahiyanganaya to Sacred City of Mahiyanganaya buses depart every 15 minutes.',
    intervalEn: '15 MIN',
    intervalSi: 'විනාඩි 15',
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

              <div className="frequent-pill-badge" aria-label={`Every ${item.intervalEn}`}>
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
                  <span className="pill-min">{item.intervalEn}</span>
                  <span lang="si" className="pill-si">
                    {item.intervalSi}
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
