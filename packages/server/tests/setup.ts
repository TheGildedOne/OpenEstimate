// Test environment setup
// Set required env vars before any imports that read from config
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file::memory:?cache=shared';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-32-characters-minimum-padding';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-characters-minimum-padding';
process.env.CLIENT_URL = 'http://localhost:5173';
