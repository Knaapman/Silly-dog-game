export type ConnectedGamepad = {
  browserIndex: number;
  playerIndex: number | null;
  id: string;
  label: string;
  mapping: string;
  connected: boolean;
  recognized: boolean;
  xinputLike: boolean;
  buttonCount: number;
  axisCount: number;
};

function cleanGamepadLabel(id: string) {
  return id
    .replace(/\s+/g, ' ')
    .replace(/\(STANDARD GAMEPAD Vendor: [^)]+\)/i, '')
    .replace(/Vendor:[^\s]+/gi, '')
    .replace(/Product:[^\s]+/gi, '')
    .trim() || 'Unknown controller';
}

function isXInputLike(gamepad: Gamepad) {
  return /xinput|x-box|xbox|microsoft|045e/i.test(gamepad.id) || gamepad.mapping === 'standard';
}

function isRecognizedGamepad(gamepad: Gamepad) {
  return gamepad.connected && gamepad.axes.length >= 2 && gamepad.buttons.length >= 8;
}

function toConnectedGamepad(gamepad: Gamepad, order: number): ConnectedGamepad {
  return {
    browserIndex: gamepad.index,
    playerIndex: order < 2 ? order : null,
    id: gamepad.id,
    label: cleanGamepadLabel(gamepad.id),
    mapping: gamepad.mapping || 'unknown',
    connected: gamepad.connected,
    recognized: isRecognizedGamepad(gamepad),
    xinputLike: isXInputLike(gamepad),
    buttonCount: gamepad.buttons.length,
    axisCount: gamepad.axes.length
  };
}

export function listConnectedGamepads(gamepads: readonly (Gamepad | null)[]) {
  return gamepads
    .filter((gamepad): gamepad is Gamepad => Boolean(gamepad?.connected))
    .sort((left, right) => left.index - right.index)
    .map((gamepad, order) => toConnectedGamepad(gamepad, order));
}

export function readConnectedGamepads() {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return [] as ConnectedGamepad[];
  }

  return listConnectedGamepads(Array.from(navigator.getGamepads()));
}

export function getAssignedGamepad(playerIndex: number, gamepads: readonly (Gamepad | null)[]) {
  const connected = gamepads
    .filter((gamepad): gamepad is Gamepad => Boolean(gamepad?.connected))
    .sort((left, right) => left.index - right.index);

  return connected[playerIndex] ?? null;
}
