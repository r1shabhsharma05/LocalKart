// API tests against the real Express app + an in-memory MongoDB.
// Only the Brevo HTTP call is stubbed (global fetch) so the OTP code the
// controller generates can be read back from the request it would have sent.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-bytes-long!';
process.env.BREVO_API_KEY = 'test-brevo-key';
process.env.BREVO_FROM = 'test@localkart.test';
process.env.NODE_ENV = 'test';

let mongo;
let mongoDbPath;
let app;
const sentCodes = [];
const realFetch = global.fetch;

const captureBrevoCode = async (url, options) => {
  if (String(url).includes('api.brevo.com')) {
    const body = JSON.parse(options.body);
    const match = /(\d{6})/.exec(body.textContent || '');
    if (match) sentCodes.push(match[1]);
    return { ok: true, status: 201, text: async () => '{}', json: async () => ({}) };
  }
  return realFetch(url, options);
};

beforeAll(async () => {
  global.fetch = captureBrevoCode;
  // Explicit dbPath so afterAll can remove it even if create() throws:
  // the default /tmp path leaked ~200MB per failed run and filled this
  // VM's 512MB /tmp until mongod itself failed with fassert().
  mongoDbPath = await mkdtemp(path.join(os.tmpdir(), 'localkart-mongo-'));
  mongo = await MongoMemoryServer.create({ instance: { dbPath: mongoDbPath } });
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(process.env.MONGO_URI);
  ({ default: app } = await import('../app'));
}, 120000);

afterAll(async () => {
  global.fetch = realFetch;
  if (mongo) {
    await mongoose.disconnect().catch(() => {});
    await mongo.stop().catch(() => {});
  }
  if (mongoDbPath) await rm(mongoDbPath, { recursive: true, force: true }).catch(() => {});
});

// One agent per user: cookies (session + CSRF) persist across its requests.
const agentFor = async () => {
  const agent = request.agent(app);
  const csrf = await agent.get('/api/auth/csrf-token');
  return { agent, csrfToken: csrf.body.token };
};

const registerAndVerify = async (agent, csrfToken, email) => {
  const res = await agent.post('/api/auth/register')
    .set('X-CSRF-Token', csrfToken)
    .send({ name: 'Test Seller', email, password: 'Password@123', college: 'GLA University' });
  expect(res.status).toBe(200);
  const code = sentCodes[sentCodes.length - 1];
  expect(code).toMatch(/^\d{6}$/);
  const verified = await agent.post('/api/auth/verify-email')
    .set('X-CSRF-Token', csrfToken)
    .send({ email, code });
  expect(verified.status).toBe(201);
  return verified.body.user;
};

const seedProducts = async (agent, csrfToken, sellerId, count) => {
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const res = await agent.post('/api/products')
      .set('X-CSRF-Token', csrfToken)
      .field('title', `Test Book ${i}`)
      .field('description', 'A test textbook for the suite')
      .field('category', 'Books')
      .field('price', String(100 + i))
      .field('condition', 'Good')
      .field('location', 'Library');
    expect(res.status).toBe(201);
    ids.push(res.body.product._id);
  }
  return ids;
};

describe('health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.commit).toBe('string');
  });
});

describe('auth', () => {
  it('rejects signup with a weak password', async () => {
    const { agent, csrfToken } = await agentFor();
    const res = await agent.post('/api/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Weak', email: 'weak@localkart.test', password: 'short', college: 'GLA University' });
    expect(res.status).toBe(400);
  });

  it('rejects a mutation with no CSRF token', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ name: 'No Csrf', email: 'nocsrf@localkart.test', password: 'Password@123', college: 'GLA University' });
    expect(res.status).toBe(403);
  });

  it('registers, verifies the emailed OTP, then logs in', async () => {
    const { agent, csrfToken } = await agentFor();
    const user = await registerAndVerify(agent, csrfToken, 'seller@localkart.test');
    expect(user.email).toBe('seller@localkart.test');
    const login = await agent.post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'seller@localkart.test', password: 'Password@123' });
    expect(login.status).toBe(200);
  });

  it('rejects a wrong OTP with 400 and locks out after 5 wrong codes with 429', async () => {
    const { agent, csrfToken } = await agentFor();
    const res = await agent.post('/api/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Wrong Otp', email: 'wrongotp@localkart.test', password: 'Password@123', college: 'GLA University' });
    expect(res.status).toBe(200);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const bad = await agent.post('/api/auth/verify-email')
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'wrongotp@localkart.test', code: '000000' });
      expect(bad.status).toBe(400);
    }
    const locked = await agent.post('/api/auth/verify-email')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'wrongotp@localkart.test', code: '000000' });
    expect(locked.status).toBe(429);
  });
});

describe('products', () => {
  let seller;
  let csrfToken;
  let ids = [];

  it('declares a compound index for the list filter (status + category + newest first)', async () => {
    // Assert on the declared schema index, not a live build: the
    // in-memory MongoDB on this VM's 512MB /tmp cannot build indexes
    // (MongoDB requires 500MB free disk). Atlas builds it on connect.
    const Product = mongoose.model('Product');
    const declared = Product.schema.indexes().map(([fields]) => JSON.stringify(fields));
    expect(declared).toContain(JSON.stringify({ status: 1, category: 1, createdAt: -1 }));
  });

  beforeAll(async () => {
    const ctx = await agentFor();
    seller = ctx;
    csrfToken = ctx.csrfToken;
    await registerAndVerify(ctx.agent, csrfToken, 'shop@localkart.test');
    ids = await seedProducts(ctx.agent, csrfToken, seller, 5);
  });

  it('lists products and filters by category', async () => {
    const res = await request(app).get('/api/products?category=Books');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
    expect(res.body.every((p) => p.category === 'Books')).toBe(true);
  });

  it('paginates: page 2 returns different items and reports the total', async () => {
    const page1 = await request(app).get('/api/products?page=1&limit=2');
    const page2 = await request(app).get('/api/products?page=2&limit=2');
    expect(page1.status).toBe(200);
    expect(page1.body.total).toBeGreaterThanOrEqual(5);
    expect(page1.body.products).toHaveLength(2);
    expect(page2.body.products).toHaveLength(2);
    const ids1 = page1.body.products.map((p) => p._id);
    const ids2 = page2.body.products.map((p) => p._id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });

  it('searches by q across title and description', async () => {
    const res = await request(app).get('/api/products?q=Test%20Book%203');
    expect(res.status).toBe(200);
    expect(res.body.products.some((p) => p.title === 'Test Book 3')).toBe(true);
    expect(res.body.products.every((p) => /test book 3/i.test(`${p.title} ${p.description}`))).toBe(true);
  });

  it('rejects creating a product with no title', async () => {
    const res = await seller.agent.post('/api/products')
      .set('X-CSRF-Token', csrfToken)
      .field('description', 'missing title')
      .field('category', 'Books')
      .field('price', '100');
    expect(res.status).toBe(400);
  });

  it('runs the sell flow: message, purchase request, seller confirms sold', async () => {
    const buyerCtx = await agentFor();
    await registerAndVerify(buyerCtx.agent, buyerCtx.csrfToken, 'buyer@localkart.test');
    const productId = ids[0];
    const listing = await request(app).get(`/api/products/${productId}`);
    const sellerId = listing.body.seller._id;
    const msg = await buyerCtx.agent.post('/api/messages')
      .set('X-CSRF-Token', buyerCtx.csrfToken)
      .send({ receiver: sellerId, product: productId, content: 'Hi, is this still available?' });
    expect(msg.status).toBe(201);
    const requested = await buyerCtx.agent.post(`/api/products/${productId}/purchase`)
      .set('X-CSRF-Token', buyerCtx.csrfToken);
    expect(requested.status).toBe(200);
    const confirmed = await seller.agent.post(`/api/products/${productId}/confirm-sale`)
      .set('X-CSRF-Token', csrfToken);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.product.status).toBe('sold');
  });
});

describe('messages', () => {
  it('requires login to list messages', async () => {
    const res = await request(app).get('/api/messages');
    expect(res.status).toBe(401);
  });
});

describe('error handling', () => {
  it('returns clean JSON, never a stack trace, for a bad product id', async () => {
    const res = await request(app).get('/api/products/not-an-id');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid product id');
    expect(JSON.stringify(res.body)).not.toContain('at ');
  });
});
