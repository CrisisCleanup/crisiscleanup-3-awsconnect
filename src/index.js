const axios = require('axios');

axios.defaults.baseURL = 'https://api.crisiscleanup.org';

module.exports.handler = async (event, context, callback) => {
  // Grab inbound number from event
  const {
    Details: {
      Parameters: { inboundNumber },
    },
  } = event;

  // Query phone outbound table
  const queryNumber = inboundNumber.split('+')[1];
  const response = await axios.get(
    `/phone_outbound?phone_number=${queryNumber}`,
    {
      auth: {
        username: process.env.CC_AUTH_USERNAME,
        password: process.env.CC_AUTH_PASSWORD,
      },
    },
  );

  // Throw error to trigger 'no ID' path in connect
  if (response.status !== 200) {
    console.error('response:', response);
    throw 'Number not found!';
  }

  // Filter for outbounds w/ valid pda/worksite id
  const { results } = response.data;
  const cases = results.filter(({ pda, worksite }) => {
    if (worksite !== null) {
      return { type: 'worksite', id: worksite };
    }
    if (pda !== null) {
      return { type: 'pda', id: pda };
    }
  });

  // if we got any, send em' back
  if (cases) {
    return callback(null, { cases });
  }

  // Catch all, 'no ID'
  throw 'Number does not have a pda or worksite associated!';
};
