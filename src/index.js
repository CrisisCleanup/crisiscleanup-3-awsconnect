const axios = require('axios');

const ENDPOINT = (isDev) => {
  const ep = {
    auth: `Token ${process.env.CC_AUTH_TOKEN}`,
    baseUrl: process.env.CC_API_BASE_URL,
  };
  // AWS connect likes to cast inputs as strings
  if (isDev === '1') {
    (ep.auth = `Token ${process.env.CC_DEV_AUTH_TOKEN}`),
      (ep.baseUrl = process.env.CC_DEV_API_BASE_URL);
  }
  return ep;
};

const checkCases = async (inboundNumber, callback) => {
  // Query phone outbound table
  const queryNumber = inboundNumber.split('+')[1];
  const response = await axios.get(
    `/phone_outbound?phone_number=${queryNumber}`,
  );

  // Throw error to trigger 'no ID' path in connect
  if (response.status !== 200) {
    console.error('response:', response);
    throw 'Number not found!';
  }

  // Filter for outbounds w/ valid pda/worksite id
  const { results } = response.data;
  const cases = {
    pdas: [],
    worksites: [],
    ids: [],
  };

  results.forEach(({ id, pda, worksite }) => {
    cases.ids.push(id);
    if (worksite !== null) {
      return cases.worksites.push(worksite);
    }
    if (pda !== null) {
      return cases.pdas.push(pda);
    }
  });
  console.log('response', response);
  console.log('cases', cases);

  // Response must be simple string map
  if (cases.ids.length >= 1) {
    console.log('Case found!');
    return callback(null, {
      ids: cases.ids.join(','),
      pdas: cases.pdas.join(','),
      worksites: cases.worksites.join(','),
    });
  }

  // Catch all, 'no ID'
  console.log('No cases found!');
  throw 'Number does not have a pda or worksite associated!';
};

const getLanguageId = async (subtag) => {
  const response = await axios.get('/languages');
  const { results } = response.data;
  const tag = subtag.replace('_', '-');
  const id = results.filter((r) => (r.subtag === tag ? r.id : null));
  if (!id.length >= 1) {
    return 2; // en-US default
  }
  return id[0].id;
};

const createCallback = async (
  inboundNumber,
  userLanguage,
  incidentId,
  callback,
) => {
  // Request params
  const params = {
    dnis1: inboundNumber,
    call_type: 'callback',
    language: await getLanguageId(userLanguage),
    incident_id: [incidentId],
  };
  console.log('creating callback...', params);

  const response = await axios.post('/phone_outbound', params);
  console.log('callback response:', response);
  callback(null, { status: 'CREATED' });
};

module.exports.handler = async (event, context, callback) => {
  // Grab inbound number from event
  const {
    Details: {
      Parameters: { inboundNumber, isDev, action, userLanguage, incidentId },
    },
  } = event;

  // Get Endpoint
  const endpoint = ENDPOINT(isDev);
  axios.defaults.baseURL = endpoint.baseUrl;
  axios.defaults.headers.common.Authorization = endpoint.auth;

  switch (action) {
    case 'CHECK_CASE':
      return checkCases(inboundNumber, callback);
    case 'CALLBACK':
      return createCallback(inboundNumber, userLanguage, incidentId, callback);
    default:
      console.log('no action provided!');
      callback(0);
      break;
  }
};
