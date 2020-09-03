/**
 * utils.tests.js
 * Utils Tests
 */

// Environment based tests setup based on:
// https://stackoverflow.com/a/48042799
import { configureEndpoint, Dynamo } from '../utils';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';

describe('utils', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('should configure offline dynamo endpoint correctly', async () => {
    process.env.SLS_STAGE = 'local';
    expect(Dynamo.dynamoOptions()).toMatchInlineSnapshot(`
      Object {
        "endpoint": "http://localhost:4566",
        "region": "localhost",
      }
    `);
  });

  it('should use default dynamo endpoint if not offline', async () => {
    process.env.IS_OFFLINE = undefined;
    process.env.SLS_STAGE = 'prod';
    expect(Dynamo.dynamoOptions()).toMatchInlineSnapshot(`Object {}`);
  });

  it('should set axios defaults correctly', () => {
    process.env.CC_AUTH_TOKEN = 'abc123';
    process.env.CC_API_BASE_URL = 'http://api.com';

    // with only base
    const ax = configureEndpoint();
    expect(ax.defaults).toMatchSnapshot();
  });
});

describe('dynamo', () => {
  it('should generate expression correctly', () => {
    // const filter = Dynamo.expiredFilter();
    // expect(filter).toMatchSnapshot();
    const op = {
      ...Dynamo.Expressions([
        { key: 'a', name: 'keyOne', value: 1 },
        { key: 'b', name: 'keyTwo', value: 2 },
        { key: 'c', value: 5, valueOnly: true },
      ]),
      IndexName: 'fake-index',
      KeyConditionExpression: 'some exp',
    };
    expect(op).toMatchSnapshot();
    // expect({
    //   ...Dynamo.filter
    // })
  });
});
