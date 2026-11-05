// Late answers must never repaint the page: only the latest request of a kind,
// started under the current role, may update it. Covered by tests/gate.test.js.
export function createGate() {
  let role = 0;
  const seq = Object.create(null);
  return {
    switchRole() { role += 1; },
    async run(kind, fn) {
      const myRole = role;
      const mySeq = (seq[kind] = (seq[kind] || 0) + 1);
      const value = await fn();
      return { fresh: myRole === role && mySeq === seq[kind], value };
    },
  };
}

// "Refused by the server" is shown only for the role refusal, never for a missing row or a server error.
export const isRoleRefusal = (r) => r.status === 403 && !!r.body && r.body.error === 'outside_role';
