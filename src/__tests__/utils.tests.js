/**
 * utils.tests.js
 * Utils Tests
 */

// Environment based tests setup based on:
// https://stackoverflow.com/a/48042799
import { configureEndpoint } from '../utils';

describe('utils', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('should set axios defaults correctly', () => {
    process.env.CC_AUTH_TOKEN = 'abc123';
    process.env.CC_API_BASE_URL = 'http://api.com';

    // with only base
    const ax = configureEndpoint();
    expect(ax.defaults).toMatchSnapshot();
  });
});
