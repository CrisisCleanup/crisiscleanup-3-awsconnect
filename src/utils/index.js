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

export const configureEndpoint = (isDev = null) => {
  const apiConfig = ENDPOINT(isDev);
  const { baseUrl, auth } = apiConfig;
  axios.defaults.baseURL = baseUrl;
  axios.defaults.headers.common.Authorization = auth;
  return axios;
};
