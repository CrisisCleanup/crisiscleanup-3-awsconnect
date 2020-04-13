/**
 * helpers.js
 * Api Helpers
 */

import axios from 'axios';

export const getLanguageId = async (subtag) => {
  const response = await axios.get('/languages');
  const { results } = response.data;
  const tag = subtag.replace('_', '-');
  const id = results.filter((r) => (r.subtag === tag ? r.id : null));
  if (!id.length) {
    return 2; // en-US default
  }
  return id[0].id;
};
