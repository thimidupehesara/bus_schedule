export interface FrequentServiceCard {
  id: number;
  routeLabel: string;
  textSi: string;
  textEn: string;
  badgeEn: string;
  badgeSi: string;
}

export interface FrequentServicesConfig {
  headerSi: string;
  headerEn: string;
  cards: FrequentServiceCard[];
  updatedAt?: number;
}

export const DEFAULT_FREQUENT_SERVICES_CONFIG: FrequentServicesConfig = {
  headerSi: 'නිතර පිටත්වන ගමනාන්ත',
  headerEn: 'FREQUENT BUS SERVICES',
  cards: [
    {
      id: 1,
      routeLabel: 'Badulla',
      textSi: 'බදුල්ල දක්වා ධාවනය වන බස් රථ සෑම විනාඩි 15කට වරක් පිටත්වෙයි.',
      textEn: 'Mahiyanganaya to Badulla buses depart every 15 minutes.',
      badgeEn: '15 MIN',
      badgeSi: 'විනාඩි 15',
    },
    {
      id: 2,
      routeLabel: 'Kandy',
      textSi: 'මහනුවර දක්වා ධාවනය වන බස් රථ සෑම විනාඩි 20-30කට වරක් පිටත්වෙයි.',
      textEn: 'Mahiyanganaya to Kandy buses depart every 20-30 minutes.',
      badgeEn: '20-30 MIN',
      badgeSi: 'විනාඩි 20-30',
    },
    {
      id: 3,
      routeLabel: 'Sacred City',
      textSi: 'මහියංගණ සිට පූජා නගරය දක්වා ධාවනය වන බස් රථ සෑම විනාඩි 15කට වරක් පිටත්වෙයි.',
      textEn: 'Mahiyanganaya to Sacred City of Mahiyanganaya buses depart every 15 minutes.',
      badgeEn: '15 MIN',
      badgeSi: 'විනාඩි 15',
    },
  ],
};
