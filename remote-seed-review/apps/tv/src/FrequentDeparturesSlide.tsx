import { memo } from 'react';
import {
  type FrequentServicesConfig,
  type FrequentServiceCard,
  DEFAULT_FREQUENT_SERVICES_CONFIG,
} from '@bus-schedule/shared';

export type FrequentServiceItem = FrequentServiceCard;

export const FREQUENT_SERVICES: readonly FrequentServiceCard[] =
  DEFAULT_FREQUENT_SERVICES_CONFIG.cards;

interface FrequentDeparturesSlideProps {
  active: boolean;
  hidden: boolean;
  fadeMs: number;
  config?: FrequentServicesConfig | undefined;
}

export const FrequentDeparturesSlide = memo(function FrequentDeparturesSlide({
  active,
  hidden,
  fadeMs,
  config,
}: FrequentDeparturesSlideProps) {
  const activeConfig = config ?? DEFAULT_FREQUENT_SERVICES_CONFIG;
  const headerSi = activeConfig.headerSi || DEFAULT_FREQUENT_SERVICES_CONFIG.headerSi;
  const headerEn = activeConfig.headerEn || DEFAULT_FREQUENT_SERVICES_CONFIG.headerEn;
  const cards =
    activeConfig.cards && activeConfig.cards.length > 0
      ? activeConfig.cards
      : DEFAULT_FREQUENT_SERVICES_CONFIG.cards;

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
            {headerSi}
          </h2>
          <div lang="en" className="frequent-subtitle-en">
            {headerEn}
          </div>
        </header>

        <div className="frequent-cards-stack">
          {cards.map((item) => {
            const textSi = item.textSi ?? (item as unknown as { si?: string }).si ?? '';
            const textEn = item.textEn ?? (item as unknown as { en?: string }).en ?? '';
            const badgeEn =
              item.badgeEn ??
              (item as unknown as { intervalEn?: string }).intervalEn ??
              '15 MIN';
            const badgeSi =
              item.badgeSi ??
              (item as unknown as { intervalSi?: string }).intervalSi ??
              'විනාඩි 15';

            return (
              <article key={item.id} className="frequent-card">
                <div className="frequent-card-left">
                  <p lang="si" className="frequent-card-si">
                    {textSi}
                  </p>
                  <p lang="en" className="frequent-card-en">
                    {textEn}
                  </p>
                </div>

                <div className="frequent-pill-badge" aria-label={`Every ${badgeEn}`}>
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
                    <span className="pill-min">{badgeEn}</span>
                    <span lang="si" className="pill-si">
                      {badgeSi}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
});
