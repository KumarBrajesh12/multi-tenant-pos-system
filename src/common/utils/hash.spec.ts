import { canonicalJson, hashRequest } from './hash';

describe('request hashing', () => {
  it('ignores object key order', () => {
    const a = { items: [{ productId: 'p1', quantity: 2 }], payment: { method: 'CARD', token: 't' } };
    const b = { payment: { token: 't', method: 'CARD' }, items: [{ quantity: 2, productId: 'p1' }] };
    expect(hashRequest(a)).toBe(hashRequest(b));
  });

  it('changes when a value changes', () => {
    const a = { items: [{ productId: 'p1', quantity: 2 }] };
    const b = { items: [{ productId: 'p1', quantity: 3 }] };
    expect(hashRequest(a)).not.toBe(hashRequest(b));
  });

  it('keeps array order and drops undefined fields', () => {
    expect(canonicalJson({ b: [2, 1], a: undefined, c: null })).toBe('{"b":[2,1],"c":null}');
  });
});
