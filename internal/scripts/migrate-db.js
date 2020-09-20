#!/usr/bin/env node
/*
 * Update all function
 *
 */

const shelljs = require('shelljs');
const path = require('path');
const fs = require('fs');

const getCmd = (content) =>
  `awslocal dynamodb create-table --cli-input-json '${content}'`;
const getRemoveCmd = (tableName) =>
  `awslocal dynamodb delete-table --table-name ${tableName} `;

const curShell = process.env.SHELL;

const migrationsDir = path.resolve(__dirname, '../migrations');
const migrateFiles = shelljs.find(migrationsDir);
migrateFiles.shift(); // shift out dir name

shelljs.echo('Executing DynamoDB Migrations...');

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
