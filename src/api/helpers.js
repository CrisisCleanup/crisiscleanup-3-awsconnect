/**
 * helpers.js
 * Api Helpers
 */

import axios from 'axios';

export const LANGUAGE = {
  en_US: 'en-US',
  es_MX: 'es-MX',
  ar: 'ar',
  ku: 'ku',
};

const LANGUAGE_IDS = {
  en_US: 2,
  es_MX: 7,
  ar: 11,
  ku: 230,
};

export const getLanguageId = async (subtag) => {
  if (subtag.includes('-')) {
    return getLanguageId(subtag.replace('-', '_'));
  }
  if (Object.keys(LANGUAGE_IDS).includes(subtag)) {
    return LANGUAGE_IDS[subtag];
  }
  return 2;
};
