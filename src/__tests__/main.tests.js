/**
 * main.tests.js
 * Main Tests
 */

import { Agent, Outbound } from '../api';
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

  it('creates a new callback', async () => {
    Outbound.create = jest.fn();
    Outbound.create.mockResolvedValue({
      status: 200,
    });
    const callback = jest.fn();
    await Handler(MockEvent({ action: 'CALLBACK' }), {}, callback);
    expect(Outbound.create.mock.calls.length).toBe(1);
    expect(callback).toMatchSnapshot();
  });

  it('denies a callback', async () => {
    Outbound.unlock = jest.fn();
    Outbound.unlock.mockResolvedValue({
      status: 200,
    });
    const callback = jest.fn();
    await Handler(MockEvent({ action: 'DENIED_CALLBACK' }), {}, callback);
    expect(Outbound.unlock.mock.calls.length).toBe(1);
    expect(callback).toMatchSnapshot();
  });

  it('sets agent state', async () => {
    Agent.setState = jest.fn();
    const callback = jest.fn();
    const params = {
      action: 'SET_AGENT_STATE',
      agentId: 'xxxx',
      agentState: 'routable',
    };
    await Handler(
      MockEvent({ action: 'SET_AGENT_STATE', ...params }),
      {},
      callback,
    );
    expect(Agent.setState).toMatchSnapshot();
    expect(callback).toMatchSnapshot();
  });
});
