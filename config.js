// Dynamic Serverless Config

const DOMAINS = {
  dev: {
    domainName: 'socket.dev.crisiscleanup.io',
    stage: 'dev',
    createRoute53Record: true,
    endpointType: 'regional',
    certificateName: '*.dev.crisiscleanup.io',
  },
  staging: {
    domainName: 'socket.staging.crisiscleanup.io',
    stage: 'staging',
    createRoute53Record: true,
    endpointType: 'edge',
    certificateName: '*.staging.crisicleanup.io',
  },
  prod: {
    domainName: 'socket.crisiscleanup.org',
    stage: 'prod',
    createRoute53Record: true,
    endpointType: 'edge',
    certificateName: '*.crisiscleanup.org',
  },
};

module.exports = (serverless) => {
  serverless.cli.consoleLog('Loading Dynamic config...');
  serverless.cli.consoleLog(
    'Generating config for stage:',
    process.env.SLS_STAGE,
  );
  const stage = process.env.SLS_STAGE;
  return { domain: DOMAINS[stage] };
};
