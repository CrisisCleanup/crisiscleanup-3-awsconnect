/**
 * api.tests.js
 * Api Module Tests
 */

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { Agent, Helpers, Outbound } from '../api';
import { Dynamo } from '../utils';

jest.mock('../utils/dynamo.js');

const MockOutbound = ({ id, phoneNumber, pda, worksite } = {}) => ({
  id: id || 0,
  phone_number: phoneNumber || '+1234567890',
  pda: pda || null,
  worksite: worksite || null,
});

describe('outbound api', () => {
  it('retrieves outbound by number', async () => {
    const mock = new MockAdapter(axios);
    mock
      .onGet('/phone_outbound', {
        params: { phone_number: '1234567890' },
      })
      .reply(200, {
        results: [MockOutbound()],
      });

    const resp = await Outbound.getByPhoneNumber('+1234567890');
    expect(resp).toMatchSnapshot();
  });

  it('throws error on no results', async () => {
    const mock = new MockAdapter(axios);
    mock
      .onGet('/phone_outbound', {
        params: { phone_number: '1234567890' },
      })
      .reply(404, {
        results: [],
      });
    await expect(Outbound.getByPhoneNumber('123')).rejects.toThrow();
  });

  it('resolves cases by number', async () => {
    const mock = new MockAdapter(axios);
    mock
      .onGet('/phone_outbound', { params: { phone_number: '1234567890' } })
      .reply(200, {
        results: [
          MockOutbound(),
          MockOutbound({ id: 1, worksite: 1 }),
          MockOutbound({ id: 3, pda: 1 }),
        ],
      });
    const cases = await Outbound.resolveCasesByNumber('+1234567890');
    expect(cases).toMatchSnapshot();
  });

  it('creates callback', async () => {
    const mock = new MockAdapter(axios);
    mock.onGet('/languages').reply(200, {
      results: [
        {
          id: 5,
          subtag: 'en-US',
        },
      ],
    });
    mock
      .onPost('/phone_outbound', {
        dnis1: '+10000000000',
        call_type: 'callback',
        language: 5,
        incident_id: ['199'],
      })
      .reply(201);
    const resp = await Outbound.create('+10000000000', 'en_US', '199');
    expect(resp).toMatchSnapshot();
  });

  it('unlocks the latest callback', async () => {
    const mock = new MockAdapter(axios);
    mock
      .onGet('/phone_outbound', { params: { phone_number: '10001112222' } })
      .reply(200, {
        results: [MockOutbound(), MockOutbound({ id: 99 })],
      });
    mock.onPost('/phone_outbound/99/unlock').reply(200);
    const resp = await Outbound.unlock('+10001112222');
    expect(resp).toMatchSnapshot();
  });

  it('gets the language id', async () => {
    const mock = new MockAdapter(axios);
    mock.onGet('/languages').reply(200, {
      results: [
        {
          id: 5,
          subtag: 'en-US',
        },
      ],
    });

    const result = await Helpers.getLanguageId('en_US');
    expect(result).toBe(5);
    const defaultResult = await Helpers.getLanguageId('abc');
    expect(defaultResult).toBe(2);
  });
});

describe('agent api', () => {
  it('generates valid keymaps', () => {
    const keyMap = Agent.KeyMap({
      agentId: 'xxxx',
      agentState: Agent.AGENT_STATES.ROUTABLE,
    });
    expect(keyMap).toMatchSnapshot();
    const itemKeyMap = Agent.KeyMap({
      mapName: 'Item',
      agentId: 'xxxx',
      agentState: Agent.AGENT_STATES.ON_CALL,
      attributes: {
        contactId: 'yyyy',
      },
    });
    expect(itemKeyMap).toMatchSnapshot();
  });

  it('sets agent state', () => {
    const putItemsMock = jest.fn();
    const mockDb = jest.fn();
    mockDb.putItem = putItemsMock;
    Dynamo.DynamoTable = jest.fn(() => mockDb);
    Dynamo.DynamoTable.mockReturnValue(mockDb);
    Agent.setState({
      agentId: 'xxxx',
      agentState: Agent.AGENT_STATES.ROUTABLE,
    });
    expect(Dynamo.DynamoTable).toMatchSnapshot();
    expect(putItemsMock).toMatchSnapshot();
  });
});
