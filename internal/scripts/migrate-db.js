#!/usr/bin/env node
/*
 * Update all function
 *
 */

const shelljs = require('shelljs');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const getCmd = (content) =>
  `awslocal --endpoint-url=${process.env.LOCAL_DYNAMO_ENDPOINT} dynamodb create-table --cli-input-json '${content}'`;
const getRemoveCmd = (tableName) =>
  `awslocal --endpoint-url=${process.env.LOCAL_DYNAMO_ENDPOINT} dynamodb delete-table --table-name ${tableName} `;

const curShell = process.env.SHELL;

const migrationsDir = path.resolve(__dirname, '../migrations');
const migrateFiles = shelljs.find(migrationsDir);
migrateFiles.shift(); // shift out dir name

shelljs.echo('Executing DynamoDB Migrations...');

const isCI = process.env.CI;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const pollLS = async () => {
  shelljs.echo('Waiting...');
  shelljs.echo('Waiting for localstack to be ready...');
  if (isCI !== '1') return;
  let isReady = false;
  let data;
  while (!isReady) {
    try {
      const resp = await axios.get(
        `${process.env.LOCAL_DYNAMO_ENDPOINT}/health`,
      );
      data = resp.data;
    } catch {
      shelljs.echo('Not up yet, waiting...');
    }
    if (data) {
      shelljs.echo('Localstack is up! Checking services...');
      const ready = Object.keys(data.services).map(
        (s) => data.services[s] === 'ready',
      );
      shelljs.echo(data);
      if (!ready.length <= 5) {
        shelljs.echo('Localstack is up! Checking services...');
        isReady = true;
      }
    }
    await delay(5000);
  }
};

pollLS().then(() => {
  migrateFiles.forEach((path) => {
    const fileContent = fs.readFileSync(path).toString();
    const tableDef = JSON.parse(fileContent);
    try {
      shelljs.exec(getRemoveCmd(tableDef.TableName), { shell: curShell });
    } catch (e) {}
    shelljs.echo(`Executing migration: ${tableDef.TableName}`);
    shelljs.exec(getCmd(fileContent), { shell: curShell });
  });
  shelljs.echo('Done!');
});
