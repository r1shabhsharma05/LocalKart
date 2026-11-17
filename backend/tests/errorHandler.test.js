// errorHandler: client errors keep their message, server errors never leak a stack.
import { describe, expect, it, vi } from 'vitest';
import errorHandler from '../middleware/errorHandler';

const run = (err) => {
  const req = {};
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  errorHandler(err, req, res, vi.fn());
  return res;
};

describe('errorHandler', () => {
  it('returns a clean JSON error with no stack trace for a 500', () => {
    const err = new Error('db exploded');
    err.stack = 'Error: db exploded\n    at secret.js:1:1';
    const res = run(err);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Something went wrong' });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secret.js');
  });

  it('passes a 400 message through unchanged', () => {
    const err = new Error('Please provide a title');
    err.status = 400;
    const res = run(err);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Please provide a title' });
  });

  it('turns invalid JSON into a 400, not a 500 with a stack', () => {
    const err = new SyntaxError('Unexpected token');
    err.type = 'entity.parse.failed';
    const res = run(err);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid JSON request body' });
  });
});
