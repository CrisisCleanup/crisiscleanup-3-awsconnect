// Dynamic Serverless Config

const DOMAINS = {
  dev: {
    domainName: 'socket.dev.crisiscleanup.io',
    stage: 'dev',
    createRoute53Record: false,
    endpointType: 'regional',
    enabled: false,
    certificateArn:
      'arn:aws:acm:us-east-1:182237011124:certificate/7bdd9a49-4c15-47e5-803b-b9fde85614b5',
  },
  staging: {
    domainName: 'socket.staging.crisiscleanup.io',
    stage: 'staging',
    createRoute53Record: false,
    endpointType: 'regional',
    enabled: false,
    certificateArn:
      'arn:aws:acm:us-east-1:182237011124:certificate/fd622028-f569-43e6-83b3-6f696af0d004',
  },
  prod: {
    domainName: 'socket.crisiscleanup.org',
    stage: 'prod',
    enabled: false,
    createRoute53Record: false,
    endpointType: 'regional',
    certificateArn:
      'arn:aws:acm:us-east-1:182237011124:certificate/278f94c1-8eeb-47a6-bb9c-bb3d83a932a7',
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
