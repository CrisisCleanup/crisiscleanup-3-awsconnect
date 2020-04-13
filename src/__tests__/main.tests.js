/**
 * main.tests.js
 * Main Tests
 */

import { Outbound } from '../api';
import Handler from '../index';

jest.mock('../api');

const MockEvent = (data = {}) => ({
  Details: {
    Parameters: {
      inboundNumber: '+10000000000',
      isDev: '0',
      action: 'CHECK_CASE',
      userLanguage: 'en_US',
      incidentId: '199',
      ...data,
    },
  },
});

describe('handler', () => {
  it('checks for existing case', async () => {
    Outbound.resolveCasesByNumber = jest.fn();
    Outbound.resolveCasesByNumber.mockResolvedValue({
      ids: [0, 1],
      pdas: [1],
      worksites: [2],
    });
    const callback = jest.fn();
    await Handler(MockEvent(), {}, callback);
    expect(Outbound.resolveCasesByNumber.mock.calls.length).toBe(1);
    expect(callback).toMatchSnapshot();
  });
});
