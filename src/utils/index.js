/**
 * index.js
 * Utils
 */

import axios from 'axios';

export const ENDPOINT = (isDev = null) => {
  const ep = {
    auth: `Token ${process.env.CC_AUTH_TOKEN}`,
    baseUrl: process.env.CC_API_BASE_URL,
  };
  // AWS connect likes to cast inputs as strings
  const dev = isDev || Boolean(Number(process.env.IS_DEV));
  if (dev) {
    ep.auth = `Token ${process.env.CC_DEV_AUTH_TOKEN}`;
    ep.baseUrl = process.env.CC_DEV_API_BASE_URL;
  }
  return ep;
};

export const getEndpoint = ({ isDev, path } = {}) => {
  const apiConfig = ENDPOINT(isDev);
  const { baseUrl, auth } = apiConfig;
  let endpoint = baseUrl;
  if (path) {
    endpoint = `${baseUrl}/${path}`;
  }
  return axios.create({
    baseUrl: endpoint,
    headers: {
      'X-Authorization': auth,
    },
  });
};
