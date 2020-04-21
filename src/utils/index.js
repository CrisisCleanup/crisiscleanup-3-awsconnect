/**
 * index.js
 * Utils
 */

import axios from 'axios';
import * as DynamoDB from './dynamo';

export const Dynamo = DynamoDB;

export const CURRENT_ENDPOINT = {
  ws: process.env.WS_CALLBACK_URL,
  token: process.env.CC_AUTH_TOKEN,
  api: process.env.CC_API_BASE_URL,
};

export const configureEndpoint = (config = {}) => {
  const ep = { ...CURRENT_ENDPOINT, ...config };

  const { api, token } = ep;
  axios.defaults.baseURL = api;
  axios.defaults.headers.common.Authorization = `Token ${token}`;
  console.log('Endpoints Configured:', ep);
  return axios;
};

export const getLatestById = (items) => Math.max(...items.map((o) => o.id));
