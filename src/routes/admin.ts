import express from 'express';
import { authService } from '../services/AuthService';
import { configService } from '../services/ConfigService';
import { tvAPI } from '../tvInstance';

const router = express.Router();

// Simple Basic Auth Middleware
const adminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const config = configService.get();
  const auth = { login: 'admin', password: config.adminPassword };
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  if (login && password && login === auth.login && password === auth.password) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="401"');
  res.status(401).send('Authentication required.');
};

router.use(adminAuth);

router.get('/', (_req, res) => {
  const keys = authService.getAllKeys();
  const config = configService.get();
  res.render('admin', { keys, config });
});

router.post('/config', (req, res) => {
  const { serverUrl, adminPassword } = req.body;
  configService.update({ serverUrl, adminPassword });
  res.redirect('/admin');
});

router.post('/restart', async (_req, res) => {
  console.log('Admin requested restart...');
  // Soft restart of TV connection
  await tvAPI.cleanup();
  await tvAPI.setup();
  res.redirect('/admin');
});

router.post('/kill', (_req, res) => {
  console.log('Admin requested process exit...');
  res.send('Server is shutting down... If you are running with a process manager (PM2/Docker), it will restart automatically.');
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

router.post('/create', (req, res) => {
  const { owner, domains, rateLimit } = req.body;
  authService.createKey(owner, domains, parseInt(rateLimit));
  res.redirect('/admin');
});

router.post('/delete', (req, res) => {
  const { key } = req.body;
  authService.deleteKey(key);
  res.redirect('/admin');
});

export default router;
