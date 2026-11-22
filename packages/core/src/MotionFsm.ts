/**
 * MotionFsm — a motion state machine asset (`.fsm.json`, RE's motion FSM role): parameters, states playing a clip, and
 * transitions with conditions. Format (contract):
 * `{ format: 1, kind: 'MotionFsm', initial, parameters: [{ name, type: 'float' | 'bool' | 'trigger', value }],
 *    states: [{ name, clip, speed?, loop? }],
 *    transitions: [{ from, to, conditions: [{ param, op, value }], exitTime?, duration? }] }`
 * `from: '*'` = any state. `op`: `>` `<` `>=` `<=` `==` `!=` (floats / bools), triggers need no op (consumed when used).
 * `exitTime` (0..1, normalized time of the current clip) gates a transition; `duration` = cross-fade seconds.
 */
export interface FsmParameter {
  name: string;
  type: 'float' | 'bool' | 'trigger';
  value?: number | boolean;
}
export interface FsmState {
  name: string;
  clip: string;
  speed?: number;
  loop?: boolean;
}
export interface FsmCondition {
  param: string;
  op?: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value?: number | boolean;
}
export interface FsmTransition {
  from: string;
  to: string;
  conditions: FsmCondition[];
  exitTime?: number;
  duration?: number;
}
export interface MotionFsmData {
  format: number;
  kind: 'MotionFsm';
  initial: string;
  parameters: FsmParameter[];
  states: FsmState[];
  transitions: FsmTransition[];
}

export function emptyFsm(): MotionFsmData {
  return { format: 1, kind: 'MotionFsm', initial: 'Idle', parameters: [], states: [{ name: 'Idle', clip: '', loop: true }], transitions: [] };
}

/** Fills missing keys (files written by hand / older versions). */
export function normalizeFsm(j: Partial<MotionFsmData> | null | undefined): MotionFsmData {
  const d = emptyFsm();
  if (!j) return d;
  return {
    format: 1,
    kind: 'MotionFsm',
    initial: j.initial ?? j.states?.[0]?.name ?? d.initial,
    parameters: Array.isArray(j.parameters) ? j.parameters : [],
    states: Array.isArray(j.states) && j.states.length ? j.states : d.states,
    transitions: Array.isArray(j.transitions) ? j.transitions.map((t) => ({ ...t, conditions: Array.isArray(t.conditions) ? t.conditions : [] })) : [],
  };
}

/** Whether a transition's conditions hold for the parameters (triggers: set). */
export function conditionsMet(t: FsmTransition, params: Map<string, number | boolean>, triggers: Set<string>, types: Map<string, FsmParameter['type']>): boolean {
  for (const c of t.conditions) {
    const type = types.get(c.param);
    if (type === 'trigger') {
      if (!triggers.has(c.param)) return false;
      continue;
    }
    const v = params.get(c.param) ?? (type === 'bool' ? false : 0);
    const w = c.value ?? (type === 'bool' ? true : 0);
    const a = typeof v === 'boolean' ? Number(v) : v;
    const b = typeof w === 'boolean' ? Number(w) : w;
    switch (c.op ?? '==') {
      case '>':
        if (!(a > b)) return false;
        break;
      case '<':
        if (!(a < b)) return false;
        break;
      case '>=':
        if (!(a >= b)) return false;
        break;
      case '<=':
        if (!(a <= b)) return false;
        break;
      case '!=':
        if (a === b) return false;
        break;
      default:
        if (a !== b) return false;
    }
  }
  return true;
}
