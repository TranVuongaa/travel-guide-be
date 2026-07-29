export const TRAVEL_CONTENT_INGESTION_QUEUE = 'travel-content-ingestion';
export const RUN_TRAVEL_CONTENT_INGESTION_JOB = 'run-travel-content-ingestion';

export const TRAVEL_TREND_SEEDS = [
  'travel',
  'destination',
  'travel guide',
  'places to visit',
  'things to do',
] as const;

export const MAX_TREND_KEYWORDS = 10;
export const MAX_ARTICLES = 20;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_TITLE_LENGTH = 200;
export const MAX_ERROR_SUMMARY_LENGTH = 2000;
