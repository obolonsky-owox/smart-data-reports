import { bootstrap } from './bootstrap';

if (import.meta.env.DEV && import.meta.env.VITE_PROBE === '1') {
  void import('./probe').then((m) => m.runProbe());
} else {
  void bootstrap();
}
