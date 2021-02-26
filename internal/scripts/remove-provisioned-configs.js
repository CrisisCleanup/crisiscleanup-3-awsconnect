const shelljs = require('shelljs');

// Vars
const slsFunctions = [
  'awsConnect',
  'wsHandler',
  'connectionHandler',
  'metricStreamHandler',
  'contactStreamHandler',
  'agentStreamHandler',
];
const curShell = process.env.SHELL;
const targStage = process.argv[2];

if (!targStage) {
  shelljs.echo('You must provide a stage!');
  shelljs.exit(1);
}

const cmdBase = 'aws --region us-east-1 lambda';

slsFunctions.forEach((func) => {
  const lambdaName = `crisiscleanup-3-awsconnect-${targStage}-${func}`;
  const qualifier = 'provisioned';
  shelljs.echo(`Removing provisioned concurrency for: ${lambdaName}`);
  let cmd = `${cmdBase} delete-provisioned-concurrency-config --function-name ${lambdaName} --qualifier ${qualifier}`;
  shelljs.exec(cmd, {
    shell: curShell,
  });
  shelljs.echo(`Removing reserved config for: ${lambdaName}`);
  cmd = `${cmdBase} delete-function-concurrency --function-name ${lambdaName}`;
  shelljs.exec(cmd, {
    shell: curShell,
  });
});

shelljs.echo('Done!');
