// Dynamic calls are by design never resolved

const actions = {
  start: () => console.log('starting'),
  stop: () => console.log('stopping'),
  pause: () => console.log('pausing'),
};

function invoke(action) {
  actions[action](); // DYNAMIC: obj[expr]() pattern - never guessed
}

invoke('start');

export { actions, invoke };