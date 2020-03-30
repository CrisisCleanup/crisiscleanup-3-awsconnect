const axios = require('axios');

axios.defaults.baseURL = 'https://api.crisiscleanup.org';

module.exports.handler = async (event, context, callback) => {
  // Grab inbound number from event
  const {
    Details: {
      Parameters: { inboundNumber },
    },
  } = event;

  // Log
  console.log('EVENT', event);
  console.log('CONTEXT', context);

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
  console.log('RESPONSE', response);
  if (response.status !== 200) {
    throw 'Number not found!';
  }

  const { pda, worksite } = response.data;
  if (worksite !== null) {
    return callback(null, { type: 'worksite', id: worksite });
  }

  if (pda !== null) {
    return callback(null, { type: 'pda', id: pda });
  }

  throw 'Number does not have a pda or worksite associated!';
};
