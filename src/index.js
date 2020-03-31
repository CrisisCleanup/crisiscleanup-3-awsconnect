const axios = require('axios');

axios.defaults.baseURL = 'https://api.crisiscleanup.org';
axios.defaults.headers.common.Authorization = `Token ${process.env.CC_AUTH_TOKEN}`;

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
  };

  results.forEach(({ pda, worksite }) => {
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
  if (cases) {
    return callback(null, {
      outboundId: results.id,
      pdas: cases.pdas.join(','),
      worksites: cases.worksites.join(','),
    });
  }

  // Catch all, 'no ID'
  throw 'Number does not have a pda or worksite associated!';
};
