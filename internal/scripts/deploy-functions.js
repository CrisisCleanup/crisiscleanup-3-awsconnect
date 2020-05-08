#!/usr/bin/env node
/* eslint-disable import/no-extraneous-dependencies */

/*
 * Update all function
 *
 */

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

const cmdBase = `sls --env ${targStage} --stage ${targStage} deploy`;

shelljs.echo(`Deploying functions for: ${targStage}`);

slsFunctions.forEach((func) => {
  shelljs.echo(`- Updating: ${func}`);
  const cmd = `${cmdBase} -f ${func} --aws-s3-accelerate`;
  shelljs.echo(`Executing: ${cmd}`);
  shelljs.exec(cmd, {
    shell: curShell,
    env: { SENTRY_BUILD: slsFunctions.indexOf(func) === 0 ? '1' : '0' },
  });
});

shelljs.echo('Done!');
