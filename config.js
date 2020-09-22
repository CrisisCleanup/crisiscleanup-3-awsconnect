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

const DomainMapping = ({ domainName }) => ({
  Type: 'AWS::ApiGatewayV2::ApiMapping',
  Properties: {
    DomainName: domainName,
    ApiId: {
      Ref: 'WebsocketsApi',
    },
    Stage: {
      Ref: 'WebsocketsDeploymentStage',
    },
  },
});

const StreamsPFactor = {
  dev: 3,
  staging: 5,
  prod: 10,
};

const LambdaEventDynamoMapping = ({ dbRef, lambdaRef }, stage) => ({
  Type: 'AWS::Lambda::EventSourceMapping',
  Properties: {
    BatchSize: 1,
    EventSourceArn: {
      'Fn::GetAtt': [dbRef, 'StreamArn'],
    },
    FunctionName: {
      'Fn::GetAtt': [lambdaRef, 'Arn'],
    },
    StartingPosition: 'TRIM_HORIZON',
    Enabled: 'True',
    ParallelizationFactor: StreamsPFactor[stage],
    MaximumRetryAttempts: 1000,
    MaximumRecordAgeInSeconds: 120,
    MaximumBatchingWindowInSeconds: 0,
  },
});

const LambdaStreams = {
  metricsEventMap: {
    dbRef: 'metricsTable',
    lambdaRef: 'MetricStreamHandlerLambdaFunction',
  },
  contactsEventMap: {
    dbRef: 'contactsTable',
    lambdaRef: 'ContactStreamHandlerLambdaFunction',
  },
  agentsEventMap: {
    dbRef: 'agentsTable',
    lambdaRef: 'AgentStreamHandlerLambdaFunction',
  },
};

const DAXConfig = {
  dev: {
    nodeType: 'dax.r4.large',
    replicationFactor: 1,
  },
  staging: {
    nodeType: 'dax.r4.large',
    replicationFactor: 2,
  },
  prod: {
    nodeType: 'dax.r5.large',
    replicationFactor: 4,
  },
};

const LambdaConfig = {
  dev: {
    warmupConcurrency: 0,
    provisioned: 3,
    reserved: 5,
    wsHandler: {
      provisioned: 10,
      reserved: 15,
    },
    awsConnect: {
      provisioned: 5,
      reserved: 8,
    },
  },
  staging: {
    warmupConcurrency: 1,
    provisioned: 10,
    reserved: 20,
    wsHandler: {
      provisioned: 30,
      reserved: 60,
    },
    awsConnect: {
      provisioned: 15,
      reserved: 20,
    },
  },
  prod: {
    warmupConcurrency: 5,
    provisioned: 15,
    reserved: 30,
    wsHandler: {
      provisioned: 30,
      reserved: 100,
    },
    awsConnect: {
      provisioned: 30,
      reserved: 100,
    },
  },
};

module.exports = serverless => {
  serverless.cli.consoleLog('Loading Dynamic config...');
  serverless.cli.consoleLog(
    'Generating config for stage:',
    process.env.SLS_STAGE,
  );
  const stage = process.env.SLS_STAGE;
  const eventMaps = Object.fromEntries(
    Object.entries(LambdaStreams).map(([key, val]) => [
      key,
      LambdaEventDynamoMapping(val, stage),
    ]),
  );
  let config = {};
  if (stage === 'local') {
    config = {
      resources: { ...eventMaps, apiMapping: DomainMapping(DOMAINS.dev) },
      domain: {
        enabled: false,
      },
      dax: DAXConfig.dev,
      lambda: LambdaConfig.dev,
    };
  } else {
    config = {
      domain: DOMAINS[stage],
      resources: {
        apiMapping: DomainMapping(DOMAINS[stage]),
        ...eventMaps,
      },
      dax: DAXConfig[stage],
      lambda: LambdaConfig[stage],
    };
  }
  serverless.cli.consoleLog(config);
  return config;
};
