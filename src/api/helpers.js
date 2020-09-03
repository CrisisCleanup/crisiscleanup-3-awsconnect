/**
 * helpers.js
 * Api Helpers
 */

import axios from 'axios';

const LANGUAGE = {
  en_US: 2,
  es_MX: 7,
};

export const getLanguageId = async (subtag) => {
  if (subtag.includes('-')) {
    return getLanguageId(subtag.replace('-', '_'));
  }
  if (Object.keys(LANGUAGE).includes(subtag)) {
    return LANGUAGE[subtag];
  }
  return 2;
};
