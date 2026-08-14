export type MonitorContext = {
  "timeout-ms": number;
};

export const schedulerHooks = {};

export async function run(
  context: MonitorContext,
  time: Date,
  traceId: string,
): Promise<MonitorContext> {
  return context;
}

// {
//   "channel-id": "123123123123123123",
//
//   "states": [
//     {
//       "from": ["online", "responding", "offline"],
//       "to": "online",
//       "when": {
//         "response": true
//       }
//     },
//     {
//       "from": ["offline", "not-responding"],
//       "to": "offline",
//       "when": {
//         "response": false,
//         "no-response-count": 3
//       }
//     },
//     {
//       "from": ["not-responding"],
//       "to": "responding",
//       "when": {
//         "response": true
//       }
//     },
//     {
//       "from": ["online", "responding", "not-responding"],
//       "to": "not-responding",
//       "when": {
//         "response": false
//       }
//     }
//   ],
//
//   "events": {
//     "restarting": {
//       "start": {
//         "when": {
//           "time": "1970-01-01T09:55:00Z"
//         }
//       },

//       "end": {
//         "when": {
//           "time": "1970-01-01T10:00:00Z"
//         }
//       },

//       "fail": {
//         "when": {
//           "just-left-restart-window": true,
//           "has-restarted": false
//         }
//       }
//     },

//     "reviving": {
//       "no-start-because-offline": {
//         "when": {
//           "status": "offline",
//           "is-ongoing": false
//         }
//       },

//       "delayed-start-after-offline": {
//         "when": {
//           "last-status": "offline",
//           "is-ongoing": false,
//           "status": ["online", "responding"]
//         }
//       },

//       "forced-stop-because-offline": {
//         "when": {
//           "status": "offline",
//           "is-ongoing": true
//         }
//       },

//       "resumed-after-offline": {
//         "when": {
//           "last-status": "offline",
//           "status": ["online"],
//           "is-ongoing": true
//         }
//       },

//       "start": {
//         "when": {
//           "time": "1970-01-04T00:00:00Z",
//           "status": ["online", "responding"],
//           "is-ongoing": false
//         }
//       },

//       "end": {
//         "when": {
//           "time": "1970-01-04T09:55:00Z",
//           "event": "restarting",
//           "is-ongoing": true
//         }
//       },

//       "failed-to-end-on-time": {
//         "when": {
//           "status": ["online", "responding"],
//           "is-ongoing": true,
//           "just-left-restart-window": true
//         }
//       },

//       "delayed-end-after-fail-to-end-on-time": {
//         "when": {
//           "status": ["offline"],
//           "last-status": "online",
//           "is-ongoing": true
//         }
//       }
//     }
//   }
// }
// }
