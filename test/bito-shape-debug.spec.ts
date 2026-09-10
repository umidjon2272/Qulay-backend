import { bitoResponseShape, bitoInventorySchemaCandidate } from '../src/bito/bito-shape-debug';

it.each(['stock', 'inventory', 'warehouse', 'product', 'item', 'balance', 'remain', 'quantity', 'storage', 'sklad', 'ombor', 'qoldiq'])('flags schema tool names containing %s for inspection only', concept => {
  expect(bitoInventorySchemaCandidate(`fixture_${concept}_read`)).toBe(true);
});

it('inspects all unwrapped content documents while keeping business values private', () => {
  const shape = JSON.stringify(bitoResponseShape({ mcpPayloads: [{ meta: { totalPages: 3 } }, [{ product_id: 'private-id', quantity: 987654 }]] }));
  expect(shape).toContain('product_id');
  expect(shape).toContain('totalPages');
  expect(shape).not.toMatch(/private-id|987654/);
});

it('logs only field names/types, counts and pagination flags', () => {
  const shape = JSON.stringify(bitoResponseShape({ content: [{ type: 'text', text: JSON.stringify({ items: [{ product_id: 'private-id', name: 'Private customer', email: 'private@example.test', authorization: 'Bearer private-token' }], meta: { total: 78, page: 1, hasMore: true, nextCursor: 'secret-cursor' } }) }], accessToken: 'another-secret' }));
  for (const secret of ['private-id', 'Private customer', 'private@example.test', 'private-token', 'secret-cursor', 'another-secret']) expect(shape).not.toContain(secret);
  expect(shape).toContain('product_id');
  expect(shape).toContain('78');
  expect(shape).toContain('nextCursor');
  expect(shape).toContain('"length":1');
});

it('does not log a customer total or row count as pagination metadata', () => {
  const shape = JSON.stringify(bitoResponseShape({ customers: [{ name: 'Customer', total: 987654321, count: 654321987 }], summary: { total: 1122334455 } }));
  expect(shape).not.toContain('987654321');
  expect(shape).not.toContain('654321987');
  expect(shape).not.toContain('1122334455');
});
