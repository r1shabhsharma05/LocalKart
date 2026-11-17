// parsePagination: clamps page/limit to safe bounds, defaults page 1 / limit 20.
import { describe, expect, it } from 'vitest';
import { parsePagination } from '../utils/pagination';

describe('parsePagination', () => {
  it('defaults to page 1, limit 20 when nothing is given', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('parses page and limit and computes skip', () => {
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  it('clamps page below 1 up to 1 and limit above 100 down to 100', () => {
    expect(parsePagination({ page: '0', limit: '500' })).toEqual({ page: 1, limit: 100, skip: 0 });
  });

  it('treats non-numeric page/limit as the defaults', () => {
    expect(parsePagination({ page: 'abc', limit: 'xyz' })).toEqual({ page: 1, limit: 20, skip: 0 });
  });
});
