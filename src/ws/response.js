/**
 * Websocket Response Helpers
 */

const buildAction = ({ namespace, actionName }) => {
  const withData = (data={}) => ({
    namespace,
    action: {
      type: 'action',
      name: actionName,
    },
    data,
  });
  return withData;
};

const STREAMS = 'phone.streams';
const CONTROLLER = 'phone.controller';

const STREAMS_ACTIONS = {
  UPDATE_AGENT: buildAction({
    namespace: STREAMS,
    actionName: 'updateAgentClient',
  }),
  UPDATE_CONTACT: buildAction({
    namespace: STREAMS,
    actionName: 'updateContact',
  }),
  UPDATE_METRICS: buildAction({
    namespace: CONTROLLER,
    actionName: 'updateMetrics',
  }),
  UPDATE_CONTACT_METRICS: buildAction({
    namespace: CONTROLLER,
    actionName: 'updateContactMetrics',
  }),
  UPDATE_AGENT_METRICS: buildAction({
    namespace: CONTROLLER,
    actionName: 'updateAgentMetrics',
  }),
  PONG: buildAction({
    namespace: STREAMS,
    actionName: 'receivePong'
  })
};

export default {
  ...STREAMS_ACTIONS,
};
